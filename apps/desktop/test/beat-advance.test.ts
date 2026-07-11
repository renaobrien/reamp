import { describe, expect, it } from 'vitest';
import { BeatAdvance } from '../src/renderer/beat-advance.js';

describe('BeatAdvance', () => {
  it('fires on the first strong beat', () => {
    const ba = new BeatAdvance(20_000);
    expect(ba.shouldAdvance(1000, 1)).toBe(true);
  });

  it('ignores beat envelope decay values', () => {
    const ba = new BeatAdvance(20_000);
    expect(ba.shouldAdvance(1000, 0.88)).toBe(false);
    expect(ba.shouldAdvance(1000, 0.5)).toBe(false);
  });

  it('holds for the configured window between advances', () => {
    const ba = new BeatAdvance(20_000);
    expect(ba.shouldAdvance(1000, 1)).toBe(true);
    expect(ba.shouldAdvance(15_000, 1)).toBe(false); // inside hold
    expect(ba.shouldAdvance(21_500, 1)).toBe(true); // hold elapsed
  });

  it('manual navigation re-arms the hold', () => {
    const ba = new BeatAdvance(20_000);
    expect(ba.shouldAdvance(1000, 1)).toBe(true);
    ba.notifyManualChange(30_000);
    expect(ba.shouldAdvance(35_000, 1)).toBe(false); // manual change was recent
    expect(ba.shouldAdvance(50_500, 1)).toBe(true);
  });
});
