// Nostalgia capture sidecar (Milestone 1).
//
// Captures system audio output with ScreenCaptureKit (SCStream audio,
// macOS 13+) and streams Float32 PCM frames to the Electron main process
// over stdout. One-time user permission required; onboarding shows a live
// meter so the user can confirm signal (spec §7).
//
// Hard rules (spec §1):
//   - PCM goes straight into the parent's ring buffer. It is NEVER
//     written to disk and never leaves the process pair.
//   - Analysis-only: no recording, no export, ever.
//
// Protocol sketch (finalize in M1): little-endian Float32 mono frames,
// preceded by a one-line JSON header on stdout announcing
// {"sampleRate":48000,"channels":1,"format":"f32le"}.
//
// Fallback for users who prefer it: BlackHole + multi-output device,
// documented in the README instead of implemented here.

import Foundation

FileHandle.standardError.write(Data("capture-sidecar: not implemented (Milestone 1)\n".utf8))
exit(64)
