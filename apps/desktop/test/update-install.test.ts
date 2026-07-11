import { describe, expect, it } from 'vitest';
import { pickMacZipAsset } from '../src/main/update-check.js';
import { bundlePathFromExec, installBlocker } from '../src/main/update-install.js';

const ASSETS = [
  { name: 'Reamp-0.2.1-arm64-mac.zip', browser_download_url: 'https://x/arm64.zip' },
  { name: 'Reamp-0.2.1-mac.zip', browser_download_url: 'https://x/x64.zip' },
  { name: 'Reamp-0.2.1-arm64.dmg', browser_download_url: 'https://x/arm64.dmg' },
  { name: 'Reamp-0.2.1.dmg', browser_download_url: 'https://x/x64.dmg' },
];

describe('pickMacZipAsset', () => {
  it('picks the zip matching the machine architecture', () => {
    expect(pickMacZipAsset(ASSETS, 'arm64')?.browser_download_url).toBe('https://x/arm64.zip');
    expect(pickMacZipAsset(ASSETS, 'x64')?.browser_download_url).toBe('https://x/x64.zip');
  });

  it('returns undefined when the release has no usable zip', () => {
    expect(pickMacZipAsset([{ name: 'source.tar.gz', browser_download_url: 'u' }], 'arm64')).toBeUndefined();
    expect(pickMacZipAsset([], 'arm64')).toBeUndefined();
  });
});

describe('bundlePathFromExec', () => {
  it('walks up from the executable to the .app bundle', () => {
    expect(bundlePathFromExec('/Applications/Reamp.app/Contents/MacOS/Reamp')).toBe(
      '/Applications/Reamp.app',
    );
  });

  it('returns null outside a bundle (dev runs)', () => {
    expect(bundlePathFromExec('/usr/local/bin/electron')).toBeNull();
  });
});

describe('installBlocker', () => {
  const ok = {
    platform: 'darwin',
    isPackaged: true,
    bundlePath: '/Applications/Reamp.app',
  };

  it('allows a packaged mac app in a normal location', () => {
    expect(installBlocker(ok)).toBeNull();
  });

  it('blocks non-mac, dev runs, and translocated apps with reasons', () => {
    expect(installBlocker({ ...ok, platform: 'linux' })).toContain('macOS');
    expect(installBlocker({ ...ok, isPackaged: false })).toContain('source');
    expect(installBlocker({ ...ok, bundlePath: null })).toContain('bundle');
    expect(
      installBlocker({
        ...ok,
        bundlePath: '/private/var/folders/x/AppTranslocation/y/d/Reamp.app',
      }),
    ).toContain('Applications');
  });
});
