# Main process

Electron main process: OAuth loopback server, safeStorage token vault,
capture-sidecar manager, window manager (frameless, snapping, always-on-top).

The Electron entry point is intentionally absent until Milestone 0. The
shell must be the castLabs Electron for Content Security (ECS) fork, since
plain Electron lacks the Widevine/VMP path the Spotify Web Playback SDK
needs. Pin the ECS version against castLabs' current releases at M0 time
(do not trust stale version numbers), prove DRM playback first, then build
the app around it. Fallback if ECS fights back: a hidden Connect-device
page in the user's default browser, controlled via the Connect API
(spec §2).

What lives here already:

- `oauth/pkce.ts`: PKCE pair generation and the Spotify authorize URL
  builder (rejects `localhost`; loopback must be `127.0.0.1`).
- `oauth/loopback-server.ts`: one-shot 127.0.0.1 callback server.
- `oauth/token-client.ts`: PKCE code exchange and refresh, rotation aware.
- `oauth/authorize.ts`: the whole flow composed. PKCE, then browser, then
  loopback, then token exchange. The settings UI calls `authorizeSpotify()`.
- `sidecar/pcm-stream.ts`: the sidecar wire protocol (JSON header line
  plus f32le PCM), incremental parser and encoders for the M1 mock sidecar.

Still to come (M0 to M2): ECS entry point, safeStorage vault, sidecar
process manager, window manager.
