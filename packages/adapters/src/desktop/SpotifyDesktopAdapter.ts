import type {
  AuthState,
  PlayerState,
  PlaylistSummary,
  RepeatMode,
  SourceAdapter,
  Track,
  Unsubscribe,
} from '../types.js';
import {
  NotSupportedInDesktopModeError,
  type OsaRunner,
  clampVolume,
  expectRunning,
  notRunningGuard,
  parseBool,
  sanitizeForScript,
  splitFields,
} from './osa.js';

export interface DesktopAdapterOptions {
  runOsaScript: OsaRunner;
  /** How often onPlayerState polls the app. */
  pollIntervalMs?: number;
}

/**
 * Desktop-control adapter: drives the official Spotify macOS app via its
 * AppleScript dictionary. Zero-setup mode: no client ID, no OAuth, no
 * Premium requirement. Audio comes out of Spotify.app, which is exactly
 * what the loopback capture visualizes.
 *
 * Known limits of Spotify's scripting surface:
 * - No playlist enumeration. getPlaylists/getPlaylistTracks throw a
 *   NotSupportedInDesktopModeError; the optional API mode covers browsing.
 * - Repeat is a single boolean, so 'track' is approximated as 'context'.
 */
export class SpotifyDesktopAdapter implements SourceAdapter {
  readonly id = 'spotify' as const;
  private readonly run: OsaRunner;
  private readonly pollIntervalMs: number;

  constructor(opts: DesktopAdapterOptions) {
    this.run = opts.runOsaScript;
    this.pollIntervalMs = opts.pollIntervalMs ?? 500;
  }

  async auth(): Promise<AuthState> {
    const running = await this.run('application "Spotify" is running');
    return parseBool(running)
      ? { status: 'authorized', detail: 'Controlling the Spotify desktop app.' }
      : { status: 'unauthorized', detail: 'Spotify desktop app is not running.' };
  }

  /** Not part of the contract, but useful for onboarding: start Spotify.app. */
  async launchApp(): Promise<void> {
    await this.run('tell application "Spotify" to launch');
  }

  disconnect(): Promise<void> {
    return Promise.resolve(); // nothing to tear down; we hold no tokens
  }

  async play(uri?: string): Promise<void> {
    if (uri !== undefined) {
      const safe = sanitizeForScript(uri, 'Spotify URI');
      if (!/^spotify:(track|album|playlist|artist|episode|show):[A-Za-z0-9]+$/.test(safe)) {
        throw new Error(`not a Spotify URI: ${uri}`);
      }
      await this.transport(`play track "${safe}"`);
      return;
    }
    await this.transport('play');
  }

  async pause(): Promise<void> {
    await this.transport('pause');
  }

  async next(): Promise<void> {
    await this.transport('next track');
  }

  async previous(): Promise<void> {
    await this.transport('previous track');
  }

  async seek(ms: number): Promise<void> {
    await this.transport(`set player position to ${Math.max(0, ms) / 1000}`);
  }

  async setVolume(pct: number): Promise<void> {
    await this.transport(`set sound volume to ${clampVolume(pct)}`);
  }

  async setShuffle(on: boolean): Promise<void> {
    await this.transport(`set shuffling to ${on}`);
  }

  async setRepeat(mode: RepeatMode): Promise<void> {
    await this.transport(`set repeating to ${mode !== 'off'}`);
  }

  /** Poll the app and return the current state, or null when stopped / not running. */
  async getPlayerState(): Promise<PlayerState | null> {
    const script = [
      notRunningGuard('Spotify'),
      'set d to character id 31',
      'tell application "Spotify"',
      '  if player state is stopped then return "stopped"',
      '  set t to current track',
      '  return (player state as text) & d & (name of t) & d & (artist of t) & d & (album of t) & d & (duration of t) & d & (player position) & d & (sound volume) & d & (shuffling) & d & (repeating)',
      'end tell',
    ].join('\n');
    const out = await this.run(script);
    if (out === 'not-running' || out === 'stopped') return null;

    const f = splitFields(out, 9, 'Spotify player state');
    return {
      track: {
        title: f[1]!,
        artist: f[2]!,
        album: f[3]!,
        durationMs: Math.round(Number(f[4])), // Spotify reports ms
      },
      positionMs: Math.round(Number(f[5]) * 1000), // and position in seconds
      playing: f[0] === 'playing',
      shuffle: parseBool(f[7]!),
      repeat: parseBool(f[8]!) ? 'context' : 'off',
      volume: Math.round(Number(f[6])),
    };
  }

  onPlayerState(cb: (s: PlayerState) => void): Unsubscribe {
    return pollPlayerState(() => this.getPlayerState(), cb, this.pollIntervalMs);
  }

  getPlaylists(): Promise<PlaylistSummary[]> {
    return Promise.reject(
      new NotSupportedInDesktopModeError(
        'Spotify playlist browsing',
        'connect the optional API mode (bring-your-own client ID) to browse playlists',
      ),
    );
  }

  getPlaylistTracks(_id: string): Promise<Track[]> {
    return this.getPlaylists() as Promise<never>;
  }

  private async transport(command: string): Promise<void> {
    const script = [
      notRunningGuard('Spotify'),
      'tell application "Spotify"',
      `  ${command}`,
      'end tell',
      'return "ok"',
    ].join('\n');
    expectRunning(await this.run(script), 'Spotify');
  }
}

/**
 * Shared poller for desktop adapters: emits on change only and stops
 * cleanly on unsubscribe. Poll errors are swallowed so a quit app or a
 * transient scripting failure pauses updates instead of killing the loop.
 */
export function pollPlayerState(
  getState: () => Promise<PlayerState | null>,
  cb: (s: PlayerState) => void,
  intervalMs: number,
): Unsubscribe {
  let stopped = false;
  let last = '';
  const tick = async (): Promise<void> => {
    try {
      const state = await getState();
      if (stopped || state === null) return;
      const key = JSON.stringify(state);
      if (key !== last) {
        last = key;
        cb(state);
      }
    } catch {
      // resume on the next interval
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
