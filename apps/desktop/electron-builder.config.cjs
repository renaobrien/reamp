// Packaging config (M4). Everything the renderer and main need is
// bundled into dist/ by vite/esbuild, so node_modules stays out of the
// package entirely. The Swift capture sidecar rides along as an app
// resource when it has been built; otherwise the app falls back to the
// mock sidecar and says so in Settings.
//
// Notarization needs an Apple Developer ID and is intentionally not
// configured yet; unsigned local builds are fine for personal use
// (right-click > Open on first launch).
const { existsSync } = require('node:fs');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');

const sidecarBinary = join(__dirname, 'sidecar', '.build', 'release', 'capture-sidecar');

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.renaobrien.reamp',
  productName: 'Reamp',
  directories: { output: 'release' },
  files: ['dist/**/*', 'sidecar-mock/**/*', 'package.json', '!node_modules/**/*'],
  extraResources: existsSync(sidecarBinary)
    ? [{ from: sidecarBinary, to: 'capture-sidecar' }]
    : [],
  mac: {
    category: 'public.app-category.music',
    target: [{ target: 'dmg' }, { target: 'zip' }],
    darkModeSupport: true,
    icon: 'build/icon.png',
  },
  npmRebuild: false,
  // Ad-hoc sign the mac app so its first launch shows the bypassable
  // "unverified developer" prompt (right-click > Open) instead of the
  // scary "damaged" error on Apple Silicon. There is no Developer ID to
  // notarize with yet; this is best effort and never fails the build.
  afterPack: async (context) => {
    if (context.electronPlatformName !== 'darwin') return;
    try {
      const appName = context.packager.appInfo.productFilename;
      const appPath = join(context.appOutDir, `${appName}.app`);
      execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
      console.log(`ad-hoc signed ${appName}.app`);
    } catch (err) {
      console.warn(`ad-hoc signing skipped: ${err.message}`);
    }
  },
};
