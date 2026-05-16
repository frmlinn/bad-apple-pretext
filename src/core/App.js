/**
 * @fileoverview Main orchestration core. Syncs audio, render loop, and UI states.
 */
import { CONF } from '../conf.js';
import { AssetManager } from '../managers/AssetManager.js';
import { AudioManager } from '../managers/AudioManager.js';
import { UIManager } from '../managers/UIManager.js';
import { Renderer } from './Renderer.js';

export class App {
  constructor() {
    this.assets = new AssetManager();
    this.audio = null;
    this.ui = null;
    this.renderer = null;
    
    // Core state tracking for performance and network synchronization
    this.lastRenderedFrame = -1;
    this.isBuffering = false;
    
    // Concurrency controls to prevent Multi-loop race conditions
    this.animationFrameId = null;
    this.isStarting = false;
    
    this.renderLoop = this.renderLoop.bind(this);
  }

  /** Initializes modules and kicks off the background loading stream. */
  init() {
    try {
      this.ui = new UIManager({
        onPlay: () => this.startPlaying(),
        onReset: () => this.resetSimulation(),
        onResize: () => this.handleResize(),
        onCanvasClick: () => this.togglePlay()
      });

      this.assets.loadAll(
        (progress) => this.ui.updateProgress(progress),
        () => this.onAssetsReady()
      );

    } catch (error) {
      const errEl = document.getElementById('loading');
      if (errEl) errEl.innerText = "Error loading resources";
      console.error("Initialization Error:", error);
    }
  }

  /** Setup triggered when minimum safe frames are downloaded. */
  onAssetsReady() {
    this.audio = new AudioManager(() => {
      this.ui.showUIOnEnd();
      this.lastRenderedFrame = -1;
      // Clean up the render loop when audio ends naturally
      if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    });

    this.renderer = new Renderer(document.getElementById('canvas'), this.assets);
    this.renderer.handleResize();
    
    this.ui.showReadyState();

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.audio && this.audio.isPlaying) {
        this.audio.pause();
        this.ui.showReadyState();
        if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
      }
    });
  }

  /** Responsive dimension propagation. */
  handleResize() {
    if (!this.renderer) return;
    this.renderer.handleResize();
    
    // Force a redraw of the static frame if paused
    if (this.audio && !this.audio.isPlaying && this.lastRenderedFrame > -1) {
      this.renderer.renderFrame(this.lastRenderedFrame);
    }
  }

  /**
   * Unlocks UI and triggers the synced requestAnimationFrame loop.
   * Uses concurrency locks to prevent race conditions on rapid clicks.
   */
  async startPlaying() {
    if (!this.audio || this.isStarting) return;
    
    this.isStarting = true; // Acquire lock

    if (await this.audio.play()) {
      this.ui.hideUIForPlayback();
      
      // Destroy any orphan loop before spawning a new one
      if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = requestAnimationFrame(this.renderLoop);
    }
    
    this.isStarting = false; // Release lock
  }

  /** Play/Pause toggle logic. */
  togglePlay() {
    if (!this.audio) return;
    if (this.audio.isPlaying) {
      this.audio.pause();
      this.ui.showReadyState();
      if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    } else {
      this.startPlaying();
    }
  }

  /** Full rewind of simulation states. */
  resetSimulation() {
    if (!this.audio) return;
    this.audio.reset();
    this.lastRenderedFrame = -1;
    this.isBuffering = false;
    
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    if (this.renderer) this.renderer.clearScreen();
    this.ui.showReadyState();
  }

  /**
   * Hardware-synced render loop.
   * Handles Frame-limiting (saving CPU), Network Buffer starvation, and EOF Deadlocks.
   */
  renderLoop() {
    if (!this.audio || !this.audio.isPlaying) return;
    
    const currentTime = this.audio.getCurrentTime();
    const targetFrame = Math.floor(currentTime * CONF.FPS_VIDEO);
    const downloadedFrames = this.assets.frameOffsets.length;

    // CRITICAL FIX: Deadlock prevention. 
    // Detect if we are in the last 200ms of the audio track.
    const duration = this.audio.audio.duration;
    const isNearEnd = duration && (duration - currentTime < 0.2);

    if (targetFrame >= downloadedFrames) {
      if (isNearEnd && downloadedFrames > 0) {
        // We ran out of frames right at the end. Render the last one and wait for audio to finish.
        if (this.lastRenderedFrame !== downloadedFrames - 1) {
          this.renderer.renderFrame(downloadedFrames - 1);
          this.lastRenderedFrame = downloadedFrames - 1;
        }
        this.animationFrameId = requestAnimationFrame(this.renderLoop);
        return;
      }

      if (!this.isBuffering) {
        this.audio.audio.pause(); 
        if (this.ui.loadingText) {
          this.ui.loadingText.innerText = "Buffering network...";
          this.ui.loadingText.style.display = 'block';
        }
        this.isBuffering = true;
      }
      this.animationFrameId = requestAnimationFrame(this.renderLoop);
      return;
    }

    if (this.isBuffering) {
      if (downloadedFrames > targetFrame + (CONF.FPS_VIDEO * 1.5)) { 
        this.audio.audio.play(); 
        if (this.ui.loadingText) this.ui.loadingText.style.display = 'none';
        this.isBuffering = false;
      } else {
        this.animationFrameId = requestAnimationFrame(this.renderLoop);
        return;
      }
    }

    if (targetFrame === this.lastRenderedFrame) {
      this.animationFrameId = requestAnimationFrame(this.renderLoop);
      return;
    }

    this.lastRenderedFrame = targetFrame;
    this.renderer.renderFrame(targetFrame);
    
    this.animationFrameId = requestAnimationFrame(this.renderLoop);
  }
}