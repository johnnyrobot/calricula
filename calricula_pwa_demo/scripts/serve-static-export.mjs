import { createReadStream } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

const OUTPUT_DIRECTORY = path.resolve(process.cwd(), 'out');
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
};
export const STATIC_EXPORT_CSP =
  "default-src 'self'; base-uri 'self'; connect-src 'self' https://challenges.cloudflare.com; font-src 'self'; form-action 'self'; frame-ancestors 'none'; frame-src https://challenges.cloudflare.com; img-src 'self' data: blob:; manifest-src 'self'; object-src 'none'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; worker-src 'self'";

function parsePort(argv) {
  const index = argv.indexOf('--port');
  const value = Number(index >= 0 ? argv[index + 1] : 4178);
  if (
    !Number.isSafeInteger(value) ||
    value < 1_024 ||
    value > 65_535
  ) {
    throw new Error('Static E2E port must be from 1024 to 65535.');
  }
  return value;
}

function commonHeaders() {
  return {
    'Content-Security-Policy': STATIC_EXPORT_CSP,
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), payment=()',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  };
}

function resolveStaticPath(pathname) {
  let relativePath;
  if (pathname === '/') {
    relativePath = 'index.html';
  } else if (pathname.endsWith('/')) {
    relativePath = `${pathname.slice(1)}index.html`;
  } else {
    relativePath = pathname.slice(1);
  }
  const resolved = path.resolve(OUTPUT_DIRECTORY, relativePath);
  if (
    resolved !== OUTPUT_DIRECTORY &&
    !resolved.startsWith(`${OUTPUT_DIRECTORY}${path.sep}`)
  ) {
    return null;
  }
  return resolved;
}

async function existingFile(pathname) {
  const direct = resolveStaticPath(pathname);
  if (!direct) return null;
  try {
    if ((await stat(direct)).isFile()) return direct;
  } catch {
    // Try the canonical static-export HTML shell below.
  }
  if (!path.extname(pathname) && !pathname.endsWith('/')) {
    const html = resolveStaticPath(`${pathname}.html`);
    if (html) {
      try {
        if ((await stat(html)).isFile()) return html;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    ...commonHeaders(),
    'Cache-Control': 'no-store, max-age=0',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(body));
}

async function handleRequest(request, response) {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  if (url.pathname === '/api/health') {
    sendJson(response, 200, {
      success: true,
      data: { status: 'ok', aiEnabled: false },
    });
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    sendJson(response, 404, {
      success: false,
      error: { code: 'NOT_FOUND', message: 'API endpoint not found.' },
    });
    return;
  }

  let filePath = await existingFile(url.pathname);
  let statusCode = 200;
  if (!filePath) {
    filePath = path.join(OUTPUT_DIRECTORY, '404.html');
    statusCode = 404;
  }
  const headers = {
    ...commonHeaders(),
    'Content-Type':
      MIME_TYPES[path.extname(filePath).toLowerCase()] ??
      'application/octet-stream',
  };
  if (url.pathname === '/sw.js') {
    headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    headers['Service-Worker-Allowed'] = '/';
  } else if (url.pathname === '/connectivity.txt') {
    headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
  }
  response.writeHead(statusCode, headers);
  createReadStream(filePath).pipe(response);
}

export async function startStaticExportServer(port) {
  await access(path.join(OUTPUT_DIRECTORY, 'index.html'));
  const server = createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      response.writeHead(500, { 'Content-Type': 'text/plain' });
      response.end(error instanceof Error ? error.message : 'Server error');
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return server;
}

const entryPoint = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : '';
if (import.meta.url === entryPoint) {
  const port = parsePort(process.argv.slice(2));
  startStaticExportServer(port)
    .then(() => {
      console.log(
        `[static-e2e] Serving out at http://127.0.0.1:${port}.`,
      );
    })
    .catch((error) => {
      console.error(
        `[static-e2e] ${
          error instanceof Error ? error.message : 'Server failed.'
        }`,
      );
      process.exitCode = 1;
    });
}
