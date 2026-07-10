/**
 * Falling peak caps, the little bars that hover above each spectrum
 * column, hold for a beat, then fall with acceleration. Half of what
 * makes the classic analyzer read as "Winamp" at a glance.
 *
 * Per-frame hot path: no allocation after construction.
 */

export interface PeakOptions {
  /** Frames a cap holds at its peak before falling. */
  holdFrames?: number;
  /** Fall acceleration per frame (in level units, 0..1 scale). */
  gravity?: number;
}

export class PeakTracker {
  /** Current cap position per band, 0..1. Reused across frames. */
  readonly peaks: Float32Array;
  private readonly hold: Int32Array;
  private readonly velocity: Float32Array;
  private readonly holdFrames: number;
  private readonly gravity: number;

  constructor(bands: number, opts: PeakOptions = {}) {
    this.peaks = new Float32Array(bands);
    this.hold = new Int32Array(bands);
    this.velocity = new Float32Array(bands);
    this.holdFrames = opts.holdFrames ?? 12;
    this.gravity = opts.gravity ?? 0.003;
  }

  /** Advance one frame with the current bar levels. Returns the cap positions. */
  update(levels: ArrayLike<number>): Float32Array {
    const n = Math.min(levels.length, this.peaks.length);
    for (let i = 0; i < n; i++) {
      const level = levels[i]!;
      if (level >= this.peaks[i]!) {
        this.peaks[i] = level;
        this.hold[i] = this.holdFrames;
        this.velocity[i] = 0;
      } else if (this.hold[i]! > 0) {
        this.hold[i] = this.hold[i]! - 1;
      } else {
        this.velocity[i] = this.velocity[i]! + this.gravity;
        this.peaks[i] = Math.max(level, this.peaks[i]! - this.velocity[i]!);
      }
    }
    return this.peaks;
  }
}
