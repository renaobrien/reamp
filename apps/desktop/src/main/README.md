# Main process

Electron main process: window and menu bootstrap, osascript runner for the
desktop-control adapters, OAuth plumbing for the optional API mode, and
(from M1) the capture-sidecar manager.

v1 uses plain Electron because desktop-control mode plays no DRM audio
in-app. The castLabs ECS fork enters only if API-mode in-app playback
lands (spec §2); pin its version against current releases at that time.

Build/run: esbuild bundles main + preload to `dist/`, Vite builds the
renderer. `pnpm start` inside apps/desktop builds and launches (needs the
Electron binary approved: `pnpm approve-builds` once, on a machine with a
display).

What lives here:

- `index.ts`: entry point. Boots the transport-strip window, constructs
  the desktop adapters with the real osascript runner, and registers IPC.
  The application menu carries Help > Send Feedback.
- `adapter-host.ts`: owns the adapters, dispatches transport commands to
  the active one, manages the player-state subscription across source
  switches, broadcasts state to the IPC layer.
- `register-ipc.ts`: binds AdapterHost to ipcMain; `../shared/ipc.ts` is
  the typed channel contract, `../preload.ts` the contextBridge surface.
- `feedback.ts`: builds the prefilled new-issue URL on the upstream repo
  (https://github.com/renaobrien/reamp). Nothing is sent silently; the
  browser opens a draft the user can edit or abandon.
- `diagnostics.ts`: the facts-only diagnostics block (version, OS, mode,
  adapter and capture status) appended to feedback drafts, collapsed.
- `osascript.ts`: real OsaRunner shelling to /usr/bin/osascript; expect
  the one-time macOS Automation permission prompt per controlled app.
- `oauth/pkce.ts`: PKCE pair generation and the Spotify authorize URL
  builder (rejects `localhost`; loopback must be `127.0.0.1`).
- `oauth/loopback-server.ts`: one-shot 127.0.0.1 callback server.
- `oauth/token-client.ts`: PKCE code exchange and refresh, rotation aware.
- `oauth/authorize.ts`: the whole API-mode flow composed. PKCE, then
  browser, then loopback, then token exchange.
- `sidecar/pcm-stream.ts`: the sidecar wire protocol (JSON header line
  plus f32le PCM), incremental parser and encoders for the M1 mock sidecar.
- `sidecar/manager.ts`: sidecar process manager. Spawns the binary, feeds
  decoded PCM to a sink, restarts on crash with a consecutive-failure cap,
  and reports state (idle/starting/running/stopped/failed) for the
  settings UI. Tested against real child processes faking the protocol.
- `vis-service.ts`: the vis pipeline's main-process half. Sidecar PCM
  fills the ring buffer; a ~30Hz timer runs the FFT and oscilloscope math
  and broadcasts compact frames over IPC (sidesteps SharedArrayBuffer
  isolation for v1). Without REAMP_SIDECAR_BIN set it runs
  `../../sidecar-mock/mock-sidecar.mjs`, a Node stand-in speaking the
  same wire protocol with synthetic audio, so bars move on any machine.

Still to come (M1 to M2): the Swift sidecar binary itself, safeStorage
vault, window snapping/always-on-top, Webamp host wiring.
