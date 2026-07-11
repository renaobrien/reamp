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
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BrowserWindow, Menu, app, dialog, globalShortcut, ipcMain, screen, shell } from 'electron';
import { MusicDesktopAdapter, SpotifyDesktopAdapter } from '@reamp/adapters';
import { AdapterHost } from './adapter-host.js';
import { collectSystemInfo, formatDiagnostics } from './diagnostics.js';
import { buildFeedbackUrl } from './feedback.js';
import { runOsaScript } from './osascript.js';
import { broadcastToWindows, registerIpc } from './register-ipc.js';
import { IPC, type UpdateInfo, type UpdateProgressEvent } from '../shared/ipc.js';
import { Logger } from './logger.js';
import { serveRenderer, type RendererServer } from './renderer-server.js';
import { SettingsStore } from './settings.js';
import { checkForUpdates } from './update-check.js';
import { bundlePathFromExec, downloadAndInstall, installBlocker } from './update-install.js';
import { VisService } from './vis-service.js';

const REPO = 'renaobrien/reamp';

/** Commit stamped by scripts/write-build-info.mjs at build time. */
function buildCommit(): string {
  try {
    const info = JSON.parse(readFileSync(join(__dirname, '../build-info.json'), 'utf8')) as {
      commit?: string;
    };
    return info.commit ?? 'dev';
  } catch {
    return 'dev';
  }
}

/**
 * The renderer is served over 127.0.0.1, not file://: Chromium blocks
 * ES-module scripts from file:// origins with CORS errors, which
 * silently broke every code-split chunk (Webamp, Milkdrop, skin-drop)
 * in the first on-device run.
 */
let renderer: RendererServer | null = null;
let logger: Logger | null = null;

/**
 * Sidecar resolution order: REAMP_SIDECAR_BIN, then the binary packaged
 * as an app resource, then the mock sidecar (same wire protocol,
 * synthetic audio) run through our own executable in Node mode.
 */
function resolveSidecar(): { binaryPath: string; args: string[]; env?: NodeJS.ProcessEnv } {
  const real = process.env['REAMP_SIDECAR_BIN'];
  if (real !== undefined && real.length > 0) return { binaryPath: real, args: [] };
  const packaged = join(process.resourcesPath ?? '', 'capture-sidecar');
  if (app.isPackaged && existsSync(packaged)) return { binaryPath: packaged, args: [] };
  return {
    binaryPath: process.execPath,
    args: [join(__dirname, '../../sidecar-mock/mock-sidecar.mjs')],
    env: { ELECTRON_RUN_AS_NODE: '1' },
  };
}

/** Latest check result, so openUpdatePage never takes a URL from the
 * renderer; it can only open what the check itself produced. */
let lastUpdate: UpdateInfo | null = null;
let installing = false;
let updateProgress: (event: UpdateProgressEvent) => void = () => {};

/** Kick off the in-place self-update from the last check. Shared by the
 * settings button (over IPC) and the Help menu. */
function startInstall(): { started: boolean; reason?: string } {
  const downloadUrl = lastUpdate?.downloadUrl;
  if (downloadUrl === undefined) {
    return { started: false, reason: 'no packaged download for this machine' };
  }
  const bundlePath = bundlePathFromExec(app.getPath('exe'));
  const blocked = installBlocker({
    platform: process.platform,
    isPackaged: app.isPackaged,
    bundlePath,
  });
  if (blocked !== null) return { started: false, reason: blocked };
  if (installing) return { started: false, reason: 'an update is already installing' };
  installing = true;
  void downloadAndInstall({
    downloadUrl,
    bundlePath: bundlePath!,
    stagingDir: join(app.getPath('userData'), 'update-staging'),
    onProgress: (phase, pct) => {
      logger?.log('update', pct === undefined ? phase : `${phase} ${pct}%`);
      updateProgress({ phase, pct } as UpdateProgressEvent);
    },
  })
    .then(() => {
      logger?.log('update', `installed ${lastUpdate?.latest ?? ''}; relaunching`);
      app.relaunch();
      app.exit(0);
    })
    .catch((err: unknown) => {
      installing = false;
      const error = err instanceof Error ? err.message : String(err);
      logger?.log('update', `install failed: ${error}`);
      updateProgress({ phase: 'failed', error });
    });
  return { started: true };
}

