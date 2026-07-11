import { describe, expect, it } from 'vitest';
import { AnalyserFeed } from '../src/renderer/analyser-feed.js';
import type { VisFrameEvent } from '../src/shared/ipc.js';

function frame(pcmValue: number, level: number): VisFrameEvent {
  return {
    pcm: new Array(1024).fill(pcmValue),
    levels: new Array(75).fill(level),
    wave: new Array(75).fill(0),
  };
}

describe('AnalyserFeed', () => {
  it('serves 128-centered silence before any frame arrives', () => {
    const feed = new AnalyserFeed();
    const time = new Uint8Array(2048);
    feed.readTimeDomain(time);
    expect(time[0]).toBe(128);
    expect(time[2047]).toBe(128);
    const freqBins = new Uint8Array(1024);
    feed.readFrequency(freqBins);
    expect(Math.max(...freqBins)).toBe(0);
  });

  it('converts PCM floats to unsigned bytes', () => {
    const feed = new AnalyserFeed();
    feed.update(frame(1, 0));
    const time = new Uint8Array(2048);
    feed.readTimeDomain(time);
    expect(time[0]).toBe(255);
    feed.update(frame(-1, 0));
    feed.readTimeDomain(time);
    expect(time[0]).toBe(1); // -1*127+128
  });

  it('maps band levels onto the frequency bins', () => {
    const feed = new AnalyserFeed();
    feed.update(frame(0, 0.5));
    const freqBins = new Uint8Array(1024);
    feed.readFrequency(freqBins);
    expect(freqBins[0]).toBe(128);
    expect(freqBins[1023]).toBe(128);
  });

  it('fills shorter target arrays without overflowing', () => {
    const feed = new AnalyserFeed();
    feed.update(frame(0.5, 0.5));
    const small = new Uint8Array(512);
    feed.readTimeDomain(small);
    expect(small[0]).toBe(Math.round(0.5 * 127 + 128));
  });
});
