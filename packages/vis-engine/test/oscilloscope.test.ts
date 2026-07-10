import { describe, expect, it } from 'vitest';
import { waveformPoints } from '../src/index.js';

describe('waveformPoints', () => {
  it('produces the requested number of points', () => {
    const pcm = new Float32Array(1024).map((_, i) => Math.sin(i / 20));
    expect(waveformPoints(pcm, 75).length).toBe(75);
  });

  it('preserves a constant signal exactly', () => {
    const pcm = new Float32Array(512).fill(0.7);
    const pts = waveformPoints(pcm, 75);
    for (const p of pts) expect(p).toBeCloseTo(0.7, 6);
  });

  it('clamps out-of-range samples to [-1, 1]', () => {
    const pcm = new Float32Array([5, -5, 0.5, -0.5]);
    expect(Array.from(waveformPoints(pcm, 4))).toEqual([1, -1, 0.5, -0.5]);
  });

  it('returns silence for an empty window', () => {
    expect(Array.from(waveformPoints(new Float32Array(0), 4))).toEqual([0, 0, 0, 0]);
  });

  it('reuses a provided output array (no per-frame allocation)', () => {
    const out = new Float32Array(75);
    const pcm = new Float32Array(1024).fill(0.1);
    expect(waveformPoints(pcm, 75, out)).toBe(out);
  });
});
