/**
 * Diagnostics block for feedback issues. Facts only, no PII: app version,
 * OS, architecture, active mode, adapter and capture status. Rendered as
 * markdown and shown to the user in the issue draft before anything is
 * submitted.
 */
import { arch, release, type } from 'node:os';

export interface Diagnostics {
  appVersion: string;
  mode: 'desktop-control' | 'api';
  os: string;
  arch: string;
  /** e.g. "granted", "denied", "not requested" (M1). */
  captureStatus?: string;
  /** One line per adapter, e.g. "spotify: authorized". */
  adapterStatus?: string[];
}

export function collectSystemInfo(): Pick<Diagnostics, 'os' | 'arch'> {
  return { os: `${type()} ${release()}`, arch: arch() };
}

export function formatDiagnostics(d: Diagnostics): string {
  const lines = [
    `- Reamp: ${d.appVersion}`,
    `- Mode: ${d.mode}`,
    `- OS: ${d.os} (${d.arch})`,
  ];
  if (d.captureStatus !== undefined) lines.push(`- Audio capture: ${d.captureStatus}`);
  for (const status of d.adapterStatus ?? []) lines.push(`- Adapter ${status}`);
  return lines.join('\n');
}
