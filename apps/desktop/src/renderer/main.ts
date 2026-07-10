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
