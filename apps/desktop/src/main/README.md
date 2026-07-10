# Main process

Electron main process: OAuth loopback server, safeStorage token vault,
capture-sidecar manager, window manager (frameless, snapping, always-on-top).

The Electron entry point is intentionally absent until **Milestone 0**:
the shell must be the castLabs Electron for Content Security (ECS) fork —
plain Electron lacks the Widevine/VMP path the Spotify Web Playback SDK
needs. Pin the ECS version against castLabs' current releases at M0 time
(do not trust stale version numbers), prove DRM playback first, then build
the app around it. Fallback if ECS fights back: hidden Connect-device page
in the user's default browser, controlled via the Connect API (spec §2).

What lives here already:

- `oauth/pkce.ts` — PKCE pair generation + Spotify authorize URL builder
  (rejects `localhost`; loopback must be `127.0.0.1`).
- `oauth/loopback-server.ts` — one-shot 127.0.0.1 callback server.
- `oauth/token-client.ts` — PKCE code exchange + refresh (rotation-aware).
- `oauth/authorize.ts` — the whole flow composed: PKCE → browser →
  loopback → token exchange. Settings UI calls `authorizeSpotify()`.
- `sidecar/pcm-stream.ts` — the sidecar wire protocol (JSON header line +
  f32le PCM), incremental parser + encoders for the M1 mock sidecar.

Still to come (M0–M2): ECS entry point, safeStorage vault, sidecar
process manager, window manager.
