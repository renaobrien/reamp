# Nostalgia build conventions

Repo: `nostalgia` (docs use the working title "Reamp"). Full context lives
in `docs/`. Read `reamp-technical-spec.md` before touching platform-adjacent
code. This file is the distilled rulebook.

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
- The Electron dependency is the castLabs ECS fork, added at M0 with a
  version pinned against their current releases. Do not add plain
  `electron`.

## Milestones (spec §8)

M0 ECS/DRM spike, M1 capture sidecar + live FFT, M2 Webamp + Spotify
adapter, M3 Apple Music parity, M4 vis windows (classic + Butterchurn),
M5 ship v1 (settings, packaging, notarization), M6+ the P1 list.

Current state: pre-M0 scaffold. Contracts, vis math (FFT, spectrum bands,
oscilloscope, ring buffer), the complete Spotify auth flow (PKCE, loopback,
token exchange/refresh), the sidecar PCM wire protocol, and token minting
are real and tested. Adapters and the Electron entry point are deliberate
stubs until their milestone.
