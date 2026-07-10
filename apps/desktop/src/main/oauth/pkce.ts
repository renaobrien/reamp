/**
 * PKCE helpers for the Spotify Authorization Code flow (spec §4).
 * Implicit grant is deprecated; PKCE is the only supported path.
 */
import { createHash, randomBytes } from 'node:crypto';

export interface PkcePair {
  /** Random secret, kept locally until the token exchange. */
  verifier: string;
  /** base64url(SHA-256(verifier)), sent in the authorize URL. */
  challenge: string;
}

export function generatePkcePair(): PkcePair {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: challengeFromVerifier(verifier) };
}

export function challengeFromVerifier(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export interface AuthorizeUrlOptions {
  clientId: string;
  /** Must be registered verbatim in the Spotify app, 127.0.0.1, never localhost. */
  redirectUri: string;
  scopes: string[];
  challenge: string;
  state: string;
}

export function buildSpotifyAuthorizeUrl(opts: AuthorizeUrlOptions): string {
  if (/\/\/localhost[:/]/i.test(opts.redirectUri)) {
    throw new Error('Spotify loopback redirect URIs must use 127.0.0.1, not localhost');
  }
  const url = new URL('https://accounts.spotify.com/authorize');
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    scope: opts.scopes.join(' '),
    code_challenge_method: 'S256',
    code_challenge: opts.challenge,
    state: opts.state,
  }).toString();
  return url.toString();
}
