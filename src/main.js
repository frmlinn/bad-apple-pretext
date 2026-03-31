import { prepareWithSegments, layoutNextLine } from '@chenglou/pretext';

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { alpha: false }); // alpha: false optimizes GPU rendering
const ui = document.getElementById('ui');
const loadingText = document.getElementById('loading');
const btnPlay = document.getElementById('btnPlay');
const btnReset = document.getElementById('btnReset');

const FPS_VIDEO = 30;
const TEXT_ROWS = 40;        // So it matches the preprocessing script
const LOGICAL_WIDTH = 1000; 

const FONT_EN = 'bold 14px "Helvetica Neue", Helvetica, Arial, sans-serif';
const FONT_JP = 'bold 14px "Noto Sans JP", sans-serif';

let audio;
let uint16Data;
let frameOffsets = [];
let preparedEN;
let preparedJP;
let scaleX = 1;
let lineHeight = 1;

// ==========================================
// INITIALIZATION
// ==========================================
async function init() {
  try {
    //Fetch text lyrics
    const [resEN, resJP] = await Promise.all([
      fetch('lyrics_bad_apple_en.txt'),
      fetch('lyrics_bad_apple_jp.txt')
    ]);
    
    const textEN = await resEN.text();
    
    // Strict UTF-8 decoding to prevent Mojibake in Japanese text
    const bufferJP = await resJP.arrayBuffer();
    const decoder = new TextDecoder('utf-8');
    const textJP = decoder.decode(bufferJP);

    //Fetch and parse binary frame data
    const resBin = await fetch('frames.bin');
    const bufferBin = await resBin.arrayBuffer();
    uint16Data = new Uint16Array(bufferBin);
    
    // Look-up table for frame byte offsets
    let ptr = 0;
    while (ptr < uint16Data.length) {
      frameOffsets.push(ptr);
      const numSegments = uint16Data[ptr];
      ptr += 1 + (numSegments * 4); 
    }

    audio = new Audio('audio.m4a'); 
    audio.addEventListener('ended', () => {
      audio.currentTime = 0;
      audio.pause();
      ui.style.display = 'flex';
      ui.style.opacity = '1';
    });
    
    handleResize();
    window.addEventListener('resize', handleResize);

    // Pre-computes glyph metrics and segmentation caches 
    preparedEN = prepareWithSegments(textEN, FONT_EN);
    preparedJP = prepareWithSegments(textJP, FONT_JP);

    loadingText.style.display = 'none';
    btnPlay.style.display = 'flex'; 
    btnReset.style.display = 'flex';

  } catch (error) {
    loadingText.innerText = "Error loading resources";
    console.error("Initialization Error:", error);
  }
}

// ==========================================
// VIEWPORT HANDLING
// ==========================================
function handleResize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  scaleX = canvas.width / LOGICAL_WIDTH;
  lineHeight = canvas.height / TEXT_ROWS;
}

// ==========================================
// MAIN RENDER LOOP
// ==========================================
function renderLoop() {
  if (audio.paused) return;

  // Sync current frame with audio timeline
  let currentFrame = (audio.currentTime * FPS_VIDEO) | 0;
  if (currentFrame >= frameOffsets.length) currentFrame = frameOffsets.length - 1;

  // Clear previous frame
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Retrieve segment data for the current frame
  const offset = frameOffsets[currentFrame];
  const numSegments = uint16Data[offset];
  let ptr = offset + 1;
  
  ctx.textBaseline = 'top';

  // Reset cursors to loop text organically per frame
  let cursorEN = { segmentIndex: 0, graphemeIndex: 0 };
  let cursorJP = { segmentIndex: 0, graphemeIndex: 0 };

  for (let i = 0; i < numSegments; i++) {
    const logicalY = uint16Data[ptr++];
    const colorType = uint16Data[ptr++];
    const startX = uint16Data[ptr++] * scaleX;
    const endX = uint16Data[ptr++] * scaleX;
    const realY = logicalY * lineHeight;
    const segmentWidth = endX - startX;

    if (segmentWidth <= 0) continue; 

    if (colorType === 1) {
      ctx.fillStyle = 'white';
      ctx.fillRect(startX, realY, segmentWidth, lineHeight);

      let line = layoutNextLine(preparedEN, cursorEN, segmentWidth);
      if (line === null) {
        cursorEN = { segmentIndex: 0, graphemeIndex: 0 };
        line = layoutNextLine(preparedEN, cursorEN, segmentWidth);
      }

      if (line) {
        ctx.fillStyle = 'black';
        ctx.font = FONT_EN;
        ctx.fillText(line.text, startX, realY);
        cursorEN = line.end; // Advance cursor
      }

    } else {
      let line = layoutNextLine(preparedJP, cursorJP, segmentWidth);
      if (line === null) {
        cursorJP = { segmentIndex: 0, graphemeIndex: 0 };
        line = layoutNextLine(preparedJP, cursorJP, segmentWidth);
      }

      if (line) {
        ctx.fillStyle = 'white';
        ctx.font = FONT_JP;
        ctx.fillText(line.text, startX, realY);
        cursorJP = line.end;
      }
    }
  }

  requestAnimationFrame(renderLoop);
}

// ==========================================
// EVENT LISTENERS
// ==========================================

// Initial Play
btnPlay.addEventListener('click', (e) => {
  e.stopPropagation(); 
  ui.style.opacity = '0';
  setTimeout(() => ui.style.display = 'none', 300);
  
  audio.play();
  requestAnimationFrame(renderLoop);
});

// Canvas Play/Pause toggle
canvas.addEventListener('click', () => {
  if (!audio) return; 
  
  if (audio.paused) {
    audio.play();
    requestAnimationFrame(renderLoop); 
  } else {
    audio.pause();
  }
});

// Global Reset
btnReset.addEventListener('click', () => {
  if (!audio) return;
  
  audio.pause();
  audio.currentTime = 0;
  
  // Clear canvas to prevent stuck frames
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  ui.style.display = 'flex';
  setTimeout(() => ui.style.opacity = '1', 10);
});

init();