/**
 * The real OsaRunner for the desktop-control adapters: shells out to
 * /usr/bin/osascript. macOS will show a one-time Automation permission
 * prompt per target app ("Nostalgia wants to control Spotify"); denial
 * surfaces here as an error the settings UI can explain.
 */
import { execFile } from 'node:child_process';

export function runOsaScript(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      '/usr/bin/osascript',
      ['-e', script],
      { timeout: 10_000 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`osascript failed: ${stderr.trim() || err.message}`));
          return;
        }
        resolve(stdout.replace(/\n$/, ''));
      },
    );
  });
}
