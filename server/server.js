// Dedicated server for your own PC: serves the game files AND runs the match simulation.
// Usage:  npm install && npm start     (env: PORT=8080 TEAM_SIZE=5 BOTS=1)
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { G } from '../js/state.js';
import { Host } from '../js/host.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +process.env.PORT || 8080;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p), rel = path.relative(root, f);
  if (rel.startsWith('..') || rel.startsWith('server') || rel.startsWith('node_modules') || rel.startsWith('.')) { res.writeHead(404); return res.end('Not found'); }
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
    res.end(d);
  });
});

const wss = new WebSocketServer({ server });
const socks = new Map();
let n = 0;

G.myId = null; G.handle = null;
G.net = {
  broadcast(m, except) { const s = JSON.stringify(m); for (const [id, ws] of socks) if (id !== except && ws.readyState === 1) ws.send(s); },
  sendTo(id, m) { const ws = socks.get(id); if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); },
};
// No player rank on a dedicated server, so bot difficulty is a setting: BOT_LEVEL=0 (easiest) .. 1 (hardest), default 0.4 (about Silver/Gold).
Host.init({ headless: true, size: +process.env.TEAM_SIZE || 5, bots: process.env.BOTS !== '0', map: process.env.MAP || 'rotate', level: process.env.BOT_LEVEL !== undefined ? +process.env.BOT_LEVEL : .4 });

wss.on('connection', ws => {
  const id = 'p' + (++n);
  socks.set(id, ws);
  ws.on('message', d => {
    let m; try { m = JSON.parse(d.toString()); } catch { return; }
    try { Host.onMsg(id, m); } catch (e) { console.error('msg error', e); }
  });
  ws.on('close', () => { socks.delete(id); Host.removePlayer(id); });
  ws.on('error', () => {});
});

let last = Date.now();
setInterval(() => { const now = Date.now(); try { Host.tick((now - last) / 1000); } catch (e) { console.error('tick error', e); } last = now; }, 33);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`WEBSTRIKE server running on port ${PORT}`);
  console.log(`  This PC:  http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces()))
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) console.log(`  LAN:      http://${i.address}:${PORT}   (server URL: ws://${i.address}:${PORT})`);
});
