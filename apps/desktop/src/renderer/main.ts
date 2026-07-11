/**
 * Renderer entry: mounts Webamp on the stage, drives the deck (classic
 * vis, transport, readout), and manages the stage visuals. The deck
 * canvas always shows the classic vis (click flips bars/scope, like the
 * original). The stage backdrop behind Webamp cycles Off / Tunnel /
 * Plasma / Swarm / Milkdrop, with a fullscreen option for all of them.
 */
import type { PlayerStateEvent, TransportCommand, VisFrameEvent } from '../shared/ipc.js';
import type { ReampApi } from '../preload.js';
import { ClassicVis } from './classic-vis.js';
import { installDemoBridge } from './demo-bridge.js';
import type { MilkdropEngine } from './milkdrop-engine.js';
import { FeatureExtractor, createScenes, type SpectralFeatures } from './scenes.js';

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

function setStatus(text: string): void {
  $('status').textContent = text;
}

function send(cmd: TransportCommand): void {
  void window.reamp.transport(cmd).catch((err: unknown) => {
    setStatus(String(err instanceof Error ? err.message : err));
  });
}

// ---- player readout + transport -------------------------------------------

let playing = false;

window.reamp.onPlayerState((event: PlayerStateEvent) => {
  const { state, source } = event;
  playing = state.playing;
  $('marquee').textContent = `${state.track.artist} - ${state.track.title}`;
  $('time').textContent = `${fmtTime(state.positionMs)} / ${fmtTime(state.track.durationMs)}`;
  setStatus(`${source} · ${state.playing ? 'playing' : 'paused'}`);
  ($('playpause') as HTMLButtonElement).textContent = state.playing ? '❚❚' : '▶';
});

$('prev').addEventListener('click', () => send({ action: 'previous' }));
$('playpause').addEventListener('click', () =>
  send(playing ? { action: 'pause' } : { action: 'play' }),
);
$('next').addEventListener('click', () => send({ action: 'next' }));
$('source').addEventListener('change', (e) => {
  const id = (e.target as HTMLSelectElement).value;
  void window.reamp.setSource(id).then(() => setStatus(`${id} · switched`));
});

// ---- Webamp on the stage ---------------------------------------------------

let webampRef: import('webamp').default | null = null;

import('./webamp-host.js')
  .then(async ({ mountWebamp }) => {
    webampRef = await mountWebamp(window.reamp, $('webamp-container'), setStatus);
    // restore the persisted skin once Webamp is up
    const saved = await window.reamp.getSavedSkin();
    if (saved !== null && saved.byteLength > 0) {
      const { extractViscolors } = await import('./skin-drop.js');
      const colors = await extractViscolors(saved).catch(() => null);
      if (colors !== null) deckVis.setColors(colors);
      webampRef.setSkinFromUrl(URL.createObjectURL(new Blob([saved])));
    }
  })
  .catch((err: unknown) => {
    setStatus(`Webamp failed to mount: ${String(err instanceof Error ? err.message : err)}`);
  });

// ---- skin drag-and-drop (R2) -------------------------------------------------

import('./skin-drop.js')
  .then(({ installSkinDrop }) => {
    installSkinDrop(document.body, {
      onSkin: (url, name, data) => {
        webampRef?.setSkinFromUrl(url);
        setStatus(`skin: ${name}`);
        void window.reamp.saveSkin(data).catch(() => {});
      },
      onColors: (colors) => deckVis.setColors(colors),
      onError: setStatus,
    });
  })
  .catch(() => {});

// ---- deck vis (always on, bars/scope like the original) --------------------

const deckVis = new ClassicVis($('vis') as HTMLCanvasElement);
let deckMode: 'bars' | 'scope' = 'bars';
$('vis').addEventListener('click', () => {
  deckMode = deckMode === 'bars' ? 'scope' : 'bars';
  deckVis.setMode(deckMode);
});

// ---- stage visuals ----------------------------------------------------------

const stage = $('stage');
const sceneCanvas = $('scene-bg') as HTMLCanvasElement;
const milkdropCanvas = $('milkdrop-bg') as HTMLCanvasElement;
const scenes = createScenes();
const features = new FeatureExtractor();

