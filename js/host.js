// Authoritative game simulation: rounds, operators, bomb, damage, walls, bots.
// Runs inside the host's browser (solo / P2P host) or inside the Node dedicated server.
// Internal team ids: 'T' = Attack, 'CT' = Defense. A team id is the *side* a player is on right now.
// Players also belong to a squad (p.sq = 0 or 1) that stays together and swaps sides every SWAP_EVERY rounds.
import { G } from './state.js';
import { W, OPS, OPS_BY_SIDE, GADGETS, DOORS, BOXES, SPAWNS, SITES, ROUTES, HOLDS, HS_MULT, SCALE, moveE, castWorld, rayPlayer, losClear, smokeCut, inSite, segClear, navPath, blockedAt, applyWorld, resetWorld, MAPS, MAPINFO, loadMap, watchPoint, floorOf, FH } from './data.js';
import { createGadgets } from './gadgets.js';

export const FREEZE = 20, ROUND = 105, ENDT = 5.5, PLANT = 3.2, BOMBT = 40, MAXR = 8, SWAP_EVERY = 3;
export const SQ_NAMES = ['Alpha', 'Bravo'];   // first to MAXR round wins; a 7-7 tie is settled by one deciding round
const DEFUSE = 7;                          // seconds to defuse (no defuse kits any more)
const WALL_HP = 240, BAR_HP = 120;   // wall damage needed to carve a hole / break a barricade
export const MAX_BARR = 6;           // barricades defenders may place per round
export const H = {
  phase: 'freeze', t: FREEZE, round: 1, sc: [0, 0], sq1: 'T', sid: 0, over: false,   // sc = squad scores, sq1 = the side squad 0 is on
  bomb: { s: 'none', x: 0, y: 0, z: 0, t: 0 }, holds: {}, botsOn: true, size: 5, nextBot: 1, headless: false,
  plan: 'A', acc: { rs: 0, snap: 0, meta: 0 },
  log: [], whp: new Map(),                 // world events this round (replayed to late joiners), wall hit points left
};

