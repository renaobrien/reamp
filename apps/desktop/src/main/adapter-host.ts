/**
 * Owns the source adapters in the main process: dispatches transport
 * commands to the active one, manages the player-state subscription
 * across source switches, and pushes state to a broadcast callback (the
 * IPC layer forwards it to the renderer).
 */
import type {
  AuthState,
  PlaylistSummary,
  SourceAdapter,
  SourceId,
  Track,
  Unsubscribe,
} from '@reamp/adapters';
import type { PlayerStateEvent, TransportCommand } from '../shared/ipc.js';

export interface AdapterHostOptions {
  adapters: Partial<Record<SourceId, SourceAdapter>>;
  initialSource: SourceId;
  broadcast: (event: PlayerStateEvent) => void;
}

export class AdapterHost {
  private readonly adapters: Partial<Record<SourceId, SourceAdapter>>;
  private readonly broadcast: (event: PlayerStateEvent) => void;
  private source: SourceId;
  private unsubscribe: Unsubscribe | null = null;
  private lastState: PlayerStateEvent | null = null;

  constructor(opts: AdapterHostOptions) {
    this.adapters = opts.adapters;
    this.broadcast = opts.broadcast;
    this.source = opts.initialSource;
    this.subscribeActive();
  }

  getSource(): SourceId {
    return this.source;
  }

  /** Most recent broadcast state, for main-process consumers (media keys). */
  getLastState(): PlayerStateEvent | null {
    return this.lastState;
  }

  async setSource(id: SourceId): Promise<AuthState> {
    const adapter = this.require(id);
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.source = id;
    this.subscribeActive();
    return adapter.auth();
  }

  auth(): Promise<AuthState> {
    return this.active().auth();
  }

  async transport(cmd: TransportCommand): Promise<void> {
    const a = this.active();
    switch (cmd.action) {
      case 'play':
        return a.play(cmd.uri);
      case 'pause':
        return a.pause();
      case 'next':
        return a.next();
      case 'previous':
        return a.previous();
      case 'seek':
        return a.seek(cmd.ms);
      case 'setVolume':
        return a.setVolume(cmd.pct);
      case 'setShuffle':
        return a.setShuffle(cmd.on);
      case 'setRepeat':
        return a.setRepeat(cmd.mode);
    }
  }

  getPlaylists(): Promise<PlaylistSummary[]> {
    return this.active().getPlaylists();
  }

  getPlaylistTracks(id: string): Promise<Track[]> {
    return this.active().getPlaylistTracks(id);
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private active(): SourceAdapter {
    return this.require(this.source);
  }

  private require(id: SourceId): SourceAdapter {
    const adapter = this.adapters[id];
    if (adapter === undefined) throw new Error(`no adapter registered for source "${id}"`);
    return adapter;
  }

  private subscribeActive(): void {
    const source = this.source;
    this.unsubscribe = this.active().onPlayerState((state) => {
      // Guard against a late emission from a previous subscription.
      if (this.source === source) {
        this.lastState = { source, state };
        this.broadcast(this.lastState);
      }
    });
  }
}
