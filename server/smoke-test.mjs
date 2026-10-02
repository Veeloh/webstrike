// Smoke test: connect a fake client to the dedicated server and watch a bot match play out.
import WebSocket from 'ws';
const url = process.argv[2] || 'ws://localhost:8099';
const ws = new WebSocket(url);
const counts = {}; let me = null, lastRs = null, kills = 0, players = 0, moved = new Set(), first = {};
ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', name: 'Tester' })));
ws.on('message', d => {
  const m = JSON.parse(d.toString());
  counts[m.t] = (counts[m.t] || 0) + 1;
  if (m.t === 'welcome') me = m;
  if (m.t === 'rs') lastRs = m;
  if (m.t === 'kill') kills++;
  if (m.t === 'meta') players = m.p.length;
  if (m.t === 'snap') for (const e of m.e) { if (!first[e[0]]) first[e[0]] = [e[1], e[3]]; else if (Math.hypot(e[1] - first[e[0]][0], e[3] - first[e[0]][1]) > 3) moved.add(e[0]); }
});
setTimeout(() => {
  console.log({ me, counts, players, kills, movedBots: moved.size, rs: lastRs && { phase: lastRs.phase, round: lastRs.round, sT: lastRs.sT, sCT: lastRs.sCT, bomb: lastRs.bomb.s } });
  ws.close(); process.exit(0);
}, +process.argv[3] || 40000);
