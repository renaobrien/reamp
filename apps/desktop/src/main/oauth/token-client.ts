/**
 * Spotify token exchange + refresh for the PKCE flow (spec §4).
 *
 * Runs in the Electron main process. The resulting TokenSet is handed to
 * the safeStorage vault (M5), tokens never touch the renderer directly
 * and never land in the repo or on disk unencrypted.
 */

export interface TokenSet {
  accessToken: string;
  /** Spotify may rotate this on refresh; when it doesn't, the old one is kept. */
  refreshToken: string;
  /** Epoch ms after which accessToken should be considered stale. */
  expiresAt: number;
  scope: string;
  tokenType: string;
}

export interface TokenClientOptions {
  /** User-supplied client ID (BYO, Nostalgia never ships one). */
  clientId: string;
  tokenUrl?: string;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}

/** Refresh this many ms before the reported expiry to absorb clock skew. */
const EXPIRY_SKEW_MS = 30_000;

export class SpotifyTokenClient {
  private readonly clientId: string;
  private readonly tokenUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: TokenClientOptions) {
    this.clientId = opts.clientId;
    this.tokenUrl = opts.tokenUrl ?? 'https://accounts.spotify.com/api/token';
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  /** Exchange the authorization code caught by the loopback server. */
  exchangeCode(params: { code: string; redirectUri: string; verifier: string }): Promise<TokenSet> {
    return this.request({
      grant_type: 'authorization_code',
      code: params.code,
      redirect_uri: params.redirectUri,
      client_id: this.clientId,
      code_verifier: params.verifier,
    });
  }

  /** Trade a refresh token for a fresh access token. */
  async refresh(refreshToken: string): Promise<TokenSet> {
    const next = await this.request(
      {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.clientId,
      },
      refreshToken,
    );
    return next;
  }

  private async request(form: Record<string, string>, priorRefreshToken?: string): Promise<TokenSet> {
    const res = await this.fetchImpl(this.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
    });

    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const detail =
        body !== null && typeof body === 'object' && 'error' in body
          ? `${(body as { error: string; error_description?: string }).error}: ${(body as { error_description?: string }).error_description ?? ''}`
          : `HTTP ${res.status}`;
      throw new Error(`Spotify token request failed, ${detail.trim()}`);
    }

    const t = body as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      token_type?: string;
    };
    if (typeof t?.access_token !== 'string' || typeof t.expires_in !== 'number') {
      throw new Error('Spotify token response missing access_token/expires_in');
    }
    const refreshToken = t.refresh_token ?? priorRefreshToken;
    if (typeof refreshToken !== 'string') {
      throw new Error('Spotify token response missing refresh_token');
    }

    return {
      accessToken: t.access_token,
      refreshToken,
      expiresAt: Date.now() + t.expires_in * 1000 - EXPIRY_SKEW_MS,
      scope: t.scope ?? '',
      tokenType: t.token_type ?? 'Bearer',
    };
  }
}
