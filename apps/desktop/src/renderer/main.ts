/**
 * Renderer entry: mounts Webamp, drives the classic vis deck, and keeps
 * the fallback transport controls wired. Everything reaches the main
 * process only through the `window.reamp` bridge.
 */
import type { PlayerStateEvent, TransportCommand } from '../shared/ipc.js';
import type { ReampApi } from '../preload.js';
import { ClassicVis } from './classic-vis.js';
import { installDemoBridge } from './demo-bridge.js';

declare global {
  interface Window {
    reamp: ReampApi;
  }
}

// Outside Electron (plain browser: vite dev, static hosting) there is no
// preload, so run in demo mode with synthesized audio and fake tracks.
if (!('reamp' in window)) installDemoBridge();

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

// Webamp mounts into the main area; the deck below stays as the always-on
// diagnostic surface until Webamp is verified on a real display.
import('./webamp-host.js')
  .then(({ mountWebamp }) => mountWebamp(window.reamp, $('webamp-container')))
  .catch((err: unknown) => {
    $('status').textContent = `Webamp failed to mount: ${String(
      err instanceof Error ? err.message : err,
    )}`;
  });

const vis = new ClassicVis($('vis') as HTMLCanvasElement);
window.reamp.onVisFrame((frame) => vis.render(frame));

let playing = false;

window.reamp.onPlayerState((event) => {
  playing = event.state.playing;
  render(event);
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
