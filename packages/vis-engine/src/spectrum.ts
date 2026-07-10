import { RealFft } from './fft.js';

export interface SpectrumOptions {
  /** FFT size in samples (power of two). */
  fftSize?: number;
  /** Capture sample rate in Hz. */
  sampleRate?: number;
  /** Number of output bars. Classic Winamp vis draws 75. */
  bands?: number;
  /** Lowest band center frequency in Hz. */
  minHz?: number;
  /** Highest band center frequency in Hz. */
  maxHz?: number;
  /** Per-frame decay factor for the falloff (0..1, higher = slower fall). */
  decay?: number;
}

/**
 * Maps FFT magnitudes onto log-spaced bars with Winamp-style rise/fall:
 * bars jump instantly on attack and decay smoothly, matching the classic
 * spectrum analyzer feel. Output values are 0..1 per band.
 */
export class SpectrumAnalyzer {
  readonly bands: number;
  readonly sampleRate: number;
  private readonly fft: RealFft;
  private readonly bandEdges: Uint32Array;
  private readonly levels: Float32Array;
  private readonly decay: number;

  constructor(opts: SpectrumOptions = {}) {
    const {
      fftSize = 1024,
      sampleRate = 48000,
      bands = 75,
      minHz = 40,
      maxHz = 16000,
      decay = 0.82,
    } = opts;
    if (bands < 1) throw new Error('bands must be >= 1');
    if (maxHz <= minHz) throw new Error('maxHz must exceed minHz');

    this.bands = bands;
    this.sampleRate = sampleRate;
    this.fft = new RealFft(fftSize);
    this.levels = new Float32Array(bands);
    this.decay = decay;

    // log-spaced band edges over FFT bins, each band at least one bin wide
    const binCount = fftSize / 2;
    const hzPerBin = sampleRate / fftSize;
    this.bandEdges = new Uint32Array(bands + 1);
    for (let b = 0; b <= bands; b++) {
      const hz = minHz * Math.pow(maxHz / minHz, b / bands);
      this.bandEdges[b] = Math.min(binCount, Math.max(1, Math.round(hz / hzPerBin)));
    }
    for (let b = 1; b <= bands; b++) {
      if (this.bandEdges[b]! <= this.bandEdges[b - 1]!) {
        this.bandEdges[b] = Math.min(binCount, this.bandEdges[b - 1]! + 1);
      }
    }
  }

  get fftSize(): number {
    return this.fft.size;
  }

  /**
   * Analyze one window of PCM (mono Float32, length ≥ fftSize) and return
   * the current bar levels (0..1). The returned array is reused per frame.
   */
  process(pcm: Float32Array): Float32Array {
    const mags = this.fft.analyze(pcm);
    for (let b = 0; b < this.bands; b++) {
      const from = this.bandEdges[b]!;
      const to = this.bandEdges[b + 1]!;
      let peak = 0;
      for (let k = from; k < to; k++) {
        const m = mags[k]!;
        if (m > peak) peak = m;
      }
      const level = Math.min(1, peak);
      const prev = this.levels[b]!;
      this.levels[b] = level >= prev ? level : prev * this.decay;
    }
    return this.levels;
  }
}
