import { describe, expect, it } from 'vitest';
import { checkForUpdates, compareVersions, type FetchLike } from '../src/main/update-check.js';

function fakeFetch(routes: Record<string, { status: number; body?: unknown }>): FetchLike {
  return (url) => {
    for (const [suffix, res] of Object.entries(routes)) {
      if (url.endsWith(suffix)) {
        return Promise.resolve({
          ok: res.status >= 200 && res.status < 300,
          status: res.status,
          json: () => Promise.resolve(res.body ?? {}),
        });
      }
    }
    return Promise.reject(new Error(`unrouted: ${url}`));
  };
}

const BASE = { repo: 'renaobrien/reamp', currentVersion: '0.2.0', currentCommit: 'abc1234' };

describe('compareVersions', () => {
  it('orders dotted versions numerically, not lexically', () => {
    expect(compareVersions('0.10.0', '0.9.1')).toBeGreaterThan(0);
    expect(compareVersions('v0.3.0', '0.2.0')).toBeGreaterThan(0);
    expect(compareVersions('0.2.0', '0.2')).toBe(0);
    expect(compareVersions('0.1.9', '0.2.0')).toBeLessThan(0);
  });
});

describe('checkForUpdates', () => {
  it('prefers a newer packaged release', async () => {
    const info = await checkForUpdates({
      ...BASE,
      fetcher: fakeFetch({
        '/releases/latest': {
          status: 200,
          body: { tag_name: 'v0.3.0', html_url: 'https://github.com/renaobrien/reamp/releases/tag/v0.3.0' },
        },
      }),
    });
    expect(info.status).toBe('update-available');
    expect(info.kind).toBe('release');
    expect(info.latest).toBe('v0.3.0');
    expect(info.url).toContain('/releases/');
  });

  it('falls through to a commit compare when no release is newer', async () => {
    const info = await checkForUpdates({
      ...BASE,
      fetcher: fakeFetch({
        '/releases/latest': { status: 404 },
        '/commits/main': { status: 200, body: { sha: 'fff9999aaaa' } },
      }),
    });
    expect(info.status).toBe('update-available');
    expect(info.kind).toBe('source');
    expect(info.latest).toBe('fff9999');
    expect(info.detail).toContain('git pull');
  });

  it('reports up to date when main matches the build commit', async () => {
    const info = await checkForUpdates({
      ...BASE,
      fetcher: fakeFetch({
        '/releases/latest': { status: 404 },
        '/commits/main': { status: 200, body: { sha: 'abc1234def5678' } },
      }),
    });
    expect(info.status).toBe('up-to-date');
  });

  it('cannot compare an unstamped dev build', async () => {
    const info = await checkForUpdates({
      ...BASE,
      currentCommit: 'dev',
      fetcher: fakeFetch({ '/releases/latest': { status: 404 } }),
    });
    expect(info.status).toBe('unknown');
    expect(info.detail).toContain('commit stamp');
  });

  it('degrades to unknown when GitHub is unreachable', async () => {
    const info = await checkForUpdates({
      ...BASE,
      fetcher: () => Promise.reject(new Error('offline')),
    });
    expect(info.status).toBe('unknown');
    expect(info.detail).toContain('offline');
  });

  it('degrades to unknown on a rate-limited commit lookup', async () => {
    const info = await checkForUpdates({
      ...BASE,
      fetcher: fakeFetch({
        '/releases/latest': { status: 404 },
        '/commits/main': { status: 403 },
      }),
    });
    expect(info.status).toBe('unknown');
    expect(info.detail).toContain('403');
  });
});
