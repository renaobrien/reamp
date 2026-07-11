import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { serveRenderer, type RendererServer } from '../src/main/renderer-server.js';

const parent = mkdtempSync(join(tmpdir(), 'reamp-server-'));
const dir = join(parent, 'site');
mkdirSync(dir);
writeFileSync(join(dir, 'index.html'), '<h1>hi</h1>');
mkdirSync(join(dir, 'assets'));
writeFileSync(join(dir, 'assets', 'main.js'), 'export const x = 1;');
writeFileSync(join(parent, 'secret.txt'), 'nope'); // outside the served root

const servers: RendererServer[] = [];
afterAll(() => {
  for (const s of servers) s.close();
});

async function boot(): Promise<RendererServer> {
  const s = await serveRenderer(dir);
  servers.push(s);
  return s;
}

describe('serveRenderer', () => {
  it('serves files with correct content types', async () => {
    const s = await boot();
    const html = await fetch(`${s.url}/index.html`);
    expect(html.status).toBe(200);
    expect(html.headers.get('content-type')).toContain('text/html');
    expect(await html.text()).toBe('<h1>hi</h1>');

    const js = await fetch(`${s.url}/assets/main.js`);
    expect(js.headers.get('content-type')).toContain('text/javascript');
  });

  it('maps / to index.html', async () => {
    const s = await boot();
    expect(await (await fetch(`${s.url}/`)).text()).toBe('<h1>hi</h1>');
  });

  it('404s missing files and 405s non-GET', async () => {
    const s = await boot();
    expect((await fetch(`${s.url}/nope.js`)).status).toBe(404);
    expect((await fetch(`${s.url}/index.html`, { method: 'POST' })).status).toBe(405);
  });

  it('blocks path traversal out of the served directory', async () => {
    const s = await boot();
    // encoded forms reach the server unnormalized (fetch flattens raw /../)
    for (const attempt of [
      '/%2e%2e/secret.txt',
      '/..%2fsecret.txt',
      '/assets/%2e%2e/%2e%2e/secret.txt',
    ]) {
      const res = await fetch(`${s.url}${attempt}`);
      expect([403, 404]).toContain(res.status);
      expect(await res.text()).not.toContain('nope');
    }
  });

  it('binds to 127.0.0.1 with an ephemeral port', async () => {
    const s = await boot();
    expect(s.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });
});
