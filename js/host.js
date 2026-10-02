// Authoritative game simulation: rounds, economy, bomb, damage, bots.
// Runs inside the host's browser (solo / P2P host) or inside the Node dedicated server.
import { G } from './state.js';
import { W, SPAWNS, SITES, ROUTES, HOLDS, HS_MULT, moveE, castWorld, rayPlayer, losClear, inSite } from './data.js';

export const FREEZE = 9, ROUND = 105, ENDT = 5.5, PLANT = 3.2, BOMBT = 40, MAXR = 8;
export const H = {
  phase: 'freeze', t: FREEZE, round: 1, sT: 0, sCT: 0, sid: 0, over: false,
  bomb: { s: 'none', x: 0, z: 0, t: 0 }, holds: {}, botsOn: true, size: 5, nextBot: 1, headless: false,
  plan: 'A', acc: { rs: 0, snap: 0, meta: 0 },
};

const list = () => [...G.players.values()];
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const turn = (cur, tgt, max) => cur + clamp(angDiff(tgt, cur), -max, max);
const BOT_NAMES = ['Rex', 'Nova', 'Kilo', 'Echo', 'Zed', 'Ivy', 'Moe', 'Sable', 'Tank', 'Fox', 'Jax', 'Lux', 'Onyx', 'Vee', 'Dash'];

function bcast(m, except) {
  if (G.net) G.net.broadcast(m, except);
  if (G.handle && except !== G.myId) G.handle(m);
}

