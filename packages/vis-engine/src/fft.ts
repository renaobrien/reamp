/**
 * Radix-2 FFT for the vis pipeline.
 *
 * Target (spec §2): 1024-sample FFT at 48kHz (~21ms hop, ~46ms window),
 * <100ms audible-to-visual latency end to end. This runs per animation
 * frame in the renderer, so it allocates nothing after construction.
 */

/** In-place iterative radix-2 complex FFT. re/im must be the same power-of-two length. */
export function fftInPlace(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  if (n !== im.length) throw new Error('re/im length mismatch');
  if (n === 0 || (n & (n - 1)) !== 0) throw new Error(`FFT size must be a power of two, got ${n}`);

  // bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]!; re[i] = re[j]!; re[j] = tr;
      const ti = im[i]!; im[i] = im[j]!; im[j] = ti;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      const half = len >> 1;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const bRe = re[b]! * curRe - im[b]! * curIm;
        const bIm = re[b]! * curIm + im[b]! * curRe;
        re[b] = re[a]! - bRe;
        im[b] = im[a]! - bIm;
        re[a] = re[a]! + bRe;
        im[a] = im[a]! + bIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

/** Precomputed Hann window of the given size. */
export function hannWindow(size: number): Float32Array {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return w;
}

/**
 * Real-input forward FFT producing normalized magnitudes for bins 0..N/2.
 * Reusable across frames: construct once, call analyze() per frame.
 */
export class RealFft {
  readonly size: number;
  private readonly window: Float32Array;
  private readonly re: Float32Array;
  private readonly im: Float32Array;
  /** Magnitude per bin, 0..size/2 inclusive, normalized so a full-scale sine ≈ 1.0. */
  readonly magnitudes: Float32Array;

  constructor(size = 1024) {
    if (size === 0 || (size & (size - 1)) !== 0) {
      throw new Error(`FFT size must be a power of two, got ${size}`);
    }
    this.size = size;
    this.window = hannWindow(size);
    this.re = new Float32Array(size);
    this.im = new Float32Array(size);
    this.magnitudes = new Float32Array(size / 2 + 1);
  }

  /** Windowed magnitude spectrum of `input` (length ≥ size; extra samples ignored). */
  analyze(input: Float32Array): Float32Array {
    const n = this.size;
    if (input.length < n) throw new Error(`need ${n} samples, got ${input.length}`);
    for (let i = 0; i < n; i++) {
      this.re[i] = input[i]! * this.window[i]!;
      this.im[i] = 0;
    }
    fftInPlace(this.re, this.im);
    // Hann coherent gain is 0.5; normalize so a full-scale sine peaks at ~1.0.
    const scale = 2 / (n * 0.5);
    for (let k = 0; k <= n / 2; k++) {
      this.magnitudes[k] = Math.hypot(this.re[k]!, this.im[k]!) * scale;
    }
    return this.magnitudes;
  }
}
