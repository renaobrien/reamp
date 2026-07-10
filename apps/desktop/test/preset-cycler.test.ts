import { describe, expect, it } from 'vitest';
import { PresetCycler } from '../src/renderer/preset-cycler.js';

describe('PresetCycler', () => {
  it('cycles forward and backward with wrapping', () => {
    const c = new PresetCycler(['a', 'b', 'c']);
    expect(c.current).toBe('a');
    expect(c.next()).toBe('b');
    expect(c.next()).toBe('c');
    expect(c.next()).toBe('a'); // wraps
    expect(c.previous()).toBe('c'); // wraps backward
  });

  it('random jump never lands on the current preset', () => {
    // rng pinned to the lowest offset: always the immediate neighbor
    const c = new PresetCycler(['a', 'b', 'c'], () => 0);
    expect(c.randomJump()).toBe('b');
    expect(c.randomJump()).toBe('c');
    // rng at the top of the range: the furthest offset, still not current
    const d = new PresetCycler(['a', 'b', 'c'], () => 0.999);
    expect(d.randomJump()).toBe('c');
  });

  it('handles a single-preset list', () => {
    const c = new PresetCycler(['only'], () => 0.5);
    expect(c.randomJump()).toBe('only');
    expect(c.next()).toBe('only');
  });

  it('rejects an empty list', () => {
    expect(() => new PresetCycler([])).toThrow(/no presets/);
  });
});
