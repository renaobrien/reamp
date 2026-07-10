import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildSpotifyAuthorizeUrl,
  challengeFromVerifier,
  generatePkcePair,
} from '../src/main/oauth/pkce.js';

describe('PKCE', () => {
  it('derives the challenge as base64url(SHA-256(verifier))', () => {
    const { verifier, challenge } = generatePkcePair();
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
    expect(challengeFromVerifier(verifier)).toBe(challenge);
  });

  it('generates unique url-safe verifiers', () => {
    const a = generatePkcePair();
    const b = generatePkcePair();
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('buildSpotifyAuthorizeUrl', () => {
  const base = {
    clientId: 'client123',
    scopes: ['streaming', 'user-read-playback-state'],
    challenge: 'chal',
    state: 'st4te',
  };

  it('builds a PKCE authorize URL', () => {
    const url = new URL(
      buildSpotifyAuthorizeUrl({ ...base, redirectUri: 'http://127.0.0.1:8888/callback' }),
    );
    expect(url.origin).toBe('https://accounts.spotify.com');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe('chal');
    expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:8888/callback');
    expect(url.searchParams.get('scope')).toBe('streaming user-read-playback-state');
    expect(url.searchParams.get('state')).toBe('st4te');
  });

  it('rejects localhost redirect URIs (Spotify requires 127.0.0.1)', () => {
    expect(() =>
      buildSpotifyAuthorizeUrl({ ...base, redirectUri: 'http://localhost:8888/callback' }),
    ).toThrow(/127\.0\.0\.1/);
  });
});