const STAGE_MODES = ['Off', ...scenes.map((s) => s.name), 'Milkdrop'] as const;
let stageIndex = 0;
let milkdrop: MilkdropEngine | null = null;
let sceneRaf: number | null = null;
let latestFrame: VisFrameEvent | null = null;
let latestFeatures: SpectralFeatures = {
  bass: 0,
  mid: 0,
  treble: 0,
  beat: 0,
  centroid: 0,
  loudness: 0,
};

function sizeCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = stage.clientWidth * devicePixelRatio;
  canvas.height = stage.clientHeight * devicePixelRatio;
}

new ResizeObserver(() => {
  if (currentSceneIndex() !== null) sizeCanvas(sceneCanvas);
  if (STAGE_MODES[stageIndex] === 'Milkdrop' && milkdrop !== null) {
    milkdrop.setSize(stage.clientWidth * devicePixelRatio, stage.clientHeight * devicePixelRatio);
  }
}).observe(stage);

function currentSceneIndex(): number | null {
  const i = stageIndex - 1; // 0 is Off, milkdrop is last
  return i >= 0 && i < scenes.length ? i : null;
}

function stopSceneLoop(): void {
  if (sceneRaf !== null) {
    cancelAnimationFrame(sceneRaf);
    sceneRaf = null;
  }
}

function startSceneLoop(): void {
  if (sceneRaf !== null) return;
  const ctx = sceneCanvas.getContext('2d');
  if (ctx === null) return;
  ctx.fillStyle = '#04040a';
  ctx.fillRect(0, 0, sceneCanvas.width, sceneCanvas.height);
  let lastT: number | null = null;
  const loop = (t: number): void => {
    const dt = lastT === null ? 16.7 : t - lastT;
    lastT = t;
    const idx = currentSceneIndex();
    if (idx !== null && latestFrame !== null) {
      scenes[idx]!.render(
        ctx,
        sceneCanvas.width,
        sceneCanvas.height,
        latestFrame,
        latestFeatures,
        t,
        dt,
      );
    }
    sceneRaf = requestAnimationFrame(loop);
  };
  sceneRaf = requestAnimationFrame(loop);
}

async function activateMilkdrop(): Promise<void> {
  if (milkdrop === null) {
    const { MilkdropEngine } = await import('./milkdrop-engine.js');
    sizeCanvas(milkdropCanvas);
    milkdrop = new MilkdropEngine({
      canvas: milkdropCanvas,
      onPreset: (name) => setStatus(name),
    });
  }
  if (latestFrame !== null) milkdrop.updatePcm(latestFrame.pcm);
  milkdrop.start();
}

function setStageMode(index: number, persist = true): void {
  stageIndex = (index + STAGE_MODES.length) % STAGE_MODES.length;
  const mode = STAGE_MODES[stageIndex]!;
  $('stage-name').textContent = mode;
  if (persist) void window.reamp.saveSettings({ stageMode: mode }).catch(() => {});
  document.body.classList.toggle('mode-milkdrop', mode === 'Milkdrop');
  document.body.classList.toggle('mode-scene', currentSceneIndex() !== null);

  if (mode === 'Milkdrop') {
    stopSceneLoop();
    activateMilkdrop().catch((err: unknown) => {
      setStatus(String(err instanceof Error ? err.message : err));
    });
    return;
  }
  milkdrop?.stop();
  if (currentSceneIndex() !== null) {
    sizeCanvas(sceneCanvas);
    startSceneLoop();
  } else {
    stopSceneLoop();
  }
}

$('stage-prev').addEventListener('click', () => setStageMode(stageIndex - 1));
$('stage-next').addEventListener('click', () => setStageMode(stageIndex + 1));
$('stage-name').addEventListener('click', () => setStageMode(stageIndex + 1));
$('preset-next').addEventListener('click', () => milkdrop?.next());
$('preset-prev').addEventListener('click', () => milkdrop?.previous());
$('preset-random').addEventListener('click', () => milkdrop?.random());

