/**
 * Capture-sidecar process manager (spec §2). Spawns the Swift SCK binary,
 * decodes its stdout through PcmStreamParser, and hands samples to a sink
 * (the PCM ring buffer at M1 wiring). Restarts on crash with a cap on
 * consecutive failures so a broken binary cannot spin forever; the
 * settings UI surfaces state changes (R9: honest degradation, playback
 * keeps working when capture does not).
 *
 * PCM discipline: samples go straight from the parser to the sink. They
 * are never written to disk and never leave the process.
 */
import { spawn } from 'node:child_process';
import { PcmStreamParser, type PcmStreamHeader } from './pcm-stream.js';

export type SidecarState = 'idle' | 'starting' | 'running' | 'stopped' | 'failed';

export interface SidecarManagerOptions {
  binaryPath: string;
  args?: string[];
  /** Receives every decoded PCM block (wire it to PcmRingBuffer.write). */
  onSamples: (samples: Float32Array) => void;
  onHeader?: (header: PcmStreamHeader) => void;
  onStateChange?: (state: SidecarState, detail?: string) => void;
  /** Give up after this many consecutive failed runs (no header seen). */
  maxConsecutiveFailures?: number;
  restartDelayMs?: number;
  /** Injectable for tests. */
  spawnImpl?: typeof spawn;
}

const STDERR_TAIL_LINES = 20;

export class SidecarManager {
  private readonly opts: Required<Pick<SidecarManagerOptions, 'binaryPath' | 'onSamples'>> &
    SidecarManagerOptions;
  private readonly spawnImpl: typeof spawn;
  private readonly maxConsecutiveFailures: number;
  private readonly restartDelayMs: number;

  private child: ReturnType<typeof spawn> | null = null;
  private state: SidecarState = 'idle';
  private failures = 0;
  private stopping = false;
  private restartTimer: NodeJS.Timeout | null = null;
  private stderrTail: string[] = [];

  constructor(opts: SidecarManagerOptions) {
    this.opts = opts;
    this.spawnImpl = opts.spawnImpl ?? spawn;
    this.maxConsecutiveFailures = opts.maxConsecutiveFailures ?? 3;
    this.restartDelayMs = opts.restartDelayMs ?? 1000;
  }

  getState(): SidecarState {
    return this.state;
  }

  start(): void {
    if (this.child !== null) return;
    this.stopping = false;
    this.failures = 0;
    this.spawnOnce();
  }

  stop(): void {
    this.stopping = true;
    if (this.restartTimer !== null) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.child !== null) {
      this.child.kill();
    } else {
      this.setState('stopped');
    }
  }

  private spawnOnce(): void {
    this.setState('starting');
    this.stderrTail = [];

    const parser = new PcmStreamParser({
      onHeader: (header) => {
        this.failures = 0; // a header means the binary works; reset the cap
        this.setState('running');
        this.opts.onHeader?.(header);
      },
      onSamples: (samples) => this.opts.onSamples(samples),
    });

    const child = this.spawnImpl(this.opts.binaryPath, this.opts.args ?? [], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child = child;
    let settled = false;
    const settle = (detail?: string): void => {
      if (settled || this.child !== child) return;
      settled = true;
      this.child = null;
      this.handleExit(detail);
    };

    child.stdout?.on('data', (chunk: Buffer) => {
      try {
        parser.push(chunk);
      } catch (err) {
        // Protocol violation: this is not our sidecar. Kill and let the
        // failure cap decide whether to retry.
        this.recordStderr(String(err));
        child.kill();
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => this.recordStderr(chunk.toString()));
    child.on('error', (err) => settle(err.message)); // spawn failure, e.g. missing binary
    child.on('exit', (code, signal) => settle(`exit ${code ?? `signal ${signal}`}`));
  }

  private handleExit(detail?: string): void {
    if (this.stopping) {
      this.setState('stopped');
      return;
    }
    this.failures += 1;
    const tail = this.stderrTail.join('\n');
    if (this.failures >= this.maxConsecutiveFailures) {
      this.setState('failed', [detail, tail].filter(Boolean).join('\n'));
      return;
    }
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (!this.stopping) this.spawnOnce();
    }, this.restartDelayMs);
  }

  private recordStderr(text: string): void {
    for (const line of text.split('\n')) {
      if (line.trim().length === 0) continue;
      this.stderrTail.push(line);
      if (this.stderrTail.length > STDERR_TAIL_LINES) this.stderrTail.shift();
    }
  }

  private setState(state: SidecarState, detail?: string): void {
    if (this.state === state) return;
    this.state = state;
    this.opts.onStateChange?.(state, detail);
  }
}
