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

const DEMO_TRACKS = [
  { title: 'It Really Whips', artist: 'Demo Llama', album: 'Loopback Sessions', durationMs: 187_000 },
  { title: 'Loopback To The Future', artist: 'Demo Llama', album: 'Loopback Sessions', durationMs: 214_000 },
  { title: '75 Bands Of Green And Red', artist: 'Demo Llama', album: 'Loopback Sessions', durationMs: 243_000 },
  { title: 'Peak Caps Falling Slowly', artist: 'Demo Llama', album: 'Loopback Sessions', durationMs: 199_000 },
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
        case 'play':
          playing = true;
          break;
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
    getPlaylists: () => Promise.resolve([{ id: 'demo', name: 'Loopback Sessions', trackCount: DEMO_TRACKS.length }]),
    getPlaylistTracks: () => Promise.resolve([]),
    onPlayerState: (cb) => {
      stateListeners.push(cb);
      setTimeout(emitState, 0);
    },
    onVisFrame: (cb) => {
      visListeners.push(cb);
    },
  };
  (window as unknown as { reamp: ReampApi }).reamp = api;

  // The same synth the mock sidecar plays: a sweeping tone with a pulse.
  const analyzer = new SpectrumAnalyzer({ fftSize: FFT_SIZE, sampleRate: SAMPLE_RATE, bands: 75 });
  const pcm = new Float32Array(FFT_SIZE);
  const wave = new Float32Array(75);
  let clock = 0;

  const sample = (n: number): number => {
    const seconds = n / SAMPLE_RATE;
    const sweep = 110 * Math.pow(2, (seconds % 8) / 2);
    const pulse = 0.55 + 0.45 * Math.pow(Math.max(0, Math.sin(TWO_PI * seconds * 2)), 4);
    return (
      pulse *
      (0.6 * Math.sin((TWO_PI * sweep * n) / SAMPLE_RATE) +
        0.25 * Math.sin((TWO_PI * sweep * 1.5 * n) / SAMPLE_RATE) +
        0.05 * (Math.random() * 2 - 1))
    );
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
