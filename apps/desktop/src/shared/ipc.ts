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
  /** main -> renderer: VisFrameEvent, ~30Hz while capture runs */
  visFrame: 'reamp:vis-frame',
  /** invoke() -> SettingsData */
  getSettings: 'reamp:get-settings',
  /** invoke(Partial<SettingsData>) -> void */
  saveSettings: 'reamp:save-settings',
  /** invoke() -> ArrayBuffer | null (the persisted .wsz) */
  getSavedSkin: 'reamp:get-saved-skin',
  /** invoke(ArrayBuffer) -> void */
  saveSkin: 'reamp:save-skin',
  /** main -> renderer: VisStateEvent on capture pipeline changes */
  visState: 'reamp:vis-state',
  /** invoke() -> VisStateEvent (current) */
  getVisState: 'reamp:get-vis-state',
  /** invoke() -> AppInfo */
  getAppInfo: 'reamp:get-app-info',
  /** invoke() -> void; opens the prefilled feedback issue in the browser */
  sendFeedback: 'reamp:send-feedback',
} as const;

export interface VisStateEvent {
  state: 'idle' | 'starting' | 'running' | 'stopped' | 'failed';
  detail?: string;
}

export interface AppInfo {
  version: string;
  mode: 'desktop-control' | 'api';
  /** What the vis pipeline is running on. */
  sidecar: string;
}

export interface PersistedSettings {
  source?: string;
  stageMode?: string;
}

export interface VisFrameEvent {
  /** Spectrum bar levels, 0..1. */
  levels: number[];
  /** Oscilloscope points, -1..1. */
  wave: number[];
  /** Latest raw PCM window, floats -1..1 (Butterchurn eats this). */
  pcm: number[];
}

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
