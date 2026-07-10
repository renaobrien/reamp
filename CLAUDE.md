# Nostalgia build conventions

Repo: `nostalgia` (docs use the working title "Reamp"). Full context lives
in `docs/`. Read `reamp-technical-spec.md` before touching platform-adjacent
code. This file is the distilled rulebook.

Strategy update (July 2026, supersedes the spec where they conflict):
v1 is desktop-control mode. Adapters drive the official Spotify and Music
macOS apps via AppleScript; visuals come from loopback capture. The spec's
API mode (Web Playback SDK, MusicKit JS, castLabs ECS) is an optional
later mode; its auth plumbing is built and stays.

## Commands

```sh
pnpm install          # workspace install
pnpm typecheck        # tsc --noEmit across all packages + scripts
pnpm test             # vitest across all packages + scripts
```

## Layout

- `apps/desktop`: Electron shell (castLabs ECS at M0). `src/main` is the
  Node main process (OAuth, safeStorage, sidecar manager, windows);
  `src/renderer` is the Webamp host, adapters, vis, settings; `sidecar/`
  is the Swift ScreenCaptureKit capture binary.
- `packages/adapters`: `SourceAdapter` contract plus Spotify/Apple impls.
- `packages/vis-engine`: FFT, spectrum bands, oscilloscope, PCM ring buffer.
- `packages/skins`: default-skin resolution, `.wsz` helpers.
- `scripts/`: `gen-apple-token.ts` (offline MusicKit JWT minting).

## Hard platform rules (violating these breaks the product or ToS)

1. Spotify audio-features/audio-analysis endpoints are dead (403 for
   post-Nov-2024 apps). Never build against them; the vis signal is
   loopback PCM only.
2. Bring-your-own client ID. Never ship, embed, or default a Spotify
   client ID. Users create their own app; dev mode caps at a 5-user
   allowlist and the owner must hold Premium.
3. OAuth is Authorization Code + PKCE; the loopback redirect is
   `http://127.0.0.1:<port>/callback`. `localhost` is rejected by Spotify
   and by our own code (`apps/desktop/src/main/oauth/pkce.ts`).
4. DRM audio is untouchable. EME/Widevine streams get no Web Audio tap.
   PCM comes from system loopback (SCK sidecar), lives in the ring buffer,
   is never written to disk, and never leaves the process. Analysis only.
5. No secrets in the repo. Tokens go through Electron `safeStorage`;
   `.p8` keys are gitignored; there is no proxy server.
6. Skin IP: never bundle the Winamp base skin (Llama Group). The default
   skin must be CC-licensed; users load everything else themselves.
7. Verify Spotify dev-mode endpoint availability against the Feb 2026
   changelog when wiring Web API calls. Several catalog endpoints are
   gone, and older SDK wrappers (and model training data) lie.

## Engineering conventions

- TypeScript strict everywhere; `tsconfig.base.json` is the source of truth.
- pnpm workspace; packages export TS source directly. Bundling is the
  app's job, via Vite, from M2.
- No em dashes in prose or comments; plain punctuation only.
- Vis code paths run per frame: no allocation after construction in
  `@nostalgia/vis-engine` (see `RealFft.analyze`, `SpectrumAnalyzer.process`).
- The `SourceAdapter` interface (`packages/adapters/src/types.ts`) is the
  contract everything hangs on. Change it in the spec first, then here,
  and keep it mirrorable to Swift (visionOS Phase 3 shares the shape).
- Desktop-control mode needs no DRM playback, so v1 uses plain `electron`.
  The castLabs ECS fork is only required if/when API-mode in-app playback
  lands; pin its version against current releases at that time.
- Desktop adapters take an injected `OsaRunner` so they stay testable
  off-macOS. All AppleScript must go through the helpers in
  `packages/adapters/src/desktop/osa.ts`: the not-running guard (never
  auto-launch), control-character field separators (track names contain
  commas), and `sanitizeForScript` for every interpolated value.

## Milestones (revised for the desktop-control pivot)

M0 desktop-control adapters (done, verify on macOS), M1 capture sidecar +
live FFT, M2 Electron shell + Webamp + adapters wired, M3 vis windows
(classic + Butterchurn), M4 ship v1 (settings, packaging, notarization),
M5+ optional API mode (ECS spike, Web Playback SDK, MusicKit JS).

Current state: pre-M1. Desktop-control adapters for Spotify.app and
Music.app, contracts, vis math (FFT, spectrum bands, oscilloscope, ring
buffer), the API-mode Spotify auth flow (PKCE, loopback, token
exchange/refresh), the sidecar PCM wire protocol, and token minting are
real and tested. The Electron entry point and Webamp host land at M2.
