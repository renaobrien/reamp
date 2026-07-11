/**
 * Webamp's pluggable media backend (the __customMediaClass hook), wired
 * to the Reamp bridge instead of an <audio> element. When the user
 * clicks Webamp's transport buttons, Webamp calls these methods; we
 * forward intents over IPC to the active SourceAdapter. Position and
 * duration come back through player-state events, and we emit the
 * events Webamp's media middleware consumes (timeupdate, playing,
 * fileLoaded).
 *
 * Interface verified against webamp@2.3.1 built/types/js/media/index.d.ts
 * and the events its mediaMiddleware subscribes to in the shipped bundle.
 */
import type Webamp from 'webamp';
import type { ReampApi } from '../preload.js';

// IMedia/IMediaClass are not exported from the package root; derive them
// from the constructor options so the compiler holds us to the real
// contract webamp@2.3.1 ships.
type WebampOptions = ConstructorParameters<typeof Webamp>[0];
export type WebampMediaClass = NonNullable<WebampOptions['__customMediaClass']>;

type Listener = (...args: unknown[]) => void;

export interface ReampMediaInstance {
  /** Current live state, for the host to reconcile Webamp's UI against. */
  readonly playing: boolean;
}

export function createReampMediaClass(
  bridge: ReampApi,
  onNotice?: (message: string) => void,
): WebampMediaClass {
  let eqNoticeShown = false;
  const eqNotice = (): void => {
    if (eqNoticeShown) return;
    eqNoticeShown = true;
    onNotice?.('EQ and balance are visual-only for streaming sources (DRM audio cannot be processed)');
  };

  return class ReampMedia implements ReampMediaInstance {
    private listeners = new Map<string, Listener[]>();
    private positionMs = 0;
    private durationMs = 0;
    playing = false;
    private analyser: AnalyserNode | null = null;

    constructor() {
      bridge.onPlayerState(({ state }) => {
        const wasPlaying = this.playing;
        const trackChanged = this.durationMs !== state.track.durationMs;
        this.positionMs = state.positionMs;
        this.durationMs = state.track.durationMs;
        this.playing = state.playing;
        if (trackChanged) this.trigger('fileLoaded');
        if (!wasPlaying && state.playing) this.trigger('playing');
        this.trigger('timeupdate');
      });
    }

    // transport intents -> IPC -> active adapter
    play(): Promise<void> {
      return this.send({ action: 'play' });
    }

    pause(): void {
      void this.send({ action: 'pause' });
    }

    stop(): void {
      // Streaming sources have no stop; pause is the honest equivalent.
      void this.send({ action: 'pause' });
    }

    seekToPercentComplete(percent: number): void {
      if (this.durationMs <= 0) return;
      void this.send({ action: 'seek', ms: Math.round((percent / 100) * this.durationMs) });
    }

    setVolume(volume: number): void {
      void this.send({ action: 'setVolume', pct: volume });
    }

    /**
     * Called when Webamp loads a playlist entry. Track URLs are
     * "reamp:<service-uri>" carriers; a real URI starts playback there.
     */
    async loadFromUrl(url: string, autoPlay: boolean): Promise<void> {
      const uri = url.startsWith('reamp:') ? url.slice('reamp:'.length) : '';
      if (autoPlay) {
        await this.send(uri.length > 0 && uri !== 'current' ? { action: 'play', uri } : { action: 'play' });
      }
      this.trigger('fileLoaded');
    }

    // state Webamp reads back (seconds, per the IMedia contract)
    timeElapsed(): number {
      return this.positionMs / 1000;
    }

    duration(): number {
      return this.durationMs / 1000;
    }

    // EQ and balance are visual-only for streaming sources (spec: no
    // audio tap on DRM playback; we do not process the audio path).
    // Touching them surfaces a one-time honest explanation (R9).
    setBalance(_balance: number): void {
      eqNotice();
    }
    setPreamp(_value: number): void {
      eqNotice();
    }
    setEqBand(_band: number, _value: number): void {
      eqNotice();
    }
    disableEq(): void {}
    enableEq(): void {}

    /** Webamp's built-in vis reads this. Silent until we feed loopback PCM (M3). */
    getAnalyser(): AnalyserNode {
      this.analyser ??= new AudioContext().createAnalyser();
      return this.analyser;
    }

    on(event: string, callback: Listener): void {
      const list = this.listeners.get(event) ?? [];
      list.push(callback);
      this.listeners.set(event, list);
    }

    dispose(): void {
      this.listeners.clear();
    }

    private trigger(event: string): void {
      for (const cb of this.listeners.get(event) ?? []) cb();
    }

    private send(cmd: Parameters<ReampApi['transport']>[0]): Promise<void> {
      return bridge.transport(cmd).catch(() => {
        // Adapter errors (app not running, unsupported) surface in the
        // status line via the host; the media layer stays quiet.
      });
    }
  };
}
