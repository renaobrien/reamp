/**
 * Preload bridge: the only surface the sandboxed renderer sees. Exposes
 * a typed `reamp` API backed by IPC; no Node primitives cross over.
 */
import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC,
  type AppInfo,
  type PersistedSettings,
  type PlayerStateEvent,
  type TransportCommand,
  type VisFrameEvent,
  type VisStateEvent,
} from './shared/ipc.js';

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
  onVisFrame: (cb: (frame: VisFrameEvent) => void): void => {
    ipcRenderer.on(IPC.visFrame, (_e, frame: VisFrameEvent) => cb(frame));
  },
  getSettings: (): Promise<PersistedSettings> => ipcRenderer.invoke(IPC.getSettings),
  saveSettings: (patch: PersistedSettings): Promise<void> =>
    ipcRenderer.invoke(IPC.saveSettings, patch),
  getSavedSkin: (): Promise<ArrayBuffer | null> => ipcRenderer.invoke(IPC.getSavedSkin),
  saveSkin: (data: ArrayBuffer): Promise<void> => ipcRenderer.invoke(IPC.saveSkin, data),
  onVisState: (cb: (event: VisStateEvent) => void): void => {
    ipcRenderer.on(IPC.visState, (_e, event: VisStateEvent) => cb(event));
  },
  getVisState: (): Promise<VisStateEvent> => ipcRenderer.invoke(IPC.getVisState),
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(IPC.getAppInfo),
  sendFeedback: (): Promise<void> => ipcRenderer.invoke(IPC.sendFeedback),
};

export type ReampApi = typeof api;

contextBridge.exposeInMainWorld('reamp', api);
