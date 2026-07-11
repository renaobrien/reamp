/**
 * Feeds Webamp's built-in mini vis. Webamp reads an AnalyserNode from the
 * media backend and calls getByteTimeDomainData/getByteFrequencyData per
 * frame; since our audio never touches Web Audio (DRM rule), we hand it a
 * real AnalyserNode whose read methods are patched to serve the latest
 * loopback frame instead. The little waveform in the main window dances
 * to the same signal as everything else.
 */
import type { VisFrameEvent } from '../shared/ipc.js';

const TIME_SIZE = 2048; // AnalyserNode default fftSize
const FREQ_SIZE = 1024; // = frequencyBinCount

export class AnalyserFeed {
  private readonly time = new Uint8Array(TIME_SIZE).fill(128);
  private readonly freq = new Uint8Array(FREQ_SIZE).fill(0);

  /** Latest loopback frame becomes what the analyser "measures". */
  update(frame: VisFrameEvent): void {
    const pcm = frame.pcm;
    for (let i = 0; i < TIME_SIZE; i++) {
      // stretch/repeat the 1024-sample window across the 2048 slots
      const v = pcm[Math.floor((i / TIME_SIZE) * pcm.length)] ?? 0;
      this.time[i] = Math.max(0, Math.min(255, Math.round(v * 127 + 128)));
    }
    const levels = frame.levels;
    for (let i = 0; i < FREQ_SIZE; i++) {
      // map the 75 log-spaced bands across the linear bin range
      const level = levels[Math.floor((i / FREQ_SIZE) * levels.length)] ?? 0;
      this.freq[i] = Math.max(0, Math.min(255, Math.round(level * 255)));
    }
  }

  readTimeDomain(target: Uint8Array): void {
    target.set(this.time.subarray(0, Math.min(target.length, TIME_SIZE)));
  }

  readFrequency(target: Uint8Array): void {
    target.set(this.freq.subarray(0, Math.min(target.length, FREQ_SIZE)));
  }

  /** Wrap a real AnalyserNode so Webamp's reads come from the feed. */
  attach(node: AnalyserNode): AnalyserNode {
    node.fftSize = TIME_SIZE;
    node.getByteTimeDomainData = (arr: Uint8Array): void => this.readTimeDomain(arr);
    node.getByteFrequencyData = (arr: Uint8Array): void => this.readFrequency(arr);
    return node;
  }
}
