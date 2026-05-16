/**
 * @fileoverview Fetches, decodes, and buffers external assets (Text, Binary Data).
 */
import { CONF } from '../conf.js';

export class AssetManager {
  constructor() {
    this.rawTextEN = '';
    this.rawTextJP = '';
    this.uint16Data = null;
    this.frameOffsets = [];
    
    // Determine target architecture byte order (Little vs Big Endian).
    this.isLittleEndian = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
  }

  /** Orchestrates the downloading and decoding of all critical assets. */
  async loadAll(onProgress, onReady) {
    try {
      const [resEN, resJP] = await Promise.all([
        fetch('lyrics_bad_apple_en.txt'),
        fetch('lyrics_bad_apple_jp.txt')
      ]);

      if (!resEN.ok || !resJP.ok) throw new Error("Failed to load text assets");

      this.rawTextEN = await resEN.text();
      this.rawTextJP = new TextDecoder('utf-8').decode(await resJP.arrayBuffer());

      const resBin = await fetch('frames.bin');
      if (!resBin.ok) throw new Error(`HTTP Error: ${resBin.status} on frames.bin`);

      // Fallback length: 5MB if header is missing
      const contentLength = parseInt(resBin.headers.get('content-length'), 10) || (5 * 1024 * 1024);
      
      await this.loadStream(resBin, contentLength, onProgress, onReady);
    } catch (error) {
      console.error("Asset Load Aborted:", error);
      throw error;
    }
  }

  /**
   * Processes the binary stream using dynamic resizing and safe endianness swapping.
   * @private
   */
  async loadStream(resBin, initialLength, onProgress, onReady) {
    let currentCapacity = initialLength;
    let buffer = new ArrayBuffer(currentCapacity);
    let uint8View = new Uint8Array(buffer);
    this.uint16Data = new Uint16Array(buffer); // Shared view
    
    const reader = resBin.body.getReader();
    let bytesRead = 0;
    let parsedPtr = 0;
    let framesParsed = 0;
    let readyFired = false;
    let lastSwappedByte = 0;
    
    let estimatedTotal = initialLength;
    const MIN_FRAMES_TO_PLAY = CONF.FPS_VIDEO * 5;

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        if (onProgress) onProgress(1.0); // Force 100% visually
        break;
      }

      // Dynamic Buffer Resizing (Prevents Buffer Overflow if Content-Length was compressed)
      if (bytesRead + value.length > currentCapacity) {
        currentCapacity = Math.max(currentCapacity * 2, bytesRead + value.length + (1024 * 1024));
        const newBuffer = new ArrayBuffer(currentCapacity);
        const newUint8View = new Uint8Array(newBuffer);
        newUint8View.set(uint8View.subarray(0, bytesRead));
        
        buffer = newBuffer;
        uint8View = newUint8View;
        this.uint16Data = new Uint16Array(buffer);
      }

      uint8View.set(value, bytesRead);
      bytesRead += value.length;

      // CRITICAL FIX: Safe Endianness Swap (Resolves Odd Byte Corruption)
      // Only swap complete 16-bit boundaries.
      if (!this.isLittleEndian) {
        const swappableBytes = Math.floor(bytesRead / 2) * 2;
        for (let i = lastSwappedByte; i < swappableBytes; i += 2) {
          const temp = uint8View[i];
          uint8View[i] = uint8View[i + 1];
          uint8View[i + 1] = temp;
        }
        lastSwappedByte = swappableBytes;
      }

      const availableUint16 = Math.floor(bytesRead / 2);

      // Parse logical frames dynamically from available memory
      while (parsedPtr < availableUint16) {
        const numSegments = this.uint16Data[parsedPtr];
        const frameLength = 1 + (numSegments * 4);

        if (parsedPtr + frameLength <= availableUint16) {
          this.frameOffsets.push(parsedPtr);
          parsedPtr += frameLength;
          framesParsed++;
        } else {
          break; // Chunk boundary reached mid-frame
        }
      }

      // CRITICAL FIX: Dynamic visual progress scaling
      if (onProgress) {
        if (bytesRead > estimatedTotal) estimatedTotal = bytesRead * 1.5;
        onProgress(Math.min(bytesRead / estimatedTotal, 0.99));
      }

      if (!readyFired && framesParsed >= MIN_FRAMES_TO_PLAY) {
        readyFired = true;
        if (onReady) onReady();
      }
    }

    if (!readyFired && onReady) onReady();
  }
}