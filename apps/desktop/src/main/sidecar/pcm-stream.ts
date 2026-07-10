/**
 * Wire protocol between the Swift capture sidecar and the main process
 * (spec §2, M1): one JSON header line, then a raw little-endian Float32
 * PCM stream on stdout. The parser feeds decoded samples straight into
 * the PcmRingBuffer, PCM is never written to disk, never leaves the
 * process pair.
 *
 *   {"sampleRate":48000,"channels":1,"format":"f32le"}\n
 *   <f32le><f32le><f32le>…
 */

export interface PcmStreamHeader {
  sampleRate: number;
  /** 1 = mono (the sidecar downmixes), 2 = interleaved stereo. */
  channels: 1 | 2;
  format: 'f32le';
}

export interface PcmStreamCallbacks {
  onHeader?: (header: PcmStreamHeader) => void;
  /** Called with each decoded block. The array is freshly allocated per call. */
  onSamples: (samples: Float32Array) => void;
}

const NEWLINE = 0x0a;
const MAX_HEADER_BYTES = 4096;

/** Incremental parser, stdout chunk boundaries can split anything, even mid-float. */
export class PcmStreamParser {
  private readonly callbacks: PcmStreamCallbacks;
  private headerParsed = false;
  private pending: Uint8Array = new Uint8Array(0);

  constructor(callbacks: PcmStreamCallbacks) {
    this.callbacks = callbacks;
  }

  get header(): boolean {
    return this.headerParsed;
  }

  push(chunk: Uint8Array): void {
    this.pending = concat(this.pending, chunk);

    if (!this.headerParsed) {
      const nl = this.pending.indexOf(NEWLINE);
      if (nl === -1) {
        if (this.pending.length > MAX_HEADER_BYTES) {
          throw new Error('PCM stream header exceeds 4KB, sidecar output is not the expected protocol');
        }
        return;
      }
      const headerBytes = this.pending.subarray(0, nl);
      this.pending = this.pending.slice(nl + 1);
      const header = parseHeader(headerBytes);
      this.headerParsed = true;
      this.callbacks.onHeader?.(header);
    }

    const sampleCount = Math.floor(this.pending.length / 4);
    if (sampleCount === 0) return;

    const view = new DataView(this.pending.buffer, this.pending.byteOffset, sampleCount * 4);
    const samples = new Float32Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) {
      samples[i] = view.getFloat32(i * 4, true);
    }
    this.pending = this.pending.slice(sampleCount * 4);
    this.callbacks.onSamples(samples);
  }
}

function parseHeader(bytes: Uint8Array): PcmStreamHeader {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('PCM stream header is not valid JSON');
  }
  const h = parsed as Partial<PcmStreamHeader>;
  if (
    typeof h?.sampleRate !== 'number' ||
    h.sampleRate <= 0 ||
    (h.channels !== 1 && h.channels !== 2) ||
    h.format !== 'f32le'
  ) {
    throw new Error(`Unsupported PCM stream header: ${JSON.stringify(parsed)}`);
  }
  return { sampleRate: h.sampleRate, channels: h.channels, format: 'f32le' };
}

/** Encode a header line, used by tests and the M1 mock sidecar. */
export function encodePcmHeader(header: PcmStreamHeader): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(header)}\n`);
}

/** Encode samples as f32le regardless of host endianness, tests / mock sidecar. */
export function encodePcmSamples(samples: ArrayLike<number>): Uint8Array {
  const out = new Uint8Array(samples.length * 4);
  const view = new DataView(out.buffer);
  for (let i = 0; i < samples.length; i++) {
    view.setFloat32(i * 4, samples[i]!, true);
  }
  return out;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length === 0) return b instanceof Uint8Array ? new Uint8Array(b) : b;
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}
