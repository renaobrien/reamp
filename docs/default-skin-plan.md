# Default skin: the decision that needs an owner

Rule 6 (CLAUDE.md) and PRD open question 3: Reamp must not bundle the
Winamp base skin (Llama Group IP), and the default we ship must be
clearly licensed. This is a legal call for the project owner; here are
the vetted options.

## Current state (fine for now)

Reamp ships no skin of its own. The `webamp` npm package renders its own
embedded default; that bundling decision and its IP posture live
upstream in Webamp (MIT, widely distributed, maintained by the Winamp
Skin Museum author). Users drop their own `.wsz` for everything else.
This is acceptable for personal use and arguably for release, since the
artwork never enters this repository.

## Option A: bundle the Audacious/XMMS classic skin (GPLv2+)

The XMMS default skin artwork ships inside the GPL-licensed XMMS and
Audacious source trees (the skinned interface plugin remains GPLv2+
from its XMMS heritage; see
https://redmine.audacious-media-player.org/boards/1/topics/2715).
Bundling GPL data files alongside MIT code is aggregation, not linking:
permitted, provided we ship the GPL license text and attribution and
point to the source. Work items if chosen:

1. Extract the skin BMP set from an Audacious release tarball.
2. Zip as `default.wsz`, verify Webamp renders every window cleanly
   (XMMS-era skins can miss newer Winamp2 sprites).
3. Add `docs/skin-credits.md` + the GPLv2 text alongside the file.
4. Pass `initialSkin` in webamp-host and use its viscolor for the deck.

## Option B: commission or draw an original Reamp skin (CC0)

A full classic skin is roughly 20 BMP sprite sheets with exact layouts
(main, cbuttons, titlebar, numbers, text, posbar, volume, balance,
shufrep, playpaus, monoster, eqmain, pledit, plus viscolor.txt and
region.txt). Entirely doable and cleanest legally (we own it, release
CC0), but it is real pixel-art work. The app icon's palette (dark tile,
viscolor ramp) is a ready-made art direction.

## Option C: ask the Winamp Skin Museum

The museum (skins.webamp.org) catalogs ~90k skins but does not track
licenses; most classic skins are abandonware with unknown rights. Its
maintainer has thought about this more than anyone; an issue on
github.com/captbaritone/webamp asking which skins have clear licenses
may surface a known-CC option quickly.

## Recommendation

Stay with the current state through v1 (no bundled artwork in this
repo), pursue Option B for identity when there is appetite for pixel
art, and treat Option A as the fast fallback if a bundled default
becomes a hard requirement.
