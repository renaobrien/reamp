/**
 * Minimal functional transport strip: proves the whole chain from button
 * to AppleScript before Webamp's pixels land. Replaced by the Webamp
 * host later in M2.
 */
import type { PlayerStateEvent, TransportCommand } from '../shared/ipc.js';
import type { ReampApi } from '../preload.js';

declare global {
  interface Window {
    reamp: ReampApi;
  }
}

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`missing element #${id}`);
  return el;
};

function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function send(cmd: TransportCommand): void {
  void window.reamp.transport(cmd).catch((err: unknown) => {
    $('status').textContent = String(err instanceof Error ? err.message : err);
  });
}

function render(event: PlayerStateEvent): void {
  const { state, source } = event;
  $('marquee').textContent = `${state.track.artist} - ${state.track.title}`;
  $('time').textContent = `${fmtTime(state.positionMs)} / ${fmtTime(state.track.durationMs)}`;
  $('status').textContent = `${source} · ${state.playing ? 'playing' : 'paused'}`;
  ($('playpause') as HTMLButtonElement).textContent = state.playing ? '❚❚' : '▶';
}

let playing = false;

window.reamp.onPlayerState((event) => {
  playing = event.state.playing;
  render(event);
});

// Debug vis: 75 classic bars plus the oscilloscope trace. Colors follow
// the stock viscolor palette vibe until real viscolor.txt support (M3).
const canvas = $('vis') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
window.reamp.onVisFrame(({ levels, wave }) => {
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  const barW = width / levels.length;
  for (let i = 0; i < levels.length; i++) {
    const h = levels[i]! * (height - 20);
    const hue = 120 - (h / (height - 20)) * 120; // green floor to red peak
    ctx.fillStyle = `hsl(${hue}, 90%, 50%)`;
    ctx.fillRect(i * barW, height - h, Math.max(1, barW - 1), h);
  }
  ctx.strokeStyle = '#00e5b0';
  ctx.beginPath();
  for (let i = 0; i < wave.length; i++) {
    const x = (i / (wave.length - 1)) * width;
    const y = height / 2 + (wave[i]! * height) / 2.5;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
});

$('prev').addEventListener('click', () => send({ action: 'previous' }));
$('playpause').addEventListener('click', () =>
  send(playing ? { action: 'pause' } : { action: 'play' }),
);
$('next').addEventListener('click', () => send({ action: 'next' }));
$('source').addEventListener('change', (e) => {
  const id = (e.target as HTMLSelectElement).value;
  void window.reamp.setSource(id).then(() => {
    $('status').textContent = `${id} · switched`;
  });
});
