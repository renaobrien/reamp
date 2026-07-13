import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SpotifyApi } from '../src/main/spotify-api.js';
import { TokenVault, type VaultCipher } from '../src/main/token-vault.js';
import type { TokenSet } from '../src/main/oauth/token-client.js';
import type { SpotifyTokenClient } from '../src/main/oauth/token-client.js';

const fakeCipher: VaultCipher = {
  isAvailable: () => true,
  encrypt: (s) => Buffer.from(s, 'utf8'),
  decrypt: (b) => b.toString('utf8'),
};

function freshVault(): TokenVault {
  return new TokenVault(mkdtempSync(join(tmpdir(), 'reamp-vault-')), fakeCipher);
}

function tokens(expiresAt: number): TokenSet {
  return { accessToken: 'live-token', refreshToken: 'refresh-1', expiresAt, scope: '', tokenType: 'Bearer' };
}

type Route = { status: number; body: unknown };
function fakeFetch(routes: Route[]): { impl: typeof fetch; calls: Array<{ url: string; auth: string }> } {
  const calls: Array<{ url: string; auth: string }> = [];
  const impl = ((url: string, init?: { headers?: Record<string, string> }) => {
    calls.push({ url: String(url), auth: init?.headers?.['authorization'] ?? '' });
    const route = routes.shift() ?? { status: 500, body: {} };
    return Promise.resolve({
      ok: route.status >= 200 && route.status < 300,
      status: route.status,
      json: () => Promise.resolve(route.body),
    });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const refreshedClient = {
  refresh: () =>
    Promise.resolve({
      accessToken: 'refreshed-token',
      refreshToken: 'refresh-2',
      expiresAt: Date.now() + 3600_000,
      scope: '',
      tokenType: 'Bearer',
    }),
} as unknown as SpotifyTokenClient;

describe('TokenVault', () => {
  it('round-trips through the cipher and clears', () => {
    const vault = freshVault();
    vault.save({ clientId: 'abc', tokens: tokens(1) });
    expect(vault.load()?.clientId).toBe('abc');
    vault.clear();
    expect(vault.load()).toBeNull();
  });

  it('keeps tokens in memory only when encryption is unavailable', () => {
    const dir = mkdtempSync(join(tmpdir(), 'reamp-vault-'));
    const vault = new TokenVault(dir, { ...fakeCipher, isAvailable: () => false });
    vault.save({ clientId: 'abc', tokens: tokens(1) });
    expect(vault.load()?.clientId).toBe('abc'); // this session works
    const rebooted = new TokenVault(dir, { ...fakeCipher, isAvailable: () => false });
    expect(rebooted.load()).toBeNull(); // nothing hit the disk
  });
});

describe('SpotifyApi', () => {
  it('rejects a malformed client ID before opening any browser', async () => {
    const api = new SpotifyApi({ vault: freshVault() });
    await expect(api.connect('not-a-client-id', () => {})).rejects.toThrow(/client ID/);
  });

  it('maps and paginates playlists', async () => {
    const vault = freshVault();
    vault.save({ clientId: 'a'.repeat(32), tokens: tokens(Date.now() + 3600_000) });
    const { impl, calls } = fakeFetch([
      {
        status: 200,
        body: {
          items: [{ id: 'p1', name: 'Bangers', tracks: { total: 12 }, images: [{ url: 'u' }] }],
          next: 'https://api.spotify.com/v1/me/playlists?offset=50',
        },
      },
      { status: 200, body: { items: [{ id: 'p2', name: 'Sleepers', tracks: { total: 3 } }], next: null } },
    ]);
    const api = new SpotifyApi({ vault, fetchImpl: impl });
    const lists = await api.getPlaylists();
    expect(lists).toEqual([
      { id: 'p1', name: 'Bangers', trackCount: 12, artUrl: 'u' },
      { id: 'p2', name: 'Sleepers', trackCount: 3, artUrl: undefined },
    ]);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.auth).toBe('Bearer live-token');
  });

  it('maps tracks and skips local/null entries', async () => {
    const vault = freshVault();
    vault.save({ clientId: 'a'.repeat(32), tokens: tokens(Date.now() + 3600_000) });
    const { impl } = fakeFetch([
      {
        status: 200,
        body: {
          items: [
            {
              track: {
                id: 't1',
                uri: 'spotify:track:t1',
                name: 'Song',
                duration_ms: 1000,
                artists: [{ name: 'A' }, { name: 'B' }],
                album: { name: 'Alb' },
              },
            },
            { track: null },
            { track: { id: null, uri: 'spotify:local:x', name: 'Local', duration_ms: 1, artists: [], album: { name: '' } } },
          ],
          next: null,
        },
      },
    ]);
    const api = new SpotifyApi({ vault, fetchImpl: impl });
    const tracksOut = await api.getPlaylistTracks('p1');
    expect(tracksOut).toEqual([
      { id: 't1', uri: 'spotify:track:t1', title: 'Song', artist: 'A, B', album: 'Alb', durationMs: 1000 },
    ]);
  });

  it('refreshes once on 401 and persists the rotated tokens', async () => {
    const vault = freshVault();
    vault.save({ clientId: 'a'.repeat(32), tokens: tokens(Date.now() + 3600_000) });
    const { impl, calls } = fakeFetch([
      { status: 401, body: {} },
      { status: 200, body: { items: [], next: null } },
    ]);
    const api = new SpotifyApi({ vault, fetchImpl: impl, tokenClientFactory: () => refreshedClient });
    await api.getPlaylists();
    expect(calls[1]!.auth).toBe('Bearer refreshed-token');
    expect(vault.load()?.tokens.refreshToken).toBe('refresh-2');
  });

  it('refreshes proactively when the stored token is stale', async () => {
    const vault = freshVault();
    vault.save({ clientId: 'a'.repeat(32), tokens: tokens(Date.now() - 1000) });
    const { impl, calls } = fakeFetch([{ status: 200, body: { items: [], next: null } }]);
    const api = new SpotifyApi({ vault, fetchImpl: impl, tokenClientFactory: () => refreshedClient });
    await api.getPlaylists();
    expect(calls[0]!.auth).toBe('Bearer refreshed-token');
  });

  it('explains the dev-mode allowlist on 403', async () => {
    const vault = freshVault();
    vault.save({ clientId: 'a'.repeat(32), tokens: tokens(Date.now() + 3600_000) });
    const { impl } = fakeFetch([{ status: 403, body: {} }]);
    const api = new SpotifyApi({ vault, fetchImpl: impl });
    await expect(api.getPlaylists()).rejects.toThrow(/User Management/);
  });

  it('clears the vault and asks for a reconnect when refresh fails', async () => {
    const vault = freshVault();
    vault.save({ clientId: 'a'.repeat(32), tokens: tokens(Date.now() - 1000) });
    const failingClient = {
      refresh: () => Promise.reject(new Error('invalid_grant')),
    } as unknown as SpotifyTokenClient;
    const { impl } = fakeFetch([]);
    const api = new SpotifyApi({ vault, fetchImpl: impl, tokenClientFactory: () => failingClient });
    await expect(api.getPlaylists()).rejects.toThrow(/reconnect in Settings/);
    expect(vault.load()).toBeNull();
  });
});
