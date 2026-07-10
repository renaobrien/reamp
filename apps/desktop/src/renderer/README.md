# Renderer

Chromium renderer: Webamp host (UI, `.wsz` skin engine, windows), the
source-adapter layer (`@nostalgia/adapters`), the vis engine host
(`@nostalgia/vis-engine` fed by the PCM SharedArrayBuffer), settings and
onboarding UI.

Deliberately empty until Milestone 2. The ECS/DRM spike (M0) and capture
pipeline (M1) come first, per the milestone order in
`docs/reamp-technical-spec.md` §8. Renderer tooling will be Vite and
TypeScript strict; `webamp`, `butterchurn`, and `butterchurn-presets` are
added when the Webamp host lands.

Rules that bind this directory:

- Streaming audio is EME-protected. Never attempt a Web Audio tap on the
  playback element; the vis signal comes from loopback capture only.
- Webamp keeps UI ownership. Where it assumes Web Audio ownership (EQ,
  balance), stub with visual-only behavior for streaming sources.
- MusicKit JS is loaded via script tag. Keep it in a dedicated webview if
  it misbehaves inside the main renderer (spec §7).
