/**
 * One-shot OAuth loopback server (spec §2, §4).
 *
 * Lives in the Electron main process. The system browser is opened to the
 * authorize URL; the redirect lands on http://127.0.0.1:<port>/callback,
 * we capture the code, show a "you can close this tab" page, and shut the
 * server down. Binds strictly to 127.0.0.1, Spotify rejects `localhost`
 * loopback URIs and we never listen on external interfaces.
 */
import { createServer, type Server } from 'node:http';

export interface LoopbackOptions {
  /** Port to bind. Must match the redirect URI registered with the service. */
  port: number;
  /** Path component of the redirect URI. */
  callbackPath?: string;
  /** Expected `state` value; mismatches are rejected. */
  state: string;
  /** Abort waiting after this many ms. */
  timeoutMs?: number;
}

export interface LoopbackResult {
  code: string;
}

const CLOSE_PAGE = `<!doctype html><meta charset="utf-8"><title>Nostalgia</title>
<body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0">
<p>Nostalgia is connected. You can close this tab and get back to the llama.</p></body>`;

/** Start listening and resolve with the authorization code from the first valid callback. */
export function waitForOAuthCallback(opts: LoopbackOptions): Promise<LoopbackResult> {
  const { port, callbackPath = '/callback', state, timeoutMs = 5 * 60_000 } = opts;

  return new Promise<LoopbackResult>((resolve, reject) => {
    let settled = false;
    const server: Server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
      if (url.pathname !== callbackPath) {
        res.writeHead(404).end();
        return;
      }
      const error = url.searchParams.get('error');
      const code = url.searchParams.get('code');
      const gotState = url.searchParams.get('state');

      if (gotState !== state) {
        res.writeHead(400, { 'content-type': 'text/plain' }).end('state mismatch');
        finish(new Error('OAuth callback state mismatch'));
        return;
      }
      if (error !== null || code === null) {
        res.writeHead(400, { 'content-type': 'text/plain' }).end(`authorization failed: ${error ?? 'missing code'}`);
        finish(new Error(`Authorization failed: ${error ?? 'missing code'}`));
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(CLOSE_PAGE);
      finish(null, { code });
    });

    const timer = setTimeout(
      () => finish(new Error(`Timed out waiting for OAuth callback after ${timeoutMs}ms`)),
      timeoutMs,
    );

    function finish(err: Error | null, result?: LoopbackResult): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Give the response a beat to flush before tearing the server down.
      setImmediate(() => server.close());
      if (err) reject(err);
      else resolve(result!);
    }

    server.on('error', (err) => finish(err));
    server.listen(port, '127.0.0.1');
  });
}
