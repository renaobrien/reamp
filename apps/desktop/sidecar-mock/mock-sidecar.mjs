// Mock capture sidecar: speaks the exact wire protocol of the Swift SCK
// binary (one JSON header line, then f32le PCM on stdout) so the whole
// vis pipeline runs on any machine with no capture permission and no
// macOS. Plays the same tiny procedural band as the browser demo (four
// on the floor kick, sidechain-ducked bass, a 16th-note arpeggio, and
// offbeat hats) so beats actually fire and the scenes have music to
// react to, not a test tone. Grooves rotate so it never sits still.
//
// Plain .mjs on purpose: runs with any Node (or Electron via
// ELECTRON_RUN_AS_NODE=1) without a build step.

const SAMPLE_RATE = 48000;
const CHUNK_MS = 20;
const CHUNK_SAMPLES = (SAMPLE_RATE * CHUNK_MS) / 1000;

// the consumer quitting mid-write is a normal shutdown, not a crash
process.stdout.on('error', () => process.exit(0));

process.stdout.write(
  JSON.stringify({ sampleRate: SAMPLE_RATE, channels: 1, format: 'f32le' }) + '\n',
);

const TWO_PI = 2 * Math.PI;
const GROOVES = [
  { bpm: 126, root: 55, arp: [0, 3, 7, 10] },
  { bpm: 98, root: 41.2, arp: [0, 5, 7, 12] },
  { bpm: 140, root: 61.7, arp: [0, 4, 7, 11] },
  { bpm: 82, root: 49, arp: [0, 3, 8, 12] },
];
const GROOVE_SECONDS = 24;

function sample(n) {
  const seconds = n / SAMPLE_RATE;
  const g = GROOVES[Math.floor(seconds / GROOVE_SECONDS) % GROOVES.length];
  const beatLen = 60 / g.bpm;
  const beatPhase = (seconds % beatLen) / beatLen; // 0..1 within the beat
  const beatIndex = Math.floor(seconds / beatLen);

  // kick: exponentially decaying pitch-dropping sine on every beat
  const kickEnv = Math.exp(-beatPhase * 9);
  const kick = Math.sin(TWO_PI * (48 + 60 * Math.exp(-beatPhase * 14)) * seconds) * kickEnv;

  // bass: root note, ducked by the kick (fake sidechain pumps everything)
  const duck = 1 - kickEnv * 0.75;
  const bassNote = g.root * (beatIndex % 8 < 4 ? 1 : 0.749); // I .. bVII
  const bass = Math.sin(TWO_PI * bassNote * seconds) * 0.5 * duck;

  // arpeggio: 16ths stepping through the groove's chord, two octaves up
  const step = Math.floor(seconds / (beatLen / 4)) % g.arp.length;
  const arpFreq = g.root * 4 * Math.pow(2, g.arp[step] / 12);
  const arpEnv = Math.exp(-((seconds % (beatLen / 4)) / (beatLen / 4)) * 5);
  const arp = Math.sin(TWO_PI * arpFreq * seconds) * 0.3 * arpEnv * duck;

  // hats: filtered-ish noise bursts on the offbeats
  const offbeat = (seconds + beatLen / 2) % beatLen;
  const hatEnv = Math.exp(-(offbeat / beatLen) * 26);
  const hat = (Math.random() * 2 - 1) * 0.22 * hatEnv;

  return Math.max(-1, Math.min(1, kick * 0.9 + bass + arp + hat));
}

let t = 0; // sample clock
const buf = Buffer.alloc(CHUNK_SAMPLES * 4);
setInterval(() => {
  for (let i = 0; i < CHUNK_SAMPLES; i++) {
    buf.writeFloatLE(sample(t + i), i * 4);
  }
  t += CHUNK_SAMPLES;
  process.stdout.write(buf);
}, CHUNK_MS);
