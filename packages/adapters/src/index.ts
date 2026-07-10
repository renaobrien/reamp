export * from './types.js';

// Desktop-control mode (v1): drives the official macOS apps via
// AppleScript. Zero setup, no API keys.
export {
  SpotifyDesktopAdapter,
  pollPlayerState,
  type DesktopAdapterOptions,
} from './desktop/SpotifyDesktopAdapter.js';
export { MusicDesktopAdapter } from './desktop/MusicDesktopAdapter.js';
export {
  AppNotRunningError,
  NotSupportedInDesktopModeError,
  type OsaRunner,
} from './desktop/osa.js';

// API mode (optional, later): in-app playback via Web Playback SDK and
// MusicKit JS. Requires BYO client ID + Premium (Spotify) and an Apple
// Developer membership (Apple Music).
export { SpotifyAdapter } from './spotify/SpotifyAdapter.js';
export { AppleMusicAdapter } from './apple-music/AppleMusicAdapter.js';
