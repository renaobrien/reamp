import { describe, expect, it } from 'vitest';
import { PeakTracker } from '../src/index.js';

const silence = new Float32Array(4);

describe('PeakTracker', () => {
  it('jumps to a new peak instantly', () => {
    const pt = new PeakTracker(4);
    const peaks = pt.update([0.2, 0.9, 0.5, 0]);
    expect(Array.from(peaks)).toEqual([0.2 + 0, 0.9, 0.5, 0].map((v) => Math.fround(v)));
  });

  it('holds for holdFrames before falling', () => {
    const pt = new PeakTracker(1, { holdFrames: 3, gravity: 0.01 });
    pt.update([0.8]);
    for (let i = 0; i < 3; i++) {
      pt.update(silence);
      expect(pt.peaks[0]!).toBeCloseTo(0.8, 6);
    }
    pt.update(silence);
    expect(pt.peaks[0]!).toBeLessThan(0.8);
  });

  it('falls with acceleration once the hold expires', () => {
    const pt = new PeakTracker(1, { holdFrames: 0, gravity: 0.01 });
    pt.update([0.9]);
    pt.update(silence); // v=0.01, peak 0.89
    const drop1 = 0.9 - pt.peaks[0]!;
    pt.update(silence); // v=0.02, peak 0.87
    const drop2 = 0.89 - pt.peaks[0]!;
    expect(drop2).toBeGreaterThan(drop1);
  });

  it('never falls below the live level and re-arms the hold on a new peak', () => {
    const pt = new PeakTracker(1, { holdFrames: 2, gravity: 0.5 });
    pt.update([0.9]);
    pt.update(silence);
    pt.update(silence);
    pt.update([0.6]); // falling fast, but the floor is the live level
    expect(pt.peaks[0]!).toBeGreaterThanOrEqual(0.6);
    pt.update([0.95]); // new peak re-arms hold
    expect(pt.peaks[0]!).toBeCloseTo(0.95, 6);
    pt.update(silence);
    expect(pt.peaks[0]!).toBeCloseTo(0.95, 6); // held again
  });
});
