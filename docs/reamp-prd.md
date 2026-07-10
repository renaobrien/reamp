# Reamp PRD

Version 1.0 | July 2026 | Owner: Rena O'Brien

## Problem statement

Streaming service clients are functional and joyless. Users who grew up with Winamp want its tactile UI, skins, and audio-reactive visualizations, but their music now lives in Spotify and Apple Music, which offer no skinnable player and no visualizer. No existing product bridges classic Winamp aesthetics to modern streaming with real audio-reactive visuals.

## Goals

1. Play and control Spotify (Premium) and Apple Music from a pixel-faithful Winamp 2.9 style interface on macOS.
2. Render audio-reactive visualizations (spectrum, oscilloscope, Milkdrop) driven by the actual audio signal at 60fps.
3. Load any classic community `.wsz` skin without conversion.
4. Deliver a visionOS spatial mode with a volumetric visualizer (Phase 3).
5. Ship as open source with a setup flow a motivated non-developer can complete in under 15 minutes (Spotify client ID creation included).

## Non-goals

- **Commercial distribution with bundled Spotify access.** Spotify's Feb 2026 rules cap Development Mode apps at 5 users and grant extended quota to organizations only. Out of scope by platform policy.
- **Audio downloading, recording, or export.** Loopback capture is analysis-only, discarded in real time. Anything else is a legal and ToS landmine.
- **Local file library management.** Winamp was also an MP3 player. V1 targets streaming control only. Local playback is P2.
- **Windows and Linux in Phase 1.** macOS first because it is the primary dev machine and the visionOS path depends on Apple frameworks. Windows follows in Phase 2.
- **Tidal, YouTube Music, Deezer.** Architecture should keep the source adapter interface clean for these, but no work in v1.
- **Winamp 3/5 modern skin engine (.wal).** Classic `.wsz` only.

## Personas and user stories

**P1: The nostalgic power listener** (primary, this is Rena)
- As a listener, I want to connect my Spotify Premium account so Reamp becomes a Spotify Connect device I can play to.
- As a listener, I want to connect Apple Music so I can browse my library and play it inside Reamp.
- As a listener, I want play/pause/next/prev/seek/volume/shuffle/repeat from the classic transport controls so the UI actually works, without opening the native apps.
- As a listener, I want the song title scrolling in the marquee, bitrate/time display, and working playlist window so the illusion is complete.
- As a skin collector, I want to drag any `.wsz` file onto the player and have it apply instantly.
- As a visuals nerd, I want the small vis window to show spectrum/oscilloscope, and a detachable fullscreen window running Milkdrop presets reacting to the real audio.
- As a Vision Pro owner, I want the player pinned in space with a room-scale visualizer while music plays.

**P2: The OSS tinkerer** (secondary)
- As a self-hoster, I want a guided settings flow to paste my own Spotify client ID and complete OAuth so I am not dependent on anyone else's API quota.
- As a contributor, I want a clean source-adapter interface so I can add Tidal later.

## Requirements

### P0 (v1 cannot ship without)

| # | Requirement | Acceptance criteria |
|---|---|---|
| R1 | Winamp 2.9 UI via embedded Webamp: main window, EQ window, playlist window, shade mode, snapping | Windows dock and snap; shade mode toggles; UI matches base skin at 1x and 2x scaling |
| R2 | Classic `.wsz` skin loading | Top 20 skins from the Winamp Skin Museum load without visual errors; drag-and-drop applies in <1s |
| R3 | Spotify source adapter: OAuth (PKCE), Web Playback SDK as local Connect device, transport control, current-track metadata, playlist browse into playlist window | Given a Premium account and user-supplied client ID, playback starts in-app; all transport controls round-trip in <500ms; track/artist/duration render in marquee and playlist |
| R4 | Apple Music source adapter: MusicKit auth, library and playlist browse, transport control, metadata | Given an active subscription, same criteria as R3 |
| R5 | Loopback audio capture on macOS feeding an analysis bus | FFT frames at ≥45Hz with <100ms latency from audible sound to visual response; zero audio written to disk |
| R6 | Built-in vis window: spectrum analyzer and oscilloscope, classic Winamp styling, driven by R5 | Bars respond to real audio; falls back to idle animation when capture permission is denied |
| R7 | Milkdrop mode via Butterchurn in a detachable window | ≥100 bundled presets; preset cycling; fullscreen on any display at 60fps on Apple Silicon |
| R8 | Settings pane: service connect/disconnect, client ID entry, capture permission status, skin manager | A new user completes full setup from README in under 15 minutes |
| R9 | Graceful degradation | If capture permission is missing, playback still works and visuals run in metadata/idle mode with a one-line explanation |

### P1 (fast follow)

- Modern visual engine: 5 to 10 original WebGPU shader scenes (particle field, tunnel, terrain, plasma) selectable alongside Milkdrop.
- Windows build with WASAPI loopback (much easier than macOS; no permission prompt needed).
- Global media key support and macOS Now Playing integration.
- Double-size mode, always-on-top, multi-monitor vis placement memory.
- EQ that actually processes audio for Apple Music via an output tap where feasible; otherwise EQ window is visual-only with honest labeling.
- Apple Music tempo/key metadata used to beat-sync preset transitions.

### P2 (future, design for now)

- visionOS app: SwiftUI player panel + RealityKit volumetric visualizer, MusicKit-native playback, Spotify controlled remotely via Connect API with metadata-driven visuals (no loopback exists on visionOS).
- Local file playback (drag MP3/FLAC into playlist, full Web Audio path, real EQ, perfect visualizer signal).
- WebXR fallback for the visualizer in Safari on visionOS.
- Skin browser with Winamp Skin Museum API integration.
- Additional source adapters (Tidal, Plex, Jellyfin).

## Success metrics

This is a personal-first OSS project, so metrics are product-quality gates rather than growth targets.

- **Leading:** end-to-end setup completion in <15 min by one outside tester; audio-to-visual latency <100ms; 60fps Milkdrop on M-series; zero crashes across a 2-hour listening session; top-20 skin compatibility.
- **Lagging (post OSS release):** 500 GitHub stars in 90 days; 10 external issues/PRs in 90 days; at least one community-contributed source adapter or shader scene in 6 months.

## Open questions

1. **Engineering:** ScreenCaptureKit audio capture vs. requiring a virtual device (BlackHole) on macOS. SCK is zero-install but needs a native sidecar and a permission prompt. Decision needed before R5. (Recommendation in tech spec: SCK sidecar.)
2. **Engineering:** Tauri vs. Electron shell. (Recommendation in tech spec: Electron for Webamp/Chromium fidelity and Widevine non-issues, revisit if bundle size offends.)
3. **Legal (non-blocking):** default bundled skin must be community/CC licensed, since the original base skin is Llama Group IP. Pick one before public release.
4. **Product (non-blocking):** whether the EQ window should be hidden for streaming sources or shown as visual-only. Winamp purism says show it.
5. **Platform (blocking for Phase 3):** confirm current visionOS MusicKit and RealityKit capabilities at Phase 3 kickoff; Apple moves this surface yearly at WWDC.

## Timeline and phasing

- **Phase 1 (v0.1 to v1.0):** P0 requirements, macOS only. Milestones in tech spec map directly to Claude Code work sessions.
- **Phase 2 (v1.x):** P1 list, Windows build, OSS public release.
- **Phase 3 (v2.0):** visionOS app, local files, WebXR.

No hard external deadlines. Sequencing constraint: R5 (loopback) before R6/R7; R3 and R4 are parallelizable.
