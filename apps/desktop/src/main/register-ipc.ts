/**
 * Binds the AdapterHost to ipcMain and forwards player-state events to
 * the renderer. Kept separate from index.ts so the wiring is one screen
 * of code with no logic worth testing beyond AdapterHost's own tests.
 */
import { type BrowserWindow, ipcMain } from 'electron';
import type { SourceId } from '@reamp/adapters';
import { IPC, type PersistedSettings, type TransportCommand } from '../shared/ipc.js';
import type { AdapterHost } from './adapter-host.js';
import type { SettingsStore } from './settings.js';

export function registerIpc(host: AdapterHost, settings: SettingsStore): void {
  ipcMain.handle(IPC.transport, (_e, cmd: TransportCommand) => host.transport(cmd));
  ipcMain.handle(IPC.setSource, (_e, id: SourceId) => {
    settings.save({ source: id });
    return host.setSource(id);
  });
  ipcMain.handle(IPC.getSource, () => host.getSource());
  ipcMain.handle(IPC.auth, () => host.auth());
  ipcMain.handle(IPC.getPlaylists, () => host.getPlaylists());
  ipcMain.handle(IPC.getPlaylistTracks, (_e, id: string) => host.getPlaylistTracks(id));
  ipcMain.handle(IPC.getSettings, () => {
    const { source, stageMode, webampZoom, playerStyle, deckHidden, eqNoticeDismissed } =
      settings.load();
    return {
      source,
      stageMode,
      webampZoom,
      playerStyle,
      deckHidden,
      eqNoticeDismissed,
    } satisfies PersistedSettings;
  });
  ipcMain.handle(IPC.saveSettings, (_e, patch: PersistedSettings) => settings.save(patch));
  ipcMain.handle(IPC.getSavedSkin, () => {
    const skin = settings.loadSkin();
    // hand the renderer a fresh ArrayBuffer, not a Node Buffer view
    return skin === null
      ? null
      : skin.buffer.slice(skin.byteOffset, skin.byteOffset + skin.byteLength);
  });
  ipcMain.handle(IPC.saveSkin, (_e, data: ArrayBuffer) => settings.saveSkin(new Uint8Array(data)));
}

export function broadcastToWindows(channel: string, getWindows: () => BrowserWindow[]) {
  return (event: unknown): void => {
    for (const win of getWindows()) {
      if (!win.isDestroyed()) win.webContents.send(channel, event);
    }
  };
}
