import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Logger } from '../src/main/logger.js';

describe('Logger', () => {
  it('appends timestamped lines', () => {
    const logger = new Logger(mkdtempSync(join(tmpdir(), 'reamp-log-')));
    logger.log('main', 'hello');
    logger.log('renderer:error', 'kaboom');
    const text = readFileSync(logger.logFile, 'utf8');
    expect(text).toMatch(/\[main\] hello\n/);
    expect(text).toMatch(/\[renderer:error\] kaboom\n/);
    expect(text).toMatch(/^\d{4}-\d{2}-\d{2}T/m);
  });

  it('truncates instead of growing forever', () => {
    const logger = new Logger(mkdtempSync(join(tmpdir(), 'reamp-log-')));
    const big = 'x'.repeat(1024 * 1024);
    for (let i = 0; i < 6; i++) logger.log('main', big);
    expect(statSync(logger.logFile).size).toBeLessThan(2 * 1024 * 1024);
    expect(readFileSync(logger.logFile, 'utf8')).toContain('log truncated');
  });

  it('routes console-message events into the file', () => {
    const logger = new Logger(mkdtempSync(join(tmpdir(), 'reamp-log-')));
    let handler: ((e: unknown, level: number, message: string) => void) | null = null;
    logger.captureWebContents(
      { on: (_event, cb) => { handler = cb; } },
      'renderer',
    );
    handler!(null, 3, 'WebGL2 unavailable');
    expect(readFileSync(logger.logFile, 'utf8')).toContain('[renderer:error] WebGL2 unavailable');
  });
});
