import { describe, expect, it } from 'vitest';
import { RealFft, SpectrumAnalyzer, hannWindow } from '../src/index.js';

function sine(size: number, bin: number, amplitude = 1): Float32Array {
  const out = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    out[i] = amplitude * Math.sin((2 * Math.PI * bin * i) / size);
  }
  return out;
}

describe('RealFft', () => {
  it('rejects non-power-of-two sizes', () => {
    expect(() => new RealFft(1000)).toThrow(/power of two/);
  });

  it('puts a pure tone in the right bin at ~unity magnitude', () => {
    const fft = new RealFft(1024);
    const mags = fft.analyze(sine(1024, 100));
    let peakBin = 0;
    for (let k = 1; k < mags.length; k++) {
      if (mags[k]! > mags[peakBin]!) peakBin = k;
    }
    expect(peakBin).toBe(100);
    expect(mags[100]!).toBeGreaterThan(0.9);
    expect(mags[100]!).toBeLessThan(1.1);
  });

  it('scales linearly with amplitude', () => {
    const fft = new RealFft(1024);
    const loud = fft.analyze(sine(1024, 50, 1.0))[50]!;
    const quiet = new RealFft(1024).analyze(sine(1024, 50, 0.25))[50]!;
    expect(quiet / loud).toBeCloseTo(0.25, 2);
  });

  it('reports silence as ~zero everywhere', () => {
    const fft = new RealFft(512);
    const mags = fft.analyze(new Float32Array(512));
    for (const m of mags) expect(m).toBe(0);
  });
});

describe('hannWindow', () => {
  it('is zero at the ends and unity in the middle', () => {
    const w = hannWindow(1024);
    expect(w[0]).toBeCloseTo(0, 6);
    expect(w[1023]).toBeCloseTo(0, 6);
    expect(w[511]!).toBeGreaterThan(0.99);
  });
});

describe('SpectrumAnalyzer', () => {
  it('produces 75 bands in 0..1 with the tone landing in a low band for low freq', () => {
    const sa = new SpectrumAnalyzer({ fftSize: 1024, sampleRate: 48000, bands: 75 });
    // 100Hz tone: bin ≈ 100 / (48000/1024) ≈ 2
    const levels = sa.process(sine(1024, 2));
    expect(levels.length).toBe(75);
    let peakBand = 0;
    for (let b = 1; b < levels.length; b++) {
      if (levels[b]! > levels[peakBand]!) peakBand = b;
    }
    expect(peakBand).toBeLessThan(15);
    for (const v of levels) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('decays after the signal stops instead of dropping to zero', () => {
    const sa = new SpectrumAnalyzer({ fftSize: 1024, bands: 75, decay: 0.8 });
    const active = sa.process(sine(1024, 8)).slice();
    let peakBand = 0;
    for (let b = 1; b < active.length; b++) {
      if (active[b]! > active[peakBand]!) peakBand = b;
    }
    const silent = sa.process(new Float32Array(1024));
    expect(silent[peakBand]!).toBeCloseTo(active[peakBand]! * 0.8, 5);
  });
});
