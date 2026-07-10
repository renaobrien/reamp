# Nostalgia

A Winamp 2.9 style player that controls Spotify (Premium) and Apple Music,
with visualizations driven by the actual audio: classic spectrum and
oscilloscope, plus Milkdrop via Butterchurn. macOS first, Windows in phase 2,
Vision Pro in phase 3.

Load your 2003-era `.wsz` skin, hit play, and the bars move to the real music.

The docs in `docs/` use the working title "Reamp"; the project is Nostalgia.

## Design constraints

Two platform facts shape the whole architecture:

1. Spotify locked down its platform in February 2026. New apps get
   Development Mode only: a 5-user allowlist, a reduced endpoint set, and no
   audio analysis API at all. So Nostalgia is personal-use, open-source
   software. You bring your own client ID and you need Premium.
2. Both services stream DRM-encrypted audio, so nothing can read the raw
   stream. The visualizer analyzes the system's audio output instead
   (loopback capture via a ScreenCaptureKit sidecar). The captured signal is
   used for analysis only and is never written to disk.

Details in [docs/reamp-overview-brief.md](docs/reamp-overview-brief.md),
[docs/reamp-prd.md](docs/reamp-prd.md), and
[docs/reamp-technical-spec.md](docs/reamp-technical-spec.md).

## Status

Pre-M0 scaffold.

| Milestone | What | State |
|---|---|---|
| M0 | castLabs ECS Electron spike: one Spotify and one Apple Music track playing, proving the DRM path | next up |
| M1 | Swift ScreenCaptureKit sidecar to PCM ring buffer to live FFT | not started |
| M2 | Webamp embedded, Spotify adapter wired to transport, marquee, playlist | not started |
| M3 | Apple Music adapter parity and source switcher | not started |
| M4 | Classic vis window (viscolor.txt aware) and detachable Butterchurn | not started |
| M5 | Settings, onboarding, skin drag-drop, packaging, notarization: v1 | not started |

Working and tested today: the `SourceAdapter` contract, the vis-engine math
(FFT, 75-band spectrum, oscilloscope, SharedArrayBuffer PCM ring buffer),
the complete Spotify PKCE auth flow (loopback server on 127.0.0.1, code
exchange, refresh), the sidecar PCM wire protocol, and the MusicKit token
minting script.

## Repo layout

```
apps/desktop/        Electron shell (castLabs ECS from M0)
  src/main/          main process: OAuth, safeStorage, sidecar manager
  src/renderer/      Webamp host, adapters, vis, settings (from M2)
  sidecar/           Swift ScreenCaptureKit audio capture (M1)
packages/adapters/   SourceAdapter contract, Spotify and Apple Music impls
packages/vis-engine/ FFT, spectrum bands, oscilloscope, PCM ring buffer
packages/skins/      default skin and .wsz helpers
scripts/             gen-apple-token.ts (offline MusicKit JWT)
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

### Minting an Apple Music developer token

Requires an Apple Developer Program membership and a MusicKit `.p8` key.
The key is gitignored; never commit it.

```sh
node --experimental-strip-types scripts/gen-apple-token.ts \
  --key ~/keys/AuthKey_ABC123DEFG.p8 --key-id ABC123DEFG --team-id TEAM456789
```

### Bringing your own Spotify client ID

Create an app at developer.spotify.com (Development Mode) and set the
redirect URI to `http://127.0.0.1:8888/callback`. Spotify requires
`127.0.0.1`, not `localhost`. Paste the client ID into the settings pane
once it exists (M2). The app owner needs an active Premium subscription.

## Skins

Webamp loads classic `.wsz` skins natively. The Winamp base skin is Llama
Group IP and will not be bundled. The default will be a CC-licensed
community skin, and the other 90k or so live at the
[Winamp Skin Museum](https://skins.webamp.org).

## License

[MIT](LICENSE). Built on [Webamp](https://github.com/captbaritone/webamp)
and [Butterchurn](https://github.com/jberg/butterchurn), both MIT.
