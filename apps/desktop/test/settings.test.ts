import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SettingsStore } from '../src/main/settings.js';

function freshDir(): string {
  return mkdtempSync(join(tmpdir(), 'reamp-settings-'));
}

describe('SettingsStore', () => {
  it('round-trips settings across instances (restart survival)', () => {
    const dir = freshDir();
    const a = new SettingsStore(dir);
    a.save({ source: 'apple-music', stageMode: 'Plasma' });
    a.save({ windowBounds: { x: 10, y: 20, width: 800, height: 600 } });

    const b = new SettingsStore(dir); // "restart"
    expect(b.load()).toEqual({
      source: 'apple-music',
      stageMode: 'Plasma',
      windowBounds: { x: 10, y: 20, width: 800, height: 600 },
    });
  });

  it('merges patches without dropping other keys', () => {
    const store = new SettingsStore(freshDir());
    store.save({ source: 'spotify' });
    store.save({ stageMode: 'Swarm' });
    expect(store.load().source).toBe('spotify');
  });

  it('degrades to defaults on a corrupt settings file', () => {
    const dir = freshDir();
    writeFileSync(join(dir, 'settings.json'), '{not json');
    expect(new SettingsStore(dir).load()).toEqual({});
  });

  it('returns empty settings when nothing was saved', () => {
    expect(new SettingsStore(freshDir()).load()).toEqual({});
  });

  it('round-trips the skin archive bytes', () => {
    const dir = freshDir();
    const store = new SettingsStore(dir);
    expect(store.loadSkin()).toBeNull();
    const bytes = new Uint8Array([0x50, 0x4b, 3, 4, 42, 99]);
    store.saveSkin(bytes);
    expect(new Uint8Array(new SettingsStore(dir).loadSkin()!)).toEqual(bytes);
  });
});
