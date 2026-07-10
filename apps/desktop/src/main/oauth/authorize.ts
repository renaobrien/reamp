/**
 * End-to-end Spotify authorization: PKCE pair → loopback server → system
 * browser → code exchange. Composes pkce.ts, loopback-server.ts and
 * token-client.ts; the settings UI (M5) calls this and shows the result.
 */
import { randomBytes } from 'node:crypto';
import { waitForOAuthCallback } from './loopback-server.js';
import { buildSpotifyAuthorizeUrl, generatePkcePair } from './pkce.js';
import { SpotifyTokenClient, type TokenSet } from './token-client.js';

/**
 * Everything Reamp needs: Web Playback SDK (streaming + user-read-email +
 * user-read-private), transport control, and playlist browse.
 * Verify against dev-mode availability when wiring the adapter (M2).
 */
export const DEFAULT_SPOTIFY_SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
];

export interface SpotifyAuthOptions {
  clientId: string;
  /** Must match the redirect URI registered in the user's Spotify app. */
  port: number;
  callbackPath?: string;
  scopes?: string[];
  /** Open the system browser (Electron: shell.openExternal). */
  openBrowser: (url: string) => void | Promise<void>;
  timeoutMs?: number;
  /** Injectable for tests. */
  tokenClient?: SpotifyTokenClient;
}

export async function authorizeSpotify(opts: SpotifyAuthOptions): Promise<TokenSet> {
  const callbackPath = opts.callbackPath ?? '/callback';
  const redirectUri = `http://127.0.0.1:${opts.port}${callbackPath}`;
  const { verifier, challenge } = generatePkcePair();
  const state = randomBytes(16).toString('base64url');

  const url = buildSpotifyAuthorizeUrl({
    clientId: opts.clientId,
    redirectUri,
    scopes: opts.scopes ?? DEFAULT_SPOTIFY_SCOPES,
    challenge,
    state,
  });

  // Listen before opening the browser so a fast redirect can't race us.
  const pendingCallback = waitForOAuthCallback({
    port: opts.port,
    callbackPath,
    state,
    timeoutMs: opts.timeoutMs,
  });
  await opts.openBrowser(url);
  const { code } = await pendingCallback;

  const tokenClient = opts.tokenClient ?? new SpotifyTokenClient({ clientId: opts.clientId });
  return tokenClient.exchangeCode({ code, redirectUri, verifier });
}
