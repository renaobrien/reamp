# Reamp

> repo codename: `nostalgia`

A pixel-faithful Winamp 2.9 style player that controls **Spotify** (Premium)
and **Apple Music**, with real audio-reactive visualizations — classic
spectrum/oscilloscope and Milkdrop via Butterchurn — on macOS first, then
Windows, then a spatial mode on Vision Pro.

Streaming killed the player as an object. This puts the artifact back on the
desktop and lets it drive the services you actually pay for: your 2003-era
`.wsz` skin loads, you hit play, Spotify audio comes out, and the bars move
to the actual music.

## How it can work at all (the two hard truths)

1. **Spotify's platform is locked down** (Feb 2026 rules): Development Mode
   only, 5-user allowlist, bring-your-own client ID, and the audio-analysis
   endpoints are dead with no replacement. So Reamp is a personal-use /
   open-source product — you paste your own client ID, Premium required.
2. **DRM means no direct audio access.** Both services stream encrypted
   audio. The visualizer instead analyzes the system's audio *output*
   (loopback capture via a ScreenCaptureKit sidecar) — a true FFT of
   whatever is playing, analysis-only, never written to disk.

Full reasoning: [docs/reamp-overview-brief.md](docs/reamp-overview-brief.md),
[docs/reamp-prd.md](docs/reamp-prd.md),
[docs/reamp-technical-spec.md](docs/reamp-technical-spec.md).

## Status: pre-M0 scaffold

| Milestone | What | State |
|---|---|---|
| M0 | castLabs ECS Electron spike — one Spotify + one Apple Music track playing (proves the DRM path) | next up |
| M1 | Swift SCK capture sidecar → PCM ring buffer → live FFT | — |
| M2 | Webamp embedded, Spotify adapter wired to transport/marquee/playlist | — |
| M3 | Apple Music adapter parity + source switcher | — |
| M4 | Classic vis window (viscolor.txt-aware) + detachable Butterchurn | — |
| M5 | Settings/onboarding, skin drag-drop, packaging, notarization → v1 | — |

What's real today: the `SourceAdapter` contract, the vis-engine math (FFT,
75-band spectrum, SharedArrayBuffer PCM ring buffer), PKCE + 127.0.0.1
loopback OAuth plumbing, and the MusicKit token minting script — all typed
strict and tested.

## Repo layout

```
apps/desktop/        Electron shell (castLabs ECS from M0)
  src/main/          main process: OAuth loopback, safeStorage, sidecar mgr
  src/renderer/      Webamp host, adapters, vis, settings (from M2)
  sidecar/           Swift ScreenCaptureKit audio capture (M1)
packages/adapters/   SourceAdapter contract + Spotify / Apple Music impls
packages/vis-engine/ FFT, spectrum bands, PCM ring buffer
packages/skins/      default-skin + .wsz helpers (no Winamp base skin — IP)
scripts/             gen-apple-token.ts (offline MusicKit JWT)
docs/                brief, PRD, tech spec
```

## Development

```sh
pnpm install
pnpm typecheck
pnpm test
```

Node ≥ 22, pnpm ≥ 10. Conventions and hard platform rules live in
[CLAUDE.md](CLAUDE.md).

### Minting an Apple Music developer token

Requires an Apple Developer Program membership and a MusicKit `.p8` key
(never commit it — it's gitignored):

```sh
node --experimental-strip-types scripts/gen-apple-token.ts \
  --key ~/keys/AuthKey_ABC123DEFG.p8 --key-id ABC123DEFG --team-id TEAM456789
```

### Bringing your own Spotify client ID

Create an app at developer.spotify.com (Development Mode), set the redirect
URI to `http://127.0.0.1:8888/callback` (must be `127.0.0.1`, not
`localhost`), and paste the client ID into Reamp's settings pane once it
exists (M2). The app owner needs an active Premium subscription.

## Skins

Webamp loads classic `.wsz` skins natively. The Winamp base skin is Llama
Group IP and will never be bundled; the default will be a CC-licensed
community skin, and the other ~90k live at the
[Winamp Skin Museum](https://skins.webamp.org).

## License

[MIT](LICENSE). Built on the shoulders of
[Webamp](https://github.com/captbaritone/webamp) and
[Butterchurn](https://github.com/jberg/butterchurn) (both MIT).
