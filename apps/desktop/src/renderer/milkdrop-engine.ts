/**
 * Shared Butterchurn engine used by both the standalone Milkdrop window
 * and the embedded backdrop in the main window. Owns the visualizer,
 * preset cycling, PCM-to-byte conversion, and the render loop.
 *
 * Interop note: butterchurn and its preset packs are UMD bundles without
 * the __esModule marker, so depending on the bundler the default import
 * is either the API or a {default: API} wrapper. unwrap() accepts both;
 * this exact mismatch produced a black screen in the first demo build.
 */
import butterchurnModule from 'butterchurn';
import type { ButterchurnVisualizer } from 'butterchurn';
import basePackModule from 'butterchurn-presets';
import extraPackModule from 'butterchurn-presets/lib/butterchurnPresetsExtra.min.js';
import { PresetCycler } from './preset-cycler.js';

function unwrap<T>(mod: unknown): T {
  const m = mod as { default?: unknown };
  return (typeof m === 'object' && m !== null && 'default' in m && m.default != null
    ? m.default
    : m) as T;
}

type ButterchurnApi = {
  createVisualizer(
    context: AudioContext | null,
    canvas: HTMLCanvasElement,
    opts: { width: number; height: number; pixelRatio?: number },
  ): ButterchurnVisualizer;
};
type PresetPack = { getPresets(): Record<string, object> };

const SAMPLES = 1024; // butterchurn's AudioProcessor fftSize
const BLEND_SECONDS = 2.7;

export interface MilkdropEngineOptions {
  canvas: HTMLCanvasElement;
  /** Called whenever the preset changes, with its name. */
  onPreset?: (name: string) => void;
  autoAdvanceMs?: number;
}

export class MilkdropEngine {
  private readonly visualizer: ButterchurnVisualizer;
  private readonly presets: Record<string, object>;
  private readonly cycler: PresetCycler;
  private readonly opts: MilkdropEngineOptions;
  private readonly timeByteArray = new Uint8Array(SAMPLES).fill(128);
  private rafId: number | null = null;
  private autoTimer: ReturnType<typeof setInterval> | null = null;

  /** Throws with a readable message when WebGL2 is unavailable. */
  constructor(opts: MilkdropEngineOptions) {
    this.opts = opts;
    if (opts.canvas.getContext('webgl2') === null) {
      throw new Error('Milkdrop needs WebGL2, which this browser/GPU refused to provide');
    }
    const butterchurn = unwrap<ButterchurnApi>(butterchurnModule);
    this.presets = {
      ...unwrap<PresetPack>(basePackModule).getPresets(),
      ...unwrap<PresetPack>(extraPackModule).getPresets(),
    };
    this.cycler = new PresetCycler(Object.keys(this.presets).sort());
    this.visualizer = butterchurn.createVisualizer(null, opts.canvas, {
      width: opts.canvas.width,
      height: opts.canvas.height,
      pixelRatio: devicePixelRatio,
    });
    // Start somewhere interesting: the alphabetically-first preset is a
    // sparse one, and every launch looking identical gets old anyway.
    this.cycler.randomJump();
    this.loadCurrent(0);
  }

  get presetCount(): number {
    return this.cycler.count;
  }

  get presetName(): string {
    return this.cycler.current;
  }

  /** Feed the latest PCM window (floats -1..1). */
  updatePcm(pcm: ArrayLike<number>): void {
    const n = Math.min(SAMPLES, pcm.length);
    for (let i = 0; i < n; i++) {
      this.timeByteArray[i] = Math.max(0, Math.min(255, Math.round(pcm[i]! * 127 + 128)));
    }
  }

  next(): void {
    this.cycler.next();
    this.loadCurrent();
    this.rearmAutoAdvance();
  }

  previous(): void {
    this.cycler.previous();
    this.loadCurrent();
    this.rearmAutoAdvance();
  }

  random(): void {
    this.cycler.randomJump();
    this.loadCurrent();
    this.rearmAutoAdvance();
  }

  setSize(width: number, height: number): void {
    this.opts.canvas.width = width;
    this.opts.canvas.height = height;
    this.visualizer.setRendererSize(width, height);
  }

  start(): void {
    if (this.rafId !== null) return;
    const frame = (): void => {
      this.visualizer.render({
        audioLevels: {
          timeByteArray: this.timeByteArray,
          timeByteArrayL: this.timeByteArray,
          timeByteArrayR: this.timeByteArray,
        },
      });
      this.rafId = requestAnimationFrame(frame);
    };
    this.rafId = requestAnimationFrame(frame);
    this.rearmAutoAdvance();
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.autoTimer !== null) {
      clearInterval(this.autoTimer);
      this.autoTimer = null;
    }
  }

  private loadCurrent(blend = BLEND_SECONDS): void {
    this.visualizer.loadPreset(this.presets[this.cycler.current]!, blend);
    this.opts.onPreset?.(this.cycler.current);
  }

  private rearmAutoAdvance(): void {
    if (this.autoTimer !== null) clearInterval(this.autoTimer);
    const ms = this.opts.autoAdvanceMs ?? 30_000;
    this.autoTimer = setInterval(() => {
      this.cycler.next();
      this.loadCurrent();
    }, ms);
  }
}
