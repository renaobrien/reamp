/**
 * SharedArrayBuffer-backed PCM ring buffer.
 *
 * Pipeline (spec §2): SCK sidecar → PCM ring buffer (main process) →
 * SharedArrayBuffer → renderer FFT. Single writer (main), any number of
 * readers (renderer vis windows).
 *
 * Rules (spec §1): PCM lives only in this buffer — never written to disk,
 * never leaves the process. Analysis-only.
 *
 * Readers only ever want the most recent window (e.g. the latest 1024
 * samples), so this is a lossy latest-wins ring: the writer never blocks
 * and overwrites the oldest data. Sample reads are not atomic; a torn
 * Float32 during a concurrent write is imperceptible in a visualizer and
 * accepted by design.
 */

const HEADER_BYTES = 16; // one BigInt64 (totalWritten) + padding, keeps data 16-byte aligned

export class PcmRingBuffer {
  /** Samples the buffer can hold before wrapping. */
  readonly capacity: number;
  readonly sab: SharedArrayBuffer;
  private readonly header: BigInt64Array;
  private readonly data: Float32Array;

  private constructor(sab: SharedArrayBuffer) {
    this.sab = sab;
    this.header = new BigInt64Array(sab, 0, 1);
    this.data = new Float32Array(sab, HEADER_BYTES);
    this.capacity = this.data.length;
  }

  /** Allocate a new buffer (writer side). Default: 1s of 48kHz mono. */
  static create(capacity = 48000): PcmRingBuffer {
    if (capacity < 1) throw new Error('capacity must be >= 1');
    return new PcmRingBuffer(
      new SharedArrayBuffer(HEADER_BYTES + capacity * Float32Array.BYTES_PER_ELEMENT),
    );
  }

  /** Attach to an existing buffer (reader side, e.g. renderer). */
  static attach(sab: SharedArrayBuffer): PcmRingBuffer {
    return new PcmRingBuffer(sab);
  }

  /** Total samples ever written. */
  get totalWritten(): number {
    return Number(Atomics.load(this.header, 0));
  }

  /** Append samples, overwriting the oldest data when full. Writer only. */
  write(samples: Float32Array): void {
    const cap = this.capacity;
    let src = samples;
    if (src.length > cap) src = src.subarray(src.length - cap);
    const totalAfter = Atomics.load(this.header, 0) + BigInt(samples.length);
    // Place src so its last sample lands at (totalAfter - 1) % cap — for an
    // oversized (truncated) write this skips past the dropped samples.
    const pos = Number((totalAfter - BigInt(src.length)) % BigInt(cap));
    const firstChunk = Math.min(src.length, cap - pos);
    this.data.set(src.subarray(0, firstChunk), pos);
    if (firstChunk < src.length) this.data.set(src.subarray(firstChunk), 0);
    Atomics.store(this.header, 0, totalAfter);
  }

  /**
   * Copy the most recent `out.length` samples into `out` (oldest first).
   * Returns the number of valid samples (< out.length until enough audio
   * has been written; the leading remainder is zero-filled).
   */
  readLatest(out: Float32Array): number {
    const cap = this.capacity;
    const total = Atomics.load(this.header, 0);
    const want = Math.min(out.length, cap);
    const have = Math.min(Number(total < BigInt(cap) ? total : BigInt(cap)), want);
    const offset = out.length - have;
    if (offset > 0) out.fill(0, 0, offset);
    if (have === 0) return 0;

    const end = Number(total % BigInt(cap)); // one past the newest sample
    let start = end - have;
    if (start < 0) start += cap;
    const firstChunk = Math.min(have, cap - start);
    out.set(this.data.subarray(start, start + firstChunk), offset);
    if (firstChunk < have) out.set(this.data.subarray(0, have - firstChunk), offset + firstChunk);
    return have;
  }
}
