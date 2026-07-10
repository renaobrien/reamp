import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { waitForOAuthCallback } from '../src/main/oauth/loopback-server.js';

/** Grab an ephemeral port the OS considers free. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });
}

describe('waitForOAuthCallback', () => {
  it('resolves with the code from a valid callback', async () => {
    const port = await freePort();
    const pending = waitForOAuthCallback({ port, state: 'xyz' });
    const res = await fetch(`http://127.0.0.1:${port}/callback?code=abc123&state=xyz`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('close this tab');
    await expect(pending).resolves.toEqual({ code: 'abc123' });
  });

  it('rejects on state mismatch (CSRF guard)', async () => {
    const port = await freePort();
    // attach the rejection handler before triggering the callback so the
    // rejection is never momentarily unhandled
    const assertion = expect(
      waitForOAuthCallback({ port, state: 'expected' }),
    ).rejects.toThrow(/state mismatch/);
    const res = await fetch(`http://127.0.0.1:${port}/callback?code=abc&state=evil`);
    expect(res.status).toBe(400);
    await assertion;
  });

  it('rejects when the service reports an error', async () => {
    const port = await freePort();
    const assertion = expect(waitForOAuthCallback({ port, state: 's' })).rejects.toThrow(
      /access_denied/,
    );
    await fetch(`http://127.0.0.1:${port}/callback?error=access_denied&state=s`);
    await assertion;
  });

  it('404s other paths without settling', async () => {
    const port = await freePort();
    const pending = waitForOAuthCallback({ port, state: 's' });
    const res = await fetch(`http://127.0.0.1:${port}/favicon.ico`);
    expect(res.status).toBe(404);
    await fetch(`http://127.0.0.1:${port}/callback?code=late&state=s`);
    await expect(pending).resolves.toEqual({ code: 'late' });
  });

  it('times out when nothing calls back', async () => {
    const port = await freePort();
    await expect(waitForOAuthCallback({ port, state: 's', timeoutMs: 50 })).rejects.toThrow(
      /Timed out/,
    );
  });
});
