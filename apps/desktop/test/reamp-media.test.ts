import { describe, expect, it } from 'vitest';
import type { PlayerStateEvent, TransportCommand } from '../src/shared/ipc.js';
import type { ReampApi } from '../src/preload.js';
import { createReampMediaClass } from '../src/renderer/reamp-media.js';

interface MediaLike {
  play(): Promise<void>;
  pause(): void;
  stop(): void;
  seekToPercentComplete(percent: number): void;
  setVolume(volume: number): void;
  loadFromUrl(url: string, autoPlay: boolean): Promise<void>;
  timeElapsed(): number;
  duration(): number;
  on(event: string, cb: () => void): void;
  dispose(): void;
}

function harness() {
  const commands: TransportCommand[] = [];
  let emit: ((e: PlayerStateEvent) => void) | null = null;
  const bridge = {
    transport: (cmd: TransportCommand) => {
      commands.push(cmd);
      return Promise.resolve();
    },
    onPlayerState: (cb: (e: PlayerStateEvent) => void) => {
      emit = cb;
    },
    onVisFrame: () => {},
    setSource: () => Promise.resolve(undefined),
    getSource: () => Promise.resolve('spotify'),
    auth: () => Promise.resolve(undefined),
    getPlaylists: () => Promise.resolve(undefined),
    getPlaylistTracks: () => Promise.resolve(undefined),
  } as unknown as ReampApi;

  const MediaClass = createReampMediaClass(bridge) as new () => MediaLike;
  const media = new MediaClass();
  const emitState = (positionMs: number, durationMs: number, playing: boolean): void => {
    emit?.({
      source: 'spotify',
      state: {
        track: { title: 't', artist: 'a', album: 'b', durationMs },
        positionMs,
        playing,
        shuffle: false,
        repeat: 'off',
        volume: 50,
      },
    });
  };
  return { media, commands, emitState };
}

describe('ReampMedia', () => {
  it('forwards transport intents over the bridge', async () => {
    const { media, commands } = harness();
    await media.play();
    media.pause();
    media.stop(); // honest streaming stop = pause
    media.setVolume(66);
    expect(commands).toEqual([
      { action: 'play' },
      { action: 'pause' },
      { action: 'pause' },
      { action: 'setVolume', pct: 66 },
    ]);
  });

  it('reports position and duration in seconds from player state', () => {
    const { media, emitState } = harness();
    emitState(93_500, 240_000, true);
    expect(media.timeElapsed()).toBeCloseTo(93.5);
    expect(media.duration()).toBe(240);
  });

  it('converts percent seeks into absolute milliseconds', () => {
    const { media, commands, emitState } = harness();
    emitState(0, 200_000, true);
    media.seekToPercentComplete(25);
    expect(commands.at(-1)).toEqual({ action: 'seek', ms: 50_000 });
  });

  it('ignores percent seeks before any duration is known', () => {
    const { media, commands } = harness();
    media.seekToPercentComplete(50);
    expect(commands).toEqual([]);
  });

  it('emits the events the media middleware consumes', () => {
    const { media, emitState } = harness();
    const seen: string[] = [];
    media.on('timeupdate', () => seen.push('timeupdate'));
    media.on('playing', () => seen.push('playing'));
    media.on('fileLoaded', () => seen.push('fileLoaded'));

    emitState(1000, 200_000, true); // new track + starts playing
    expect(seen).toEqual(['fileLoaded', 'playing', 'timeupdate']);

    seen.length = 0;
    emitState(2000, 200_000, true); // same track ticking along
    expect(seen).toEqual(['timeupdate']);
  });

  it('starts playback of a carried URI via loadFromUrl(autoPlay)', async () => {
    const { media, commands } = harness();
    await media.loadFromUrl('reamp:spotify:track:abc123', true);
    expect(commands).toEqual([{ action: 'play', uri: 'spotify:track:abc123' }]);

    commands.length = 0;
    await media.loadFromUrl('reamp:current', true); // placeholder resumes
    expect(commands).toEqual([{ action: 'play' }]);

    commands.length = 0;
    await media.loadFromUrl('reamp:current', false); // no autoplay, no command
    expect(commands).toEqual([]);
  });
});