$('fullscreen').addEventListener('click', () => {
  if (document.fullscreenElement === null) void stage.requestFullscreen();
  else void document.exitFullscreen();
});

// restore the persisted stage mode and source selection
void window.reamp
  .getSettings()
  .then((s) => {
    const idx = STAGE_MODES.indexOf(s.stageMode as (typeof STAGE_MODES)[number]);
    if (idx > 0) setStageMode(idx, false);
    if (s.source === 'spotify' || s.source === 'apple-music') {
      ($('source') as HTMLSelectElement).value = s.source;
    }
  })
  .catch(() => {});

// ---- capture status + settings (R9: honest degradation) ----------------------

function renderCaptureState(event: { state: string; detail?: string }): void {
  const chip = $('capture');
  const bad = event.state === 'failed' || event.state === 'stopped';
  chip.classList.toggle('visible', bad);
  if (bad) chip.textContent = `capture ${event.state}`;
  $('set-capture').textContent = event.detail
    ? `${event.state}: ${event.detail.split('\n')[0]}`
    : event.state;
}

window.reamp.onVisState(renderCaptureState);
void window.reamp.getVisState().then(renderCaptureState).catch(() => {});
void window.reamp
  .getAppInfo()
  .then((info) => {
    $('set-sidecar').textContent = info.sidecar;
    $('set-version').textContent = `${info.version} (${info.mode})`;
  })
  .catch(() => {});

$('settings-btn').addEventListener('click', () => {
  $('settings-panel').classList.toggle('open');
});
$('send-feedback').addEventListener('click', () => {
  void window.reamp.sendFeedback().catch(() => {});
});

// ---- playlist browser --------------------------------------------------------

const panel = $('playlist-panel');
const itemsEl = $('playlist-items');
const backBtn = $('playlist-back') as HTMLButtonElement;

function renderItems(
  entries: Array<{ label: string; onClick?: () => void }>,
  title: string,
  showBack: boolean,
): void {
  $('playlist-title').textContent = title;
  backBtn.hidden = !showBack;
  itemsEl.replaceChildren(
    ...entries.map(({ label, onClick }) => {
      const li = document.createElement('li');
      li.textContent = label;
      if (onClick === undefined) li.className = 'note';
      else li.addEventListener('click', onClick);
      return li;
    }),
  );
}

async function showPlaylists(): Promise<void> {
  renderItems([{ label: 'loading…' }], 'Playlists', false);
  try {
    const lists = (await window.reamp.getPlaylists()) as Array<{
      id: string;
      name: string;
      trackCount: number;
    }>;
    if (lists.length === 0) {
      renderItems([{ label: 'no playlists found' }], 'Playlists', false);
      return;
    }
    renderItems(
      lists.map((p) => ({
        label: `${p.name} (${p.trackCount})`,
        onClick: () => void showTracks(p.id, p.name),
      })),
      'Playlists',
      false,
    );
  } catch (err) {
    // Spotify desktop-control mode lands here by design: its scripting
    // interface cannot enumerate playlists. Honest message, not a spinner.
    renderItems(
      [{ label: String(err instanceof Error ? err.message : err) }],
      'Playlists',
      false,
    );
  }
}

async function showTracks(id: string, name: string): Promise<void> {
  renderItems([{ label: 'loading…' }], name, true);
  try {
    const tracks = (await window.reamp.getPlaylistTracks(id)) as Array<{
      uri: string;
      title: string;
      artist: string;
    }>;
    renderItems(
      tracks.map((t) => ({
        label: `${t.artist} - ${t.title}`,
        onClick: () => send({ action: 'play', uri: t.uri }),
      })),
      name,
      true,
    );
  } catch (err) {
    renderItems([{ label: String(err instanceof Error ? err.message : err) }], name, true);
  }
}

$('playlists').addEventListener('click', () => {
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) void showPlaylists();
});
backBtn.addEventListener('click', () => void showPlaylists());

// ---- frames ----------------------------------------------------------------

window.reamp.onVisFrame((frame) => {
  latestFrame = frame;
  latestFeatures = features.extract(frame);
  deckVis.render(frame);
  milkdrop?.updatePcm(frame.pcm);
});
