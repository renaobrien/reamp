/**
 * Settings persistence: a small JSON file plus the last-dropped skin
 * archive, both in Electron's userData directory. Synchronous fs is fine
 * at this scale (a few KB, read once at boot, written on user actions).
 * Corrupt or missing files degrade to defaults instead of erroring.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

export interface SettingsData {
  /** Active source adapter id. */
  source?: string;
  /** Stage visual by name ("Off", "Tunnel", ...), robust to reordering. */
  stageMode?: string;
  windowBounds?: WindowBounds;
  /** Webamp scale factor, or 'fit' for the largest size the window allows. */
  webampZoom?: number | 'fit';
  deckHidden?: boolean;
  /** "Don't show again" on the EQ explainer dialog. */
  eqNoticeDismissed?: boolean;
}

const SETTINGS_FILE = 'settings.json';
const SKIN_FILE = 'skin.wsz';

export class SettingsStore {
  private readonly dir: string;
  private cache: SettingsData | null = null;

  constructor(dir: string) {
    this.dir = dir;
    mkdirSync(dir, { recursive: true });
  }

  load(): SettingsData {
    if (this.cache !== null) return this.cache;
    try {
      const parsed: unknown = JSON.parse(readFileSync(join(this.dir, SETTINGS_FILE), 'utf8'));
      this.cache = typeof parsed === 'object' && parsed !== null ? (parsed as SettingsData) : {};
    } catch {
      this.cache = {};
    }
    return this.cache;
  }

  save(patch: Partial<SettingsData>): void {
    const next = { ...this.load(), ...patch };
    this.cache = next;
    // write-then-rename so a crash mid-write cannot corrupt the file
    const tmp = join(this.dir, `${SETTINGS_FILE}.tmp`);
    writeFileSync(tmp, JSON.stringify(next, null, 2));
    renameSync(tmp, join(this.dir, SETTINGS_FILE));
  }

  /** Persist the last-dropped .wsz so the skin survives restarts. */
  saveSkin(data: Uint8Array): void {
    const tmp = join(this.dir, `${SKIN_FILE}.tmp`);
    writeFileSync(tmp, data);
    renameSync(tmp, join(this.dir, SKIN_FILE));
  }

  loadSkin(): Buffer | null {
    try {
      return readFileSync(join(this.dir, SKIN_FILE));
    } catch {
      return null;
    }
  }
}
