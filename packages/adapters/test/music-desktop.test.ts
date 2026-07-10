import { describe, expect, it } from 'vitest';
import { MusicDesktopAdapter } from '../src/index.js';
import { FIELD_SEP, RECORD_SEP } from '../src/desktop/osa.js';

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

describe('MusicDesktopAdapter', () => {
  it('parses player state with seconds converted to ms and full repeat mapping', async () => {
    const fields = [
      'paused',
      'Kid A',
      'Radiohead',
      'Kid A',
      '284.5', // Music reports seconds
      '12.25',
      '65',
      'false',
      'one',
    ];
    const adapter = new MusicDesktopAdapter(
      fakeRunner([[/player state/, fields.join(FIELD_SEP)]]),
    );
    const s = await adapter.getPlayerState();
    expect(s).toEqual({
      track: { title: 'Kid A', artist: 'Radiohead', album: 'Kid A', durationMs: 284500 },
      positionMs: 12250,
      playing: false,
      shuffle: false,
      repeat: 'track',
      volume: 65,
    });
  });

  it('browses playlists', async () => {
    const rows = [
      ['ABC123', 'Driving', '42'].join(FIELD_SEP),
      ['DEF456', 'Focus, Deep', '7'].join(FIELD_SEP),
    ].join(RECORD_SEP);
    const adapter = new MusicDesktopAdapter(
      fakeRunner([[/user playlists/, rows + RECORD_SEP]]),
    );
    expect(await adapter.getPlaylists()).toEqual([
      { id: 'ABC123', name: 'Driving', trackCount: 42 },
      { id: 'DEF456', name: 'Focus, Deep', trackCount: 7 },
    ]);
  });

  it('browses playlist tracks and builds music-desktop URIs', async () => {
    const rows =
      ['0FA1B2C3D4E5F607', 'Idioteque', 'Radiohead', 'Kid A', '309.1'].join(FIELD_SEP) +
      RECORD_SEP;
    const adapter = new MusicDesktopAdapter(fakeRunner([[/tracks of p/, rows]]));
    expect(await adapter.getPlaylistTracks('ABC123')).toEqual([
      {
        id: '0FA1B2C3D4E5F607',
        uri: 'music-desktop:track:0FA1B2C3D4E5F607',
        title: 'Idioteque',
        artist: 'Radiohead',
        album: 'Kid A',
        durationMs: 309100,
      },
    ]);
  });

  it('plays tracks and playlists by persistent ID and rejects malformed URIs', async () => {
    const fake = fakeRunner([[/tell application "Music"/, 'ok']]);
    const adapter = new MusicDesktopAdapter(fake);

    await adapter.play('music-desktop:track:0FA1B2C3D4E5F607');
    expect(fake.scripts.at(-1)).toContain('whose persistent ID is "0FA1B2C3D4E5F607"');
    expect(fake.scripts.at(-1)).toContain('library playlist 1');

    await adapter.play('music-desktop:playlist:AABBCCDD');
    expect(fake.scripts.at(-1)).toContain('first user playlist whose persistent ID is "AABBCCDD"');

    await expect(adapter.play('spotify:track:abc')).rejects.toThrow(/not a music-desktop URI/);
  });

  it('maps repeat modes onto song repeat values', async () => {
    const fake = fakeRunner([[/tell application "Music"/, 'ok']]);
    const adapter = new MusicDesktopAdapter(fake);
    await adapter.setRepeat('track');
    expect(fake.scripts.at(-1)).toContain('set song repeat to one');
    await adapter.setRepeat('context');
    expect(fake.scripts.at(-1)).toContain('set song repeat to all');
    await adapter.setRepeat('off');
    expect(fake.scripts.at(-1)).toContain('set song repeat to off');
  });

  it('rejects playlist IDs that could escape the script', async () => {
    const adapter = new MusicDesktopAdapter(fakeRunner([]));
    await expect(adapter.getPlaylistTracks('X" & (do shell script "rm")')).rejects.toThrow(
      /unsafe/,
    );
  });
});
