/**
 * The detachable Milkdrop window (R7): Butterchurn full-window at 60fps,
 * fed by loopback PCM frames from the vis service. No Web Audio graph;
 * we hand render() raw 128-centered byte arrays, which butterchurn@2.6.7
 * accepts when created with a null AudioContext.
 *
 * Keys: space/N next preset, P previous, R random, F fullscreen.
 * Presets auto-advance every 30s; any manual navigation resets the clock.
 */
import butterchurn from 'butterchurn';
import basePack from 'butterchurn-presets';
import extraPack from 'butterchurn-presets/lib/butterchurnPresetsExtra.min.js';
import type { ReampApi } from '../preload.js';
import { installDemoBridge } from './demo-bridge.js';
import { PresetCycler } from './preset-cycler.js';

declare global {
  interface Window {
    reamp: ReampApi;
  }
}

// Plain-browser demo mode (no Electron preload): synthesized audio.
if (!('reamp' in window)) installDemoBridge();

const AUTO_ADVANCE_MS = 30_000;
const BLEND_SECONDS = 2.7;
const SAMPLES = 1024; // butterchurn's AudioProcessor fftSize

const canvas = document.getElementById('milkdrop') as HTMLCanvasElement;
const overlay = document.getElementById('preset-name')!;

const presets: Record<string, object> = { ...basePack.getPresets(), ...extraPack.getPresets() };
const cycler = new PresetCycler(Object.keys(presets).sort());

const visualizer = butterchurn.createVisualizer(null, canvas, {
  width: window.innerWidth * devicePixelRatio,
  height: window.innerHeight * devicePixelRatio,
  pixelRatio: devicePixelRatio,
});

let overlayTimer: ReturnType<typeof setTimeout> | null = null;
function showPreset(name: string, blend = BLEND_SECONDS): void {
  visualizer.loadPreset(presets[name]!, blend);
  overlay.textContent = name;
  overlay.classList.add('visible');
  if (overlayTimer !== null) clearTimeout(overlayTimer);
  overlayTimer = setTimeout(() => overlay.classList.remove('visible'), 3000);
}

let autoTimer = setInterval(() => showPreset(cycler.next()), AUTO_ADVANCE_MS);
function navigate(name: string): void {
  clearInterval(autoTimer);
  autoTimer = setInterval(() => showPreset(cycler.next()), AUTO_ADVANCE_MS);
  showPreset(name);
}

document.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key.toLowerCase() === 'n') navigate(cycler.next());
  else if (e.key.toLowerCase() === 'p') navigate(cycler.previous());
  else if (e.key.toLowerCase() === 'r') navigate(cycler.randomJump());
  else if (e.key.toLowerCase() === 'f') {
    if (document.fullscreenElement === null) void document.documentElement.requestFullscreen();
    else void document.exitFullscreen();
  }
});
canvas.addEventListener('dblclick', () => {
  if (document.fullscreenElement === null) void document.documentElement.requestFullscreen();
  else void document.exitFullscreen();
});

// 128-centered byte arrays; silence until the first frame arrives.
const timeByteArray = new Uint8Array(SAMPLES).fill(128);
const timeByteArrayL = new Uint8Array(SAMPLES).fill(128);
const timeByteArrayR = new Uint8Array(SAMPLES).fill(128);

window.reamp.onVisFrame(({ pcm }) => {
  const n = Math.min(SAMPLES, pcm.length);
  for (let i = 0; i < n; i++) {
    const v = pcm[i]!;
    const byte = Math.max(0, Math.min(255, Math.round(v * 127 + 128)));
    timeByteArray[i] = byte;
    timeByteArrayL[i] = byte; // mono capture: same signal both channels
    timeByteArrayR[i] = byte;
  }
});

function resize(): void {
  const w = window.innerWidth * devicePixelRatio;
  const h = window.innerHeight * devicePixelRatio;
  canvas.width = w;
  canvas.height = h;
  visualizer.setRendererSize(w, h);
}
window.addEventListener('resize', resize);
resize();
showPreset(cycler.current, 0);

// Render at display rate; PCM updates at the vis-service frame rate and
// each window is simply reused until the next one lands.
function frame(): void {
  visualizer.render({ audioLevels: { timeByteArray, timeByteArrayL, timeByteArrayR } });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
