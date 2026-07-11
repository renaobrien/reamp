/**
 * Browser demo mode: when the page runs outside Electron (no preload, so
 * no window.reamp), install a fake bridge so the whole renderer works on
 * plain localhost or a static host. Webamp, the classic vis deck, and
 * Milkdrop all run for real; the "music" is the same synthesized sweep
 * the mock sidecar plays, and the transport drives a pretend playlist.
 *
 * The real app is unaffected: Electron's contextBridge defines
 * window.reamp before any module script runs, and the installer is
 * guarded on its absence.
 */
import { SpectrumAnalyzer, waveformPoints } from '@reamp/vis-engine';
import type { ReampApi } from '../preload.js';
import type { PlayerStateEvent, VisFrameEvent } from '../shared/ipc.js';

/** Each pretend track has its own tempo, key, and arpeggio, so switching
 * tracks audibly (visibly) changes everything the scenes react to. */
const DEMO_TRACKS = [
  { title: 'It Really Whips', artist: 'Demo Llama', album: 'Loopback Sessions', durationMs: 187_000, bpm: 126, root: 55, arp: [0, 3, 7, 10] },
  { title: 'Loopback To The Future', artist: 'Demo Llama', album: 'Loopback Sessions', durationMs: 214_000, bpm: 98, root: 41.2, arp: [0, 5, 7, 12] },
  { title: '75 Bands Of Green And Red', artist: 'Demo Llama', album: 'Loopback Sessions', durationMs: 243_000, bpm: 140, root: 61.7, arp: [0, 4, 7, 11] },
  { title: 'Peak Caps Falling Slowly', artist: 'Demo Llama', album: 'Loopback Sessions', durationMs: 199_000, bpm: 82, root: 49, arp: [0, 3, 8, 12] },
];

const SAMPLE_RATE = 48_000;
const FFT_SIZE = 1024;
const FRAME_MS = 33;
const TWO_PI = 2 * Math.PI;

