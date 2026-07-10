/**
 * Skin helpers for the Webamp host.
 *
 * Webamp handles `.wsz` (a zip of BMPs + config) natively — cursors,
 * viscolor.txt (which colors the classic vis), region maps. This package
 * only adds the bits around it: default-skin resolution and persistence
 * of the last-used skin.
 *
 * IP rule (spec §5): the Winamp base skin is Llama Group IP and must NOT
 * be bundled. Ship one CC-licensed community skin as the default (open
 * question #3 in the PRD — pick before public release) and point users at
 * the Winamp Skin Museum (https://skins.webamp.org) for the other 90k.
 */

export interface SkinRef {
  /** Absolute path or app-resource URL to a .wsz file. */
  source: string;
  /** Display name for the skin manager in settings. */
  name: string;
  /** Attribution required for the bundled CC skin (docs/skin-credits). */
  credit?: string;
}

/** Placeholder until the CC-licensed default skin is chosen (PRD open question #3). */
export const DEFAULT_SKIN: SkinRef | null = null;

export function isWszFile(path: string): boolean {
  return /\.wsz$/i.test(path);
}
