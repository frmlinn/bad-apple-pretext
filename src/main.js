/**
 * @fileoverview Main entry point for the Bad Apple!! Pretext Canvas simulation.
 * Handles fetching, canvas scaling, dynamic font rendering, and playback control.
 */

import { prepareWithSegments, layoutNextLine } from '@chenglou/pretext';

/** @type {HTMLCanvasElement} */
const canvas = document.getElementById('canvas');
/** @type {CanvasRenderingContext2D} */
const ctx = canvas.getContext('2d', { alpha: false });

/** @type {HTMLElement} */
const ui = document.getElementById('ui');
/** @type {HTMLElement} */
const loadingText = document.getElementById('loading');
/** @type {HTMLButtonElement} */
const btnPlay = document.getElementById('btnPlay');
/** @type {HTMLButtonElement} */
const btnReset = document.getElementById('btnReset');

const FPS_VIDEO = 30;
const TEXT_ROWS = 80;
const LOGICAL_WIDTH = 1000;

/** @type {HTMLAudioElement} */
let audio;
/** @type {Uint16Array} */
let uint16Data;
/** @type {number[]} */
let frameOffsets = [];

let rawTextEN = '';
let rawTextJP = '';
let preparedEN;
let preparedJP;

let currentFontEN = '';
let currentFontJP = '';
let physicalScaleX = 1;
let physicalLineHeight = 1;

let resizeTimeout;
let isPlaying = false;

/**
 * Initializes resources (lyrics, binary frames, audio) and sets up event listeners.
 * @async
 * @returns {Promise<void>}
 */
async function init() {
  try {
    const [resEN, resJP, resBin] = await Promise.all([
      fetch('lyrics_bad_apple_en.txt'),
      fetch('lyrics_bad_apple_jp.txt'),
      fetch('frames.bin')
    ]);

    rawTextEN = await resEN.text();
    const bufferJP = await resJP.arrayBuffer();
    rawTextJP = new TextDecoder('utf-8').decode(bufferJP);

    const bufferBin = await resBin.arrayBuffer();
    uint16Data = new Uint16Array(bufferBin);

    let ptr = 0;
    while (ptr < uint16Data.length) {
      frameOffsets.push(ptr);
      const numSegments = uint16Data[ptr];
      ptr += 1 + (numSegments * 4);
    }

    audio = new Audio('audio.m4a');
    audio.addEventListener('ended', onAudioEnded);

    handleResize();

    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(handleResize, 150);
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && isPlaying) {
        audio.pause();
        isPlaying = false;
      }
    });

    loadingText.style.display = 'none';
    btnPlay.style.display = 'block';
    btnReset.style.display = 'block';

  } catch (error) {
    loadingText.innerText = "Error loading resources";
    console.error("Initialization Error:", error);
  }
}

/**
 * Handles audio completion, resetting UI and playback state.
 * @returns {void}
 */
function onAudioEnded() {
  isPlaying = false;
  audio.currentTime = 0;
  ui.style.display = 'flex';
  ui.style.opacity = '1';
}

/**
 * Calculates responsive viewport dimensions, applies HiDPI scaling,
 * and dynamically recalculates Pretext text boundaries.
 * @returns {void}
 */