const list = () => [...G.players.values()];
const rnd = (a, b) => a + Math.random() * (b - a);
const sqOn = side => (H.sq1 === side ? 0 : 1);                       // which squad is on a side right now
const sideOf = sq => (sq === 0 ? H.sq1 : H.sq1 === 'T' ? 'CT' : 'T'); // which side a squad is on right now
const scoreOn = side => H.sc[sqOn(side)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const turn = (cur, tgt, max) => cur + clamp(angDiff(tgt, cur), -max, max);
const BOT_NAMES = ['Rex', 'Nova', 'Kilo', 'Echo', 'Zed', 'Ivy', 'Moe', 'Sable', 'Tank', 'Fox', 'Jax', 'Lux', 'Onyx', 'Vee', 'Dash'];
const SIDE = { T: 'Attackers', CT: 'Defenders' };
// Private message to one player (nothing for bots). The host's own player is delivered locally.
function tell(p, text, extra) {
  if (!p || p.isBot) return;
  const m = { t: 'msg', text, short: 1, ...extra };
  if (p.id === G.myId) { if (G.handle) G.handle(m); } else if (G.net) G.net.sendTo(p.id, m);
}
// Is attacker `a` standing behind victim `v` (relative to where v is facing)?
function behind(v, a) {
  const dx = a.x - v.x, dz = a.z - v.z, d = Math.hypot(dx, dz) || 1;
  return (-Math.sin(v.yaw) * dx - Math.cos(v.yaw) * dz) / d < -.35;
}
// Bot difficulty. level 0..1 (from the host player's rank) scales how well bots aim, react, keep their fire discipline,
// land headshots and how quickly they make gadget decisions. Individual bots still vary a little (skill is randomised).
export function botTuning(level) {
  const l = clamp(+level || 0, 0, 1), lerp = (a, b) => a + (b - a) * l;
  return { skill: lerp(.65, 1.6), cd: lerp(1.35, .85), hs: lerp(.06, .28), think: lerp(.8, .15) };
}
const gad = createGadgets({ H, list, bcast, worldEvent, inflict, tell });

function bcast(m, except) {
  if (G.net) G.net.broadcast(m, except);
  if (G.handle && except !== G.myId) G.handle(m);
}

// ---------- players & operators ----------
function equip(p, id) {
  let o = OPS[id];
  if (!o || o.side !== p.team) { id = OPS_BY_SIDE[p.team][0]; o = OPS[id]; }
  p.op = id; p.prim = o.prim; p.sec = o.sec; p.armor = o.armor; p.w = o.prim; p.gad = o.gad;
  gad.resetPlayer(p);
}
function mk(id, name, team, isBot) {
  team = team === 'T' ? 'T' : 'CT';
  const p = {
    id, name, team, isBot, sq: sqOn(team), lean: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, hp: 100, armor: 0, alive: false,
    k: 0, d: 0, op: null, prim: null, sec: 'pistol', w: 'pistol', crouch: 0, ai: null,
  };
  equip(p, null);
  G.players.set(id, p);
  return p;
}

function fillBots() {
  if (!H.botsOn) { for (const p of list()) if (p.isBot) G.players.delete(p.id); return; }
  for (const t of ['T', 'CT']) {
    const hum = list().filter(p => p.team === t && !p.isBot).length;
    const bots = list().filter(p => p.team === t && p.isBot);
    const want = Math.max(0, H.size - hum);
    while (bots.length > want) { const b = bots.pop(); G.players.delete(b.id); delete H.holds[b.id]; }
    while (bots.length < want) {
      const n = H.nextBot++;
      bots.push(mk('b' + n, 'BOT ' + BOT_NAMES[n % BOT_NAMES.length], t, true));
    }
  }
}

// ---------- broadcast helpers ----------
function sendMeta() {
  bcast({ t: 'meta', p: list().map(p => ({ id: p.id, name: p.name, team: p.team, hp: p.hp, armor: p.armor | 0, alive: p.alive, k: p.k, d: p.d, bot: p.isBot, op: p.op, prim: p.prim, sec: p.sec, sq: p.sq })) });
}
function sendRS() {
  const hid = Object.keys(H.holds)[0], h = hid ? H.holds[hid] : null;
  let hold = null;
  if (h) hold = { id: hid, type: h.type, p: h.p, need: h.type === 'plant' ? PLANT : DEFUSE };
  bcast({ t: 'rs', phase: H.phase, tm: Math.max(0, H.t), round: H.round, sT: scoreOn('T'), sCT: scoreOn('CT'), sc: H.sc, sq1: H.sq1, over: H.over, bomb: { s: H.bomb.s, x: H.bomb.x, y: H.bomb.y || 0, z: H.bomb.z, t: Math.max(0, H.bomb.t) }, hold });
}
function sendSnap() {
  bcast({ t: 'snap', e: list().map(p => [p.id, +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +p.yaw.toFixed(3), +p.pitch.toFixed(3), p.w, p.crouch ? 1 : 0, +(p.lean || 0).toFixed(2)]) });
}

// ---------- world (breakable walls / barricades) ----------
// Apply an event on the host first (so a headless server stays correct), log it for late joiners, then tell everyone.
function worldEvent(ev) {
  applyWorld(ev);
  H.log.push(ev);
  bcast({ t: 'world', ev: [ev] });
}
function damageWall(i, dmg, x, y, z) {
  const b = BOXES[i];
  if (!b || b.off || b.rf) return;
  const isBar = b.bar !== undefined, isSh = b.sh !== undefined;
  if (!isBar && !isSh && !b.brk) return;
  const hp = (H.whp.get(i) ?? (isBar ? BAR_HP : isSh ? GADGETS.shield.hp : WALL_HP)) - dmg;
  if (hp > 0) { H.whp.set(i, hp); return; }
  H.whp.delete(i);
  if (isBar) worldEvent({ k: 'barr', d: b.bar, on: false });
  else if (isSh) worldEvent({ k: 'shieldoff', u: b.sh });
  else worldEvent({ k: 'hole', i, x: +x.toFixed(2), z: +z.toFixed(2) });
}

// ---------- rounds ----------
function spawnOne(p, i) {
  const arr = SPAWNS[p.team], s = arr[i % arr.length];
  p.x = s[0]; p.y = s[3] || 0; p.vy = 0; p.z = s[1]; p.yaw = s[2]; p.pitch = 0; p.hp = 100; p.alive = true; p.crouch = 0;
  p.w = p.prim || p.sec;
  if (p.isBot) botInit(p);
}
function startRound() {
  // Every SWAP_EVERY rounds the squads trade sides. Everybody's operator resets to one of the new side (they pick again in prep).
  const swap = H.round > 1 && (H.round - 1) % SWAP_EVERY === 0;
  if (swap) { H.sq1 = H.sq1 === 'T' ? 'CT' : 'T'; for (const p of list()) { p.team = sideOf(p.sq); p.op = null; } }
  H.phase = 'freeze'; H.t = FREEZE; H.bomb = { s: 'none', x: 0, y: 0, z: 0, t: 0 }; H.holds = {}; H.sid++; gad.resetRound();
  H.plan = Math.random() < .5 ? 'A' : 'B';
  H.log = []; H.whp = new Map(); resetWorld();   // walls whole, barricades off
  const idx = { T: 0, CT: 0 };
  for (const p of list()) {
    if (p.isBot) { const ids = OPS_BY_SIDE[p.team]; p.op = ids[Math.random() * ids.length | 0]; }
    equip(p, p.op);                               // fresh loadout and armour every round
    spawnOne(p, idx[p.team]++);
  }
  bcast({ t: 'world', ev: [{ k: 'reset' }] });
  sendMeta();                                  // before 'spawn' so clients already know their new side and loadout
  bcast({ t: 'spawn', sid: H.sid, swap: swap ? 1 : 0, l: list().map(p => [p.id, p.x, p.z, p.yaw, p.y]) });
  const final = H.sc[0] === MAXR - 1 && H.sc[1] === MAXR - 1;
  bcast({ t: 'msg', text: swap ? 'SIDES SWAP' : final ? 'FINAL ROUND — prep phase (B: operator)' : `${H.round === 1 ? MAPINFO.name + ' — ' : ''}Round ${H.round} — prep phase (B: operator)`, short: swap ? 0 : 1, swap: swap ? 1 : 0 });
  sendRS(); gad.sendGS();
}
// Pick the map for a new match (fixed, or a random one different from the last) and tell everybody before the round starts.
function pickMap() {
  const ids = MAPS.map(m => m.id);
  let id = ids.includes(H.mapPref) ? H.mapPref : null;
  if (!id) { const pool = ids.filter(i => i !== H.lastMap); id = pool[Math.random() * pool.length | 0]; }
  H.lastMap = id; loadMap(id);
  bcast({ t: 'map', id });
}
function startMatch() {
  pickMap();
  H.round = 1; H.sc = [0, 0]; H.over = false;
  if (H.sq1 !== 'T') { H.sq1 = 'T'; for (const p of list()) { p.team = sideOf(p.sq); p.op = null; } }   // a new match starts on the original sides
  for (const p of list()) { p.k = 0; p.d = 0; p.alive = false; }
  startRound();
}
function endRound(winner, reason) {
  if (H.phase !== 'live') return;
  H.phase = 'end'; H.t = ENDT; H.holds = {};
  const wsq = sqOn(winner); H.sc[wsq]++;
  const name = `${SQ_NAMES[wsq]} (${SIDE[winner]})`;
  if (H.sc[wsq] >= MAXR) { H.over = true; H.t = 9; bcast({ t: 'msg', text: `MATCH OVER — ${SQ_NAMES[wsq]} win ${H.sc[wsq]}:${H.sc[1 - wsq]}`, team: winner }); }
  else bcast({ t: 'msg', text: `${name} win — ${reason}`, team: winner });
  sendMeta(); sendRS();
}
function checkEnd() {
  if (H.phase !== 'live') return;
  const aT = list().filter(p => p.alive && p.team === 'T').length, aC = list().filter(p => p.alive && p.team === 'CT').length;
  if (aC === 0) endRound('T', 'Defenders eliminated');
  else if (aT === 0 && H.bomb.s !== 'planted') endRound('CT', 'Attackers eliminated');
}
function explode() {
  H.bomb.s = 'boom';
  for (const p of list()) if (p.alive && Math.hypot(p.x - H.bomb.x, p.z - H.bomb.z) < 22 * SCALE) { p.alive = false; p.hp = 0; p.d++; }
  bcast({ t: 'boom', x: H.bomb.x, z: H.bomb.z });
  sendMeta(); endRound('T', 'Bomb exploded');
}

// ---------- damage ----------
function applyDamage(v, a, wid, n, hs) {
  if (!v.alive || H.phase === 'freeze') return;
  const w = W[wid]; if (!w) return;
  let dmg = w.dmg * (n - hs) + w.dmg * HS_MULT * hs;
  if (w.melee) {
    dmg = w.dmg * n;
    if (a && a.gad === 'ghost' && behind(v, a)) { dmg *= GADGETS.ghost.stab; tell(a, 'BACKSTAB'); }   // Phantom's knife from behind
  }
  inflict(v, a, dmg, wid, hs);
}
// Everything that happens to a hit: armour, gadget modifiers, health, kills. o.pierce = ignores armour (Trip Mine).
function inflict(v, a, dmg, wid, hs = 0, o = {}) {
  if (!v.alive || H.phase === 'freeze') return;
  if (v.armor > 0 && !o.pierce) { v.armor = Math.max(0, v.armor - dmg * .3); dmg *= .55; }
  if (v.fort) dmg *= GADGETS.fortify.dmgMul;                                         // Fortify Mode
  if (v.gact > 0 && a && behind(v, a)) dmg *= GADGETS.rush.backMul;                  // Adrenaline Rush: less damage from behind
  if (v.ghost) gad.cancelGhost(v);                                                   // taking damage ends Ghost Walk
  v.hp -= Math.round(dmg);
  if (v.hp <= 0) {
    v.hp = 0; v.alive = false; v.d++; delete H.holds[v.id]; v.ghost = false; v.fort = false;
    if (a && a.id !== v.id) a.k++;
    bcast({ t: 'kill', kn: a ? a.name : '', kt: a ? a.team : '', vn: v.name, vt: v.team, w: wid, h: hs > 0 ? 1 : 0 });
    sendMeta(); checkEnd();
  } else sendMeta();
}

// ---------- plant / defuse ----------
// Within r of the planted bomb on the same storey (a bomb upstairs cannot be defused from the room below).
const nearBomb = (p, r) => Math.hypot(p.x - H.bomb.x, p.z - H.bomb.z) <= r && Math.abs((p.y || 0) - (H.bomb.y || 0)) < 2.2;
function startHold(p, type) {
  if (!p.alive || H.phase !== 'live') return false;
  if (H.holds[p.id]) return true;
  if (type === 'plant') {
    if (p.team !== 'T' || H.bomb.s !== 'none' || !inSite(p)) return false;
    if (Object.values(H.holds).some(h => h.type === 'plant')) return false;
  } else {
    if (p.team !== 'CT' || H.bomb.s !== 'planted' || !nearBomb(p, 2.2)) return false;
    if (Object.values(H.holds).some(h => h.type === 'defuse')) return false;
  }
  if (p.fort) return false;                       // Fortify Mode locks you in place
  gad.cancelGhost(p);                             // planting / defusing ends Ghost Walk
  H.holds[p.id] = { type, p: 0, seen: Date.now() };
  return true;
}
function holdsTick(dt) {
  for (const id of Object.keys(H.holds)) {
    const h = H.holds[id], p = G.players.get(id);
    const bad = !p || !p.alive || (h.type === 'plant' && (H.bomb.s !== 'none' || !inSite(p))) || (h.type === 'defuse' && H.bomb.s !== 'planted')
      || (p && !p.isBot && Date.now() - h.seen > 700);
    if (bad) { delete H.holds[id]; continue; }
    h.p += dt;
    const need = h.type === 'plant' ? PLANT : DEFUSE;
    if (h.p >= need) {
      delete H.holds[id];
      if (h.type === 'plant') {
        H.bomb = { s: 'planted', x: p.x, y: floorOf(p.y) * FH, z: p.z, t: BOMBT };   // the bomb sits on the floor of the storey it was planted on
        bcast({ t: 'msg', text: 'The bomb has been planted', short: 1 }); sendRS();
      } else { H.bomb.s = 'defused'; endRound('CT', 'Bomb defused'); }
    }
  }
}

// ---------- bots ----------
function botInit(b) {
  const tune = botTuning(H.levelFn ? H.levelFn() : H.level);
  const a = b.ai = { tune, path: [], pi: 0, tgt: null, react: 0, cd: 0, burst: 4, lost: 9, strafe: 0, sd: 1, lx: b.x, lz: b.z, st: 0, unst: 0, ua: 0, skill: rnd(.8, 1.3) * tune.skill, guard: null, home: null, wp: null, wt: 0, nav: null, breach: null, breachT: 0, mv: null, did: 0, dn: 0, gt: 0 };
  if (b.team === 'T') {
    const site = Math.random() < .75 ? H.plan : (H.plan === 'A' ? 'B' : 'A');
    const routes = ROUTES[site], route = routes[Math.random() * routes.length | 0];
    a.path = jitterPath(route);
  } else {
    const r = Math.random(), k = r < .35 ? 'A' : r < .7 ? 'B' : 'M', hold = HOLDS[k];
    // defenders may spawn on another storey than their hold route starts on: walk (via the stairs) to its first point
    a.path = jitterPath([...navPath(b.x, b.z, b.y, hold[0][0], hold[0][1], hold[0][2]), ...hold.slice(1)]);
  }
  a.home = a.path[a.path.length - 1];
}
// Route points get a little random offset so a squad does not walk in single file, except around staircases (which are narrow).
function jitterPath(pts) {
  return pts.map((q, i) => {
    const edge = (pts[i - 1] && pts[i - 1][2] !== q[2]) || (pts[i + 1] && pts[i + 1][2] !== q[2]);
    return edge ? [q[0], q[1], q[2]] : [q[0] + rnd(-1, 1), q[1] + rnd(-1, 1), q[2]];
  });
}
// Has the bot reached waypoint wp = [x, z, floorHeight]? (Being right below / above it on another storey does not count.)
const reached = (b, wp, r) => Math.hypot(wp[0] - b.x, wp[1] - b.z) < r && Math.abs((wp[2] || 0) - b.y) < 1.2;
// Next point to steer toward on the way to (gx,gz) on floor height gy: straight there if it is on this storey and the way is
// clear, otherwise along the nav graph (which knows about the staircases).
function steer(b, a, gx, gz, dt, gy = 0) {
  const fb = floorOf(b.y), fg = floorOf(gy);
  if (fb === fg && segClear(b.x, b.z, gx, gz, fb * FH)) { a.nav = null; return [gx, gz]; }
  let n = a.nav;
  if (n) n.age += dt;
  if (!n || n.age > 1.5 || n.gf !== fg || Math.hypot(n.gx - gx, n.gz - gz) > 3) n = a.nav = { gx, gz, gf: fg, pts: navPath(b.x, b.z, b.y, gx, gz, gy), i: 0, age: 0 };
  while (n.i < n.pts.length - 1 && Math.hypot(n.pts[n.i][0] - b.x, n.pts[n.i][1] - b.z) < 1.8 && Math.abs(n.pts[n.i][2] - b.y) < 1.2) n.i++;
  return n.pts[n.i];
}
function trace(sh, ox, oy, oz, dx, dy, dz, range) {
  let best = castWorld(ox, oy, oz, dx, dy, dz, range), hit = null, head = false;
  for (const e of list()) {
    if (!e.alive || e.team === sh.team) continue;
    const r = rayPlayer(e, ox, oy, oz, dx, dy, dz);
    if (r && r.t < best) { best = r.t; hit = e; head = r.head; }
  }
  return { t: best, hit, head };
}
function botFire(b, tgt, dist) {
  const wid = b.prim || b.sec, w = W[wid], a = b.ai;
  const ox = b.x, oy = b.y + 1.55, oz = b.z;
  let dx = tgt.x - ox, dy = tgt.y + (Math.random() < a.tune.hs ? 1.62 : 1.15) - oy, dz = tgt.z - oz;
  const L = Math.hypot(dx, dy, dz); dx /= L; dy /= L; dz /= L;
  const fm = b.fort && wid === b.prim ? GADGETS.fortify : null;                 // Fortify Mode: tighter, faster rifle
  const err = (w.spread * .8 + .004 + dist * .0007) / a.skill * (fm ? fm.spreadMul : 1);
  const agg = new Map(); let end = null;
  for (let i = 0; i < (w.pellets || 1); i++) {
    let ex = dx + (Math.random() - .5) * 2 * err, ey = dy + (Math.random() - .5) * 2 * err, ez = dz + (Math.random() - .5) * 2 * err;
    const l = Math.hypot(ex, ey, ez); ex /= l; ey /= l; ez /= l;
    const r = trace(b, ox, oy, oz, ex, ey, ez, w.range);
    if (i === 0) end = [ox + ex * r.t, oy + ey * r.t, oz + ez * r.t];
    if (r.hit) { const g = agg.get(r.hit.id) || { v: r.hit, n: 0, hs: 0 }; g.n++; if (r.head) g.hs++; agg.set(r.hit.id, g); }
  }
  bcast({ t: 'shot', id: b.id, w: wid, x: ox, y: oy, z: oz, tx: end[0], ty: end[1], tz: end[2] });
  for (const g of agg.values()) applyDamage(g.v, b, wid, g.n, g.hs);
  a.cd = (w.delay * (w.auto ? 1 : 1.5) + rnd(0, .12)) * (fm ? fm.rateMul : 1) * a.tune.cd;
  if (--a.burst <= 0) { a.cd += rnd(.4, .9); a.burst = 3 + (Math.random() * 5 | 0); }
}
// A barricaded doorway in front of a bot that is trying to walk (index into DOORS, or -1).
function barrierAhead(b, mx, mz) {
  const l = Math.hypot(mx, mz) || 1; let best = -1, bd = 3.5;
  for (let i = 0; i < DOORS.length; i++) {
    const d = DOORS[i]; if (BOXES[d.bi].off || Math.abs(d.y - floorOf(b.y) * FH) > .1) continue;
    const dx = d.x - b.x, dz = d.z - b.z, dist = Math.hypot(dx, dz);
    if (dist < bd && (dx * mx + dz * mz) / ((dist * l) || 1) > .2) { bd = dist; best = i; }
  }
  return best;
}
// Stand and shoot the barricade the bot is stuck behind. Returns false once it is gone (or the bot gave up).
function botBreach(b, a, dt) {
  const d = DOORS[a.breach];
  if (!d || BOXES[d.bi].off || (a.breachT -= dt) <= 0) { a.breach = null; return false; }
  const dx = d.x - b.x, dz = d.z - b.z, ty = Math.atan2(-dx, -dz);
  b.yaw = turn(b.yaw, ty, 10 * dt);
  if (a.cd <= 0 && Math.abs(angDiff(ty, b.yaw)) < .15) {
    const wid = b.prim || b.sec, w = W[wid];
    bcast({ t: 'shot', id: b.id, w: wid, x: b.x, y: b.y + 1.55, z: b.z, tx: d.x, ty: d.y + 1.2, tz: d.z });
    damageWall(d.bi, w.dmg * (w.pellets || 1) * .8, d.x, d.y + 1.2, d.z);
    a.cd = w.delay * (w.auto ? 1 : 1.5) + .05;
  }
  return true;
}
function botThink(b, dt) {
  const a = b.ai; if (!a || !b.alive) return;
  const eyeY = b.y + 1.55;
  a.cd -= dt; a.react -= dt;
  let tgt = null, bd = 1e9;
  for (const e of list()) {
    if (!e.alive || e.team === b.team) continue;
    const dx = e.x - b.x, dz = e.z - b.z, d = Math.hypot(dx, dz);
    if (d > 55 * SCALE || d >= bd) continue;
    const dot = (dx * -Math.sin(b.yaw) + dz * -Math.cos(b.yaw)) / (d || 1);
    if (d > 9 * SCALE && dot < .3 && a.tgt !== e.id) continue;
    if (!losClear(b.x, eyeY, b.z, e.x, e.y + 1.25, e.z) || smokeCut(b.x, b.z, e.x, e.z)) continue;
    if (e.ghost && d > 10 * SCALE) continue;      // a ghost walking silently is only noticed up close
    tgt = e; bd = d;
  }
  if (tgt) { if (a.tgt !== tgt.id) { a.tgt = tgt.id; a.react = (.25 + Math.random() * .3) / a.skill; } a.lost = 0; }
  else { a.lost += dt; if (a.lost > 1.2) a.tgt = null; }

  // Gadget rules (one per operator, see gadgets.js). The point a defender watches from its hold spot depends on which hold it has.
  gad.bot(b, dt, { tgt, bd: tgt ? bd : 0, atEnd: a.pi >= a.path.length, thr: watchPoint(b.x) });

  let mvx = 0, mvz = 0, want = false, speed = 4.3, gx = null, gz = null;
  const holding = H.holds[b.id];
  if (tgt) {
    if (holding) delete H.holds[b.id];
    const dx = tgt.x - b.x, dz = tgt.z - b.z, dy = (tgt.y + 1.3) - eyeY;
    const ty = Math.atan2(-dx, -dz), tp = Math.atan2(dy, Math.hypot(dx, dz));
    b.yaw = turn(b.yaw, ty, 8 * dt * a.skill);
    b.pitch += clamp(tp - b.pitch, -6 * dt, 6 * dt);
    if (H.phase === 'live' && !b.ghost && Math.abs(angDiff(ty, b.yaw)) < .1 && a.react <= 0 && a.cd <= 0) botFire(b, tgt, bd);
    a.strafe -= dt;
    if (a.strafe <= 0) { a.strafe = rnd(.4, 1.3); a.sd = Math.random() < .25 ? 0 : (Math.random() < .5 ? -1 : 1); }
    if (a.sd) { mvx = Math.cos(b.yaw) * a.sd; mvz = -Math.sin(b.yaw) * a.sd; want = true; speed = 2.6; }
    // Long lanes: while the enemy is still far away, keep advancing on the objective (route waypoint, or the
    // planted bomb for defenders) while shooting, instead of freezing in place trading fire across the map.
    if (bd > 14 * SCALE) {
      let ax = null, az = null;
      if (b.team === 'CT' && H.bomb.s === 'planted') [ax, az] = steer(b, a, H.bomb.x, H.bomb.z, dt, H.bomb.y);
      else if (H.bomb.s !== 'planted' && a.path[a.pi]) {
        const wp = a.path[a.pi];
        [ax, az] = steer(b, a, wp[0], wp[1], dt, wp[2]);
        if (reached(b, wp, 1.3)) a.pi++;
      }
      if (ax != null) { const dx = ax - b.x, dz = az - b.z, d = Math.hypot(dx, dz) || 1; mvx = dx / d; mvz = dz / d; want = true; speed = 3.4; }
    }
  } else if (!holding && a.breach !== null && botBreach(b, a, dt)) {
    // standing still, shooting through a barricade that blocks the way
  } else if (!holding) {
    const bm = H.bomb;
    if (bm.s === 'planted') {
      if (b.team === 'CT') {
        if (nearBomb(b, 1.6)) startHold(b, 'defuse');
        else [gx, gz] = steer(b, a, bm.x, bm.z, dt, bm.y);
      } else {
        if (!a.guard) {
          for (let k = 0; k < 10; k++) {
            const ang = Math.random() * 6.28, r = 3 + Math.random() * 4;
            a.guard = [bm.x + Math.cos(ang) * r, bm.z + Math.sin(ang) * r];
            if (!blockedAt(a.guard[0], a.guard[1], bm.y) && segClear(bm.x, bm.z, a.guard[0], a.guard[1], bm.y)) break;
          }
        }
        if (Math.hypot(a.guard[0] - b.x, a.guard[1] - b.z) >= 1.5 || Math.abs(bm.y - b.y) > 1.5) [gx, gz] = steer(b, a, a.guard[0], a.guard[1], dt, bm.y);
      }
    } else {
      const wp = a.path[a.pi];
      if (wp) { [gx, gz] = steer(b, a, wp[0], wp[1], dt, wp[2]); if (reached(b, wp, 1.3)) a.pi++; }
      else if (b.team === 'T' && bm.s === 'none' && inSite(b) && !Object.values(H.holds).some(h => h.type === 'plant')) { startHold(b, 'plant'); }
      else {
        a.wt -= dt;
        if (!a.wp || a.wt <= 0) { a.wp = [a.home[0] + rnd(-2.5, 2.5), a.home[1] + rnd(-2.5, 2.5)]; a.wt = rnd(2, 4); }
        gx = a.wp[0]; gz = a.wp[1]; speed = 2.4;
        if (Math.hypot(gx - b.x, gz - b.z) < .6) gx = null;
      }
    }
    if (gx != null) {
      const dx = gx - b.x, dz = gz - b.z, d = Math.hypot(dx, dz);
      if (d > .4) { mvx = dx / d; mvz = dz / d; want = true; b.yaw = turn(b.yaw, Math.atan2(-dx, -dz), 6 * dt); b.pitch *= .9; }
    }
  }
  if (b.fort) want = false;                       // a deployed Bastion does not move
  a.st += dt;
  if (a.st > .7) {
    if (want && !tgt && Math.hypot(b.x - a.lx, b.z - a.lz) < .25) {
      a.unst = .6; a.ua = (Math.random() < .5 ? 1 : -1) * rnd(1.2, 2.0);
      const bar = barrierAhead(b, mvx, mvz);
      if (bar >= 0) { a.breach = bar; a.breachT = 6; a.unst = 0; }   // stuck behind a barricade: break it instead of wiggling
    }
    a.lx = b.x; a.lz = b.z; a.st = 0;
  }
  a.mv = want ? [mvx, mvz] : null;
  if (a.unst > 0) { a.unst -= dt; const c = Math.cos(a.ua), s = Math.sin(a.ua); const nx = mvx * c - mvz * s, nz = mvx * s + mvz * c; mvx = nx; mvz = nz; want = true; }
  speed *= (b.slow > 0 ? GADGETS.mine.slowMul : 1) * (b.gact > 0 ? GADGETS.rush.speedMul : 1) * (b.ghost ? 1.1 : 1);
  if (want && !H.holds[b.id] && H.phase === 'live') moveE(b, mvx * speed * dt, 0, mvz * speed * dt, 1.75);
  // gravity: bots settle on stair steps and floor slabs, and fall if they step into a stairwell opening
  b.vy = (b.vy || 0) - 20 * dt;
  const gf = moveE(b, 0, b.vy * dt, 0, 1.75);
  if (gf & 1) b.vy = 0; else if ((gf & 2) && b.vy > 0) b.vy = 0;
  b.w = b.ghost ? 'knife' : (b.prim || b.sec);
}

// ---------- API ----------
export function init(o = {}) {
  H.size = o.size || 5; H.botsOn = o.bots !== false; H.headless = !!o.headless;
  H.mapPref = o.map || 'rotate'; H.lastMap = null;   // 'rotate' = a different map every match, or a fixed map id
  H.log = []; H.whp = new Map(); resetWorld(); gad.resetRound();
  H.sq1 = 'T'; H.sc = [0, 0];
  H.level = o.level ?? .4; H.levelFn = o.levelFn || null;   // bot difficulty: fixed level, or a function re-read every round
  G.players.clear(); G.isHost = true;
  if (!H.headless) { mk('h', (o.name || 'Player').slice(0, 16), o.team || 'CT', false); G.myId = 'h'; }
  fillBots(); startMatch();
}
export function removePlayer(id) {
  if (!G.players.has(id)) return;
  G.players.delete(id); delete H.holds[id];
  fillBots(); sendMeta(); checkEnd();
}
export function onMsg(from, m) {
  if (!m || typeof m.t !== 'string') return;
  const p = G.players.get(from);
  switch (m.t) {
    case 'hello': {
      if (p) return;
      const humans = list().filter(q => !q.isBot);
      if (humans.length >= H.size * 2) { if (G.net) G.net.sendTo(from, { t: 'full' }); return; }
      const c = t => humans.filter(q => q.team === t).length;
      const team = c('T') < c('CT') ? 'T' : c('CT') < c('T') ? 'CT' : (Math.random() < .5 ? 'T' : 'CT');
      const np = mk(from, String(m.name || 'Player').replace(/[<>&"']/g, '').slice(0, 16) || 'Player', team, false);
      const first = humans.length === 0;
      fillBots();
      if (G.net) {
        G.net.sendTo(from, { t: 'welcome', id: from, team });
        G.net.sendTo(from, { t: 'map', id: MAPINFO.id });
        if (H.log.length) G.net.sendTo(from, { t: 'world', ev: H.log });   // walls already broken / barricades placed this round
      }
      if (first && H.headless) { startMatch(); break; }
      if (H.phase === 'freeze') {
        spawnOne(np, list().filter(q => q.alive && q.team === team).length);
        bcast({ t: 'spawn', sid: H.sid, l: [[np.id, np.x, np.z, np.yaw, np.y]] });
      }
      sendMeta(); sendRS();
      break;
    }
    case 'st': {
      if (!p || !p.alive) return;
      if (![m.x, m.y, m.z, m.yaw, m.pitch].every(Number.isFinite)) return;
      p.yaw = m.yaw; p.pitch = clamp(m.pitch, -1.6, 1.6); p.crouch = m.c ? 1 : 0; p.lean = clamp(+m.l || 0, -1, 1);
      if (typeof m.w === 'string' && W[m.w]) p.w = m.w;
      // Attackers are held in their spawn during prep; defenders can move (to place barricades).
      if (!p.fort && m.s === H.sid && (H.phase !== 'freeze' || p.team === 'CT')) {   // a deployed Bastion stays where he is
        p.x = clamp(m.x, -30 * SCALE, 30 * SCALE); p.y = clamp(m.y, 0, 10); p.z = clamp(m.z, -30 * SCALE, 30 * SCALE); }
      break;
    }
    case 'fire': {
      if (!p || !p.alive || H.phase === 'freeze' || !W[m.w]) return;
      if (![m.x, m.y, m.z, m.tx, m.ty, m.tz].every(Number.isFinite)) return;
      if (p.ghost && m.w !== 'knife') gad.cancelGhost(p);   // shooting ends Ghost Walk
      bcast({ t: 'shot', id: from, w: m.w, x: m.x, y: m.y, z: m.z, tx: m.tx, ty: m.ty, tz: m.tz }, from);
      break;
    }
    case 'hit': {
      const v = G.players.get(m.v);
      if (!p || !v || !p.alive || !v.alive || p.team === v.team || !W[m.w]) return;
      const w = W[m.w];
      if (m.w !== 'knife' && m.w !== p.prim && m.w !== p.sec) return;
      const n = clamp(m.n | 0, 1, w.pellets), hs = clamp(m.hs | 0, 0, n);
      if (p.ghost && m.w !== 'knife') gad.cancelGhost(p);
      applyDamage(v, p, m.w, n, hs);
      break;
    }
    case 'wall': {   // the shooter's client says its bullets hit wall/barricade box m.i at (m.x, m.y, m.z)
      const b = BOXES[m.i];
      if (!p || !p.alive || H.phase === 'freeze' || !b || b.off || !W[m.w]) return;
      if (!(b.brk || b.bar !== undefined || b.sh !== undefined)) return;
      if (m.w !== 'knife' && m.w !== p.prim && m.w !== p.sec) return;
      if (![m.x, m.y, m.z].every(Number.isFinite)) return;
      const w = W[m.w], n = clamp(m.n | 0, 1, w.pellets);
      if (Math.hypot(p.x - m.x, p.z - m.z) > w.range + 2) return;
      damageWall(m.i, w.dmg * n * (w.melee ? 2 : 1), clamp(m.x, b.x0, b.x1), m.y, clamp(m.z, b.z0, b.z1));
      break;
    }
    case 'op': {     // pick an operator (prep phase only)
      if (!p || H.phase !== 'freeze') return;
      const o = OPS[m.op];
      if (!o || o.side !== p.team) return;
      equip(p, m.op); sendMeta();
      break;
    }
    case 'barr': {   // defenders toggle a barricade on a doorway (prep phase only)
      const d = DOORS[m.d | 0];
      if (!p || !p.alive || p.team !== 'CT' || H.phase !== 'freeze' || !d) return;
      if (Math.hypot(p.x - d.x, p.z - d.z) > 6) return;
      if (BOXES[d.bi].off) {
        if (DOORS.filter(q => !BOXES[q.bi].off).length >= MAX_BARR) return;
        if (list().some(q => q.alive && Math.hypot(q.x - d.x, q.z - d.z) < 2.6)) return;   // someone is standing in the doorway
        worldEvent({ k: 'barr', d: m.d | 0, on: true });
      } else worldEvent({ k: 'barr', d: m.d | 0, on: false });
      break;
    }
    case 'gad': gad.msg(p, m); break;    // gadget key pressed / released
    case 'use': {
      if (!p) return;
      if (m.on) { if (startHold(p, p.team === 'T' ? 'plant' : 'defuse') && H.holds[from]) H.holds[from].seen = Date.now(); }
      else delete H.holds[from];
      break;
    }
  }
}
export function tick(dt) {
  dt = Math.min(dt, .1);
  if (H.headless && !list().some(p => !p.isBot)) return;
  H.t -= dt;
  if (H.phase === 'freeze') {
    if (H.t <= 0) { H.phase = 'live'; H.t = ROUND; bcast({ t: 'msg', text: 'GO!', short: 1 }); sendRS(); }
  } else if (H.phase === 'live') {
    for (const p of list()) if (p.isBot && p.alive) botThink(p, dt);
    holdsTick(dt);
    if (H.bomb.s === 'planted') { H.bomb.t -= dt; if (H.bomb.t <= 0) explode(); }
    else if (H.t <= 0) endRound('CT', 'Time ran out');
  } else if (H.phase === 'end') {
    if (H.t <= 0) { if (H.over) startMatch(); else { H.round++; startRound(); } }
  }
  gad.tick(dt);
  const a = H.acc; a.rs += dt; a.snap += dt; a.meta += dt;
  if (a.rs > .25) { a.rs = 0; sendRS(); }
  if (a.snap > .05) { a.snap = 0; sendSnap(); }
  if (a.meta > 1) { a.meta = 0; sendMeta(); }
}
export const Host = { init, tick, onMsg, removePlayer, H, gad };
