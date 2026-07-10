import type {
  AuthState,
  PlayerState,
  PlaylistSummary,
  RepeatMode,
  SourceAdapter,
  Track,
  Unsubscribe,
} from '../types.js';

/**
 * Spotify adapter, Web Playback SDK (local Connect device) + Web API.
 *
 * Platform constraints this implementation must respect (spec §1):
 * - BYO client ID: the user creates their own app at developer.spotify.com.
 *   Nostalgia never ships a shared client ID. Dev mode: max 5 allowlisted users,
 *   owner must hold Premium.
 * - Auth is Authorization Code with PKCE; loopback redirect must use
 *   127.0.0.1, never `localhost`. The OAuth server lives in the Electron
 *   main process; this adapter receives tokens over IPC.
 * - audio-features / audio-analysis are DEAD (403) for new apps. Do not add
 *   getTrackFeatures here, visuals come from loopback capture only.
 * - Player endpoints survive in dev mode; several catalog endpoints do not.
 *   Verify the surviving list against the Feb 2026 changelog before wiring
 *   browse/search. Do not trust older SDK wrappers.
 *
 * Wired up in Milestone 2 (spec §8).
 */
export class SpotifyAdapter implements SourceAdapter {
  readonly id = 'spotify' as const;

  auth(): Promise<AuthState> {
    return Promise.resolve({
      status: 'unauthorized',
      detail: 'Not implemented, M2. PKCE flow via main-process loopback server.',
    });
  }

  disconnect(): Promise<void> {
    return notImplemented('disconnect');
  }

  play(_uri?: string): Promise<void> {
    return notImplemented('play');
  }

  pause(): Promise<void> {
    return notImplemented('pause');
  }

  next(): Promise<void> {
    return notImplemented('next');
  }

  previous(): Promise<void> {
    return notImplemented('previous');
  }

  seek(_ms: number): Promise<void> {
    return notImplemented('seek');
  }

  setVolume(_pct: number): Promise<void> {
    return notImplemented('setVolume');
  }

  setShuffle(_on: boolean): Promise<void> {
    return notImplemented('setShuffle');
  }

  setRepeat(_mode: RepeatMode): Promise<void> {
    return notImplemented('setRepeat');
  }

  onPlayerState(_cb: (s: PlayerState) => void): Unsubscribe {
    return () => {};
  }

  getPlaylists(): Promise<PlaylistSummary[]> {
    return notImplemented('getPlaylists');
  }

  getPlaylistTracks(_id: string): Promise<Track[]> {
    return notImplemented('getPlaylistTracks');
  }
}

function notImplemented(method: string): Promise<never> {
  return Promise.reject(new Error(`SpotifyAdapter.${method} not implemented (Milestone 2)`));
}
