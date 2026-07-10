import { describe, expect, it } from 'vitest';
import { SidecarManager, type SidecarState } from '../src/main/sidecar/manager.js';
import type { PcmStreamHeader } from '../src/main/sidecar/pcm-stream.js';

/**
 * Integration tests against real child processes: node -e plays the part
 * of the Swift sidecar, speaking (or violating) the wire protocol.
 */

const HEADER_LINE = '{"sampleRate":48000,"channels":1,"format":"f32le"}\\n';

/** Emits the header plus four floats, then stays alive. */
const HAPPY_SCRIPT = [
  `process.stdout.write('${HEADER_LINE}');`,
  'const b = Buffer.alloc(16);',
  '[0.1, 0.2, -0.3, 1].forEach((v, i) => b.writeFloatLE(v, i * 4));',
  'process.stdout.write(b);',
  'setInterval(() => {}, 1000);',
].join(' ');

/** Emits a valid header then dies immediately. */
const CRASHY_SCRIPT = `process.stdout.write('${HEADER_LINE}'); process.exit(1);`;

/** Not our protocol at all. */
const GARBAGE_SCRIPT = `process.stdout.write('mooo\\n'); setInterval(() => {}, 1000);`;

interface Harness {
  manager: SidecarManager;
  states: SidecarState[];
  details: Array<string | undefined>;
  samples: number[];
  headers: PcmStreamHeader[];
}

function harness(script: string, opts: { maxFailures?: number } = {}): Harness {
  const h: Harness = { states: [], details: [], samples: [], headers: [] } as unknown as Harness;
  h.manager = new SidecarManager({
    binaryPath: process.execPath,
    args: ['-e', script],
    maxConsecutiveFailures: opts.maxFailures ?? 3,
    restartDelayMs: 10,
    onSamples: (s) => h.samples.push(...s),
    onHeader: (header) => h.headers.push(header),
    onStateChange: (state, detail) => {
      h.states.push(state);
      h.details.push(detail);
    },
  });
  return h;
}

async function until(cond: () => boolean, ms = 5000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe('SidecarManager', () => {
  it('reaches running and delivers decoded PCM to the sink', async () => {
    const h = harness(HAPPY_SCRIPT);
    h.manager.start();
    await until(() => h.samples.length >= 4);

    expect(h.manager.getState()).toBe('running');
    expect(h.headers[0]).toEqual({ sampleRate: 48000, channels: 1, format: 'f32le' });
    expect(h.samples[0]).toBeCloseTo(0.1, 5);
    expect(h.samples[2]).toBeCloseTo(-0.3, 5);
    expect(h.samples[3]).toBe(1);

    h.manager.stop();
    await until(() => h.manager.getState() === 'stopped');
  });

  it('restarts after a crash (header seen resets the failure cap)', async () => {
    const h = harness(CRASHY_SCRIPT, { maxFailures: 2 });
    h.manager.start();
    // Each run emits a header then exits; a successful header resets the
    // failure counter, so the loop keeps restarting past the cap.
    await until(() => h.headers.length >= 3);
    h.manager.stop();
    await until(() => h.manager.getState() === 'stopped');
    expect(h.states.filter((s) => s === 'starting').length).toBeGreaterThanOrEqual(3);
  });

  it('gives up after consecutive protocol failures', async () => {
    const h = harness(GARBAGE_SCRIPT, { maxFailures: 2 });
    h.manager.start();
    await until(() => h.manager.getState() === 'failed');
    expect(h.headers.length).toBe(0);
    const failDetail = h.details[h.states.indexOf('failed')];
    expect(failDetail).toMatch(/not valid JSON|exit/);
  });

  it('fails cleanly when the binary does not exist', async () => {
    const h = harness('');
    h.manager = new SidecarManager({
      binaryPath: '/nonexistent/capture-sidecar',
      maxConsecutiveFailures: 2,
      restartDelayMs: 10,
      onSamples: () => {},
      onStateChange: (state, detail) => {
        h.states.push(state);
        h.details.push(detail);
      },
    });
    h.manager.start();
    await until(() => h.states.includes('failed'));
    expect(h.details[h.states.indexOf('failed')]).toMatch(/ENOENT/);
  });

  it('does not restart after an intentional stop', async () => {
    const h = harness(HAPPY_SCRIPT);
    h.manager.start();
    await until(() => h.manager.getState() === 'running');
    h.manager.stop();
    await until(() => h.manager.getState() === 'stopped');
    const headerCount = h.headers.length;
    await new Promise((r) => setTimeout(r, 100));
    expect(h.manager.getState()).toBe('stopped');
    expect(h.headers.length).toBe(headerCount);
  });
});
