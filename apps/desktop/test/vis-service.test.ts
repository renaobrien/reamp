import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { VisService, type VisFrame } from '../src/main/vis-service.js';

const MOCK_SIDECAR = fileURLToPath(new URL('../sidecar-mock/mock-sidecar.mjs', import.meta.url));

async function until(cond: () => boolean, ms = 8000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('VisService (full pipeline against the mock sidecar)', () => {
  it('produces spectrum and waveform frames from live PCM', async () => {
    const frames: VisFrame[] = [];
    const svc = new VisService({
      binaryPath: process.execPath,
      args: [MOCK_SIDECAR],
      frameRateHz: 60,
      broadcast: (f) => frames.push(f),
    });
    svc.start();
    try {
      await until(() => frames.length >= 5);
    } finally {
      svc.stop();
    }

    const frame = frames.at(-1)!;
    expect(frame.levels.length).toBe(75);
    expect(frame.wave.length).toBe(75);
    for (const v of frame.levels) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    for (const v of frame.wave) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
    // The mock plays a loud sweep: real energy must show up somewhere.
    expect(Math.max(...frame.levels)).toBeGreaterThan(0.1);
    // The waveform must actually wiggle, not sit at zero.
    expect(Math.max(...frame.wave) - Math.min(...frame.wave)).toBeGreaterThan(0.1);
    // The raw window rides along for Butterchurn: full fftSize, live signal.
    expect(frame.pcm.length).toBe(1024);
    expect(Math.max(...frame.pcm) - Math.min(...frame.pcm)).toBeGreaterThan(0.1);
  });

  it('stops producing frames after stop()', async () => {
    const frames: VisFrame[] = [];
    const svc = new VisService({
      binaryPath: process.execPath,
      args: [MOCK_SIDECAR],
      frameRateHz: 60,
      broadcast: (f) => frames.push(f),
    });
    svc.start();
    await until(() => frames.length >= 2);
    svc.stop();
    await until(() => svc.getState() === 'stopped');
    const count = frames.length;
    await new Promise((r) => setTimeout(r, 150));
    expect(frames.length).toBe(count);
  });
});
