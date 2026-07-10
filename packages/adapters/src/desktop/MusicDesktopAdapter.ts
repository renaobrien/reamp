import type {
  AuthState,
  PlayerState,
  PlaylistSummary,
  RepeatMode,
  SourceAdapter,
  Track,
  Unsubscribe,
} from '../types.js';
import { type DesktopAdapterOptions, pollPlayerState } from './SpotifyDesktopAdapter.js';
import {
  type OsaRunner,
  clampVolume,
  expectRunning,
  notRunningGuard,
  parseBool,
  sanitizeForScript,
  splitFields,
  splitRecords,
} from './osa.js';

/**
 * Desktop-control adapter for the official Music app on macOS. Richer
 * than Spotify's scripting surface: full playlist browsing works, and
 * song repeat maps cleanly onto off/track/context.
 *
 * Track and playlist URIs use the app's persistent IDs:
 *   music-desktop:track:<persistentId>
 *   music-desktop:playlist:<persistentId>
 */
export class MusicDesktopAdapter implements SourceAdapter {
  readonly id = 'apple-music' as const;
  private readonly run: OsaRunner;
  private readonly pollIntervalMs: number;

  constructor(opts: DesktopAdapterOptions) {
    this.run = opts.runOsaScript;
    this.pollIntervalMs = opts.pollIntervalMs ?? 500;
  }

  async auth(): Promise<AuthState> {
    const running = await this.run('application "Music" is running');
    return parseBool(running)
      ? { status: 'authorized', detail: 'Controlling the Music desktop app.' }
      : { status: 'unauthorized', detail: 'Music desktop app is not running.' };
  }

  async launchApp(): Promise<void> {
    await this.run('tell application "Music" to launch');
  }

  disconnect(): Promise<void> {
    return Promise.resolve();
  }

  async play(uri?: string): Promise<void> {
    if (uri === undefined) {
      await this.transport('play');
      return;
    }
    const m = /^music-desktop:(track|playlist):([A-F0-9]+)$/.exec(
      sanitizeForScript(uri, 'Music URI'),
    );
    if (!m) throw new Error(`not a music-desktop URI: ${uri}`);
    const [, kind, pid] = m;
    await this.transport(
      kind === 'track'
        ? `play (first track of library playlist 1 whose persistent ID is "${pid}")`
        : `play (first user playlist whose persistent ID is "${pid}")`,
    );
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
    await this.transport(`set shuffle enabled to ${on}`);
  }

  async setRepeat(mode: RepeatMode): Promise<void> {
    const value = mode === 'track' ? 'one' : mode === 'context' ? 'all' : 'off';
    await this.transport(`set song repeat to ${value}`);
  }

  async getPlayerState(): Promise<PlayerState | null> {
    const script = [
      notRunningGuard('Music'),
      'set d to character id 31',
      'tell application "Music"',
      '  if player state is stopped then return "stopped"',
      '  set t to current track',
      '  return (player state as text) & d & (name of t) & d & (artist of t) & d & (album of t) & d & (duration of t) & d & (player position) & d & (sound volume) & d & (shuffle enabled) & d & (song repeat as text)',
      'end tell',
    ].join('\n');
    const out = await this.run(script);
    if (out === 'not-running' || out === 'stopped') return null;

    const f = splitFields(out, 9, 'Music player state');
    return {
      track: {
        title: f[1]!,
        artist: f[2]!,
        album: f[3]!,
        durationMs: Math.round(Number(f[4]) * 1000), // Music reports seconds
      },
      positionMs: Math.round(Number(f[5]) * 1000),
      playing: f[0] === 'playing',
      shuffle: parseBool(f[7]!),
      repeat: f[8] === 'one' ? 'track' : f[8] === 'all' ? 'context' : 'off',
      volume: Math.round(Number(f[6])),
    };
  }

  onPlayerState(cb: (s: PlayerState) => void): Unsubscribe {
    return pollPlayerState(() => this.getPlayerState(), cb, this.pollIntervalMs);
  }

  async getPlaylists(): Promise<PlaylistSummary[]> {
    const script = [
      notRunningGuard('Music'),
      'set d to character id 31',
      'set r to character id 30',
      'set out to ""',
      'tell application "Music"',
      '  repeat with p in user playlists',
      '    set out to out & (persistent ID of p) & d & (name of p) & d & (count of tracks of p) & r',
      '  end repeat',
      'end tell',
      'return out',
    ].join('\n');
    const out = expectRunning(await this.run(script), 'Music');
    return splitRecords(out).map((record) => {
      const f = splitFields(record, 3, 'Music playlist');
      return { id: f[0]!, name: f[1]!, trackCount: Number(f[2]) };
    });
  }

  async getPlaylistTracks(id: string): Promise<Track[]> {
    const pid = sanitizeForScript(id, 'playlist persistent ID');
    const script = [
      notRunningGuard('Music'),
      'set d to character id 31',
      'set r to character id 30',
      'set out to ""',
      'tell application "Music"',
      `  set p to (first user playlist whose persistent ID is "${pid}")`,
      '  repeat with t in tracks of p',
      '    set out to out & (persistent ID of t) & d & (name of t) & d & (artist of t) & d & (album of t) & d & (duration of t) & r',
      '  end repeat',
      'end tell',
      'return out',
    ].join('\n');
    const out = expectRunning(await this.run(script), 'Music');
    return splitRecords(out).map((record) => {
      const f = splitFields(record, 5, 'Music track');
      return {
        id: f[0]!,
        uri: `music-desktop:track:${f[0]!}`,
        title: f[1]!,
        artist: f[2]!,
        album: f[3]!,
        durationMs: Math.round(Number(f[4]) * 1000),
      };
    });
  }

  private async transport(command: string): Promise<void> {
    const script = [
      notRunningGuard('Music'),
      'tell application "Music"',
      `  ${command}`,
      'end tell',
      'return "ok"',
    ].join('\n');
    expectRunning(await this.run(script), 'Music');
  }
}
