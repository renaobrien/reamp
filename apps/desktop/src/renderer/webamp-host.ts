/**
 * Mounts Webamp with the Reamp media backend and keeps its UI honest
 * against external reality: if the user pauses in Spotify.app itself,
 * Webamp's play state and marquee follow.
 *
 * Skin note (CLAUDE.md rule 6): the webamp package renders its own
 * bundled default skin; Reamp does not ship one. The CC-licensed default
 * we ship, and user skin loading, land at M4.
 */
import Webamp from 'webamp';
import type { ReampApi } from '../preload.js';
import { createReampMediaClass, type StopGuard } from './reamp-media.js';

export interface MountWebampOptions {
  onNotice?: (message: string) => void;
  onEqTouched?: () => void;
  /** Fired when the user clicks the skin's close button. */
  onClose?: () => void;
}

export async function mountWebamp(
  bridge: ReampApi,
  container: HTMLElement,
  opts: MountWebampOptions = {},
): Promise<Webamp> {
  // Start with just the main window, centered a touch above the middle.
  // EQ and playlist begin closed and open in place via the skin's own
  // EQ / PL buttons; three stacked windows at boot read as clutter.
  const mainTop = Math.max(8, Math.round(window.innerHeight * 0.42 - 58));
  const mainLeft = Math.max(8, Math.round(window.innerWidth / 2 - 137));
  const stopGuard: StopGuard = { suppressStop: false };
  const webamp = new Webamp({
    initialTracks: [
      {
        url: 'reamp:current',
        duration: 0,
        metaData: { artist: 'Reamp', title: 'Play something in Spotify or Music' },
      },
    ],
    windowLayout: {
      main: { position: { top: mainTop, left: mainLeft } },
      equalizer: { position: { top: mainTop + 116, left: mainLeft }, closed: true },
      playlist: { position: { top: mainTop + 232, left: mainLeft }, closed: true },
    },
    __customMediaClass: createReampMediaClass(bridge, opts.onNotice, opts.onEqTouched, stopGuard),
  });
  // Webamp dispatches STOP between CLOSE_REQUESTED and CLOSE_WINAMP;
  // flag that window so hiding the player never pauses the real music.
  webamp.onWillClose(() => {
    stopGuard.suppressStop = true;
    setTimeout(() => {
      stopGuard.suppressStop = false;
    }, 250);
  });
  if (opts.onClose !== undefined) webamp.onClose(opts.onClose);

  let currentTrackKey = '';
  let lastVolume = -1;
  bridge.onPlayerState(({ state }) => {
    // Marquee + playlist follow the real track. setTracksToPlay restarts
    // playback via our media class, which is a no-op resume for streams;
    // the pause below restores externally-paused state.
    const key = `${state.track.artist}${state.track.title}`;
    if (key !== currentTrackKey) {
      currentTrackKey = key;
      webamp.setTracksToPlay([
        {
          url: 'reamp:current',
          duration: state.track.durationMs / 1000,
          metaData: {
            artist: state.track.artist,
            title: state.track.title,
            album: state.track.album,
          },
        },
      ]);
    }
    // Reconcile Webamp's UI with reality: external pauses flip the lamp,
    // volume moves the slider, shuffle/repeat follow the lit buttons.
    const status = webamp.getMediaStatus();
    if (state.playing && status !== 'PLAYING') webamp.play();
    else if (!state.playing && status === 'PLAYING') webamp.pause();

    const volume = Math.round(state.volume);
    if (volume !== lastVolume) {
      lastVolume = volume;
      webamp.setVolume(volume);
    }
    if (webamp.isShuffleEnabled() !== state.shuffle) webamp.toggleShuffle();
    if (webamp.isRepeatEnabled() !== (state.repeat !== 'off')) webamp.toggleRepeat();
  });

  await webamp.renderWhenReady(container);
  return webamp;
}
