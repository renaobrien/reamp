import { describe, expect, it } from 'vitest';
import type { PlayerState, SourceAdapter, SourceId } from '@reamp/adapters';
import { AdapterHost } from '../src/main/adapter-host.js';
import type { PlayerStateEvent } from '../src/shared/ipc.js';

function someState(title: string): PlayerState {
  return {
    track: { title, artist: 'a', album: 'b', durationMs: 1000 },
    positionMs: 0,
    playing: true,
    shuffle: false,
    repeat: 'off',
    volume: 50,
  };
}

/** Records calls; lets the test emit player state on demand. */
function fakeAdapter(id: SourceId) {
  const calls: string[] = [];
  let emit: ((s: PlayerState) => void) | null = null;
  let unsubscribed = 0;
  const adapter: SourceAdapter = {
    id,
    auth: async () => ({ status: 'authorized' as const }),
    disconnect: async () => {},
    play: async (uri?: string) => void calls.push(`play${uri === undefined ? '' : `:${uri}`}`),
    pause: async () => void calls.push('pause'),
    next: async () => void calls.push('next'),
    previous: async () => void calls.push('previous'),
    seek: async (ms: number) => void calls.push(`seek:${ms}`),
    setVolume: async (pct: number) => void calls.push(`volume:${pct}`),
    setShuffle: async (on: boolean) => void calls.push(`shuffle:${on}`),
    setRepeat: async (mode: string) => void calls.push(`repeat:${mode}`),
    onPlayerState: (cb) => {
      emit = cb;
      return () => {
        unsubscribed += 1;
        emit = null;
      };
    },
    getPlaylists: async () => [],
    getPlaylistTracks: async () => [],
  };
  return {
    adapter,
    calls,
    emitState: (s: PlayerState) => emit?.(s),
    unsubCount: () => unsubscribed,
  };
}

function harness() {
  const spotify = fakeAdapter('spotify');
  const music = fakeAdapter('apple-music');
  const events: PlayerStateEvent[] = [];
  const host = new AdapterHost({
    adapters: { spotify: spotify.adapter, 'apple-music': music.adapter },
    initialSource: 'spotify',
    broadcast: (e) => events.push(e),
  });
  return { host, spotify, music, events };
}

describe('AdapterHost', () => {
  it('dispatches every transport command to the active adapter', async () => {
    const { host, spotify } = harness();
    await host.transport({ action: 'play', uri: 'spotify:track:x' });
    await host.transport({ action: 'pause' });
    await host.transport({ action: 'next' });
    await host.transport({ action: 'previous' });
    await host.transport({ action: 'seek', ms: 1234 });
    await host.transport({ action: 'setVolume', pct: 80 });
    await host.transport({ action: 'setShuffle', on: true });
    await host.transport({ action: 'setRepeat', mode: 'context' });
    expect(spotify.calls).toEqual([
      'play:spotify:track:x',
      'pause',
      'next',
      'previous',
      'seek:1234',
      'volume:80',
      'shuffle:true',
      'repeat:context',
    ]);
  });

  it('broadcasts player state tagged with the source', () => {
    const { spotify, events } = harness();
    spotify.emitState(someState('Song A'));
    expect(events).toEqual([
      { source: 'spotify', state: expect.objectContaining({ track: expect.objectContaining({ title: 'Song A' }) }) },
    ]);
  });

  it('switching sources unsubscribes the old adapter and routes to the new one', async () => {
    const { host, spotify, music, events } = harness();
    const auth = await host.setSource('apple-music');
    expect(auth.status).toBe('authorized');
    expect(host.getSource()).toBe('apple-music');
    expect(spotify.unsubCount()).toBe(1);

    await host.transport({ action: 'pause' });
    expect(music.calls).toEqual(['pause']);
    expect(spotify.calls).toEqual([]);

    music.emitState(someState('From Music'));
    expect(events.at(-1)?.source).toBe('apple-music');
  });

  it('rejects transport for an unregistered source', async () => {
    const spotify = fakeAdapter('spotify');
    const host = new AdapterHost({
      adapters: { spotify: spotify.adapter },
      initialSource: 'spotify',
      broadcast: () => {},
    });
    await expect(host.setSource('apple-music')).rejects.toThrow(/no adapter registered/);
    expect(host.getSource()).toBe('spotify'); // unchanged after the failed switch
  });

  it('stops broadcasting after dispose', () => {
    const { host, spotify, events } = harness();
    host.dispose();
    spotify.emitState(someState('late'));
    expect(events).toEqual([]);
  });
});
