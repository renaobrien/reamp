/**
 * In-place self-update for the packaged mac app: download the release
 * zip, unpack it with ditto (which preserves the bundle's symlinks and
 * permissions, unlike most Node unzip code), swap our own .app bundle,
 * and relaunch. The download happens inside the app, so macOS never
 * stamps a quarantine attribute and Gatekeeper does not re-prompt.
 *
 * Every guard failure is a reason string, not a throw: the caller falls
 * back to opening the release page, which always works.
 */
import { spawn } from 'node:child_process';
import { constants, createWriteStream } from 'node:fs';
import { access, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { dirname, join } from 'node:path';

export type ProgressFn = (phase: string, pct?: number) => void;

/** .app bundle root from the running executable path
 * (Reamp.app/Contents/MacOS/Reamp -> Reamp.app). */
export function bundlePathFromExec(execPath: string): string | null {
  const marker = '.app/Contents/MacOS/';
  const at = execPath.indexOf(marker);
  if (at === -1) return null;
  return execPath.slice(0, at + '.app'.length);
}

/** Why an in-place install cannot run here, or null when it can. */
export function installBlocker(opts: {
  platform: string;
  isPackaged: boolean;
  bundlePath: string | null;
}): string | null {
  if (opts.platform !== 'darwin') return 'in-place install is macOS only';
  if (!opts.isPackaged) return 'running from source; update with git pull and pnpm dist';
  if (opts.bundlePath === null) return 'cannot locate the app bundle';
  if (opts.bundlePath.includes('/AppTranslocation/')) {
    return 'macOS is running the app from a temporary location; move Reamp to Applications first';
  }
  return null;
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}: ${stderr.slice(0, 300)}`));
    });
  });
}

export interface InstallOptions {
  downloadUrl: string;
  bundlePath: string;
  /** Scratch space, wiped and recreated (userData/update-staging). */
  stagingDir: string;
  onProgress: ProgressFn;
}

/** Download, unpack, verify, swap, done. Throws on failure; the old
 * bundle is restored if the swap itself goes wrong. */
export async function downloadAndInstall(opts: InstallOptions): Promise<void> {
  const { downloadUrl, bundlePath, stagingDir, onProgress } = opts;
  await rm(stagingDir, { recursive: true, force: true });
  await mkdir(stagingDir, { recursive: true });

  onProgress('downloading', 0);
  const res = await fetch(downloadUrl, {
    headers: { 'user-agent': 'reamp-updater' },
    redirect: 'follow',
  });
  if (!res.ok || res.body === null) throw new Error(`download failed: HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length') ?? 0);
  let seen = 0;
  const zipPath = join(stagingDir, 'update.zip');
  const counter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      seen += chunk.length;
      if (total > 0) onProgress('downloading', Math.round((seen / total) * 100));
      cb(null, chunk);
    },
  });
  await pipeline(
    Readable.fromWeb(res.body as import('stream/web').ReadableStream),
    counter,
    createWriteStream(zipPath),
  );

  onProgress('unpacking');
  const extractDir = join(stagingDir, 'extract');
  await mkdir(extractDir, { recursive: true });
  await run('/usr/bin/ditto', ['-x', '-k', zipPath, extractDir]);

  const apps = (await readdir(extractDir)).filter((name) => name.endsWith('.app'));
  if (apps.length !== 1) throw new Error(`expected one .app in the zip, found ${apps.length}`);
  const newBundle = join(extractDir, apps[0]!);
  await stat(join(newBundle, 'Contents', 'Info.plist')); // sanity: it is a bundle

  onProgress('installing');
  await access(dirname(bundlePath), constants.W_OK); // can we swap at all?
  const backup = join(stagingDir, 'previous.app');
  // /bin/mv handles cross-volume moves; fs.rename does not
  await run('/bin/mv', [bundlePath, backup]);
  try {
    await run('/bin/mv', [newBundle, bundlePath]);
  } catch (err) {
    await run('/bin/mv', [backup, bundlePath]).catch(() => {}); // roll back
    throw err;
  }
  onProgress('relaunching');
}
