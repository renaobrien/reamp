/**
 * File logging for field debugging: everything lands in
 * <userData>/logs/reamp.log with timestamps, including renderer console
 * output (forwarded via webContents), main-process errors, and sidecar
 * state changes. Help > Open Logs Folder reveals it; Settings shows the
 * path. Size-capped by truncation so it can never eat a disk.
 */
import { appendFileSync, mkdirSync, statSync, truncateSync } from 'node:fs';
import { join } from 'node:path';

const MAX_LOG_BYTES = 5 * 1024 * 1024;

export class Logger {
  readonly logFile: string;

  constructor(dir: string) {
    const logsDir = join(dir, 'logs');
    mkdirSync(logsDir, { recursive: true });
    this.logFile = join(logsDir, 'reamp.log');
  }

  log(source: string, message: string): void {
    const line = `${new Date().toISOString()} [${source}] ${message}\n`;
    try {
      appendFileSync(this.logFile, line);
      if (statSync(this.logFile).size > MAX_LOG_BYTES) {
        truncateSync(this.logFile, 0);
        appendFileSync(this.logFile, `${new Date().toISOString()} [logger] log truncated at 5MB\n`);
      }
    } catch {
      // logging must never take the app down
    }
  }

  /** Route a window's console output into the file. */
  captureWebContents(contents: {
    on(event: 'console-message', cb: (e: unknown, level: number, message: string) => void): void;
  }, label: string): void {
    contents.on('console-message', (_e, level, message) => {
      const levels = ['debug', 'info', 'warn', 'error'];
      this.log(`${label}:${levels[level] ?? level}`, message);
    });
  }
}
