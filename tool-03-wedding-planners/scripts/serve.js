// Minimal static server pinned to port 3003 (see /PORTS.md). No dependencies.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT || 3003);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
const PUBLIC = ['index.html', 'src/', 'config/', 'sample-data/'];

export function createServer() {
  return http.createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^[/\\]+/, '') || 'index.html';
    if (path.includes('..') || !PUBLIC.some((p) => path === p || path.startsWith(p))) { res.writeHead(404).end('Not found'); return; }
    try {
      const body = await readFile(join(ROOT, path));
      res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body);
    } catch { res.writeHead(404).end('Not found'); }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createServer();
  server.on('error', (e) => { console.error(e.code === 'EADDRINUSE' ? `Port ${PORT} is in use. This tool only runs on ${PORT} (see PORTS.md).` : e.message); process.exit(1); });
  server.listen(PORT, '127.0.0.1', () => console.log(`Wedding Enquiry Tracker: http://localhost:${PORT}`));
}
