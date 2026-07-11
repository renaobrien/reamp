# Reamp

[![CI](https://github.com/renaobrien/reamp/actions/workflows/ci.yml/badge.svg)](https://github.com/renaobrien/reamp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-00e5b0.svg)](LICENSE)

A Winamp 2.9 style player that controls Spotify and Apple Music, with
visualizations driven by the actual audio: the classic 75-band spectrum
with falling peak caps, the oscilloscope, and Milkdrop via Butterchurn.
macOS first. Zero setup: no API keys, no accounts, no Premium requirement.

Load your 2003-era `.wsz` skin, hit play, and the bars move to the real music.

## How it works

Two facts shape the design:

1. Both services stream DRM-encrypted audio, so no program can read the raw
   stream. The visualizer analyzes the system's audio output instead
   (loopback capture via a ScreenCaptureKit sidecar). The captured signal is
   used for analysis only and is never written to disk.
2. Spotify locked down its API in February 2026 (Development Mode only,
   5-user allowlist per client ID, no audio analysis endpoints). So the API
   is not the primary integration. The primary integration does not touch it.

## Two modes

**Desktop control (v1, the default).** Reamp drives the official
Spotify and Music apps already on your Mac through their AppleScript
interfaces, and visualizes whatever the system is playing. Zero setup: no
API keys, no developer accounts, no Premium requirement. Transport
controls, current-track metadata, and (for Apple Music) full playlist
browsing all work. Spotify playlist browsing is not exposed by its
scripting interface; that one feature needs API mode.

**API mode (optional, later).** In-app playback: Reamp itself becomes a
Spotify Connect device (Web Playback SDK) and an Apple Music player
(MusicKit JS). Costs real friction: a bring-your-own Spotify client ID plus
Premium, an Apple Developer membership ($99/yr) for the MusicKit token, and
a Widevine-capable Electron build (castLabs ECS). The auth plumbing for
this mode is already built and tested; the playback shell is deferred.

## Status

Everything below is written and unit tested (typecheck strict, 80+ tests).
What remains is hardware-bound: the Swift capture binary, and verifying
the AppleScript adapters and Webamp rendering on a real Mac with a display.

| Milestone | What | State |
|---|---|---|
| M0 | Desktop-control adapters for Spotify.app and Music.app | code done, needs macOS verification |
| M1 | Swift ScreenCaptureKit sidecar to PCM ring buffer to live FFT | not started |
| M2 | Electron shell, Webamp embedded, adapters wired to transport, marquee, playlist | code done, needs display verification |
| M3 | Classic vis window (viscolor.txt aware) and detachable Butterchurn | code done, needs display verification |
| M4 | Settings, onboarding, skin drag-drop, packaging, notarization: v1 | not started |
| M5+ | API mode: castLabs ECS spike, Web Playback SDK, MusicKit JS | later, optional |

Working and tested today: both desktop-control adapters, the
`SourceAdapter` contract, the vis-engine math (FFT, 75-band spectrum,
falling peak caps, oscilloscope, PCM ring buffer), the viscolor.txt
parser with the canonical default palette, the sidecar wire protocol and
process manager with a mock sidecar (bars move on any machine), the
Electron shell with IPC transport chain and Webamp media backend, the
classic vis deck (pixel-authentic blocks, click to toggle spectrum and
scope), the detachable Milkdrop window (Butterchurn fed raw loopback PCM,
245 bundled presets, auto-cycling, fullscreen), the feedback button, the
complete Spotify PKCE auth flow for API mode, and the MusicKit token
minting script.

## Repo layout

```
apps/desktop/        Electron shell (M2)
  src/main/          main process: osascript runner, OAuth, sidecar manager
  src/renderer/      Webamp host, adapters, vis, settings (M2)
  sidecar/           Swift ScreenCaptureKit audio capture (M1)
packages/adapters/   SourceAdapter contract, desktop-control + API adapters
packages/vis-engine/ FFT, spectrum bands, peak caps, oscilloscope, ring buffer
packages/skins/      viscolor.txt parser, default palette, .wsz helpers
scripts/             gen-apple-token.ts (offline MusicKit JWT, API mode)
docs/                brief, PRD, tech spec
```

## Development

```sh
pnpm install
pnpm typecheck
pnpm test
```

Node 22 or newer, pnpm 10 or newer. Conventions and platform rules live in
[CLAUDE.md](CLAUDE.md).

### Browser demo (no Electron, no macOS)

The renderer runs in a plain browser with a demo bridge: synthesized
audio drives the vis, and the transport controls a pretend playlist.
Webamp, the classic vis deck, and Milkdrop are all real.

```sh
pnpm --filter @reamp/desktop demo   # then open the printed localhost URL
```

The Milkdrop window is at `/milkdrop.html` on the same host.

### Running the real app (macOS)

```sh
pnpm approve-builds                  # once: allow Electron's binary download
pnpm --filter @reamp/desktop start   # build and launch
```

Spotify or Music should be running; the app never launches them itself.
Until the ScreenCaptureKit sidecar lands, visuals run on the mock
sidecar's synthesized audio (set `REAMP_SIDECAR_BIN` to a real capture
binary to switch).

## API mode setup (only if you want in-app playback)

Spotify: create an app at developer.spotify.com (free, Development Mode),
set the redirect URI to `http://127.0.0.1:8888/callback` (Spotify requires
`127.0.0.1`, not `localhost`), and paste the client ID into settings. The
account needs Premium. Each user of an open-source build does this for
themselves; the 5-user allowlist is per client ID, so nobody shares quota.

Apple Music: requires an Apple Developer Program membership and a MusicKit
`.p8` key (gitignored; never commit it):

```sh
node --experimental-strip-types scripts/gen-apple-token.ts \
  --key ~/keys/AuthKey_ABC123DEFG.p8 --key-id ABC123DEFG --team-id TEAM456789
```

## Feedback

In the app: Help > Send Feedback opens a prefilled GitHub issue with a
diagnostics block you can review before submitting. Outside the app:
[open an issue](https://github.com/renaobrien/reamp/issues/new/choose).

## Skins

Webamp loads classic `.wsz` skins natively. The Winamp base skin is Llama
Group IP and will not be bundled. The default will be a CC-licensed
community skin, and the other 90k or so live at the
[Winamp Skin Museum](https://skins.webamp.org).

## License

[MIT](LICENSE). Built on [Webamp](https://github.com/captbaritone/webamp)
and [Butterchurn](https://github.com/jberg/butterchurn), both MIT.