function handleResize() {
  const cssWidth = window.innerWidth;
  const cssHeight = window.innerHeight;

  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;

  const dpr = window.devicePixelRatio || 1;
  const physWidth = Math.floor(cssWidth * dpr);
  const physHeight = Math.floor(cssHeight * dpr);

  canvas.width = physWidth;
  canvas.height = physHeight;

  physicalScaleX = physWidth / LOGICAL_WIDTH;
  physicalLineHeight = physHeight / TEXT_ROWS;

  const fontSize = Math.max(8, Math.floor(physicalLineHeight * 0.9));
  currentFontEN = `bold ${fontSize}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  currentFontJP = `bold ${fontSize}px "Noto Sans JP", sans-serif`;

  if (rawTextEN && rawTextJP) {
    preparedEN = prepareWithSegments(rawTextEN, currentFontEN);
    preparedJP = prepareWithSegments(rawTextJP, currentFontJP);
  }

  if (audio && audio.paused && audio.currentTime > 0) {
    renderFrame();
  }
}

/**
 * Core rendering loop. Requests animation frames while audio is playing.
 * @returns {void}
 */
function renderLoop() {
  if (!isPlaying) return;
  renderFrame();
  requestAnimationFrame(renderLoop);
}

/**
 * Synchronizes binary frame data with audio timeline and draws text segments to the canvas.
 * @returns {void}
 */
function renderFrame() {
  let currentFrame = (audio.currentTime * FPS_VIDEO) | 0;
  if (currentFrame >= frameOffsets.length) currentFrame = frameOffsets.length - 1;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const offset = frameOffsets[currentFrame];
  const numSegments = uint16Data[offset];
  let ptr = offset + 1;

  ctx.textBaseline = 'top';

  let cursorEN = { segmentIndex: 0, graphemeIndex: 0 };
  let cursorJP = { segmentIndex: 0, graphemeIndex: 0 };

  for (let i = 0; i < numSegments; i++) {
    const logicalY = uint16Data[ptr++];
    const colorType = uint16Data[ptr++];
    const logicalStartX = uint16Data[ptr++];
    const logicalEndX = uint16Data[ptr++];

    const startX = logicalStartX * physicalScaleX;
    const endX = logicalEndX * physicalScaleX;
    const realY = logicalY * physicalLineHeight;
    const segmentWidth = endX - startX;

    if (segmentWidth <= 0) continue;

    if (colorType === 1) {
      ctx.fillStyle = 'white';
      ctx.fillRect(startX, realY, segmentWidth, physicalLineHeight);

      let line = layoutNextLine(preparedEN, cursorEN, segmentWidth);
      if (line === null) {
        cursorEN = { segmentIndex: 0, graphemeIndex: 0 };
        line = layoutNextLine(preparedEN, cursorEN, segmentWidth);
      }

      if (line) {
        ctx.fillStyle = 'black';
        ctx.font = currentFontEN;
        ctx.fillText(line.text, startX, realY);
        cursorEN = line.end;
      }
    } else {
      let line = layoutNextLine(preparedJP, cursorJP, segmentWidth);
      if (line === null) {
        cursorJP = { segmentIndex: 0, graphemeIndex: 0 };
        line = layoutNextLine(preparedJP, cursorJP, segmentWidth);
      }

      if (line) {
        ctx.fillStyle = 'white';
        ctx.font = currentFontJP;
        ctx.fillText(line.text, startX, realY);
        cursorJP = line.end;
      }
    }
  }
}

/**
 * Initiates audio playback and transitions UI.
 * Handles mobile browser autoplay restrictions.
 * @returns {void}
 */
function startPlaying() {
  if (!audio) return;
  isPlaying = true;

  audio.play().then(() => {
    ui.style.opacity = '0';
    setTimeout(() => ui.style.display = 'none', 300);
    requestAnimationFrame(renderLoop);
  }).catch(err => {
    console.error("Autoplay blocked by browser:", err);
    isPlaying = false;
  });
}

/**
 * Handles reset functionality. Pauses audio, resets time, and restores initial UI.
 * @returns {void}
 */
function resetSimulation() {
  if (!audio) return;

  audio.pause();
  audio.currentTime = 0;
  isPlaying = false;

  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ui.style.display = 'flex';
  setTimeout(() => ui.style.opacity = '1', 10);
}

// ---------------------------------------------------------
// EVENT LISTENERS
// ---------------------------------------------------------

['click', 'touchstart'].forEach(evt => {
  btnPlay.addEventListener(evt, (e) => {
    e.stopPropagation();
    e.preventDefault();
    startPlaying();
  }, { passive: false });
});

['click', 'touchstart'].forEach(evt => {
  canvas.addEventListener(evt, (e) => {
    e.preventDefault();
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      isPlaying = false;
    } else {
      startPlaying();
    }
  }, { passive: false });
});

['click', 'touchstart'].forEach(evt => {
  btnReset.addEventListener(evt, (e) => {
    e.stopPropagation();
    e.preventDefault();
    resetSimulation();
  }, { passive: false });
});

// Bootstrap application
init();