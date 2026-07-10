# Reamp: Overview Brief

Working title: **Reamp** (rename freely)

## One-liner

A pixel-faithful Winamp 2.9 style player that controls Spotify and Apple Music, with real reactive visualizations (classic Milkdrop and modern GPU shaders) and a spatial computing mode for Vision Pro.

## Why this exists

Streaming killed the player as an object. Spotify and Apple Music are catalogs with a transport bar bolted on. Winamp was a beloved artifact: skins, the spectrum analyzer, Milkdrop, the EQ, the tiny title-bar scroller. Reamp puts that artifact back on the desktop and lets it drive the streaming services you actually pay for.

## What it is

- A desktop app (macOS first, Windows second) that renders a classic Winamp UI, loads original `.wsz` community skins, and plays music through your Spotify Premium or Apple Music account.
- Real visualizations driven by actual audio, captured from system output via loopback, since neither streaming service exposes raw audio or (any longer) audio analysis data.
- A modern visual mode: WebGL/WebGPU shader scenes alongside the full Milkdrop preset library via Butterchurn.
- A visionOS companion (Phase 3): the player as a floating panel with a volumetric visualizer filling the room.

## The two hard truths shaping this product

1. **Spotify has locked its platform down.** As of February 2026, new Development Mode apps get 1 client ID, a 5-user allowlist, owner must hold Premium, and a reduced endpoint set. Audio analysis and audio features endpoints are dead for all new apps with no replacement. Extended quota is granted to organizations only. Consequence: Reamp ships as a personal-use or open source bring-your-own-client-ID product, with Spotify Premium required. It cannot be a commercial Spotify app.
2. **DRM means no direct audio access.** Both services deliver encrypted streams. The visualizer therefore analyzes the system's audio output (loopback capture), which yields a true FFT of whatever is playing without touching the protected stream. This is the same class of signal a hardware spectrum analyzer would see.

## Strategy

- Build on **Webamp** (MIT, faithful JS Winamp 2 clone with `.wsz` skin engine) and **Butterchurn** (MIT, Milkdrop 2 in WebGL) rather than rebuilding the chrome from scratch. Engineering effort goes into the streaming bridges, loopback pipeline, and spatial mode, where no prior art exists.
- **Apple Music is the long-term strategic backend.** Its developer program is stable ($99/yr), MusicKit works natively on macOS and visionOS, and Apple still exposes tempo and key metadata. Spotify support is real but treated as fragile by design.
- Ship in three phases: desktop player with both services and loopback visuals, then modern visual engine and polish, then visionOS.

## Audience

Rena first. Then the retro-computing and music-nerd crowd via open source release: people with Spotify Premium or Apple Music who will happily paste a client ID into a settings pane to get their llama back.

## Success looks like

You open Reamp, your 2003-era skin loads, you hit play, Spotify audio comes out, the spectrum bars move to the actual music, you double-click the vis window and Milkdrop takes over your second monitor. On Vision Pro, the same session renders as a particle field around your couch.
