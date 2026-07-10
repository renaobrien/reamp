/**
 * Preload bridge: the only surface the sandboxed renderer sees. Exposes
 * a typed `reamp` API backed by IPC; no Node primitives cross over.
 */
import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type PlayerStateEvent, type TransportCommand } from './shared/ipc.js';

const api = {
  transport: (cmd: TransportCommand): Promise<void> => ipcRenderer.invoke(IPC.transport, cmd),
  setSource: (id: string): Promise<unknown> => ipcRenderer.invoke(IPC.setSource, id),
  getSource: (): Promise<string> => ipcRenderer.invoke(IPC.getSource),
  auth: (): Promise<unknown> => ipcRenderer.invoke(IPC.auth),
  getPlaylists: (): Promise<unknown> => ipcRenderer.invoke(IPC.getPlaylists),
  getPlaylistTracks: (id: string): Promise<unknown> =>
    ipcRenderer.invoke(IPC.getPlaylistTracks, id),
  onPlayerState: (cb: (event: PlayerStateEvent) => void): void => {
    ipcRenderer.on(IPC.playerState, (_e, event: PlayerStateEvent) => cb(event));
  },
};

export type ReampApi = typeof api;

contextBridge.exposeInMainWorld('reamp', api);
