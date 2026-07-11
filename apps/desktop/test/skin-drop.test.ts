import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { DEFAULT_VISCOLORS } from '@reamp/skins';
import { extractViscolors } from '../src/renderer/skin-drop.js';

async function wsz(entries: Record<string, string>): Promise<ArrayBuffer> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(entries)) zip.file(name, content);
  return zip.generateAsync({ type: 'arraybuffer' });
}

describe('extractViscolors', () => {
  it('parses viscolor.txt from the archive root', async () => {
    const data = await wsz({ 'viscolor.txt': '1,2,3\n4,5,6', 'main.bmp': 'x' });
    const colors = await extractViscolors(data);
    expect(colors![0]).toEqual([1, 2, 3]);
    expect(colors![1]).toEqual([4, 5, 6]);
    expect(colors!.length).toBe(24); // backfilled from defaults
  });

  it('finds it case-insensitively and prefers the shallowest copy', async () => {
    const data = await wsz({
      'skin/backup/VISCOLOR.TXT': '9,9,9',
      'VISCOLOR.TXT': '7,7,7',
    });
    const colors = await extractViscolors(data);
    expect(colors![0]).toEqual([7, 7, 7]);
  });

  it('returns null when the skin ships no viscolor.txt', async () => {
    const data = await wsz({ 'main.bmp': 'x', 'pledit.txt': 'y' });
    expect(await extractViscolors(data)).toBeNull();
  });

  it('rejects on a corrupt archive', async () => {
    const junk = new TextEncoder().encode('definitely not a zip').buffer as ArrayBuffer;
    await expect(extractViscolors(junk)).rejects.toThrow();
  });

  it('default palette is exported for comparison', () => {
    expect(DEFAULT_VISCOLORS.length).toBe(24);
  });
});