async function runUpdateCheck(): Promise<UpdateInfo> {
  const info = await checkForUpdates({
    repo: REPO,
    currentVersion: app.getVersion(),
    currentCommit: buildCommit(),
  });
  lastUpdate = info;
  logger?.log('update', `${info.status}${info.latest === undefined ? '' : ` -> ${info.latest}`}`);
  return info;
}

function feedbackUrl(host: AdapterHost): string {
  let logTail = '';
  try {
    const text = readFileSync(logger!.logFile, 'utf8');
    logTail = text.slice(-2800);
  } catch {
    logTail = '(no log yet)';
  }
  const diagnostics = [
    formatDiagnostics({
      appVersion: app.getVersion(),
      mode: 'desktop-control',
      adapterStatus: [`active: ${host.getSource()}`],
      ...collectSystemInfo(),
    }),
    '',
    'A screenshot was saved locally and revealed in Finder; drag it into this issue.',
    '',
    'Recent log:',
    '```',
    logTail,
    '```',
  ].join('\n');
  return buildFeedbackUrl({ labels: ['feedback'], diagnostics });
}

/** Screenshot the focused window into the logs folder and reveal it, so
 * "I cannot copy/paste the error" is never the end of the road. */
async function captureFeedbackScreenshot(): Promise<void> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  if (win === undefined || logger === null) return;
  try {
    const image = await win.webContents.capturePage();
    const file = join(
      logger.logFile,
      `../feedback-${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
    );
    writeFileSync(file, image.toPNG());
    shell.showItemInFolder(file);
    logger.log('main', `feedback screenshot saved: ${file}`);
  } catch (err) {
    logger.log('main', `feedback screenshot failed: ${String(err)}`);
  }
}

function buildMenu(host: AdapterHost): Menu {
  return Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    {
      label: 'Vis',
      submenu: [
        {
          label: 'Milkdrop Window',
          accelerator: 'CmdOrCtrl+M',
          click: () => openMilkdropWindow(),
        },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'Send Feedback…',
          click: () => {
            void captureFeedbackScreenshot();
            void shell.openExternal(feedbackUrl(host));
          },
        },
        {
          label: 'Check for Updates…',
          click: () => {
            void runUpdateCheck().then(async (info) => {
              const canInstall =
                info.downloadUrl !== undefined &&
                installBlocker({
                  platform: process.platform,
                  isPackaged: app.isPackaged,
                  bundlePath: bundlePathFromExec(app.getPath('exe')),
                }) === null;
              const buttons =
                info.status !== 'update-available'
                  ? ['OK']
                  : canInstall
                    ? ['Install and Relaunch', 'Later']
                    : ['Open GitHub', 'Later'];
              const { response } = await dialog.showMessageBox({
                type: 'info',
                message:
                  info.status === 'update-available'
                    ? `Update available: ${info.latest ?? ''}`
                    : info.status === 'up-to-date'
                      ? 'Reamp is up to date'
                      : 'Could not check for updates',
                detail: [`Installed: ${info.current}`, info.detail ?? ''].join('\n').trim(),
                buttons,
              });
              if (info.status !== 'update-available' || response !== 0) return;
              if (canInstall) {
                startInstall();
              } else if (info.url !== undefined) {
                void shell.openExternal(info.url);
              }
            });
          },
        },
        {
          label: 'Open Logs Folder',
          click: () => {
            if (logger !== null) shell.showItemInFolder(logger.logFile);
          },
        },
        {
          label: 'Winamp Skin Museum',
          click: () => void shell.openExternal('https://skins.webamp.org'),
        },
      ],
    },
  ]);
}

let milkdropWindow: BrowserWindow | null = null;

/** Detachable Milkdrop window (R7). One instance; refocus if already open. */
function openMilkdropWindow(): void {
  if (milkdropWindow !== null && !milkdropWindow.isDestroyed()) {
    milkdropWindow.focus();
    return;
  }
  milkdropWindow = new BrowserWindow({
    width: 800,
    height: 600,
    title: 'Reamp Milkdrop',
    backgroundColor: '#000000',
    webPreferences: {
      preload: join(__dirname, '../preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  milkdropWindow.on('closed', () => {
    milkdropWindow = null;
  });
  logger?.captureWebContents(milkdropWindow.webContents, 'milkdrop');
  void milkdropWindow.loadURL(`${renderer!.url}/milkdrop.html`);
}

function createWindow(settings: SettingsStore): void {
  const saved = settings.load().windowBounds;
  // first launch: take most of the screen; after that, whatever the user
  // resized to wins (saved on close)
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  const win = new BrowserWindow({
    width: saved?.width ?? Math.min(1400, Math.round(workArea.width * 0.85)),
    height: saved?.height ?? Math.min(1000, Math.round(workArea.height * 0.9)),
    x: saved?.x,
    y: saved?.y,
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
  win.on('close', () => settings.save({ windowBounds: win.getBounds() }));
  logger?.captureWebContents(win.webContents, 'renderer');
  void win.loadURL(`${renderer!.url}/index.html`);
}

void app.whenReady().then(async () => {
  logger = new Logger(app.getPath('userData'));
  logger.log('main', `Reamp ${app.getVersion()} starting (electron ${process.versions.electron})`);
  process.on('uncaughtException', (err) =>
    logger?.log('main:uncaught', String(err instanceof Error ? err.stack : err)),
  );
  process.on('unhandledRejection', (reason) =>
    logger?.log('main:unhandledRejection', String(reason)),
  );

  renderer = await serveRenderer(join(__dirname, '../renderer'));
  const windows = (): BrowserWindow[] => BrowserWindow.getAllWindows();
  const settings = new SettingsStore(app.getPath('userData'));
  const savedSource = settings.load().source;
  const host = new AdapterHost({
    adapters: {
      spotify: new SpotifyDesktopAdapter({ runOsaScript }),
      'apple-music': new MusicDesktopAdapter({ runOsaScript }),
    },
    initialSource: savedSource === 'apple-music' ? 'apple-music' : 'spotify',
    broadcast: broadcastToWindows(IPC.playerState, windows),
  });
  registerIpc(host, settings);

  const sidecar = resolveSidecar();
  let lastVisState: { state: string; detail?: string } = { state: 'idle' };
  const visStateBroadcast = broadcastToWindows(IPC.visState, windows);
  const vis = new VisService({
    ...sidecar,
    broadcast: broadcastToWindows(IPC.visFrame, windows),
    onStateChange: (state, detail) => {
      lastVisState = { state, detail };
      visStateBroadcast(lastVisState);
      logger?.log('sidecar', detail === undefined ? state : `${state}: ${detail}`);
    },
  });
  vis.start();
  ipcMain.handle(IPC.getVisState, () => lastVisState);
  ipcMain.handle(IPC.getAppInfo, () => ({
    version: app.getVersion(),
    commit: buildCommit(),
    mode: 'desktop-control',
    sidecar:
      sidecar.binaryPath === process.execPath
        ? 'built-in demo music (capture helper not installed; see README)'
        : sidecar.binaryPath,
    demoAudio: sidecar.binaryPath === process.execPath,
    logFile: logger?.logFile ?? '',
  }));
  ipcMain.handle(IPC.sendFeedback, () => {
    void captureFeedbackScreenshot();
    return shell.openExternal(feedbackUrl(host));
  });
  ipcMain.handle(IPC.openLogs, () => {
    if (logger !== null) shell.showItemInFolder(logger.logFile);
  });
  ipcMain.handle(IPC.checkUpdate, () => runUpdateCheck());
  ipcMain.handle(IPC.openUpdatePage, () => {
    const url = lastUpdate?.url ?? `https://github.com/${REPO}`;
    return shell.openExternal(url);
  });
  updateProgress = broadcastToWindows(IPC.updateProgress, windows);
  ipcMain.handle(IPC.installUpdate, () => startInstall());
  app.on('will-quit', () => {
    vis.stop();
    renderer?.close();
  });

  // Media keys (P1): forwarded to whatever source is active. Play/pause
  // toggles off the last known state.
  globalShortcut.register('MediaPlayPause', () => {
    const playing = host.getLastState()?.state.playing ?? false;
    void host.transport({ action: playing ? 'pause' : 'play' }).catch(() => {});
  });
  globalShortcut.register('MediaNextTrack', () => {
    void host.transport({ action: 'next' }).catch(() => {});
  });
  globalShortcut.register('MediaPreviousTrack', () => {
    void host.transport({ action: 'previous' }).catch(() => {});
  });
  app.on('will-quit', () => globalShortcut.unregisterAll());

  Menu.setApplicationMenu(buildMenu(host));
  createWindow(settings);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(settings);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
