import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VISCOLORS,
  VISCOLOR_COUNT,
  parseViscolor,
  rgbToCss,
} from '../src/index.js';

describe('DEFAULT_VISCOLORS', () => {
  it('has all 24 entries with byte values', () => {
    expect(DEFAULT_VISCOLORS.length).toBe(VISCOLOR_COUNT);
    for (const [r, g, b] of DEFAULT_VISCOLORS) {
      for (const v of [r, g, b]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(255);
      }
    }
  });
});

describe('parseViscolor', () => {
  it('parses a clean 24-line file', () => {
    const text = DEFAULT_VISCOLORS.map(([r, g, b]) => `${r},${g},${b}`).join('\n');
    expect(parseViscolor(text)).toEqual(DEFAULT_VISCOLORS);
  });

  it('survives comments, blank lines, CRLF, and junk', () => {
    const text = [
      '// classic skin',
      '10, 20, 30, // background',
      '',
      '1,2,3 ; grid',
      'not a color line',
      '255,0,0,',
    ].join('\r\n');
    const colors = parseViscolor(text);
    expect(colors[0]).toEqual([10, 20, 30]);
    expect(colors[1]).toEqual([1, 2, 3]);
    expect(colors[2]).toEqual([255, 0, 0]);
  });

  it('fills missing trailing colors from the default palette', () => {
    const colors = parseViscolor('9,9,9');
    expect(colors.length).toBe(VISCOLOR_COUNT);
    expect(colors[0]).toEqual([9, 9, 9]);
    expect(colors[23]).toEqual(DEFAULT_VISCOLORS[23]);
  });

  it('clamps out-of-range values', () => {
    expect(parseViscolor('300,-5,12')[0]).toEqual([255, 0, 12]);
  });

  it('ignores lines beyond 24 colors', () => {
    const lines = Array.from({ length: 30 }, (_, i) => `${i},${i},${i}`).join('\n');
    const colors = parseViscolor(lines);
    expect(colors.length).toBe(VISCOLOR_COUNT);
    expect(colors[23]).toEqual([23, 23, 23]);
  });
});

describe('rgbToCss', () => {
  it('formats css color strings', () => {
    expect(rgbToCss([1, 2, 3])).toBe('rgb(1,2,3)');
  });
});
