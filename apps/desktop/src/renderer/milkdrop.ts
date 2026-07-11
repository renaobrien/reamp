/**
 * The standalone Milkdrop window (R7): full-window Butterchurn at display
 * rate, fed by loopback PCM frames. Keys: space/N next preset, P
 * previous, R random, F or double-click fullscreen. Failures render as a
 * readable message instead of a black void.
 */
import type { ReampApi } from '../preload.js';
import { installDemoBridge } from './demo-bridge.js';
import { MilkdropEngine } from './milkdrop-engine.js';
import { FeatureExtractor } from './scenes.js';

declare global {
  interface Window {
    reamp: ReampApi;
  }
}

// Plain-browser demo mode (no Electron preload): synthesized audio.
if (!('reamp' in window)) installDemoBridge();

const canvas = document.getElementById('milkdrop') as HTMLCanvasElement;
const overlay = document.getElementById('preset-name')!;

function fail(message: string): void {
  overlay.textContent = message;
  overlay.classList.add('visible', 'error');
}

window.addEventListener('error', (e) => fail(String(e.message)));

let overlayTimer: ReturnType<typeof setTimeout> | null = null;
function showPresetName(name: string): void {
  overlay.textContent = name;
  overlay.classList.add('visible');
  if (overlayTimer !== null) clearTimeout(overlayTimer);
  overlayTimer = setTimeout(() => overlay.classList.remove('visible'), 3000);
}

try {
  canvas.width = window.innerWidth * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
  const engine = new MilkdropEngine({ canvas, onPreset: showPresetName });
  const features = new FeatureExtractor();

  window.reamp.onVisFrame((frame) => {
    engine.updatePcm(frame.pcm);
    engine.beat(features.extract(frame).beat);
  });
  window.addEventListener('resize', () =>
    engine.setSize(window.innerWidth * devicePixelRatio, window.innerHeight * devicePixelRatio),
  );

  const toggleFullscreen = (): void => {
    if (document.fullscreenElement === null) void document.documentElement.requestFullscreen();
    else void document.exitFullscreen();
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key.toLowerCase() === 'n') engine.next();
    else if (e.key.toLowerCase() === 'p') engine.previous();
    else if (e.key.toLowerCase() === 'r') engine.random();
    else if (e.key.toLowerCase() === 'f') toggleFullscreen();
  });
  canvas.addEventListener('dblclick', toggleFullscreen);

  engine.start();
} catch (err) {
  fail(String(err instanceof Error ? err.message : err));
}
