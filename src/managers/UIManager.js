/**
 * @fileoverview Manages DOM elements, UI state, and user interactions.
 */
export class UIManager {
  /**
   * @param {Object} callbacks - Event handlers { onPlay, onReset, onResize, onCanvasClick }
   */
  constructor(callbacks) {
    this.ui = document.getElementById('ui');
    this.loadingText = document.getElementById('loading');
    this.progressContainer = document.getElementById('progressContainer');
    this.progressBar = document.getElementById('progressBar');
    this.btnPlay = document.getElementById('btnPlay');
    this.btnReset = document.getElementById('btnReset');
    
    this.callbacks = callbacks;
    this.resizeTimeout = null;

    this.setupListeners();
  }

  /** Binds generic DOM events with memory-safe listeners. */
  setupListeners() {
    window.addEventListener('resize', () => {
      clearTimeout(this.resizeTimeout);
      this.resizeTimeout = setTimeout(() => this.callbacks.onResize(), 150);
    });

    const bindEvent = (element, handler) => {
      if (!element) return;
      // CRITICAL FIX: 'pointerdown' replaces 'click' and 'touchstart'.
      // Prevents "Ghost Clicks" (double dispatching) on mobile browsers.
      element.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        handler();
      }, { passive: false });
    };

    bindEvent(this.btnPlay, this.callbacks.onPlay);
    bindEvent(this.btnReset, this.callbacks.onReset);
    bindEvent(document.getElementById('canvas'), this.callbacks.onCanvasClick);
  }

  /**
   * Updates visual progress bar during chunked downloading.
   * @param {number} progress - Normalized float (0.0 to 1.0).
   */
  updateProgress(progress) {
    // CRITICAL FIX: Clamp to 100% to prevent overflow if Content-Length 
    // mismatched the uncompressed payload size.
    const percentage = Math.min(100, Math.floor(progress * 100));
    
    if (this.loadingText) this.loadingText.innerText = `Loading resources... ${percentage}%`;
    if (this.progressBar) this.progressBar.style.width = `${percentage}%`;
  }

  /** Restores UI visibility for paused or ready states. */
  showReadyState() {
    if (this.loadingText) this.loadingText.style.display = 'none';
    if (this.progressContainer) this.progressContainer.style.display = 'none';
    
    this.ui.style.display = 'flex';
    this.ui.style.opacity = '1';
    
    if (this.btnPlay) this.btnPlay.style.display = 'block';
    if (this.btnReset) this.btnReset.style.display = 'block';
  }

  /** Hides the interactive UI overlay during playback. */
  hideUIForPlayback() {
    this.ui.style.opacity = '0';
    setTimeout(() => this.ui.style.display = 'none', 300);
  }

  /** Displays the UI wrapper explicitly when simulation ends. */
  showUIOnEnd() {
    this.ui.style.display = 'flex';
    this.ui.style.opacity = '1';
  }
}