function mk(id, name, team, isBot) {
  const p = {
    id, name, team, isBot, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, hp: 100, armor: 0, alive: false,
    money: 800, k: 0, d: 0, prim: null, sec: 'pistol', kit: false, w: 'pistol', crouch: 0, ai: null,
  };
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

// ---------- economy ----------
function purchase(p, item) {
  if (item === 'armor') { if (p.money < 650 || p.armor >= 100) return false; p.money -= 650; p.armor = 100; return true; }
  if (item === 'kit') { if (p.team !== 'CT' || p.kit || p.money < 400) return false; p.money -= 400; p.kit = true; return true; }
  const w = W[item];
  if (!w || w.price <= 0 || p.money < w.price) return false;
  p.money -= w.price;
  if (w.slot === 1) p.prim = item; else if (w.slot === 2) p.sec = item;
  p.w = p.prim || p.sec;
  return true;
}
function botBuy(b) {
  const m = () => b.money, r = Math.random();
  if (!b.prim) {
    if (m() >= 4750 + 650 && r < .18) purchase(b, 'awp');
    else if (m() >= 2700) purchase(b, 'rifle');
    else if (m() >= 1800 && r < .35) purchase(b, 'shotgun');
    else if (m() >= 1250) purchase(b, 'smg');
    else if (m() >= 700 && r < .6 && b.sec === 'pistol') purchase(b, 'deagle');
  }
  if (b.armor < 50 && m() >= 650) purchase(b, 'armor');
  if (b.team === 'CT' && !b.kit && m() >= 400 && Math.random() < .6) purchase(b, 'kit');
}

// ---------- broadcast helpers ----------
function sendMeta() {
  bcast({ t: 'meta', p: list().map(p => ({ id: p.id, name: p.name, team: p.team, hp: p.hp, armor: p.armor | 0, alive: p.alive, money: p.money, k: p.k, d: p.d, bot: p.isBot, prim: p.prim, sec: p.sec, kit: p.kit })) });
}
function sendRS() {
  const hid = Object.keys(H.holds)[0], h = hid ? H.holds[hid] : null;
  let hold = null;
  if (h) { const p = G.players.get(hid); hold = { id: hid, type: h.type, p: h.p, need: h.type === 'plant' ? PLANT : (p && p.kit ? 5 : 10) }; }
  bcast({ t: 'rs', phase: H.phase, tm: Math.max(0, H.t), round: H.round, sT: H.sT, sCT: H.sCT, over: H.over, bomb: { s: H.bomb.s, x: H.bomb.x, z: H.bomb.z, t: Math.max(0, H.bomb.t) }, hold });
}
function sendSnap() {
  bcast({ t: 'snap', e: list().map(p => [p.id, +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +p.yaw.toFixed(3), +p.pitch.toFixed(3), p.w, p.crouch ? 1 : 0]) });
}

// ---------- rounds ----------
function spawnOne(p, i) {
  const arr = SPAWNS[p.team], s = arr[i % arr.length];
  p.x = s[0]; p.y = 0; p.z = s[1]; p.yaw = s[2]; p.pitch = 0; p.hp = 100; p.alive = true; p.crouch = 0;
  p.w = p.prim || p.sec;
  if (p.isBot) botInit(p);
}
function startRound() {
  H.phase = 'freeze'; H.t = FREEZE; H.bomb = { s: 'none', x: 0, z: 0, t: 0 }; H.holds = {}; H.sid++;
  H.plan = Math.random() < .5 ? 'A' : 'B';
  const idx = { T: 0, CT: 0 };
  for (const p of list()) {
    if (!p.alive) { p.prim = null; p.armor = 0; p.kit = false; p.sec = 'pistol'; }
    if (p.isBot) botBuy(p);
    spawnOne(p, idx[p.team]++);
  }
  bcast({ t: 'spawn', sid: H.sid, l: list().map(p => [p.id, p.x, p.z, p.yaw]) });
  bcast({ t: 'msg', text: `Round ${H.round} — buy time`, short: 1 });
  sendMeta(); sendRS();
}
function startMatch() {
  H.round = 1; H.sT = 0; H.sCT = 0; H.over = false;
  for (const p of list()) { p.money = 800; p.k = 0; p.d = 0; p.alive = false; }
  startRound();
}
function endRound(winner, reason) {
  if (H.phase !== 'live') return;
  H.phase = 'end'; H.t = ENDT; H.holds = {};
  if (winner === 'T') H.sT++; else H.sCT++;
  for (const p of list()) p.money = Math.min(16000, p.money + (p.team === winner ? (reason === 'Bomb exploded' ? 3500 : 3250) : 1900));
  const name = winner === 'T' ? 'Terrorists' : 'Counter-Terrorists';
  if (H.sT >= MAXR || H.sCT >= MAXR) { H.over = true; H.t = 9; bcast({ t: 'msg', text: `MATCH OVER — ${name} win ${H.sT}:${H.sCT}`, team: winner }); }
  else bcast({ t: 'msg', text: `${name} win — ${reason}`, team: winner });
  sendMeta(); sendRS();
}
function checkEnd() {
  if (H.phase !== 'live') return;
  const aT = list().filter(p => p.alive && p.team === 'T').length, aC = list().filter(p => p.alive && p.team === 'CT').length;
  if (aC === 0) endRound('T', 'Counter-Terrorists eliminated');
  else if (aT === 0 && H.bomb.s !== 'planted') endRound('CT', 'Terrorists eliminated');
}
function explode() {
  H.bomb.s = 'boom';
  for (const p of list()) if (p.alive && Math.hypot(p.x - H.bomb.x, p.z - H.bomb.z) < 22) { p.alive = false; p.hp = 0; p.d++; }
  bcast({ t: 'boom', x: H.bomb.x, z: H.bomb.z });
  sendMeta(); endRound('T', 'Bomb exploded');
}

// ---------- damage ----------
function applyDamage(v, a, wid, n, hs) {
  if (!v.alive || H.phase === 'freeze') return;
  const w = W[wid]; if (!w) return;
  let dmg = w.dmg * (n - hs) + w.dmg * HS_MULT * hs;
  if (w.melee) dmg = w.dmg * n;
  if (v.armor > 0) { v.armor = Math.max(0, v.armor - dmg * .3); dmg *= .55; }
  v.hp -= Math.round(dmg);
  if (v.hp <= 0) {
    v.hp = 0; v.alive = false; v.d++; delete H.holds[v.id];
    if (a && a.id !== v.id) { a.k++; a.money = Math.min(16000, a.money + 300); }
    bcast({ t: 'kill', kn: a ? a.name : '', kt: a ? a.team : '', vn: v.name, vt: v.team, w: wid, h: hs > 0 ? 1 : 0 });
    sendMeta(); checkEnd();
  } else sendMeta();
}

// ---------- plant / defuse ----------
function startHold(p, type) {
  if (!p.alive || H.phase !== 'live') return false;
  if (H.holds[p.id]) return true;
  if (type === 'plant') {
    if (p.team !== 'T' || H.bomb.s !== 'none' || !inSite(p)) return false;
    if (Object.values(H.holds).some(h => h.type === 'plant')) return false;
  } else {
    if (p.team !== 'CT' || H.bomb.s !== 'planted' || Math.hypot(p.x - H.bomb.x, p.z - H.bomb.z) > 2.2) return false;
    if (Object.values(H.holds).some(h => h.type === 'defuse')) return false;
  }
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
    const need = h.type === 'plant' ? PLANT : (p.kit ? 5 : 10);
    if (h.p >= need) {
      delete H.holds[id];
      if (h.type === 'plant') {
        H.bomb = { s: 'planted', x: p.x, z: p.z, t: BOMBT };
        bcast({ t: 'msg', text: 'The bomb has been planted', short: 1 }); sendRS();
      } else { H.bomb.s = 'defused'; endRound('CT', 'Bomb defused'); }
    }
  }
}

