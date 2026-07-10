/**
 * The IPC contract between main and renderer. Adapters live in the main
 * process (they shell out to osascript, which the sandboxed renderer
 * cannot); the renderer sends transport intents and receives player
 * state. Everything crossing the bridge is a plain serializable object.
 */
import type { AuthState, PlayerState, RepeatMode, SourceId } from '@reamp/adapters';

export const IPC = {
  /** invoke(TransportCommand) -> void */
  transport: 'reamp:transport',
  /** invoke() -> PlayerState | null */
  getPlayerState: 'reamp:get-player-state',
  /** invoke(SourceId) -> AuthState */
  setSource: 'reamp:set-source',
  /** invoke() -> SourceId */
  getSource: 'reamp:get-source',
  /** invoke() -> AuthState (active source) */
  auth: 'reamp:auth',
  /** invoke() -> PlaylistSummary[] */
  getPlaylists: 'reamp:get-playlists',
  /** invoke(id) -> Track[] */
  getPlaylistTracks: 'reamp:get-playlist-tracks',
  /** main -> renderer: PlayerStateEvent */
  playerState: 'reamp:player-state',
} as const;

export type TransportCommand =
  | { action: 'play'; uri?: string }
  | { action: 'pause' }
  | { action: 'next' }
  | { action: 'previous' }
  | { action: 'seek'; ms: number }
  | { action: 'setVolume'; pct: number }
  | { action: 'setShuffle'; on: boolean }
  | { action: 'setRepeat'; mode: RepeatMode };

export interface PlayerStateEvent {
  source: SourceId;
  state: PlayerState;
}

export type { AuthState, PlayerState, SourceId };
