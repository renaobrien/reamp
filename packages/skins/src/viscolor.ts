/**
 * viscolor.txt: the 24-color palette every classic skin ships to color
 * the built-in visualizer. Line format is "R,G,B" with optional trailing
 * commentary, one color per line:
 *
 *   0:      vis background
 *   1:      background dots/grid
 *   2..17:  spectrum bar gradient, TOP of bar (2) to BOTTOM (17)
 *   18..22: oscilloscope colors, center (18) to edge (22)
 *   23:     peak cap dots
 */

export const VISCOLOR_COUNT = 24;

export type Rgb = readonly [number, number, number];

/**
 * The canonical default palette (the classic dark-green-to-red ramp).
 * These are the standard viscolor.txt values, plain color data used by
 * every skinning tutorial; no skin artwork is bundled.
 */
export const DEFAULT_VISCOLORS: readonly Rgb[] = [
  [0, 0, 0],
  [24, 33, 41],
  [239, 49, 16],
  [206, 41, 16],
  [214, 90, 0],
  [214, 102, 0],
  [214, 115, 0],
  [198, 123, 8],
  [222, 165, 24],
  [214, 181, 33],
  [189, 222, 41],
  [148, 222, 33],
  [41, 206, 16],
  [50, 190, 16],
  [57, 181, 16],
  [49, 156, 8],
  [41, 148, 0],
  [24, 132, 8],
  [255, 255, 255],
  [214, 214, 222],
  [181, 189, 189],
  [160, 170, 175],
  [148, 156, 165],
  [150, 150, 150],
];

/**
 * Parse a viscolor.txt. Tolerant of the wild files 25 years of skinners
 * produced: comments (// or ;), blank lines, extra values on a line,
 * CRLF. Missing trailing colors fall back to the default palette so a
 * sloppy skin degrades instead of erroring.
 */
export function parseViscolor(text: string): Rgb[] {
  const colors: Rgb[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    if (colors.length >= VISCOLOR_COUNT) break;
    const line = rawLine.replace(/\/\/.*$|;.*$/g, '').trim();
    if (line.length === 0) continue;
    const parts = line.split(',').map((p) => Number.parseInt(p.trim(), 10));
    if (parts.length < 3 || parts.slice(0, 3).some((n) => Number.isNaN(n))) continue;
    colors.push([clampByte(parts[0]!), clampByte(parts[1]!), clampByte(parts[2]!)]);
  }
  while (colors.length < VISCOLOR_COUNT) {
    colors.push(DEFAULT_VISCOLORS[colors.length]!);
  }
  return colors;
}

export function rgbToCss([r, g, b]: Rgb): string {
  return `rgb(${r},${g},${b})`;
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, n));
}
