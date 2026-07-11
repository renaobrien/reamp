/**
 * Serves the built renderer over 127.0.0.1 instead of file://.
 *
 * Why: Chromium blocks ES-module scripts loaded from file:// with CORS
 * errors (origin "null"), which silently killed the code-split chunks
 * (Webamp, the Milkdrop engine, skin-drop) in the packaged app. A tiny
 * loopback static server gives the renderer a real origin, so modules,
 * dynamic imports, and CSP 'self' all behave like the verified browser
 * build. Binds to 127.0.0.1 only, serves exactly one directory read-only,
 * rejects path traversal, and dies with the app.
 */
import { createServer, type Server } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wsz': 'application/zip',
  '.woff2': 'font/woff2',
};

export interface RendererServer {
  /** e.g. http://127.0.0.1:53211 (no trailing slash) */
  url: string;
  close(): void;
}

export function serveRenderer(dir: string, port = 0): Promise<RendererServer> {
  const root = resolve(dir);

  const server: Server = createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    const rel = pathname === '/' ? '/index.html' : pathname;
    const file = resolve(join(root, normalize(rel)));
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    if (!existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(file).pipe(res);
  });

  return new Promise((resolvePromise, rejectPromise) => {
    server.on('error', rejectPromise);
    server.listen(port, '127.0.0.1', () => {
      const address = server.address() as { port: number };
      resolvePromise({
        url: `http://127.0.0.1:${address.port}`,
        close: () => server.close(),
      });
    });
  });
}
