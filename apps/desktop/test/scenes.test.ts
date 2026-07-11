import { describe, expect, it } from 'vitest';
import type { VisFrameEvent } from '../src/shared/ipc.js';
import { FeatureExtractor, createScenes } from '../src/renderer/scenes.js';

function frame(levels: number[]): VisFrameEvent {
  return { levels, wave: new Array(75).fill(0), pcm: new Array(1024).fill(0) };
}

const quiet = frame(new Array(75).fill(0.05));
const bassy = frame([...new Array(25).fill(0.9), ...new Array(50).fill(0.1)]);
const trebly = frame([...new Array(50).fill(0.1), ...new Array(25).fill(0.9)]);

describe('FeatureExtractor', () => {
  it('separates bass, mid, and treble energy', () => {
    const fx = new FeatureExtractor();
    const b = fx.extract(bassy);
    expect(b.bass).toBeGreaterThan(0.8);
    expect(b.treble).toBeLessThan(0.2);
    const t = fx.extract(trebly);
    expect(t.treble).toBeGreaterThan(0.8);
    expect(t.bass).toBeLessThan(0.2);
  });

  it('fires a beat on a bass jump and decays afterward', () => {
    const fx = new FeatureExtractor();
    for (let i = 0; i < 20; i++) fx.extract(quiet); // settle the rolling average
    const hit = fx.extract(bassy);
    expect(hit.beat).toBe(1);
    const after = fx.extract(bassy); // sustained bass is not a new beat
    expect(after.beat).toBeLessThan(1);
    let f = after;
    for (let i = 0; i < 30; i++) f = fx.extract(bassy);
    expect(f.beat).toBeLessThan(0.05); // envelope decays toward zero
  });

  it('does not fire beats on silence', () => {
    const fx = new FeatureExtractor();
    for (let i = 0; i < 30; i++) {
      expect(fx.extract(quiet).beat).toBeLessThanOrEqual(0.0001 + 0);
    }
  });

  it('reports centroid low for bassy frames and high for bright ones', () => {
    const fx = new FeatureExtractor();
    expect(fx.extract(bassy).centroid).toBeLessThan(0.35);
    expect(fx.extract(trebly).centroid).toBeGreaterThan(0.65);
  });

  it('reports loudness scaled into 0..1 and capped', () => {
    const fx = new FeatureExtractor();
    expect(fx.extract(quiet).loudness).toBeCloseTo(0.2, 5); // 0.05 mean * 4
    expect(fx.extract(frame(new Array(75).fill(0.9))).loudness).toBe(1);
  });
});

describe('createScenes', () => {
  it('provides the three named scenes', () => {
    expect(createScenes().map((s) => s.name)).toEqual(['Tunnel', 'Plasma', 'Swarm']);
  });
});
