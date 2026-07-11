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
import { createReampMediaClass } from './reamp-media.js';

export async function mountWebamp(
  bridge: ReampApi,
  container: HTMLElement,
  onNotice?: (message: string) => void,
): Promise<Webamp> {
  const webamp = new Webamp({
    initialTracks: [
      {
        url: 'reamp:current',
        duration: 0,
        metaData: { artist: 'Reamp', title: 'Play something in Spotify or Music' },
      },
    ],
    __customMediaClass: createReampMediaClass(bridge, onNotice),
  });

  let currentTrackKey = '';
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
    // Reconcile Webamp's transport lamp with reality (external pauses).
    const status = webamp.getMediaStatus();
    if (state.playing && status !== 'PLAYING') webamp.play();
    else if (!state.playing && status === 'PLAYING') webamp.pause();
  });

  await webamp.renderWhenReady(container);
  return webamp;
}
