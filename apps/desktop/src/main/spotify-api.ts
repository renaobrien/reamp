/**
 * Spotify Web API client for the hybrid mode: playlists browse over the
 * API with the user's own client ID, playback stays desktop-control
 * (the chosen track's URI goes to Spotify.app over AppleScript).
 *
 * Rule 7 note: only user-library endpoints are used (/me/playlists and
 * /playlists/{id}/tracks). Those survived the Nov 2024 and Feb 2026
 * dev-mode cuts; the dead catalog/audio endpoints are not touched.
 */
import type { PlaylistSummary, Track } from '@reamp/adapters';
import { authorizeSpotify } from './oauth/authorize.js';
import { SpotifyTokenClient, type TokenSet } from './oauth/token-client.js';
import type { TokenVault } from './token-vault.js';

/** Must match the redirect URI registered in the user's Spotify app:
 * http://127.0.0.1:8888/callback (the README says exactly this). */
export const SPOTIFY_CALLBACK_PORT = 8888;

const API = 'https://api.spotify.com/v1';
const PAGE_LIMIT = 50;
const MAX_PAGES = 20; // 1000 playlists / tracks is plenty; no infinite loops

export interface SpotifyApiOptions {
  vault: TokenVault;
  fetchImpl?: typeof fetch;
  /** Injectable for tests. */
  tokenClientFactory?: (clientId: string) => SpotifyTokenClient;
}

export class SpotifyApi {
  private readonly vault: TokenVault;
  private readonly fetchImpl: typeof fetch;
  private readonly tokenClientFactory: (clientId: string) => SpotifyTokenClient;

  constructor(opts: SpotifyApiOptions) {
    this.vault = opts.vault;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.tokenClientFactory =
      opts.tokenClientFactory ?? ((clientId) => new SpotifyTokenClient({ clientId }));
  }

  isConnected(): boolean {
    return this.vault.load() !== null;
  }

  clientId(): string | null {
    return this.vault.load()?.clientId ?? null;
  }

  /** Run the PKCE flow in the system browser and persist the tokens. */
  async connect(clientId: string, openBrowser: (url: string) => void): Promise<void> {
    const trimmed = clientId.trim();
    if (!/^[a-f0-9]{32}$/i.test(trimmed)) {
      throw new Error('That does not look like a Spotify client ID (32 hex characters)');
    }
    const tokens = await authorizeSpotify({
      clientId: trimmed,
      port: SPOTIFY_CALLBACK_PORT,
      openBrowser,
      tokenClient: this.tokenClientFactory(trimmed),
    });
    this.vault.save({ clientId: trimmed, tokens });
  }

  disconnect(): void {
    this.vault.clear();
  }

  async getPlaylists(): Promise<PlaylistSummary[]> {
    const items = await this.paginate<{
      id: string;
      name: string;
      tracks?: { total?: number };
      images?: Array<{ url: string }>;
    }>(`${API}/me/playlists?limit=${PAGE_LIMIT}`);
    return items.map((p) => ({
      id: p.id,
      name: p.name,
      trackCount: p.tracks?.total ?? 0,
      artUrl: p.images?.[0]?.url,
    }));
  }

  async getPlaylistTracks(playlistId: string): Promise<Track[]> {
    const fields = 'items(track(id,uri,name,duration_ms,artists(name),album(name))),next';
    const items = await this.paginate<{
      track: {
        id: string | null;
        uri: string;
        name: string;
        duration_ms: number;
        artists: Array<{ name: string }>;
        album: { name: string };
      } | null;
    }>(
      `${API}/playlists/${encodeURIComponent(playlistId)}/tracks?limit=${PAGE_LIMIT}&fields=${encodeURIComponent(fields)}`,
    );
    return items
      .map((item) => item.track)
      // local files and removed episodes come back null or without ids
      .filter((t): t is NonNullable<typeof t> => t !== null && t.id !== null)
      .map((t) => ({
        id: t.id!,
        uri: t.uri,
        title: t.name,
        artist: t.artists.map((a) => a.name).join(', '),
        album: t.album.name,
        durationMs: t.duration_ms,
      }));
  }

  /** GET with a fresh token; one refresh+retry on 401. */
  private async request(url: string): Promise<unknown> {
    let token = await this.accessToken();
    let res = await this.fetchImpl(url, { headers: { authorization: `Bearer ${token}` } });
    if (res.status === 401) {
      token = await this.refreshTokens();
      res = await this.fetchImpl(url, { headers: { authorization: `Bearer ${token}` } });
    }
    if (!res.ok) {
      throw new Error(
        res.status === 403
          ? 'Spotify refused (403). In dev mode, add your account under User Management in the Spotify developer dashboard.'
          : `Spotify API error: HTTP ${res.status}`,
      );
    }
    return res.json();
  }

  private async paginate<T>(firstUrl: string): Promise<T[]> {
    const all: T[] = [];
    let url: string | null = firstUrl;
    for (let page = 0; page < MAX_PAGES && url !== null; page++) {
      const body = (await this.request(url)) as { items?: T[]; next?: string | null };
      all.push(...(body.items ?? []));
      url = body.next ?? null;
    }
    return all;
  }

  private async accessToken(): Promise<string> {
    const data = this.vault.load();
    if (data === null) throw new Error('Spotify is not connected; add your client ID in Settings');
    if (Date.now() < data.tokens.expiresAt) return data.tokens.accessToken;
    return this.refreshTokens();
  }

  private async refreshTokens(): Promise<string> {
    const data = this.vault.load();
    if (data === null) throw new Error('Spotify is not connected; add your client ID in Settings');
    let next: TokenSet;
    try {
      next = await this.tokenClientFactory(data.clientId).refresh(data.tokens.refreshToken);
    } catch (err) {
      // a revoked grant means reconnect, not a cryptic token error
      this.vault.clear();
      throw new Error(
        `Spotify session expired; reconnect in Settings (${err instanceof Error ? err.message : String(err)})`,
      );
    }
    this.vault.save({ clientId: data.clientId, tokens: next });
    return next.accessToken;
  }
}
