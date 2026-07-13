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
import { BeatAdvance } from './beat-advance.js';
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
  /** Called when rendering breaks beyond recovery, with a readable reason. */
  onError?: (message: string) => void;
  /** Wall-clock fallback advance; beats usually get there first. */
  autoAdvanceMs?: number;
  /** Minimum hold before a beat may switch presets. */
  beatHoldMs?: number;
}

export class MilkdropEngine {
  private readonly visualizer: ButterchurnVisualizer;
  private readonly presets: Record<string, object>;
  private readonly cycler: PresetCycler;
  private readonly opts: MilkdropEngineOptions;
  private readonly timeByteArray = new Uint8Array(SAMPLES).fill(128);
  private readonly beatAdvance: BeatAdvance;
  private rafId: number | null = null;
  private autoTimer: ReturnType<typeof setInterval> | null = null;
  private frameErrors = 0;
  private presetSkips = 0;

  /** Throws with a readable message when the visualizer cannot start. */
  constructor(opts: MilkdropEngineOptions) {
    this.opts = opts;
    this.beatAdvance = new BeatAdvance(opts.beatHoldMs ?? 20_000);
    const butterchurn = unwrap<ButterchurnApi>(butterchurnModule);
    this.presets = {
      ...unwrap<PresetPack>(basePackModule).getPresets(),
      ...unwrap<PresetPack>(extraPackModule).getPresets(),
    };
    this.cycler = new PresetCycler(Object.keys(this.presets).sort());
    try {
      // butterchurn owns context creation, so it gets the attributes it
      // wants; a pre-flight getContext here would pin the defaults
      this.visualizer = butterchurn.createVisualizer(null, opts.canvas, {
        width: opts.canvas.width,
        height: opts.canvas.height,
        pixelRatio: devicePixelRatio,
      });
    } catch (err) {
      throw new Error(
        opts.canvas.getContext('webgl2') === null
          ? 'Milkdrop needs WebGL2, which this browser/GPU refused to provide'
          : `Milkdrop failed to start: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
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

  /** Beat-synced advancing (P1): a strong beat after the hold flips presets. */
  beat(strength: number, nowMs = performance.now()): void {
    if (this.beatAdvance.shouldAdvance(nowMs, strength)) {
      this.cycler.next();
      this.loadCurrent(1.2); // faster blend so the cut lands near the beat
      this.rearmAutoAdvance();
    }
  }

  next(): void {
    this.cycler.next();
    this.loadCurrent();
    this.rearmAutoAdvance();
    this.beatAdvance.notifyManualChange(performance.now());
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
    // A preset whose shaders fail on this GPU must not kill the loop:
    // real graphics drivers reject shaders that software GL accepts.
    // Persistent failures skip to the next preset; if several presets in
    // a row fail, the GPU is telling us no, and onError says so.
    const frame = (): void => {
      try {
        this.visualizer.render({
          audioLevels: {
            timeByteArray: this.timeByteArray,
            timeByteArrayL: this.timeByteArray,
            timeByteArrayR: this.timeByteArray,
          },
        });
        this.frameErrors = 0;
        this.presetSkips = 0;
      } catch (err) {
        this.frameErrors++;
        if (this.frameErrors >= 5) {
          this.frameErrors = 0;
          this.presetSkips++;
          if (this.presetSkips > 4) {
            this.stop();
            this.opts.onError?.(
              `Milkdrop rendering failed repeatedly on this GPU: ${err instanceof Error ? err.message : String(err)}`,
            );
            return;
          }
          this.cycler.next();
          this.loadCurrent(0);
        }
      }
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
    // A preset that will not even load gets skipped, a few tries deep.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        this.visualizer.loadPreset(this.presets[this.cycler.current]!, blend);
        this.opts.onPreset?.(this.cycler.current);
        return;
      } catch {
        this.cycler.next();
      }
    }
    this.opts.onError?.('Milkdrop presets keep failing to load on this GPU');
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
