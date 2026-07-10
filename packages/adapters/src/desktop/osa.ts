/**
 * Shared plumbing for the desktop-control adapters, which drive the
 * official Spotify and Music apps on macOS via AppleScript instead of the
 * service APIs. No client ID, no tokens, no Premium requirement; the only
 * prerequisites are the official apps installed and signed in.
 *
 * The runner is injected so adapters stay testable off-macOS. The real
 * implementation (apps/desktop/src/main/osascript.ts) shells out to
 * `osascript`.
 */

export type OsaRunner = (script: string) => Promise<string>;

/**
 * Field and record separators used inside AppleScript output
 * (`character id 31` / `character id 30`), so track names containing
 * commas or newlines cannot break parsing.
 */
export const FIELD_SEP = '\u001F';
export const RECORD_SEP = '\u001E';

/** AppleScript guard: bail out without auto-launching the app. */
export function notRunningGuard(appName: string): string {
  return [
    'tell application "System Events"',
    `  if not (exists process "${appName}") then return "not-running"`,
    'end tell',
  ].join('\n');
}

export function splitFields(record: string, expected: number, context: string): string[] {
  const fields = record.split(FIELD_SEP);
  if (fields.length !== expected) {
    throw new Error(`${context}: expected ${expected} fields, got ${fields.length}`);
  }
  return fields;
}

export function splitRecords(output: string): string[] {
  return output.split(RECORD_SEP).filter((r) => r.length > 0);
}

/** Only allow characters that can never escape an AppleScript string literal. */
export function sanitizeForScript(value: string, what: string): string {
  if (!/^[A-Za-z0-9:_-]+$/.test(value)) {
    throw new Error(`unsafe ${what} for AppleScript interpolation: ${JSON.stringify(value)}`);
  }
  return value;
}

export function parseBool(field: string): boolean {
  return field === 'true';
}

export function clampVolume(pct: number): number {
  return Math.max(0, Math.min(100, Math.round(pct)));
}

export class AppNotRunningError extends Error {
  constructor(appName: string) {
    super(`${appName} is not running; launch it (or let Nostalgia launch it) first`);
    this.name = 'AppNotRunningError';
  }
}

export class NotSupportedInDesktopModeError extends Error {
  constructor(what: string, hint: string) {
    super(`${what} is not available in desktop-control mode; ${hint}`);
    this.name = 'NotSupportedInDesktopModeError';
  }
}

/** Throw if a transport script hit the not-running guard. */
export function expectRunning(output: string, appName: string): string {
  if (output === 'not-running') throw new AppNotRunningError(appName);
  return output;
}
