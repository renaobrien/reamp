/**
 * Electron entry point (plain Electron; the castLabs ECS fork is only
 * needed if API-mode in-app playback ever lands).
 *
 * This boots a placeholder window and the application menu, including the
 * Help > Send Feedback item that opens a prefilled issue on the upstream
 * repo. The Webamp host replaces the placeholder at M2; run tooling
 * (Vite + electron-builder) lands there too.
 */
import { fileURLToPath } from 'node:url';
import { BrowserWindow, Menu, app, shell } from 'electron';
import { collectSystemInfo, formatDiagnostics } from './diagnostics.js';
import { buildFeedbackUrl } from './feedback.js';

function feedbackUrl(): string {
  return buildFeedbackUrl({
    labels: ['feedback'],
    diagnostics: formatDiagnostics({
      appVersion: app.getVersion(),
      mode: 'desktop-control',
      ...collectSystemInfo(),
    }),
  });
}

function buildMenu(): Menu {
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
          click: () => void shell.openExternal(feedbackUrl()),
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
    width: 275 * 2,
    height: 116 * 2, // classic main-window ratio, doubled
    resizable: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  void win.loadFile(fileURLToPath(new URL('../renderer/index.html', import.meta.url)));
}

void app.whenReady().then(() => {
  Menu.setApplicationMenu(buildMenu());
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
