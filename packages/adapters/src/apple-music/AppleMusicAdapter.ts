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
 * Apple Music adapter — MusicKit JS v3 in the Chromium renderer.
 *
 * Platform notes (spec §1):
 * - Requires an Apple Developer Program membership to mint the developer
 *   token (ES256 JWT, ≤6-month expiry) — generated offline by
 *   scripts/gen-apple-token.ts from the user's .p8 key. Never committed.
 * - User token comes from MusicKit's authorize() in the renderer; both
 *   tokens stored via Electron safeStorage.
 * - Audio is EME-protected: no Web Audio tap. Visuals come from loopback.
 * - Apple still exposes tempo/key/timeSignature on many catalog tracks —
 *   exposed via getTrackFeatures for P1 beat-synced preset transitions,
 *   never as the primary vis signal.
 *
 * Wired up in Milestone 3 (spec §8).
 */
export class AppleMusicAdapter implements SourceAdapter {
  readonly id = 'apple-music' as const;

  auth(): Promise<AuthState> {
    return Promise.resolve({
      status: 'unauthorized',
      detail: 'Not implemented — M3. MusicKit JS authorize() with offline-minted developer token.',
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

  getTrackFeatures(_id: string): Promise<{ tempo?: number; key?: string }> {
    return notImplemented('getTrackFeatures');
  }
}

function notImplemented(method: string): Promise<never> {
  return Promise.reject(new Error(`AppleMusicAdapter.${method} not implemented (Milestone 3)`));
}
