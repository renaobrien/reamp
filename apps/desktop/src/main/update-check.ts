/**
 * Update check against GitHub, no server of our own (CLAUDE.md rule 5).
 * Two signals, in order: a packaged release newer than this version
 * (once notarized releases exist), else a commit on main newer than the
 * one this build was made from. True background auto-update needs signed
 * builds, so until notarization lands this reports and points, and the
 * renderer walks the user through the rest.
 */
import type { UpdateInfo } from '../shared/ipc.js';

export interface FetchLike {
  (url: string, init?: { headers?: Record<string, string> }): Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
  }>;
}

export interface UpdateCheckOptions {
  /** owner/name */
  repo: string;
  currentVersion: string;
  /** Short commit sha from build-info.json; 'dev' when built ad hoc. */
  currentCommit: string;
  fetcher?: FetchLike;
}

const HEADERS = {
  accept: 'application/vnd.github+json',
  'user-agent': 'reamp-update-check',
};

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

/** The zip electron-builder makes for this machine: mac zips carry
 * "-mac" and Apple Silicon ones carry "arm64" in the file name. */
export function pickMacZipAsset(
  assets: ReleaseAsset[],
  arch: string = process.arch,
): ReleaseAsset | undefined {
  const macZips = assets.filter((a) => a.name.endsWith('.zip') && a.name.includes('mac'));
  return macZips.find((a) => a.name.includes('arm64') === (arch === 'arm64'));
}

/** Compare dotted versions numerically; tolerates a leading v. Returns
 * >0 when a is newer, 0 when equal, <0 when older. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): number[] =>
    v
      .replace(/^v/i, '')
      .split('.')
      .map((part) => Number.parseInt(part, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export async function checkForUpdates(options: UpdateCheckOptions): Promise<UpdateInfo> {
  const { repo, currentVersion, currentCommit } = options;
  const fetcher = options.fetcher ?? (fetch as unknown as FetchLike);
  const api = `https://api.github.com/repos/${repo}`;
  const current = `${currentVersion} (${currentCommit})`;

  try {
    // Packaged releases win when they exist: that path needs no toolchain.
    const releaseRes = await fetcher(`${api}/releases/latest`, { headers: HEADERS });
    if (releaseRes.ok) {
      const release = (await releaseRes.json()) as {
        tag_name?: string;
        html_url?: string;
        assets?: ReleaseAsset[];
      };
      const tag = release.tag_name ?? '';
      if (tag.length > 0) {
        const releaseUrl = release.html_url ?? `https://github.com/${repo}/releases/latest`;
        if (compareVersions(tag, currentVersion) > 0) {
          return {
            status: 'update-available',
            current,
            latest: tag,
            kind: 'release',
            detail: 'A packaged release is ready.',
            url: releaseUrl,
            downloadUrl: pickMacZipAsset(release.assets ?? [])?.browser_download_url,
          };
        }
        // A packaged release exists and this build is already at or past
        // it: that is the authoritative answer. Stop here rather than fall
        // through to the main-commit comparison below, which only makes
        // sense for source checkouts with no release. Otherwise every merge
        // to main (a new merge commit that differs from the commit this
        // release was built from) would nag a released build to "git pull".
        return { status: 'up-to-date', current, url: releaseUrl };
      }
    }

    // No packaged release to compare against: for a source checkout, fall
    // back to comparing the build commit against main.
    if (currentCommit === 'dev' || currentCommit.length === 0) {
      return {
        status: 'unknown',
        current,
        detail: 'This build has no commit stamp; rebuild with pnpm build to enable checks.',
        url: `https://github.com/${repo}`,
      };
    }
    const commitRes = await fetcher(`${api}/commits/main`, { headers: HEADERS });
    if (!commitRes.ok) {
      return {
        status: 'unknown',
        current,
        detail: `GitHub answered ${commitRes.status}; try again later.`,
        url: `https://github.com/${repo}`,
      };
    }
    const head = (await commitRes.json()) as { sha?: string };
    const sha = head.sha ?? '';
    if (sha.length > 0 && !sha.startsWith(currentCommit)) {
      return {
        status: 'update-available',
        current,
        latest: sha.slice(0, 7),
        kind: 'source',
        detail: 'Newer code is on main. In the repo folder: git pull, pnpm install, pnpm dist.',
        url: `https://github.com/${repo}`,
      };
    }
    return { status: 'up-to-date', current, url: `https://github.com/${repo}` };
  } catch (err) {
    return {
      status: 'unknown',
      current,
      detail: `Could not reach GitHub: ${err instanceof Error ? err.message : String(err)}`,
      url: `https://github.com/${repo}`,
    };
  }
}