export function installDemoBridge(): void {
  const stateListeners: Array<(e: PlayerStateEvent) => void> = [];
  const visListeners: Array<(f: VisFrameEvent) => void> = [];

  let trackIndex = 0;
  let positionMs = 0;
  let playing = true;
  let volume = 80;
  let shuffle = false;
  let repeat: 'off' | 'track' | 'context' = 'off';
  let demoSkin: ArrayBuffer | null = null;

  const emitState = (): void => {
    const event: PlayerStateEvent = {
      source: 'spotify',
      state: {
        track: DEMO_TRACKS[trackIndex]!,
        positionMs,
        playing,
        shuffle,
        repeat,
        volume,
      },
    };
    for (const cb of stateListeners) cb(event);
  };

  const changeTrack = (delta: number): void => {
    trackIndex = (trackIndex + delta + DEMO_TRACKS.length) % DEMO_TRACKS.length;
    positionMs = 0;
  };

  const api: ReampApi = {
    transport: (cmd) => {
      switch (cmd.action) {
        case 'play': {
          const m = /^demo:track:(\d+)$/.exec(cmd.uri ?? '');
          if (m !== null) {
            trackIndex = Number(m[1]) % DEMO_TRACKS.length;
            positionMs = 0;
          }
          playing = true;
          break;
        }
        case 'pause':
          playing = false;
          break;
        case 'next':
          changeTrack(1);
          break;
        case 'previous':
          changeTrack(-1);
          break;
        case 'seek':
          positionMs = Math.max(0, Math.min(cmd.ms, DEMO_TRACKS[trackIndex]!.durationMs));
          break;
        case 'setVolume':
          volume = cmd.pct;
          break;
        case 'setShuffle':
          shuffle = cmd.on;
          break;
        case 'setRepeat':
          repeat = cmd.mode;
          break;
      }
      emitState();
      return Promise.resolve();
    },
    setSource: () => Promise.resolve({ status: 'authorized', detail: 'demo mode' }),
    getSource: () => Promise.resolve('spotify'),
    auth: () => Promise.resolve({ status: 'authorized', detail: 'demo mode' }),
    getPlaylists: () =>
      Promise.resolve([{ id: 'demo', name: 'Loopback Sessions', trackCount: DEMO_TRACKS.length }]),
    getPlaylistTracks: () =>
      Promise.resolve(
        DEMO_TRACKS.map((t, i) => ({
          id: `demo-${i}`,
          uri: `demo:track:${i}`,
          title: t.title,
          artist: t.artist,
          album: t.album,
          durationMs: t.durationMs,
        })),
      ),
    onPlayerState: (cb) => {
      stateListeners.push(cb);
      setTimeout(emitState, 0);
    },
    onVisFrame: (cb) => {
      visListeners.push(cb);
    },
    // persistence: settings survive reloads via localStorage; the dropped
    // skin lives in memory for the tab's lifetime (too large to stash)
    getSettings: () => {
      try {
        return Promise.resolve(JSON.parse(localStorage.getItem('reamp-demo-settings') ?? '{}'));
      } catch {
        return Promise.resolve({});
      }
    },
    saveSettings: (patch) => {
      let current: Record<string, unknown> = {};
      try {
        current = JSON.parse(localStorage.getItem('reamp-demo-settings') ?? '{}');
      } catch {
        // start fresh
      }
      localStorage.setItem('reamp-demo-settings', JSON.stringify({ ...current, ...patch }));
      return Promise.resolve();
    },
    getSavedSkin: () => Promise.resolve(demoSkin),
    saveSkin: (data) => {
      demoSkin = data;
      return Promise.resolve();
    },
    onVisState: (cb) => setTimeout(() => cb({ state: 'running', detail: 'demo synth' }), 0),
    getVisState: () => Promise.resolve({ state: 'running' as const, detail: 'demo synth' }),
    getAppInfo: () =>
      Promise.resolve({
        version: 'browser demo',
        commit: 'dev',
        mode: 'desktop-control' as const,
        sidecar: 'procedural music',
        demoAudio: true,
        logFile: '(browser console)',
      }),
    sendFeedback: () => {
      window.open('https://github.com/renaobrien/reamp/issues/new/choose', '_blank');
      return Promise.resolve();
    },
    openLogs: () => Promise.resolve(),
    checkUpdate: () =>
      Promise.resolve({
        status: 'up-to-date' as const,
        current: 'browser demo',
        detail: 'Updates apply to the desktop app; the demo always tracks the latest code.',
        url: 'https://github.com/renaobrien/reamp',
      }),
    openUpdatePage: () => {
      window.open('https://github.com/renaobrien/reamp', '_blank');
      return Promise.resolve();
    },
    installUpdate: () =>
      Promise.resolve({ started: false, reason: 'the browser demo updates itself' }),
    onUpdateProgress: () => {},
  };
  (window as unknown as { reamp: ReampApi }).reamp = api;

  // A tiny procedural band, so the visuals have real music to react to:
  // four-on-the-floor kick, offbeat hats, a bassline, and an arpeggio.
  const analyzer = new SpectrumAnalyzer({ fftSize: FFT_SIZE, sampleRate: SAMPLE_RATE, bands: 75 });
  const pcm = new Float32Array(FFT_SIZE);
  const wave = new Float32Array(75);
  let clock = 0;

  const sample = (n: number): number => {
    const track = DEMO_TRACKS[trackIndex]!;
    const seconds = n / SAMPLE_RATE;
    const beatLen = 60 / track.bpm;
    const beatPhase = (seconds % beatLen) / beatLen; // 0..1 within the beat
    const beatIndex = Math.floor(seconds / beatLen);

    // kick: exponentially decaying pitch-dropping sine on every beat
    const kickEnv = Math.exp(-beatPhase * 9);
    const kick = Math.sin(TWO_PI * (48 + 60 * Math.exp(-beatPhase * 14)) * seconds) * kickEnv;

    // bass: root note, ducked by the kick (fake sidechain pumps everything)
    const duck = 1 - kickEnv * 0.75;
    const bassNote = track.root * (beatIndex % 8 < 4 ? 1 : 0.749); // I .. bVII
    const bass = Math.sin(TWO_PI * bassNote * seconds) * 0.5 * duck;

    // arpeggio: 16ths stepping through the track's chord, two octaves up
    const step = Math.floor(seconds / (beatLen / 4)) % track.arp.length;
    const arpFreq = track.root * 4 * Math.pow(2, track.arp[step]! / 12);
    const arpEnv = Math.exp(-((seconds % (beatLen / 4)) / (beatLen / 4)) * 5);
    const arp = Math.sin(TWO_PI * arpFreq * seconds) * 0.3 * arpEnv * duck;

    // hats: filtered-ish noise bursts on the offbeats
    const offbeat = (seconds + beatLen / 2) % beatLen;
    const hatEnv = Math.exp(-(offbeat / beatLen) * 26);
    const hat = (Math.random() * 2 - 1) * 0.22 * hatEnv;

    return Math.max(-1, Math.min(1, kick * 0.9 + bass + arp + hat));
  };

  setInterval(() => {
    if (playing) {
      for (let i = 0; i < FFT_SIZE; i++) {
        pcm[i] = Math.max(-1, Math.min(1, sample(clock + i)));
      }
      clock += (SAMPLE_RATE * FRAME_MS) / 1000;
    } else {
      pcm.fill(0);
    }
    const frame: VisFrameEvent = {
      levels: Array.from(analyzer.process(pcm)),
      wave: Array.from(waveformPoints(pcm, 75, wave)),
      pcm: Array.from(pcm),
    };
    for (const cb of visListeners) cb(frame);
  }, FRAME_MS);

  // the pretend playhead
  setInterval(() => {
    if (!playing) return;
    positionMs += 1000;
    if (positionMs >= DEMO_TRACKS[trackIndex]!.durationMs) changeTrack(repeat === 'track' ? 0 : 1);
    emitState();
  }, 1000);
}
