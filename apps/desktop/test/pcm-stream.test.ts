import { describe, expect, it } from 'vitest';
import {
  PcmStreamParser,
  encodePcmHeader,
  encodePcmSamples,
  type PcmStreamHeader,
} from '../src/main/sidecar/pcm-stream.js';

const HEADER: PcmStreamHeader = { sampleRate: 48000, channels: 1, format: 'f32le' };

function collector() {
  const headers: PcmStreamHeader[] = [];
  const samples: number[] = [];
  const parser = new PcmStreamParser({
    onHeader: (h) => headers.push(h),
    onSamples: (s) => samples.push(...s),
  });
  return { parser, headers, samples };
}

describe('PcmStreamParser', () => {
  const payload = [0.5, -0.25, 1.0, -1.0, 0.125];

  it('parses header then samples from one chunk', () => {
    const { parser, headers, samples } = collector();
    const bytes = new Uint8Array([...encodePcmHeader(HEADER), ...encodePcmSamples(payload)]);
    parser.push(bytes);
    expect(headers).toEqual([HEADER]);
    expect(samples).toEqual(payload);
  });

  it('survives arbitrary chunk boundaries, even one byte at a time', () => {
    const { parser, headers, samples } = collector();
    const bytes = new Uint8Array([...encodePcmHeader(HEADER), ...encodePcmSamples(payload)]);
    for (const b of bytes) parser.push(new Uint8Array([b]));
    expect(headers).toEqual([HEADER]);
    expect(samples).toEqual(payload);
  });

  it('holds partial floats across pushes without emitting garbage', () => {
    const { parser, samples } = collector();
    parser.push(encodePcmHeader(HEADER));
    const bytes = encodePcmSamples([0.5, -0.5]);
    parser.push(bytes.subarray(0, 5)); // one full float + 1 byte
    expect(samples).toEqual([0.5]);
    parser.push(bytes.subarray(5));
    expect(samples).toEqual([0.5, -0.5]);
  });

  it('rejects a header with the wrong format', () => {
    const { parser } = collector();
    const bad = new TextEncoder().encode('{"sampleRate":48000,"channels":1,"format":"s16le"}\n');
    expect(() => parser.push(bad)).toThrow(/Unsupported PCM stream header/);
  });

  it('rejects non-JSON headers', () => {
    const { parser } = collector();
    expect(() => parser.push(new TextEncoder().encode('hello world\n'))).toThrow(/not valid JSON/);
  });

  it('rejects an unterminated oversized header instead of buffering forever', () => {
    const { parser } = collector();
    expect(() => parser.push(new Uint8Array(5000).fill(0x41))).toThrow(/exceeds 4KB/);
  });
});
