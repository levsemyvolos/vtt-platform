/**
 * Local-only screenshot saver. Receives base64 PNG via POST and writes to
 * `apps/client/docs/screenshots/<name>.png`. Used by the Claude_in_Chrome
 * MCP smoke flow — JS in the page captures via html2canvas, posts here.
 *
 * Run: node apps/client/docs/screenshot-saver.mjs
 * Stop: Ctrl+C  (or PowerShell Stop-Process)
 */
import http from 'http';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'screenshots');
const PORT = 9876;

await mkdir(OUT_DIR, { recursive: true });

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, outDir: OUT_DIR }));
    return;
  }
  if (req.method !== 'POST') { res.writeHead(404); res.end('not found'); return; }

  const url = new URL(req.url, 'http://localhost');
  const rawName = url.searchParams.get('name') ?? '';
  // Sanitize: only [a-zA-Z0-9_-], must end in .png
  const safe = rawName.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const name = safe.endsWith('.png') ? safe : `${safe || 'screenshot'}.png`;

  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', async () => {
    try {
      const body = Buffer.concat(chunks).toString('utf-8');
      const m = /^data:image\/png;base64,(.+)$/.exec(body.trim());
      if (!m) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end(`bad data url, body length=${body.length}, head=${body.slice(0, 40)}`);
        return;
      }
      const buf = Buffer.from(m[1], 'base64');
      const filepath = join(OUT_DIR, name);
      await writeFile(filepath, buf);
      const msg = `saved ${name} (${buf.length} bytes)`;
      console.log(msg);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, name, bytes: buf.length, path: filepath }));
    } catch (err) {
      console.error('save error:', err.message);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(err.message);
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`screenshot-saver listening on http://127.0.0.1:${PORT}`);
  console.log(`out dir: ${OUT_DIR}`);
});