// ---------- bots ----------
function botInit(b) {
  const a = b.ai = { path: [], pi: 0, tgt: null, react: 0, cd: 0, burst: 4, lost: 9, strafe: 0, sd: 1, lx: b.x, lz: b.z, st: 0, unst: 0, ua: 0, skill: rnd(.8, 1.3), guard: null, home: null, wp: null, wt: 0 };
  if (b.team === 'T') {
    const site = Math.random() < .75 ? H.plan : (H.plan === 'A' ? 'B' : 'A');
    a.path = ROUTES[site].map(q => [q[0] + rnd(-1, 1), q[1] + rnd(-1, 1)]);
  } else {
    const r = Math.random(), k = r < .35 ? 'A' : r < .7 ? 'B' : 'M';
    a.path = [[HOLDS[k][0][0] + rnd(-2, 2), HOLDS[k][0][1] + rnd(-1, 1)]];
  }
  a.home = a.path[a.path.length - 1];
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
  let dx = tgt.x - ox, dy = tgt.y + (Math.random() < .14 ? 1.62 : 1.15) - oy, dz = tgt.z - oz;
  const L = Math.hypot(dx, dy, dz); dx /= L; dy /= L; dz /= L;
  const err = (w.spread * .8 + .004 + dist * .0007) / a.skill;
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
  a.cd = w.delay * (w.auto ? 1 : 1.5) + rnd(0, .12);
  if (--a.burst <= 0) { a.cd += rnd(.4, .9); a.burst = 3 + (Math.random() * 5 | 0); }
}
function botThink(b, dt) {
  const a = b.ai; if (!a || !b.alive) return;
  const eyeY = b.y + 1.55;
  a.cd -= dt; a.react -= dt;
  let tgt = null, bd = 1e9;
  for (const e of list()) {
    if (!e.alive || e.team === b.team) continue;
    const dx = e.x - b.x, dz = e.z - b.z, d = Math.hypot(dx, dz);
    if (d > 55 || d >= bd) continue;
    const dot = (dx * -Math.sin(b.yaw) + dz * -Math.cos(b.yaw)) / (d || 1);
    if (d > 9 && dot < .3 && a.tgt !== e.id) continue;
    if (!losClear(b.x, eyeY, b.z, e.x, e.y + 1.25, e.z)) continue;
    tgt = e; bd = d;
  }
  if (tgt) { if (a.tgt !== tgt.id) { a.tgt = tgt.id; a.react = (.25 + Math.random() * .3) / a.skill; } a.lost = 0; }
  else { a.lost += dt; if (a.lost > 1.2) a.tgt = null; }

  let mvx = 0, mvz = 0, want = false, speed = 4.3, gx = null, gz = null;
  const holding = H.holds[b.id];
  if (tgt) {
    if (holding) delete H.holds[b.id];
    const dx = tgt.x - b.x, dz = tgt.z - b.z, dy = (tgt.y + 1.3) - eyeY;
    const ty = Math.atan2(-dx, -dz), tp = Math.atan2(dy, Math.hypot(dx, dz));
    b.yaw = turn(b.yaw, ty, 8 * dt * a.skill);
    b.pitch += clamp(tp - b.pitch, -6 * dt, 6 * dt);
    if (H.phase === 'live' && Math.abs(angDiff(ty, b.yaw)) < .1 && a.react <= 0 && a.cd <= 0) botFire(b, tgt, bd);
    a.strafe -= dt;
    if (a.strafe <= 0) { a.strafe = rnd(.4, 1.3); a.sd = Math.random() < .25 ? 0 : (Math.random() < .5 ? -1 : 1); }
    if (a.sd) { mvx = Math.cos(b.yaw) * a.sd; mvz = -Math.sin(b.yaw) * a.sd; want = true; speed = 2.6; }
  } else if (!holding) {
    const bm = H.bomb;
    if (bm.s === 'planted') {
      if (b.team === 'CT') {
        gx = bm.x; gz = bm.z;
        if (Math.hypot(gx - b.x, gz - b.z) < 1.6) { startHold(b, 'defuse'); gx = null; }
      } else {
        if (!a.guard) { const ang = Math.random() * 6.28, r = 3 + Math.random() * 4; a.guard = [bm.x + Math.cos(ang) * r, bm.z + Math.sin(ang) * r]; }
        gx = a.guard[0]; gz = a.guard[1];
        if (Math.hypot(gx - b.x, gz - b.z) < 1.5) gx = null;
      }
    } else {
      const wp = a.path[a.pi];
      if (wp) { gx = wp[0]; gz = wp[1]; if (Math.hypot(gx - b.x, gz - b.z) < 1.3) a.pi++; }
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
  a.st += dt;
  if (a.st > .7) {
    if (want && !tgt && Math.hypot(b.x - a.lx, b.z - a.lz) < .25) { a.unst = .6; a.ua = (Math.random() < .5 ? 1 : -1) * rnd(1.2, 2.0); }
    a.lx = b.x; a.lz = b.z; a.st = 0;
  }
  if (a.unst > 0) { a.unst -= dt; const c = Math.cos(a.ua), s = Math.sin(a.ua); const nx = mvx * c - mvz * s, nz = mvx * s + mvz * c; mvx = nx; mvz = nz; want = true; }
  if (want && !H.holds[b.id] && H.phase === 'live') moveE(b, mvx * speed * dt, 0, mvz * speed * dt, 1.75);
  b.w = b.prim || b.sec;
}

// ---------- API ----------
export function init(o = {}) {
  H.size = o.size || 5; H.botsOn = o.bots !== false; H.headless = !!o.headless;
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
      if (G.net) G.net.sendTo(from, { t: 'welcome', id: from, team });
      if (first && H.headless) { startMatch(); break; }
      if (H.phase === 'freeze') {
        spawnOne(np, list().filter(q => q.alive && q.team === team).length);
        bcast({ t: 'spawn', sid: H.sid, l: [[np.id, np.x, np.z, np.yaw]] });
      }
      sendMeta(); sendRS();
      break;
    }
    case 'st': {
      if (!p || !p.alive) return;
      if (![m.x, m.y, m.z, m.yaw, m.pitch].every(Number.isFinite)) return;
      p.yaw = m.yaw; p.pitch = clamp(m.pitch, -1.6, 1.6); p.crouch = m.c ? 1 : 0;
      if (typeof m.w === 'string' && W[m.w]) p.w = m.w;
      if (m.s === H.sid && H.phase !== 'freeze') { p.x = clamp(m.x, -30, 30); p.y = clamp(m.y, 0, 10); p.z = clamp(m.z, -30, 30); }
      break;
    }
    case 'fire': {
      if (!p || !p.alive || H.phase === 'freeze' || !W[m.w]) return;
      if (![m.x, m.y, m.z, m.tx, m.ty, m.tz].every(Number.isFinite)) return;
      bcast({ t: 'shot', id: from, w: m.w, x: m.x, y: m.y, z: m.z, tx: m.tx, ty: m.ty, tz: m.tz }, from);
      break;
    }
    case 'hit': {
      const v = G.players.get(m.v);
      if (!p || !v || !p.alive || !v.alive || p.team === v.team || !W[m.w]) return;
      const w = W[m.w];
      if (m.w !== 'knife' && m.w !== p.prim && m.w !== p.sec) return;
      const n = clamp(m.n | 0, 1, w.pellets), hs = clamp(m.hs | 0, 0, n);
      applyDamage(v, p, m.w, n, hs);
      break;
    }
    case 'buy': {
      if (!p || !p.alive) return;
      if (!(H.phase === 'freeze' || (H.phase === 'live' && H.t > ROUND - 12))) return;
      if (purchase(p, m.item)) sendMeta();
      break;
    }
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
  const a = H.acc; a.rs += dt; a.snap += dt; a.meta += dt;
  if (a.rs > .25) { a.rs = 0; sendRS(); }
  if (a.snap > .05) { a.snap = 0; sendSnap(); }
  if (a.meta > 1) { a.meta = 0; sendMeta(); }
}
export const Host = { init, tick, onMsg, removePlayer, H };
