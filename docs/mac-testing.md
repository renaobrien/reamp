# First run on a Mac: the checklist

Everything below was built and unit tested off-macOS; this session is
about watching it meet real hardware. Work top to bottom; each step says
what to expect and what to report back if it misbehaves. Total time:
roughly 30 to 60 minutes.

## 0. Prerequisites

- macOS 13 or newer (ScreenCaptureKit audio needs it)
- Node 22+, pnpm 10+ (`npm install -g pnpm`)
- Xcode Command Line Tools for the sidecar (`xcode-select --install`)
- Spotify and/or Music desktop apps installed and signed in

## 1. Clone and prove the baseline

```sh
git clone https://github.com/renaobrien/reamp.git
cd reamp
pnpm install
pnpm typecheck && pnpm test
```

Expect: all tests green. If not, stop and report the output; nothing
downstream is trustworthy until this passes.

## 2. Browser demo (sanity check, no Electron)

```sh
pnpm demo
```

Open the printed URL. Expect: Webamp renders, bars dance to procedural
music, the stage cycler works, dropping a `.wsz` reskins everything.
This is the same code verified headless, so surprises here are unlikely.

## 3. The real app

```sh
pnpm approve-builds                  # select electron; allows its binary download
pnpm install                         # actually downloads it after approval
pnpm app
```

Expect: the Reamp window opens, deck bars dance (mock audio), the stage
visuals and Cmd+M Milkdrop window work, and the window position/skin/
source/vis mode survive a quit and relaunch.

Report: any blank window, crash, or console error (View > Toggle
Developer Tools in the app, or run from a terminal and copy stderr).

## 4. AppleScript control (the M0 exit criterion)

With Spotify open and a song playing:

- Click play/pause/next/prev in the deck. macOS will ask "Reamp wants to
  control Spotify" once; approve it. Expect: Spotify obeys within ~500ms
  and the marquee shows the real artist and title.
- Pause inside Spotify itself. Expect: Reamp's status flips to paused
  within a second.
- Switch the source dropdown to Apple Music with Music.app open and
  repeat. Playlist browsing works for Music (not Spotify; that is API
  mode territory).

Report: the exact status-line error text if any button fails. It carries
the raw AppleScript error, which is everything needed to fix it.

## 5. The capture sidecar (the M1 exit criterion)

```sh
cd apps/desktop/sidecar
swift build -c release
```

This is the one component written entirely off-device; expect possible
compile errors. Paste them verbatim if so; they will be quick fixes.

When it builds:

```sh
cd ../../..
REAMP_SIDECAR_BIN=apps/desktop/sidecar/.build/release/capture-sidecar \
  pnpm app
```

macOS will prompt for Screen Recording permission (that is how SCK gates
system audio); approve and relaunch. Expect: the bars now move to the
actual music coming out of Spotify. That is the whole product working.

Quick standalone sidecar test without the app:

```sh
apps/desktop/sidecar/.build/release/capture-sidecar | head -c 100 | xxd | head -5
```

Expect: a JSON header line, then binary. Ctrl+C to stop.

## 6. Victory lap

Fullscreen Milkdrop on a second display, drag in a skin from
skins.webamp.org, leave it running for a 2-hour listening session (the
PRD's stability gate). Note anything that drifts, leaks, or stutters.
