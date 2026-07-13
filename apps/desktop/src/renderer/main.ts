/**
 * Renderer entry: mounts Webamp on the stage, drives the deck (classic
 * vis, transport, readout), and manages the stage visuals. The deck
 * canvas always shows the classic vis (click flips bars/scope, like the
 * original). The stage backdrop behind Webamp cycles Off / Tunnel /
 * Plasma / Swarm / Milkdrop, with a fullscreen option for all of them.
 */
import type {
  PersistedSettings,
  PlayerStateEvent,
  TransportCommand,
  VisFrameEvent,
} from '../shared/ipc.js';
import type { ReampApi } from '../preload.js';
import { ClassicVis } from './classic-vis.js';
import { installDemoBridge } from './demo-bridge.js';
import type { MilkdropEngine } from './milkdrop-engine.js';
import { FeatureExtractor, createScenes, type SpectralFeatures } from './scenes.js';
import { SharpPlayer } from './sharp-player.js';

declare global {
  interface Window {
    reamp: ReampApi;
  }
}

// Outside Electron (plain browser: vite dev, static hosting) there is no
// preload, so run in demo mode with synthesized audio and fake tracks.
if (!('reamp' in window)) installDemoBridge();

// Uncaught renderer errors land in the main-process log via console capture.
window.addEventListener('error', (e) => console.error(`uncaught: ${e.message} @ ${e.filename}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) =>
  console.error(`unhandled rejection: ${String(e.reason)}`),
);

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
});

// Transport lives on the skin (and the keyboard); the deck is for what
// the skin has no buttons for. The restore button brings the player
// back after its close button hides it.
$('player-restore').addEventListener('click', () => {
  webampRef?.reopen();
  ($('player-restore') as HTMLButtonElement).hidden = true;
  setTimeout(() => applyZoom(currentZoom), 50); // re-center about the reopened cluster
});
$('source').addEventListener('change', (e) => {
  const id = (e.target as HTMLSelectElement).value;
  void window.reamp.setSource(id).then(() => setStatus(`${id} · switched`));
});

// ---- Webamp on the stage ---------------------------------------------------

let webampRef: import('webamp').default | null = null;

let activeSkinUrl: string | null = null;
function applySkinUrl(url: string): void {
  if (activeSkinUrl !== null) URL.revokeObjectURL(activeSkinUrl);
  activeSkinUrl = url;
  webampRef?.setSkinFromUrl(url);
}

/**
 * Webamp's next/previous buttons operate on its internal playlist (one
 * entry in our world), so they were silent no-ops. Delegate clicks on the
 * real skin buttons to the transport instead.
 */
function hookWebampTransport(): void {
  const webampEl = document.getElementById('webamp');
  if (webampEl === null) return;
  webampEl.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('#next') !== null) send({ action: 'next' });
    else if (target.closest('#previous') !== null) send({ action: 'previous' });
  });
  // The EQ explainer must come from real pointer intent: Webamp also
  // calls the media-class EQ setters while restoring its own state at
  // boot, which is not the user asking why the sliders do nothing.
  webampEl.addEventListener('pointerup', (e) => {
    const target = e.target as HTMLElement;
    const inEqWindow =
      target.closest('#equalizer-window') !== null && target.closest('.title-bar') === null;
    if (inEqWindow || target.closest('#balance') !== null) onEqTouched();
  });
}

// ---- EQ explainer (desktop mode has no audio tap; honesty over silence) -----

let eqNoticeDismissed = false;
let eqNoticeShownThisSession = false;
const eqDialog = $('eq-notice') as HTMLDialogElement;

/** Fired by the media class whenever the skin's EQ, preamp, or balance
 * sliders move. Once per session unless dismissed forever. */
function onEqTouched(): void {
  if (eqNoticeDismissed || eqNoticeShownThisSession || eqDialog.open) return;
  eqNoticeShownThisSession = true;
  eqDialog.showModal();
}

// persist on close however it closes (button, Esc), so the checkbox
// always counts
eqDialog.addEventListener('close', () => {
  if (($('eq-notice-dismiss') as HTMLInputElement).checked) {
    eqNoticeDismissed = true;
    void window.reamp.saveSettings({ eqNoticeDismissed: true }).catch(() => {});
  }
});
$('eq-notice-close').addEventListener('click', () => eqDialog.close());

// ---- player styles: Sharp (vector, lossless) and Classic (.wsz bitmaps) -----

const sharp = new SharpPlayer({ host: $('stage'), bridge: window.reamp, send });
let playerStyle: 'sharp' | 'classic' = 'sharp';

function applyPlayerStyle(style: 'sharp' | 'classic', persist = true): void {
  playerStyle = style;
  sharp.root.hidden = style !== 'sharp';
  const webampEl = document.getElementById('webamp');
  if (webampEl !== null) webampEl.style.display = style === 'classic' ? '' : 'none';
  $('style-toggle').textContent = style === 'sharp' ? 'Classic' : 'Sharp';
  if (persist) void window.reamp.saveSettings({ playerStyle: style }).catch(() => {});
  applyZoom(currentZoom);
}

let currentZoom: number | 'fit' = 2;
let lastAppliedScale = 2;

function applyZoom(zoom: number | 'fit'): void {
  currentZoom = zoom;
  if (playerStyle === 'sharp') {
    let scale = zoom === 'fit' ? sharpFitScale() : zoom;
    scale = Math.min(8, Math.max(0.5, scale));
    sharp.setScale(scale);
    lastAppliedScale = scale;
    $('zoom-label').textContent =
      zoom === 'fit' ? `fit ${Math.round(scale * 100)}%` : `${Math.round(scale * 100)}%`;
    return;
  }
  const webampEl = document.getElementById('webamp');
  if (webampEl === null) return;
  webampEl.style.transform = '';
  // Webamp lays its windows out in viewport pixels inside a zero-size
  // root div, so a percentage transform origin resolves to 0,0 and a
  // plain scale slides the whole cluster down and right (fully off
  // screen at 3x). Measure the cluster with the transform cleared and
  // scale about its own center; when the scaled cluster would poke past
  // the top or left edge, anchor that edge instead so the main window
  // controls stay reachable and only the playlist bottom gets clipped.
  const rects = Array.from(
    document.querySelectorAll<HTMLElement>('#webamp [id$="-window"]'),
    (el) => el.getBoundingClientRect(),
  ).filter((r) => r.width > 0 && r.height > 0);
  const margin = 48;
  let originX = window.innerWidth / 2;
  let originY = window.innerHeight * 0.45;
  let scale = zoom === 'fit' ? 1 : zoom;
  if (rects.length > 0) {
    const left = Math.min(...rects.map((r) => r.left));
    const top = Math.min(...rects.map((r) => r.top));
    const right = Math.max(...rects.map((r) => r.right));
    const bottom = Math.max(...rects.map((r) => r.bottom));
    if (zoom === 'fit') {
      // largest scale that keeps the cluster on screen; smooth
      // filtering means fractional scales are fine, so use the room
      scale = Math.max(
        1,
        Math.min(
          8,
          Math.floor(
            Math.min(
              (window.innerWidth - margin * 2) / (right - left),
              (window.innerHeight - margin * 2) / (bottom - top),
            ) * 100,
          ) / 100,
        ),
      );
    }
    originX = (left + right) / 2;
    originY = (top + bottom) / 2;
    if (scale > 1) {
      if (originX - ((right - left) * scale) / 2 < margin) {
        originX = (left * scale - margin) / (scale - 1);
      }
      if (originY - ((bottom - top) * scale) / 2 < margin) {
        originY = (top * scale - margin) / (scale - 1);
      }
    }
  }
  lastAppliedScale = scale;
  $('zoom-label').textContent = zoom === 'fit' ? `fit ${Math.round(scale * 100)}%` : `${Math.round(scale * 100)}%`;
  if (scale === 1) return;
  const host = webampEl.getBoundingClientRect();
  // whole-pixel origin keeps the bitmaps on even offsets at every scale
  webampEl.style.transformOrigin = `${Math.round(originX - host.x)}px ${Math.round(originY - host.y)}px`;
  webampEl.style.transform = `scale(${scale})`;
}

/** Largest Sharp scale that leaves margins and room for the deck. */
function sharpFitScale(): number {
  const natural = sharp.naturalSize();
  return Math.min((window.innerWidth - 96) / natural.w, (window.innerHeight * 0.72) / natural.h);
}

function setZoomTo(zoom: number | 'fit'): void {
  applyZoom(zoom);
  void window.reamp.saveSettings({ webampZoom: zoom }).catch(() => {});
}

function zoomStep(delta: number): void {
  const base = currentZoom === 'fit' ? lastAppliedScale : currentZoom;
  setZoomTo(Math.min(8, Math.max(0.5, Math.round((base + delta) * 4) / 4)));
}

// fit follows the window; live-resize with the cluster pinned on screen
window.addEventListener('resize', () => {
  if (currentZoom === 'fit') applyZoom('fit');
});

import('./webamp-host.js')
  .then(async ({ mountWebamp }) => {
    webampRef = await mountWebamp(window.reamp, $('webamp-container'), {
      onNotice: setStatus,
      onClose: () => {
        ($('player-restore') as HTMLButtonElement).hidden = false;
        setStatus('player closed');
      },
    });
    hookWebampTransport();
    const settings = await window.reamp.getSettings().catch(() => ({}) as PersistedSettings);
    eqNoticeDismissed = settings.eqNoticeDismissed === true;
    // Webamp's root div exists only now; re-assert the active style so a
    // sharp boot hides it and a classic boot shows it
    applyPlayerStyle(settings.playerStyle === 'classic' ? 'classic' : 'sharp', false);
    applyZoom(settings.webampZoom ?? 2);
    // restore the persisted skin once Webamp is up
    const saved = await window.reamp.getSavedSkin();
    if (saved !== null && saved.byteLength > 0) {
      const { extractViscolors } = await import('./skin-drop.js');
      const colors = await extractViscolors(saved).catch(() => null);
      if (colors !== null) deckVis.setColors(colors);
      applySkinUrl(URL.createObjectURL(new Blob([saved])));
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
        applyPlayerStyle('classic'); // a dropped .wsz means: show me the skin
        applySkinUrl(url);
        setStatus(`skin: ${name}`);
        void window.reamp.saveSkin(data).catch(() => {});
      },
      onColors: (colors) => deckVis.setColors(colors),
      onError: setStatus,
    });
  })
  .catch(() => {});

// ---- deck vis (always on, bars/scope like the original) --------------------

const deckVisCanvas = $('vis') as HTMLCanvasElement;
const deckVis = new ClassicVis(deckVisCanvas);
new ResizeObserver(() => {
  deckVis.resize(
    deckVisCanvas.clientWidth * devicePixelRatio,
    deckVisCanvas.clientHeight * devicePixelRatio,
  );
}).observe(deckVisCanvas);
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
      onError: (message) => {
        setStatus(message);
        console.error(`milkdrop: ${message}`); // lands in reamp.log
      },
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

// restore persisted stage mode, source, and deck visibility; first launch
// opens on Tunnel so the stage visuals introduce themselves
void window.reamp
  .getSettings()
  .then((s) => {
    const idx = STAGE_MODES.indexOf(s.stageMode as (typeof STAGE_MODES)[number]);
    if (idx >= 0) setStageMode(idx, false);
    else setStageMode(1, false); // Tunnel by default
    if (s.source === 'spotify' || s.source === 'apple-music') {
      ($('source') as HTMLSelectElement).value = s.source;
    }
    if (s.deckHidden === true) {
      document.body.classList.add('deck-hidden');
      $('deck-toggle').textContent = 'deck ▴';
    }
  })
  .catch(() => {});

// ---- capture status + settings (R9: honest degradation) ----------------------

let captureBad = false;
let demoAudio = false;

/** One chip, worst news first: a broken pipeline beats the demo note. */
function refreshCaptureChip(): void {
  const chip = $('capture');
  chip.classList.toggle('visible', captureBad || demoAudio);
  if (captureBad) return; // text set by renderCaptureState
  if (demoAudio) {
    chip.textContent = 'demo audio ♪';
    chip.title =
      'The visuals are dancing to built-in demo music, not what you are playing. Click for the one-time setup that fixes that.';
  }
}

function renderCaptureState(event: { state: string; detail?: string }): void {
  const chip = $('capture');
  captureBad = event.state === 'failed' || event.state === 'stopped';
  if (captureBad) {
    chip.textContent = `capture ${event.state}`;
    chip.title = event.detail ?? '';
  }
  refreshCaptureChip();
  $('set-capture').textContent = event.detail
    ? `${event.state}: ${event.detail.split('\n')[0]}`
    : event.state;
}

$('capture').addEventListener('click', () => {
  $('settings-panel').classList.add('open');
});

// ---- Spotify connect (hybrid mode: API browse, desktop playback) -------------

let spotifyConnected = false;

function refreshSpotifyAuth(): void {
  void window.reamp
    .getSpotifyAuth()
    .then((info) => {
      spotifyConnected = info.connected;
      $('spotify-auth-status').textContent = info.connected
        ? `connected · playlists browse in-app`
        : 'not connected';
      ($('spotify-connect') as HTMLButtonElement).textContent = info.connected
        ? 'Disconnect'
        : 'Connect';
      const input = $('spotify-client-id') as HTMLInputElement;
      input.hidden = info.connected;
      $('spotify-hint').hidden = info.connected;
      if (info.clientId !== null) input.value = info.clientId;
    })
    .catch(() => {});
}
refreshSpotifyAuth();

$('spotify-connect').addEventListener('click', () => {
  const status = $('spotify-auth-status');
  if (spotifyConnected) {
    void window.reamp
      .spotifyDisconnect()
      .then(() => refreshSpotifyAuth())
      .catch(() => {});
    return;
  }
  const clientId = ($('spotify-client-id') as HTMLInputElement).value;
  status.textContent = 'a browser window opened; approve access there…';
  void window.reamp
    .spotifyConnect(clientId)
    .then(() => refreshSpotifyAuth())
    .catch((err: unknown) => {
      status.textContent = String(err instanceof Error ? err.message : err);
    });
});

window.reamp.onVisState(renderCaptureState);
void window.reamp.getVisState().then(renderCaptureState).catch(() => {});
void window.reamp
  .getAppInfo()
  .then((info) => {
    demoAudio = info.demoAudio;
    refreshCaptureChip();
    $('set-sidecar').textContent = info.sidecar;
    $('set-version').textContent = `${info.version} ${info.commit} (${info.mode})`;
    $('set-logfile').textContent = info.logFile;
    $('set-logfile').title = info.logFile;
    const helperRow = $('set-helper-row');
    helperRow.hidden = !info.demoAudio;
    $('set-helper').hidden = !info.demoAudio;
  })
  .catch(() => {});

$('settings-btn').addEventListener('click', () => {
  $('settings-panel').classList.toggle('open');
});
$('send-feedback').addEventListener('click', () => {
  void window.reamp.sendFeedback().catch(() => {});
});
$('open-logs').addEventListener('click', () => {
  void window.reamp.openLogs().catch(() => {});
});
let updateHasDownload = false;
$('check-update').addEventListener('click', () => {
  const result = $('update-result');
  const openBtn = $('update-open') as HTMLButtonElement;
  openBtn.hidden = true;
  result.textContent = 'checking…';
  window.reamp
    .checkUpdate()
    .then((info) => {
      if (info.status === 'update-available') {
        updateHasDownload = info.downloadUrl !== undefined;
        result.textContent = `Update available: ${info.latest ?? ''}. ${info.detail ?? ''}`;
        openBtn.textContent = updateHasDownload ? 'Install Update' : 'Get Update';
        openBtn.hidden = false;
      } else if (info.status === 'up-to-date') {
        result.textContent = `Up to date. Installed: ${info.current}.`;
      } else {
        result.textContent = info.detail ?? 'Could not check for updates.';
      }
    })
    .catch((err: unknown) => {
      result.textContent = String(err instanceof Error ? err.message : err);
    });
});
// Install in place when the release has a download for this machine;
// anything that prevents that degrades to opening the release page.
$('update-open').addEventListener('click', () => {
  const result = $('update-result');
  if (!updateHasDownload) {
    void window.reamp.openUpdatePage().catch(() => {});
    return;
  }
  void window.reamp
    .installUpdate()
    .then((r) => {
      if (r.started) {
        ($('update-open') as HTMLButtonElement).hidden = true;
        result.textContent = 'starting download…';
      } else {
        result.textContent = `${r.reason ?? 'cannot install in place'}; opening the release page.`;
        void window.reamp.openUpdatePage().catch(() => {});
      }
    })
    .catch(() => {
      void window.reamp.openUpdatePage().catch(() => {});
    });
});
window.reamp.onUpdateProgress((event) => {
  const result = $('update-result');
  if (event.phase === 'failed') {
    result.textContent = `update failed: ${event.error ?? 'unknown'}. Use the release page instead.`;
    ($('update-open') as HTMLButtonElement).hidden = false;
    updateHasDownload = false; // the button now opens the page
    return;
  }
  result.textContent =
    event.phase === 'downloading' && event.pct !== undefined
      ? `downloading… ${event.pct}%`
      : `${event.phase}…`;
});
$('zoom-in').addEventListener('click', () => zoomStep(0.25));
$('zoom-out').addEventListener('click', () => zoomStep(-0.25));
$('zoom-label').addEventListener('click', () => setZoomTo(1));
$('zoom-fit').addEventListener('click', () => setZoomTo('fit'));
$('style-toggle').addEventListener('click', () => {
  applyPlayerStyle(playerStyle === 'sharp' ? 'classic' : 'sharp');
});
$('deck-toggle').addEventListener('click', () => {
  const hidden = document.body.classList.toggle('deck-hidden');
  $('deck-toggle').textContent = hidden ? 'deck ▴' : 'deck ▾';
  void window.reamp.saveSettings({ deckHidden: hidden }).catch(() => {});
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
    // interface cannot enumerate playlists. Honest message plus the way in.
    renderItems(
      [
        { label: String(err instanceof Error ? err.message : err) },
        {
          label:
            'Spotify hides playlists from desktop apps. Connect your own Spotify client ID and they browse right here (playback still runs through Spotify.app).',
        },
        {
          label: '→ Connect Spotify in Settings',
          onClick: () => $('settings-panel').classList.add('open'),
        },
      ],
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

// ---- keyboard shortcuts ------------------------------------------------------

// Couch reach: the essentials without hunting for small buttons. Form
// fields, focused buttons, and the EQ dialog keep their native keys.
document.addEventListener('keydown', (e) => {
  // player size on the universal zoom chords, before the plain-key guard
  if ((e.metaKey || e.ctrlKey) && !e.altKey) {
    if (e.key === '=' || e.key === '+') {
      e.preventDefault();
      zoomStep(0.25);
    } else if (e.key === '-') {
      e.preventDefault();
      zoomStep(-0.25);
    } else if (e.key === '0') {
      e.preventDefault();
      setZoomTo(1);
    }
    return;
  }
  if (e.altKey) return;
  const target = e.target as HTMLElement;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLButtonElement ||
    target.isContentEditable ||
    eqDialog.open
  ) {
    return;
  }
  switch (e.key) {
    case ' ':
      e.preventDefault(); // no page scroll
      send(playing ? { action: 'pause' } : { action: 'play' });
      break;
    case 'ArrowRight':
      send({ action: 'next' });
      break;
    case 'ArrowLeft':
      send({ action: 'previous' });
      break;
    case 'f':
    case 'F':
      $('fullscreen').click();
      break;
    case 'v':
    case 'V':
      setStageMode(stageIndex + 1);
      break;
    case 'd':
    case 'D':
      $('deck-toggle').click();
      break;
  }
});

// ---- frames ----------------------------------------------------------------

window.reamp.onVisFrame((frame) => {
  latestFrame = frame;
  latestFeatures = features.extract(frame);
  deckVis.render(frame);
  milkdrop?.updatePcm(frame.pcm);
  milkdrop?.beat(latestFeatures.beat);
});
