import { describe, expect, it } from 'vitest';
import { SpotifyTokenClient } from '../src/main/oauth/token-client.js';
import { jsonResponse } from './helpers.js';

function stubFetch(
  handler: (url: string, body: URLSearchParams) => Response,
): { fetchImpl: typeof fetch; calls: URLSearchParams[] } {
  const calls: URLSearchParams[] = [];
  const fetchImpl = ((url: string, init: RequestInit) => {
    const body = new URLSearchParams(String(init.body));
    calls.push(body);
    return Promise.resolve(handler(url, body));
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const GOOD_TOKENS = {
  access_token: 'acc-1',
  refresh_token: 'ref-1',
  expires_in: 3600,
  scope: 'streaming',
  token_type: 'Bearer',
};

describe('SpotifyTokenClient.exchangeCode', () => {
  it('posts the PKCE form and maps the response', async () => {
    const { fetchImpl, calls } = stubFetch(() => jsonResponse(200, GOOD_TOKENS));
    const client = new SpotifyTokenClient({ clientId: 'cid', fetchImpl });

    const before = Date.now();
    const tokens = await client.exchangeCode({
      code: 'thecode',
      redirectUri: 'http://127.0.0.1:8888/callback',
      verifier: 'v3rif13r',
    });

    const form = calls[0]!;
    expect(form.get('grant_type')).toBe('authorization_code');
    expect(form.get('code')).toBe('thecode');
    expect(form.get('redirect_uri')).toBe('http://127.0.0.1:8888/callback');
    expect(form.get('client_id')).toBe('cid');
    expect(form.get('code_verifier')).toBe('v3rif13r');

    expect(tokens.accessToken).toBe('acc-1');
    expect(tokens.refreshToken).toBe('ref-1');
    expect(tokens.scope).toBe('streaming');
    // expiresAt = now + 3600s - 30s skew
    expect(tokens.expiresAt).toBeGreaterThanOrEqual(before + 3_570_000);
    expect(tokens.expiresAt).toBeLessThanOrEqual(Date.now() + 3_570_000);
  });

  it('surfaces Spotify error descriptions', async () => {
    const { fetchImpl } = stubFetch(() =>
      jsonResponse(400, { error: 'invalid_grant', error_description: 'Invalid authorization code' }),
    );
    const client = new SpotifyTokenClient({ clientId: 'cid', fetchImpl });
    await expect(
      client.exchangeCode({ code: 'bad', redirectUri: 'http://127.0.0.1:8888/callback', verifier: 'v' }),
    ).rejects.toThrow(/invalid_grant: Invalid authorization code/);
  });

  it('rejects malformed success responses', async () => {
    const { fetchImpl } = stubFetch(() => jsonResponse(200, { hello: 'world' }));
    const client = new SpotifyTokenClient({ clientId: 'cid', fetchImpl });
    await expect(
      client.exchangeCode({ code: 'c', redirectUri: 'http://127.0.0.1:8888/callback', verifier: 'v' }),
    ).rejects.toThrow(/missing access_token/);
  });
});

describe('SpotifyTokenClient.refresh', () => {
  it('posts the refresh form and adopts a rotated refresh token', async () => {
    const { fetchImpl, calls } = stubFetch(() =>
      jsonResponse(200, { ...GOOD_TOKENS, refresh_token: 'ref-2' }),
    );
    const client = new SpotifyTokenClient({ clientId: 'cid', fetchImpl });
    const tokens = await client.refresh('ref-1');

    const form = calls[0]!;
    expect(form.get('grant_type')).toBe('refresh_token');
    expect(form.get('refresh_token')).toBe('ref-1');
    expect(form.get('client_id')).toBe('cid');
    expect(tokens.refreshToken).toBe('ref-2');
  });

  it('keeps the prior refresh token when Spotify does not rotate it', async () => {
    const { refresh_token: _omit, ...withoutRefresh } = GOOD_TOKENS;
    const { fetchImpl } = stubFetch(() => jsonResponse(200, withoutRefresh));
    const client = new SpotifyTokenClient({ clientId: 'cid', fetchImpl });
    const tokens = await client.refresh('ref-1');
    expect(tokens.refreshToken).toBe('ref-1');
  });
});
