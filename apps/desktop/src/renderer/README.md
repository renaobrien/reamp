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
- `classic-vis.ts`: the classic vis drawn the way Winamp drew it: 2px
  blocks with gutters, the 16-step viscolor gradient, falling peak caps,
  click to toggle spectrum/oscilloscope. Palette comes from
  `@reamp/skins` (canonical default until skins load their own).
- `skin-drop.ts`: drop a .wsz anywhere on the window; Webamp reskins and
  the deck vis recolors from the skin's viscolor.txt (tested against
  synthetic archives, including case-insensitive and nested lookups).
- `main.ts` + `index.html`: the deck layout (Webamp above, vis deck
  below), fallback transport controls, source switcher, readout.
- `milkdrop.ts` + `milkdrop.html`: the detachable Milkdrop window.
  Butterchurn created with a null AudioContext and fed raw loopback PCM
  as 128-centered byte arrays per frame (verified against the shipped
  butterchurn@2.6.7 bundle; declarations in `types/butterchurn.d.ts`).
  245 presets (base + extra packs, merged), space/N/P/R navigation, F or
  double-click for fullscreen, 30s auto-advance via `preset-cycler.ts`.

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
