/**
 * Electron entry point (plain Electron; the castLabs ECS fork is only
 * needed if API-mode in-app playback ever lands).
 *
 * Wires the desktop-control adapters into the IPC layer, boots the
 * transport-strip window (Webamp host replaces it later in M2), and owns
 * the application menu including Help > Send Feedback.
 *
 * Runs from the esbuild bundle: dist/main/index.cjs, preload at
 * dist/preload.cjs, renderer at dist/renderer/.
 */
import { join } from 'node:path';
import { BrowserWindow, Menu, app, shell } from 'electron';
import { MusicDesktopAdapter, SpotifyDesktopAdapter } from '@reamp/adapters';
import { AdapterHost } from './adapter-host.js';
import { collectSystemInfo, formatDiagnostics } from './diagnostics.js';
import { buildFeedbackUrl } from './feedback.js';
import { runOsaScript } from './osascript.js';
import { broadcastToWindows, registerIpc } from './register-ipc.js';
import { IPC } from '../shared/ipc.js';
import { VisService } from './vis-service.js';

/**
 * The real SCK binary when REAMP_SIDECAR_BIN points at one; otherwise the
 * mock sidecar (same wire protocol, synthetic audio) run through our own
 * executable in Node mode, so the vis pipeline works on any machine.
 */
function resolveSidecar(): { binaryPath: string; args: string[]; env?: NodeJS.ProcessEnv } {
  const real = process.env['REAMP_SIDECAR_BIN'];
  if (real !== undefined && real.length > 0) return { binaryPath: real, args: [] };
  return {
    binaryPath: process.execPath,
    args: [join(__dirname, '../../sidecar-mock/mock-sidecar.mjs')],
    env: { ELECTRON_RUN_AS_NODE: '1' },
  };
}

function feedbackUrl(host: AdapterHost): string {
  return buildFeedbackUrl({
    labels: ['feedback'],
    diagnostics: formatDiagnostics({
      appVersion: app.getVersion(),
      mode: 'desktop-control',
      adapterStatus: [`active: ${host.getSource()}`],
      ...collectSystemInfo(),
    }),
  });
}

function buildMenu(host: AdapterHost): Menu {
  return Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'Send Feedback…',
          click: () => void shell.openExternal(feedbackUrl(host)),
        },
        {
          label: 'Winamp Skin Museum',
          click: () => void shell.openExternal('https://skins.webamp.org'),
        },
      ],
    },
  ]);
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 660,
    height: 640,
    minWidth: 640,
    minHeight: 480,
    title: 'Reamp',
    backgroundColor: '#0b0b12',
    // Clean chrome on macOS (traffic lights over our drag strip);
    // ignored on other platforms.
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  void win.loadFile(join(__dirname, '../renderer/index.html'));
}

void app.whenReady().then(() => {
  const windows = (): BrowserWindow[] => BrowserWindow.getAllWindows();
  const host = new AdapterHost({
    adapters: {
      spotify: new SpotifyDesktopAdapter({ runOsaScript }),
      'apple-music': new MusicDesktopAdapter({ runOsaScript }),
    },
    initialSource: 'spotify',
    broadcast: broadcastToWindows(IPC.playerState, windows),
  });
  registerIpc(host);

  const vis = new VisService({
    ...resolveSidecar(),
    broadcast: broadcastToWindows(IPC.visFrame, windows),
  });
  vis.start();
  app.on('will-quit', () => vis.stop());

  Menu.setApplicationMenu(buildMenu(host));
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
