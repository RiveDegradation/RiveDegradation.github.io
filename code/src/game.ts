// =====================================================
// BUG REPORT: Severe Performance Degradation with Multiple Artboard Renders
// =====================================================
// Issue: When rendering the same artboard multiple times, performance drops non-linearly
// Expected: Performance impact should be roughly linear with number of renders
// Actual Results on Firefox 133.0, Nvidia 4070 Super, Intel i7-13700K:
// - 2x renders: Stable 165 FPS
// - 3x renders: 165 FPS but with major frame time spikes
// - 4x renders: Drops to 60 FPS
// This suggests a serious underlying issue with multiple artboard.draw() calls
// Jump to line #131 to see the bug reproduction.
// =====================================================

import Rive, { RiveCanvas, File, WrappedRenderer, StateMachineInstance, Artboard } from '@rive-app/webgl-advanced';

// Version control for reproducing the issue
const VERSION = '2.21.6'; //In case you want to test with a different version. Remember to change package.json as well.

// Core rendering variables
let rive : RiveCanvas;
let canvas : HTMLCanvasElement;
let lastTime = 0;
let renderer : WrappedRenderer;
let artboard : Artboard;
let stateMachine : StateMachineInstance;
let renderCount = 1;

// FPS tracking variables
let fpsArray: number[] = [];
const MAX_FPS_SAMPLES = 1000;
let fpsCanvas: HTMLCanvasElement;
let fpsContext: CanvasRenderingContext2D;

async function main() {
  // Initialize Rive runtime
  console.log("Attempting to Load Rive WASM FROM: ", `https://unpkg.com/@rive-app/webgl-advanced@${VERSION}/rive.wasm`);
  rive = await Rive({
    locateFile: (_: string) => `https://unpkg.com/@rive-app/webgl-advanced@${VERSION}/rive.wasm`
  });

  // Setup canvas and renderer
  canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
  renderer = rive.makeRenderer(canvas);

  // Create UI controls to adjust render count
  const controls = document.createElement('div');
  controls.className = 'counter-controls'; 

  const minusBtn = document.createElement('button');
  minusBtn.textContent = '-';
  minusBtn.onclick = () => {
    renderCount = Math.max(1, renderCount - 1);
    countDisplay.textContent = renderCount.toString();
  };
  
  const countDisplay = document.createElement('span');
  countDisplay.textContent = '1';
  
  const plusBtn = document.createElement('button');
  plusBtn.textContent = '+';
  plusBtn.onclick = () => {
    renderCount = Math.min(100, renderCount + 1);
    countDisplay.textContent = renderCount.toString();
  };

  controls.appendChild(minusBtn);
  controls.appendChild(countDisplay);
  controls.appendChild(plusBtn);
  document.body.appendChild(controls);

  // Load and setup Rive animation
  /* FROM https://rive.app/community/files/12995-24869-pokey-pokey/ */
  const bytes = await (
    await fetch(new Request('/pokey_pokey.riv'))
  ).arrayBuffer();
  
  const file = (await rive.load(new Uint8Array(bytes))) as File;
  artboard = file.artboardByIndex(0);
  stateMachine = new rive.StateMachineInstance(
    artboard.stateMachineByIndex(0),
    artboard
  );

  // Initialize performance monitoring
  initFPSCanvas();
  window.addEventListener('resize', onResizeWindow);
  onResizeWindow();

  requestAnimationFrame(renderLoop);
}

// =====================================================
// Core Rendering Loop
// =====================================================

function renderLoop(time : number) {
  if (!lastTime) {
    lastTime = time;
  }
  const elapsedTimeMs = time - lastTime;
  const elapsedTimeSec = elapsedTimeMs / 1000;
  lastTime = time;

  // Track FPS
  const fps = 1 / elapsedTimeSec;
  fpsArray.push(fps);
  if (fpsArray.length > MAX_FPS_SAMPLES) {
    fpsArray.shift();
  }
  drawFPSGraph();

  // Perform rendering
  renderer.clear();
  stateMachine.advance(elapsedTimeSec);
  artboard.advance(elapsedTimeSec);
  renderer.save();
  renderer.align(
    rive.Fit.contain,
    rive.Alignment.center,
    {	
      minX: 0,	
      minY: 0,
      maxX: canvas.width,
      maxY: canvas.height
    },
    artboard.bounds,
  );

  // Bug reproduction: Draw artboard multiple times
  for (let i = 0; i < renderCount; i++) {
    artboard.draw(renderer);
  }

  renderer.restore();
  renderer.flush();
  rive.resolveAnimationFrame();
  
  requestAnimationFrame(renderLoop);
}

// =====================================================
// FPS Monitoring and Visualization
// =====================================================

function onResizeWindow() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function initFPSCanvas() {
  fpsCanvas = document.createElement('canvas');
  fpsCanvas.width = 200;
  fpsCanvas.height = 100;
  fpsCanvas.style.position = 'fixed';
  fpsCanvas.style.top = '10px';
  fpsCanvas.style.left = '10px';
  fpsCanvas.style.zIndex = '1000';
  fpsCanvas.style.maxWidth = '20vw';
  fpsCanvas.style.maxHeight = '20vh';
  fpsCanvas.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
  document.body.appendChild(fpsCanvas);
  fpsContext = fpsCanvas.getContext('2d', { alpha: true })!;
}

function drawFPSGraph() {
  const ctx = fpsContext;
  const width = fpsCanvas.width;
  const height = fpsCanvas.height;

  // Clear canvas with semi-transparent background
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, 0, width, height);

  // Draw grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.beginPath();
  for (let i = 0; i < width; i += 20) {
    ctx.moveTo(i, 0);
    ctx.lineTo(i, height);
  }
  for (let i = 0; i < height; i += 20) {
    ctx.moveTo(0, i);
    ctx.lineTo(width, i);
  }
  ctx.stroke();

  const minFPS = 15;
  const maxFPS = 200;
  const targetFPS = [30, 60, 120];

  // Draw target FPS lines
  targetFPS.forEach(fps => {
    const yPos = height - (((fps - minFPS) / (maxFPS - minFPS)) * height);
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
    ctx.beginPath();
    ctx.moveTo(0, yPos);
    ctx.lineTo(width, yPos);
    ctx.stroke();

    ctx.fillStyle = 'rgb(255, 255, 255)';
    ctx.font = '8px monospace';
    ctx.fillText(`${fps} FPS`, 5, yPos - 2);
  });

  // Draw FPS line
  ctx.strokeStyle = 'rgb(0, 255, 0)';
  ctx.beginPath();
  ctx.moveTo(0, height);

  if (fpsArray.length > 1) {
    fpsArray.forEach((fps, i) => {
      const x = (i / (fpsArray.length - 1)) * width;
      const clampedFPS = Math.max(minFPS, Math.min(maxFPS, fps));
      const y = height - (((clampedFPS - minFPS) / (maxFPS - minFPS)) * height);
      ctx.lineTo(x, y);
    });
  }
  ctx.stroke();

  // Draw current FPS
  ctx.fillStyle = 'rgb(255, 255, 255)';
  ctx.font = '10px monospace';
  ctx.fillText(`Current: ${Math.round(fpsArray[fpsArray.length - 1])} FPS`, 5, 10);
}

main();