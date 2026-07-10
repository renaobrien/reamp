/**
 * Binds the AdapterHost to ipcMain and forwards player-state events to
 * the renderer. Kept separate from index.ts so the wiring is one screen
 * of code with no logic worth testing beyond AdapterHost's own tests.
 */
import { type BrowserWindow, ipcMain } from 'electron';
import type { SourceId } from '@reamp/adapters';
import { IPC, type TransportCommand } from '../shared/ipc.js';
import type { AdapterHost } from './adapter-host.js';

export function registerIpc(host: AdapterHost): void {
  ipcMain.handle(IPC.transport, (_e, cmd: TransportCommand) => host.transport(cmd));
  ipcMain.handle(IPC.setSource, (_e, id: SourceId) => host.setSource(id));
  ipcMain.handle(IPC.getSource, () => host.getSource());
  ipcMain.handle(IPC.auth, () => host.auth());
  ipcMain.handle(IPC.getPlaylists, () => host.getPlaylists());
  ipcMain.handle(IPC.getPlaylistTracks, (_e, id: string) => host.getPlaylistTracks(id));
}

export function broadcastToWindows(getWindows: () => BrowserWindow[]) {
  return (event: unknown): void => {
    for (const win of getWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC.playerState, event);
    }
  };
}
