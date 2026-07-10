import { describe, expect, it } from 'vitest';
import { NotSupportedInDesktopModeError, SpotifyDesktopAdapter } from '../src/index.js';
import { FIELD_SEP } from '../src/desktop/osa.js';

/** Runner that answers scripts by first matching pattern and records everything sent. */
function fakeRunner(routes: Array<[RegExp, string]>) {
  const scripts: string[] = [];
  const runOsaScript = (script: string): Promise<string> => {
    scripts.push(script);
    for (const [re, reply] of routes) {
      if (re.test(script)) return Promise.resolve(reply);
    }
    return Promise.reject(new Error(`no fake route for script:\n${script}`));
  };
  return { runOsaScript, scripts };
}

const state = (fields: string[]): string => fields.join(FIELD_SEP);

describe('SpotifyDesktopAdapter', () => {
  it('parses player state, including commas in track names', async () => {
    const { runOsaScript } = fakeRunner([
      [
        /player state/,
        state([
          'playing',
          'Hello, Operator',
          'The White Stripes',
          'De Stijl',
          '154000',
          '42.5',
          '80',
          'true',
          'false',
        ]),
      ],
    ]);
    const adapter = new SpotifyDesktopAdapter({ runOsaScript });
    const s = await adapter.getPlayerState();
    expect(s).toEqual({
      track: {
        title: 'Hello, Operator',
        artist: 'The White Stripes',
        album: 'De Stijl',
        durationMs: 154000,
      },
      positionMs: 42500,
      playing: true,
      shuffle: true,
      repeat: 'off',
      volume: 80,
    });
  });

  it('returns null when stopped or the app is not running', async () => {
    const stoppedAdapter = new SpotifyDesktopAdapter(
      fakeRunner([[/player state/, 'stopped']]),
    );
    expect(await stoppedAdapter.getPlayerState()).toBeNull();

    const goneAdapter = new SpotifyDesktopAdapter(
      fakeRunner([[/player state/, 'not-running']]),
    );
    expect(await goneAdapter.getPlayerState()).toBeNull();
  });

  it('guards every transport script against auto-launching the app', async () => {
    const fake = fakeRunner([[/tell application "Spotify"/, 'ok']]);
    const adapter = new SpotifyDesktopAdapter(fake);
    await adapter.play();
    await adapter.next();
    await adapter.seek(90_000);
    for (const script of fake.scripts) {
      expect(script).toContain('exists process "Spotify"');
    }
    expect(fake.scripts.some((s) => s.includes('set player position to 90'))).toBe(true);
  });

  it('plays a specific Spotify URI and rejects unsafe ones', async () => {
    const fake = fakeRunner([[/tell application "Spotify"/, 'ok']]);
    const adapter = new SpotifyDesktopAdapter(fake);
    await adapter.play('spotify:track:4uLU6hMCjMI75M1A2tKUQC');
    expect(fake.scripts.at(-1)).toContain('play track "spotify:track:4uLU6hMCjMI75M1A2tKUQC"');

    await expect(adapter.play('spotify:track:x" -- inject')).rejects.toThrow(/unsafe/);
    await expect(adapter.play('http:evil:zzz')).rejects.toThrow(/not a Spotify URI/);
  });

  it('throws AppNotRunningError from transport when the app is gone', async () => {
    const adapter = new SpotifyDesktopAdapter(
      fakeRunner([[/tell application "Spotify"/, 'not-running']]),
    );
    await expect(adapter.pause()).rejects.toThrow(/not running/);
  });

  it('maps repeat modes onto the single AppleScript boolean', async () => {
    const fake = fakeRunner([[/tell application "Spotify"/, 'ok']]);
    const adapter = new SpotifyDesktopAdapter(fake);
    await adapter.setRepeat('context');
    expect(fake.scripts.at(-1)).toContain('set repeating to true');
    await adapter.setRepeat('off');
    expect(fake.scripts.at(-1)).toContain('set repeating to false');
  });

  it('clamps volume', async () => {
    const fake = fakeRunner([[/tell application "Spotify"/, 'ok']]);
    const adapter = new SpotifyDesktopAdapter(fake);
    await adapter.setVolume(250);
    expect(fake.scripts.at(-1)).toContain('set sound volume to 100');
  });

  it('reports auth from the running check', async () => {
    const running = new SpotifyDesktopAdapter(fakeRunner([[/is running/, 'true']]));
    expect((await running.auth()).status).toBe('authorized');
    const notRunning = new SpotifyDesktopAdapter(fakeRunner([[/is running/, 'false']]));
    expect((await notRunning.auth()).status).toBe('unauthorized');
  });

  it('declares playlist browsing unsupported in desktop mode', async () => {
    const adapter = new SpotifyDesktopAdapter(fakeRunner([]));
    await expect(adapter.getPlaylists()).rejects.toBeInstanceOf(NotSupportedInDesktopModeError);
  });

  it('polls player state, emits on change only, and stops on unsubscribe', async () => {
    let position = 0;
    const runOsaScript = (script: string): Promise<string> => {
      if (!/player state/.test(script)) return Promise.resolve('ok');
      position += 1000;
      return Promise.resolve(
        state(['playing', 'Song', 'Artist', 'Album', '200000', String(position / 1000), '50', 'false', 'false']),
      );
    };
    const adapter = new SpotifyDesktopAdapter({ runOsaScript, pollIntervalMs: 10 });
    const seen: number[] = [];
    const unsubscribe = adapter.onPlayerState((s) => seen.push(s.positionMs));

    await new Promise((r) => setTimeout(r, 60));
    unsubscribe();
    const countAtUnsub = seen.length;
    expect(countAtUnsub).toBeGreaterThanOrEqual(2);
    expect(new Set(seen).size).toBe(seen.length); // change-only: no duplicates

    await new Promise((r) => setTimeout(r, 40));
    expect(seen.length).toBe(countAtUnsub);
  });
});
