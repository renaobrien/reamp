/**
 * Skin drag-and-drop (R2): drop a .wsz anywhere on the window and it
 * applies immediately. Webamp gets the archive as an object URL for its
 * own skin engine; we additionally pull viscolor.txt out of the zip so
 * the deck vis recolors to match the skin, the way the original did.
 */
import JSZip from 'jszip';
import { parseViscolor, type Rgb } from '@reamp/skins';

/** Find and parse viscolor.txt in a .wsz archive; null when absent. */
export async function extractViscolors(data: ArrayBuffer): Promise<Rgb[] | null> {
  const zip = await JSZip.loadAsync(data);
  // case-insensitive, any depth; shortest path wins (skins sometimes nest
  // a stray copy inside subdirectories)
  const entry = Object.keys(zip.files)
    .filter((name) => name.toLowerCase().endsWith('viscolor.txt') && !zip.files[name]!.dir)
    .sort((a, b) => a.length - b.length)[0];
  if (entry === undefined) return null;
  return parseViscolor(await zip.files[entry]!.async('string'));
}

export interface SkinDropHandlers {
  /** data is the raw archive, so callers can persist the skin. */
  onSkin: (objectUrl: string, fileName: string, data: ArrayBuffer) => void;
  onColors: (colors: Rgb[]) => void;
  onError: (message: string) => void;
}

export function installSkinDrop(target: HTMLElement, handlers: SkinDropHandlers): void {
  target.addEventListener('dragover', (e) => e.preventDefault());
  target.addEventListener('drop', (e) => {
    const file = Array.from(e.dataTransfer?.files ?? []).find((f) =>
      f.name.toLowerCase().endsWith('.wsz'),
    );
    if (file === undefined) return; // not ours; let other handlers see it
    e.preventDefault();
    void (async () => {
      try {
        const data = await file.arrayBuffer();
        const colors = await extractViscolors(data);
        if (colors !== null) handlers.onColors(colors);
        handlers.onSkin(URL.createObjectURL(new Blob([data])), file.name, data);
      } catch (err) {
        handlers.onError(
          `could not load ${file.name}: ${String(err instanceof Error ? err.message : err)}`,
        );
      }
    })();
  });
}
