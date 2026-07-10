// Mock capture sidecar: speaks the exact wire protocol of the Swift SCK
// binary (one JSON header line, then f32le PCM on stdout) so the whole
// vis pipeline runs on any machine with no capture permission and no
// macOS. Emits a slow sine sweep with a beat-ish amplitude pulse so the
// spectrum bars and oscilloscope have something worth looking at.
//
// Plain .mjs on purpose: runs with any Node (or Electron via
// ELECTRON_RUN_AS_NODE=1) without a build step.

const SAMPLE_RATE = 48000;
const CHUNK_MS = 20;
const CHUNK_SAMPLES = (SAMPLE_RATE * CHUNK_MS) / 1000;

process.stdout.write(
  JSON.stringify({ sampleRate: SAMPLE_RATE, channels: 1, format: 'f32le' }) + '\n',
);

let t = 0; // sample clock
const TWO_PI = 2 * Math.PI;

function sample(n) {
  const seconds = n / SAMPLE_RATE;
  // fundamental sweeping 110Hz..1760Hz over ~8s, plus a fifth above
  const sweep = 110 * Math.pow(2, (seconds % 8) / 2);
  const pulse = 0.55 + 0.45 * Math.pow(Math.max(0, Math.sin(TWO_PI * (seconds * 2))), 4);
  return (
    pulse *
    (0.6 * Math.sin((TWO_PI * sweep * n) / SAMPLE_RATE) +
      0.25 * Math.sin((TWO_PI * sweep * 1.5 * n) / SAMPLE_RATE) +
      0.05 * (Math.random() * 2 - 1))
  );
}

const buf = Buffer.alloc(CHUNK_SAMPLES * 4);
setInterval(() => {
  for (let i = 0; i < CHUNK_SAMPLES; i++) {
    buf.writeFloatLE(Math.max(-1, Math.min(1, sample(t + i))), i * 4);
  }
  t += CHUNK_SAMPLES;
  process.stdout.write(buf);
}, CHUNK_MS);
