import { describe, expect, it } from 'vitest';
import { PcmRingBuffer } from '../src/index.js';

function ramp(from: number, count: number): Float32Array {
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) out[i] = from + i;
  return out;
}

describe('PcmRingBuffer', () => {
  it('round-trips a simple write', () => {
    const rb = PcmRingBuffer.create(16);
    rb.write(ramp(1, 4)); // 1 2 3 4
    const out = new Float32Array(4);
    expect(rb.readLatest(out)).toBe(4);
    expect(Array.from(out)).toEqual([1, 2, 3, 4]);
  });

  it('zero-fills the head until enough audio has arrived', () => {
    const rb = PcmRingBuffer.create(16);
    rb.write(ramp(1, 2)); // 1 2
    const out = new Float32Array(4).fill(99);
    expect(rb.readLatest(out)).toBe(2);
    expect(Array.from(out)).toEqual([0, 0, 1, 2]);
  });

  it('returns the most recent window across the wrap point', () => {
    const rb = PcmRingBuffer.create(8);
    rb.write(ramp(1, 6)); // 1..6
    rb.write(ramp(7, 6)); // 7..12, wraps
    const out = new Float32Array(8);
    expect(rb.readLatest(out)).toBe(8);
    expect(Array.from(out)).toEqual([5, 6, 7, 8, 9, 10, 11, 12]);
    expect(rb.totalWritten).toBe(12);
  });

  it('keeps only the tail of a write larger than capacity', () => {
    const rb = PcmRingBuffer.create(4);
    rb.write(ramp(1, 10)); // keeps 7 8 9 10
    const out = new Float32Array(4);
    expect(rb.readLatest(out)).toBe(4);
    expect(Array.from(out)).toEqual([7, 8, 9, 10]);
    expect(rb.totalWritten).toBe(10);
  });

  it('shares state through the underlying SharedArrayBuffer', () => {
    const writer = PcmRingBuffer.create(8);
    const reader = PcmRingBuffer.attach(writer.sab);
    writer.write(ramp(1, 3));
    const out = new Float32Array(3);
    expect(reader.readLatest(out)).toBe(3);
    expect(Array.from(out)).toEqual([1, 2, 3]);
  });
});
