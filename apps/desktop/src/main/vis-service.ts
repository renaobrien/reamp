/**
 * The vis pipeline's main-process half: sidecar PCM lands in the ring
 * buffer; a frame timer reads the latest window, runs the FFT and
 * oscilloscope math, and broadcasts compact frames to the renderer over
 * IPC. Computing in main sidesteps SharedArrayBuffer isolation
 * requirements for v1; at ~30 frames of 150 numbers per second the IPC
 * cost is negligible.
 */
import type { spawn } from 'node:child_process';
import { PcmRingBuffer, SpectrumAnalyzer, waveformPoints } from '@reamp/vis-engine';
import { SidecarManager, type SidecarState } from './sidecar/manager.js';

export interface VisFrame {
  /** 75 spectrum bar levels, 0..1. */
  levels: number[];
  /** 75 oscilloscope points, -1..1. */
  wave: number[];
  /** The raw analysis window (fftSize samples, -1..1) for Butterchurn. */
  pcm: number[];
}

export interface VisServiceOptions {
  binaryPath: string;
  args?: string[];
  broadcast: (frame: VisFrame) => void;
  onStateChange?: (state: SidecarState, detail?: string) => void;
  frameRateHz?: number;
  bands?: number;
  wavePoints?: number;
  fftSize?: number;
  env?: NodeJS.ProcessEnv;
  spawnImpl?: typeof spawn;
}

export class VisService {
  private readonly opts: VisServiceOptions;
  private readonly manager: SidecarManager;
  private ring: PcmRingBuffer;
  private analyzer: SpectrumAnalyzer;
  private readonly window: Float32Array;
  private readonly wave: Float32Array;
  private frameTimer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(opts: VisServiceOptions) {
    this.opts = opts;
    const fftSize = opts.fftSize ?? 1024;
    this.window = new Float32Array(fftSize);
    this.wave = new Float32Array(opts.wavePoints ?? 75);
    this.ring = PcmRingBuffer.create(48000);
    this.analyzer = this.makeAnalyzer(48000);
    this.manager = new SidecarManager({
      binaryPath: opts.binaryPath,
      args: opts.args,
      env: opts.env,
      spawnImpl: opts.spawnImpl,
      onSamples: (samples) => this.ring.write(samples),
      onHeader: (header) => {
        // A fresh run may report a different device rate; rebuild the
        // ring and analyzer so band mapping stays truthful.
        this.ring = PcmRingBuffer.create(header.sampleRate);
        this.analyzer = this.makeAnalyzer(header.sampleRate);
      },
      onStateChange: (state, detail) => {
        this.running = state === 'running';
        opts.onStateChange?.(state, detail);
      },
    });
  }

  start(): void {
    this.manager.start();
    // 60Hz: every display frame gets fresh audio, the vis reads tight
    const intervalMs = 1000 / (this.opts.frameRateHz ?? 60);
    this.frameTimer ??= setInterval(() => this.tick(), intervalMs);
  }

  stop(): void {
    if (this.frameTimer !== null) {
      clearInterval(this.frameTimer);
      this.frameTimer = null;
    }
    this.manager.stop();
  }

  getState(): SidecarState {
    return this.manager.getState();
  }

  private tick(): void {
    if (!this.running || this.ring.totalWritten < this.window.length) return;
    this.ring.readLatest(this.window);
    const levels = this.analyzer.process(this.window);
    waveformPoints(this.window, this.wave.length, this.wave);
    this.opts.broadcast({
      levels: Array.from(levels),
      wave: Array.from(this.wave),
      pcm: Array.from(this.window),
    });
  }

  private makeAnalyzer(sampleRate: number): SpectrumAnalyzer {
    return new SpectrumAnalyzer({
      fftSize: this.window.length,
      sampleRate,
      bands: this.opts.bands ?? 75,
    });
  }
}
