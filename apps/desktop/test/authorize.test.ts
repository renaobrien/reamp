import { describe, expect, it } from 'vitest';
import { DEFAULT_SPOTIFY_SCOPES, authorizeSpotify } from '../src/main/oauth/authorize.js';
import { challengeFromVerifier } from '../src/main/oauth/pkce.js';
import { SpotifyTokenClient } from '../src/main/oauth/token-client.js';
import { freePort, jsonResponse } from './helpers.js';

describe('authorizeSpotify', () => {
  it('runs the whole flow: PKCE → browser → loopback → code exchange', async () => {
    const port = await freePort();

    // Capture what the "token endpoint" receives so we can check PKCE integrity.
    let tokenForm: URLSearchParams | undefined;
    const fetchImpl = ((_url: string, init: RequestInit) => {
      tokenForm = new URLSearchParams(String(init.body));
      return Promise.resolve(
        jsonResponse(200, {
          access_token: 'acc',
          refresh_token: 'ref',
          expires_in: 3600,
          scope: DEFAULT_SPOTIFY_SCOPES.join(' '),
          token_type: 'Bearer',
        }),
      );
    }) as unknown as typeof fetch;

    let authorizeUrl: URL | undefined;
    const tokens = await authorizeSpotify({
      clientId: 'cid',
      port,
      // Plays the part of user + browser: inspect the authorize URL, then
      // "redirect" to the loopback server with a code.
      openBrowser: async (url) => {
        authorizeUrl = new URL(url);
        const state = authorizeUrl.searchParams.get('state')!;
        const res = await fetch(`http://127.0.0.1:${port}/callback?code=grant123&state=${state}`);
        expect(res.status).toBe(200);
      },
      tokenClient: new SpotifyTokenClient({ clientId: 'cid', fetchImpl }),
    });

    expect(tokens.accessToken).toBe('acc');

    // The browser saw a well-formed PKCE authorize URL…
    expect(authorizeUrl!.origin).toBe('https://accounts.spotify.com');
    expect(authorizeUrl!.searchParams.get('client_id')).toBe('cid');
    expect(authorizeUrl!.searchParams.get('redirect_uri')).toBe(
      `http://127.0.0.1:${port}/callback`,
    );
    expect(authorizeUrl!.searchParams.get('scope')).toBe(DEFAULT_SPOTIFY_SCOPES.join(' '));

    // …and the verifier sent to the token endpoint matches the challenge
    // the browser saw — the pair really belongs to this flow.
    expect(tokenForm!.get('code')).toBe('grant123');
    expect(challengeFromVerifier(tokenForm!.get('code_verifier')!)).toBe(
      authorizeUrl!.searchParams.get('code_challenge'),
    );
  });

  it('fails the whole flow when the callback times out', async () => {
    const port = await freePort();
    await expect(
      authorizeSpotify({
        clientId: 'cid',
        port,
        timeoutMs: 50,
        openBrowser: () => {},
      }),
    ).rejects.toThrow(/Timed out/);
  });
});
