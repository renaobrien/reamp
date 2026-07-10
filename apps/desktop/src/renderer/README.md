# Renderer

Chromium renderer: the Webamp host, the debug transport strip and vis
canvas, and (later) settings and onboarding UI. Fully sandboxed; talks to
the main process only through the `window.reamp` bridge.

What lives here:

- `reamp-media.ts`: Webamp's pluggable media backend (`__customMediaClass`),
  verified against webamp@2.3.1's shipped type definitions and the events
  its media middleware consumes. Transport button presses become bridge
  calls; player-state events become timeupdate/playing/fileLoaded.
- `webamp-host.ts`: mounts Webamp with the Reamp backend and reconciles
  its UI against external reality (pausing in Spotify.app pauses the lamp).
- `main.ts` + `index.html`: debug transport strip, source switcher, and
  the canvas spectrum/oscilloscope, kept as a diagnostic surface.

Rules that bind this directory:

- Streaming audio is EME-protected. Never attempt a Web Audio tap on the
  playback element; the vis signal comes from loopback capture only.
- Webamp keeps UI ownership. Where it assumes Web Audio ownership (EQ,
  balance), stub with visual-only behavior for streaming sources
  (`reamp-media.ts` does exactly this).
- The webamp package renders its own bundled default skin; Reamp ships no
  skin of its own until the CC-licensed default is chosen (M4, rule 6).
- MusicKit JS (API mode, later) loads via script tag; keep it in a
  dedicated webview if it misbehaves inside the main renderer (spec §7).
