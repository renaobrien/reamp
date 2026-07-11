// Stamps dist/build-info.json with the commit this build came from, so
// the packaged app can compare itself against main for update checks.
// Runs before the esbuild/vite steps; never fails the build.
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

let commit = 'dev';
try {
  commit = execSync('git rev-parse --short HEAD', { cwd: appRoot, encoding: 'utf8' }).trim();
} catch {
  // not a git checkout (e.g. a source tarball); 'dev' disables the check
}

mkdirSync(join(appRoot, 'dist'), { recursive: true });
writeFileSync(
  join(appRoot, 'dist/build-info.json'),
  `${JSON.stringify({ commit, builtAt: new Date().toISOString() }, null, 2)}\n`,
);
console.log(`build-info: ${commit}`);
