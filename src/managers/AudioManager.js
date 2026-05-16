/**
 * @fileoverview Manages audio playback, state, and synchronization.
 */
export class AudioManager {
  /**
   * @param {Function} onEndedCallback - Triggered when playback finishes.
   */
  constructor(onEndedCallback) {
    this.audio = new Audio('audio.m4a');
    this.isPlaying = false;

    this.audio.addEventListener('ended', () => {
      this.isPlaying = false;
      this.audio.currentTime = 0;
      if (onEndedCallback) onEndedCallback();
    });
  }

  /**
   * Attempts to play audio. Handles browser autoplay restrictions.
   * @returns {Promise<boolean>} True if playback started successfully.
   */
  async play() {
    try {
      await this.audio.play();
      this.isPlaying = true;
      return true;
    } catch (err) {
      console.warn("Playback blocked by browser policy:", err);
      this.isPlaying = false;
      return false;
    }
  }

  /** Pauses the audio stream. */
  pause() {
    this.audio.pause();
    this.isPlaying = false;
  }

  /** Stops audio and resets the timeline. */
  reset() {
    this.pause();
    this.audio.currentTime = 0;
  }

  /**
   * @returns {number} Current playback time in seconds.
   */
  getCurrentTime() {
    return this.audio.currentTime;
  }
}