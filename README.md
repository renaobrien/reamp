# Reamp

[![CI](https://github.com/renaobrien/reamp/actions/workflows/ci.yml/badge.svg)](https://github.com/renaobrien/reamp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-00e5b0.svg)](LICENSE)

A Winamp 2.9 style player for macOS that controls Spotify and Apple Music,
with visuals driven by the actual audio: the classic spectrum analyzer and
oscilloscope, Milkdrop with 245 presets, and original scenes (Tunnel,
Plasma, Swarm) that react to the music's beat, brightness, and loudness.

No API keys, no accounts, no Premium requirement. Reamp drives the Spotify
and Music apps already on your Mac and visualizes whatever your system is
playing. Drop any classic `.wsz` skin on the window and it applies
instantly, vis colors included.

## Install and run

Easiest: grab the newest `Reamp.dmg` from the
[releases page](https://github.com/renaobrien/reamp/releases), open it,
and drag Reamp into Applications. The build is unsigned for now, so the
first launch is right-click, then Open. Apple Silicon Macs want the
arm64 file; Intel Macs the plain one.

To run from source instead (macOS 13+, Node 22+, and pnpm via
`npm install -g pnpm`):

```sh
git clone https://github.com/renaobrien/reamp.git
cd reamp
pnpm install
pnpm app
```

Have Spotify or Music open and playing. Reamp asks once for permission to
control them.

### Real audio for the visuals

Out of the box the visuals run on built-in synthetic audio. To make them
follow your actual music, build the capture helper once (needs Xcode
Command Line Tools) and launch with it:

```sh
cd apps/desktop/sidecar && swift build -c release && cd ../../..
REAMP_SIDECAR_BIN=apps/desktop/sidecar/.build/release/capture-sidecar \
  pnpm app
```

macOS asks once for Screen Recording permission; that is how the system
gates audio capture. Nothing is recorded or written to disk.

### Using it

- Play, skip, seek, and volume live on the player itself, or on the
  keyboard. The deck underneath covers what the skin has no buttons for:
  stage visuals, player size, playlists, settings, and the source
  switcher. Playlist browsing works for Apple Music; Spotify's desktop
  interface does not expose playlists, so pick those in Spotify itself.
- The player's EQ and PL buttons open the equalizer and playlist windows
  (they start closed). Closing the player with its X hides it; the
  "player" button in the top left corner brings it back.
- The `<` and `>` buttons cycle the stage visuals behind the player;
  the square button goes fullscreen. Click the small vis to flip between
  spectrum and oscilloscope. Cmd+M opens Milkdrop in its own window
  (space for next preset, R for random, double-click for fullscreen).
- Keyboard: Space plays or pauses, Left and Right arrows change track,
  V cycles the stage visual, F goes fullscreen, D hides the deck.
- Resize the player with the − and + buttons (or Cmd+Minus and
  Cmd+Plus). Click the percentage to snap back to 100% (Cmd+0), or Fit
  to fill the window, which is the one you want on a TV.
- Drag any `.wsz` skin file onto the window. Thousands live at the
  [Winamp Skin Museum](https://skins.webamp.org).
- The EQ window is visual-only for streaming: Reamp listens to the mix,
  it cannot process DRM audio.

### Browser demo (no install)

```sh
pnpm demo
```

Opens the same interface in your browser with procedural music and a
pretend playlist. Milkdrop is at `/milkdrop.html` on the same host.

### Packaging a .app

```sh
pnpm dist
```

Builds `Reamp.app` and a dmg into `apps/desktop/release/`. Unsigned for
now; right-click and choose Open on first launch. If the capture helper
has been built it is bundled automatically.

### Updating

Click Check for Updates in the settings panel (the gear button), or
Help > Check for Updates. When a newer release exists, Install Update
downloads it, swaps it in place, and relaunches Reamp; nothing to drag,
no Terminal. If the in-place install cannot run (an unusual location,
or no packaged build for your machine), the button opens the release
page instead. A from-source install updates with:

```sh
git pull
pnpm install
pnpm dist
```

## Spotify or Apple Music inside the app (optional, advanced)

The default mode needs nothing. If you want Reamp to play audio itself
(in-app playback, Spotify playlist browsing), that requires your own
Spotify client ID (free, developer.spotify.com, redirect URI
`http://127.0.0.1:8888/callback`, Premium account) or an Apple Developer
membership for a MusicKit token:

```sh
node --experimental-strip-types scripts/gen-apple-token.ts \
  --key ~/keys/AuthKey_ABC123DEFG.p8 --key-id ABC123DEFG --team-id TEAM456789
```

This mode is under construction; the auth plumbing exists, the playback
shell does not yet.

## Feedback

In the app: Help > Send Feedback, or the button in Settings. Outside it:
[open an issue](https://github.com/renaobrien/reamp/issues/new/choose).

## Contributing

Development notes, conventions, and architecture live in
[CLAUDE.md](CLAUDE.md) and [docs/](docs/). Run `pnpm typecheck` and
`pnpm test` before sending a PR. First run on a Mac?
[docs/mac-testing.md](docs/mac-testing.md) is the checklist.

## License

[MIT](LICENSE). Built on [Webamp](https://github.com/captbaritone/webamp)
and [Butterchurn](https://github.com/jberg/butterchurn), both MIT.
