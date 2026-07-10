/**
 * The Source Adapter contract, the seam everything hangs on.
 *
 * Both streaming backends (and any future ones: Tidal, Plex, Jellyfin)
 * implement this interface. Webamp's media layer delegates to the active
 * adapter; the vis engine never touches adapters (it reads loopback PCM).
 *
 * Defined in docs/reamp-technical-spec.md §2. Change it there first.
 */

export type SourceId = 'spotify' | 'apple-music';

export type RepeatMode = 'off' | 'track' | 'context';

export type Unsubscribe = () => void;

export interface AuthState {
  status: 'authorized' | 'unauthorized' | 'error';
  /** Human-readable detail for settings UI / error states (R9: honest labeling). */
  detail?: string;
}

export interface TrackInfo {
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  artUrl?: string;
}

export interface PlayerState {
  track: TrackInfo;
  positionMs: number;
  playing: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  /** 0–100 */
  volume: number;
  /** Cosmetic, for the Winamp kHz/kbps display. */
  bitrateLabel?: string;
}

export interface PlaylistSummary {
  id: string;
  name: string;
  trackCount: number;
  artUrl?: string;
}

export interface Track extends TrackInfo {
  id: string;
  /** Service URI usable with play(), e.g. spotify:track:… */
  uri: string;
}

export interface SourceAdapter {
  id: SourceId;

  auth(): Promise<AuthState>;
  disconnect(): Promise<void>;

  // transport
  play(uri?: string): Promise<void>;
  pause(): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  seek(ms: number): Promise<void>;
  setVolume(pct: number): Promise<void>;
  setShuffle(on: boolean): Promise<void>;
  setRepeat(mode: RepeatMode): Promise<void>;

  // state
  onPlayerState(cb: (s: PlayerState) => void): Unsubscribe;

  // browse
  getPlaylists(): Promise<PlaylistSummary[]>;
  getPlaylistTracks(id: string): Promise<Track[]>;
  /** Optional, endpoint availability varies (Spotify dev mode removed several catalog endpoints in Feb 2026). */
  search?(q: string): Promise<Track[]>;
  /** Apple Music only, tempo/key for beat-synced preset transitions (P1). Never the primary vis signal. */
  getTrackFeatures?(id: string): Promise<{ tempo?: number; key?: string }>;
}
