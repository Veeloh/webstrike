// Host-side gadget logic. Runs wherever host.js runs (the host's browser or the Node server), so bots can use gadgets
// too. Clients only send "I pressed the gadget key" ({ t:'gad', on, yaw, pitch }); everything else happens here.
//
// Per-player state (all on the player object, reset every round by resetPlayer):
//   gad  gadget id          gch  charges left        gcd  cooldown left (s)      gact  active time left (Adrenaline Rush)
//   gbar Ghost Walk bar     ghost / fort  mode flags  slow  slowed time left (Trip Mine)
// World state: H.objs (smoke, drone, beacon, mine), H.marks (enemies revealed to a side), shields are real boxes (see data.js).
// Everything is broadcast to clients in one small 'gs' message (4 Hz, plus immediately after any change).
import { G } from './state.js';
import { GADGETS, PREP_GADGETS, BOXES, DOORS, SMOKES, SCALE, castWorldBox, losClear, blockedAt, shieldRect } from './data.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createGadgets(ctx) {
  const { H, list, bcast, worldEvent, inflict, tell } = ctx;
  H.objs = []; H.marks = new Map(); H.uid = 0; H.gAcc = 0; H.shUid = 0;
  let dirty = true;

  const flags = p => (p.ghost ? 1 : 0) | (p.gact > 0 ? 2 : 0) | (p.fort ? 4 : 0) | (p.slow > 0 ? 8 : 0);

  function sendGS() {
    dirty = false; H.gAcc = 0;
    bcast({
      t: 'gs',
      p: list().map(p => [p.id, p.gch | 0, +(p.gcd || 0).toFixed(1), +(p.gact || 0).toFixed(1), +(p.gbar || 0).toFixed(1), flags(p)]),
      o: H.objs.map(o => [o.k, o.u, +o.x.toFixed(1), +o.z.toFixed(1), o.side, +Math.min(9999, Math.max(0, o.t)).toFixed(1), o.k === 'mine' && o.armT > 0 ? 1 : 0]),
      mk: [...H.marks].map(([id, m]) => [id, m.side]),
    });
  }
  function gfx(k, x, z, id) { bcast({ t: 'gfx', k, x: +x.toFixed(1), z: +z.toFixed(1), id }); }
  function deny(p, text) { tell(p, text, { deny: 1 }); }

  function resetPlayer(p) {
    const g = GADGETS[p.gad];
    p.gch = g && g.charges != null ? g.charges : 0; p.gcd = 0; p.gact = 0; p.gbar = g && g.bar ? g.bar : 0;
    p.ghost = false; p.fort = false; p.slow = 0; p.lean = 0;
    dirty = true;
  }
  function resetRound() {
    H.objs.length = 0; H.marks.clear(); SMOKES.length = 0; H.shUid = 0; dirty = true;
  }

  // ---------- helpers ----------
  function aim(p, m) {
    const yaw = Number.isFinite(m.yaw) ? m.yaw : p.yaw, pitch = clamp(Number.isFinite(m.pitch) ? m.pitch : p.pitch, -1.5, 1.5), c = Math.cos(pitch);
    return { yaw, pitch, ox: p.x, oy: p.y + (p.crouch ? 1.15 : 1.55), oz: p.z, dx: -Math.sin(yaw) * c, dy: Math.sin(pitch), dz: -Math.cos(yaw) * c };
  }
  // Where the player is aiming, up to maxd. Bots pass m.d to place things straight ahead on the floor instead.
  function pointAt(p, m, maxd) {
    const a = aim(p, m);
    if (Number.isFinite(m.d)) {
      const d = clamp(m.d, 0, maxd);
      return { a, bi: -1, t: d, x: a.ox - Math.sin(a.yaw) * d, y: 0, z: a.oz - Math.cos(a.yaw) * d, hx: -Math.sin(a.yaw), hz: -Math.cos(a.yaw), wall: false };
    }
    const r = castWorldBox(a.ox, a.oy, a.oz, a.dx, a.dy, a.dz, maxd), hh = Math.hypot(a.dx, a.dz) || 1;
    return { a, bi: r.bi, t: r.t, x: a.ox + a.dx * r.t, y: a.oy + a.dy * r.t, z: a.oz + a.dz * r.t, hx: a.dx / hh, hz: a.dz / hh, wall: r.bi >= 0 };
  }
  // A floor spot for a placed gadget: step back from walls until the spot is free. null = no room.
  function floorSpot(pt) {
    let x = pt.x, z = pt.z;
    if (pt.wall) { x -= pt.hx * .7; z -= pt.hz * .7; }
    for (let i = 0; i < 8; i++) {
      if (!blockedAt(x, z)) return [x, z];
      x -= pt.hx * .5; z -= pt.hz * .5;
    }
    return null;
  }
  function addObj(o) { o.u = ++H.uid; H.objs.push(o); dirty = true; return o; }
  function rmObj(o) {
    const i = H.objs.indexOf(o); if (i >= 0) H.objs.splice(i, 1);
    const j = SMOKES.indexOf(o); if (j >= 0) SMOKES.splice(j, 1);
    dirty = true;
  }
  function mark(e, side, secs) {
    const m = H.marks.get(e.id);
    if (!m || m.side !== side || m.t < secs) { H.marks.set(e.id, { side, t: secs }); dirty = true; }
  }
  function cancelGhost(p) {
    if (!p.ghost) return;
    p.ghost = false; dirty = true; gfx('ghostoff', p.x, p.z, p.id);
  }
  const spend = (p, g) => { if (g.charges != null) p.gch--; p.gcd = g.cd || 0; dirty = true; };

  // ---------- using a gadget ----------
  function use(p, m = {}) {
    if (!p || !p.alive) return false;
    const g = GADGETS[p.gad]; if (!g) return false;
    const prepOk = H.phase === 'freeze' && p.team === 'CT' && PREP_GADGETS.has(p.gad);
    if (H.phase !== 'live' && !prepOk) return false;
    if (H.holds[p.id]) return false;                                  // busy planting / defusing
    if (g.charges != null && p.gch <= 0) { deny(p, g.name + ': none left'); return false; }
    if (!g.hold && p.gcd > 0) return false;                           // still cooling down (the HUD shows it)

    switch (p.gad) {
      case 'smoke': {
        const pt = pointAt(p, m, g.throwD);
        const x = pt.x - (pt.wall ? pt.hx * 1.0 : 0), z = pt.z - (pt.wall ? pt.hz * 1.0 : 0);
        const o = addObj({ k: 'smoke', x, z, r: g.r, t: g.dur, side: p.team, owner: p.id });
        SMOKES.push(o); spend(p, g); gfx('smoke', x, z, p.id);
        return true;
      }
      case 'breach': {
        const a = aim(p, m), r = castWorldBox(a.ox, a.oy, a.oz, a.dx, a.dy, a.dz, g.range), b = r.bi >= 0 ? BOXES[r.bi] : null;
        if (!b) { deny(p, 'Nothing to breach'); return false; }
        const hx = a.ox + a.dx * r.t, hz = a.oz + a.dz * r.t;
        if (b.rf) { deny(p, 'Reinforced wall'); return false; }
        if (b.bar !== undefined) { H.whp.delete(r.bi); worldEvent({ k: 'barr', d: b.bar, on: false }); }
        else if (b.sh !== undefined) { H.whp.delete(r.bi); worldEvent({ k: 'shieldoff', u: b.sh }); }
        else if (b.brk) { worldEvent({ k: 'hole', i: r.bi, x: +clamp(hx, b.x0, b.x1).toFixed(2), z: +clamp(hz, b.z0, b.z1).toFixed(2) }); }
        else { deny(p, 'Not a breakable wall'); return false; }
        spend(p, g); gfx('breach', hx, hz, p.id);
        return true;
      }
      case 'ghost': {
        if (p.ghost) return true;
        if (p.gbar < g.min) { deny(p, 'Ghost Walk recharging'); return false; }
        p.ghost = true; dirty = true; gfx('ghost', p.x, p.z, p.id);
        return true;
      }
      case 'rush': {
        if (p.gact > 0) return false;
        p.gact = g.dur; p.gcd = g.cd; dirty = true; gfx('rush', p.x, p.z, p.id);
        return true;
      }
      case 'recon': {
        const pt = pointAt(p, m, g.throwD);
        const x = pt.x - (pt.wall ? pt.hx * 1.0 : 0), z = pt.z - (pt.wall ? pt.hz * 1.0 : 0);
        addObj({ k: 'drone', x, z, t: g.dur, side: p.team, owner: p.id });
        spend(p, g); gfx('drone', x, z, p.id);
        return true;
      }
      case 'shield': {
        const a = aim(p, m), alongX = Math.abs(Math.cos(a.yaw)) >= Math.abs(Math.sin(a.yaw));   // panel faces the way you look (snapped to an axis)
        const x = p.x - Math.sin(a.yaw) * 2.4, z = p.z - Math.cos(a.yaw) * 2.4, rc = shieldRect(x, z, alongX);
        for (const b of BOXES) if (!b.off && b.y0 < 2 && b.x1 > rc.x0 && b.x0 < rc.x1 && b.z1 > rc.z0 && b.z0 < rc.z1) { deny(p, 'No room for a shield here'); return false; }
        for (const q of list()) if (q.alive && q.x > rc.x0 - .5 && q.x < rc.x1 + .5 && q.z > rc.z0 - .5 && q.z < rc.z1 + .5) { deny(p, 'Someone is in the way'); return false; }
        worldEvent({ k: 'shield', u: ++H.shUid, x: +x.toFixed(2), z: +z.toFixed(2), ax: alongX ? 1 : 0 });
        spend(p, g); gfx('shield', x, z, p.id);
        return true;
      }
      case 'reinforce': {
        const a = aim(p, m), r = castWorldBox(a.ox, a.oy, a.oz, a.dx, a.dy, a.dz, g.range), b = r.bi >= 0 ? BOXES[r.bi] : null;
        if (!b || !b.brk) { deny(p, 'Aim at a breakable wall'); return false; }
        if (b.rf) { deny(p, 'Already reinforced'); return false; }
        worldEvent({ k: 'rf', i: r.bi });
        spend(p, g); gfx('reinforce', a.ox + a.dx * r.t, a.oz + a.dz * r.t, p.id);
        return true;
      }
      case 'beacon': case 'mine': {
        const pt = pointAt(p, m, g.throwD), spot = floorSpot(pt);
        if (!spot) { deny(p, 'No room here'); return false; }
        const base = { x: spot[0], z: spot[1], t: 9999, side: p.team, owner: p.id };
        if (p.gad === 'beacon') addObj({ ...base, k: 'beacon', in: new Set() });
        else addObj({ ...base, k: 'mine', armT: 1 });
        spend(p, g); gfx(p.gad === 'beacon' ? 'beaconset' : 'mineset', spot[0], spot[1], p.id);
        return true;
      }
      case 'fortify': {
        if (p.fort) { p.fort = false; p.gcd = g.cd; dirty = true; gfx('unfort', p.x, p.z, p.id); return true; }
        if (p.y > .3) return false;                                   // only on the ground
        p.fort = true; p.gcd = g.cd; dirty = true; gfx('fort', p.x, p.z, p.id);
        return true;
      }
    }
    return false;
  }
  function release(p) { if (p && p.ghost) cancelGhost(p); }
  // Message from a client (or a bot): { on: true|false, yaw, pitch }.
  function msg(p, m) { if (m.on === false) release(p); else use(p, m); }

  // ---------- per-tick ----------
  function tick(dt) {
    for (const p of list()) {
      if (!p.alive) { if (p.ghost || p.fort || p.gact > 0 || p.slow > 0) { p.ghost = false; p.fort = false; p.gact = 0; p.slow = 0; dirty = true; } continue; }
      const g = GADGETS[p.gad]; if (!g) continue;
      if (p.gcd > 0) p.gcd = Math.max(0, p.gcd - dt);
      if (p.gact > 0) { p.gact = Math.max(0, p.gact - dt); if (p.gact === 0) dirty = true; }
      if (p.slow > 0) { p.slow = Math.max(0, p.slow - dt); if (p.slow === 0) dirty = true; }
      if (g.bar) {
        if (p.ghost) { p.gbar -= dt; if (p.gbar <= 0) { p.gbar = 0; cancelGhost(p); } }
        else if (p.gbar < g.bar) p.gbar = Math.min(g.bar, p.gbar + g.regen * dt);
      }
    }
    if (H.phase === 'live') {
      for (const o of [...H.objs]) {
        const g = GADGETS[o.k === 'drone' ? 'recon' : o.k];
        if (o.k === 'smoke' || o.k === 'drone') { o.t -= dt; if (o.t <= 0) { rmObj(o); continue; } }
        if (o.k === 'drone') {
          for (const e of list()) {
            if (!e.alive || e.team === o.side || Math.hypot(e.x - o.x, e.z - o.z) > g.r) continue;
            if (losClear(o.x, 2.6, o.z, e.x, e.y + 1.2, e.z)) mark(e, o.side, 1.4);
          }
        } else if (o.k === 'beacon') {
          for (const e of list()) {
            if (!e.alive || e.team === o.side) { o.in.delete(e.id); continue; }
            const inside = Math.hypot(e.x - o.x, e.z - o.z) < g.r && e.y < 2.5;
            if (inside && !o.in.has(e.id)) { o.in.add(e.id); mark(e, o.side, g.mark); gfx('ping', o.x, o.z, e.id); dirty = true; }
            else if (!inside) o.in.delete(e.id);
          }
        } else if (o.k === 'mine') {
          if (o.armT > 0) { o.armT -= dt; if (o.armT <= 0) dirty = true; continue; }
          for (const e of list()) {
            if (!e.alive || e.team === o.side || e.y > 1.3 || Math.hypot(e.x - o.x, e.z - o.z) > g.r) continue;
            rmObj(o); gfx('mine', o.x, o.z, e.id);
            inflict(e, G.players.get(o.owner) || null, g.dmg, 'mine', 0, { pierce: true });
            e.slow = g.slow; mark(e, o.side, 2); dirty = true;
            break;
          }
        }
      }
      for (const [id, m] of H.marks) {
        m.t -= dt; const e = G.players.get(id);
        if (m.t <= 0 || !e || !e.alive) { H.marks.delete(id); dirty = true; }
      }
    }
    H.gAcc += dt;
    if (dirty || H.gAcc > .25) sendGS();
  }

  // ---------- bots ----------
  // One simple rule per operator. Called every bot tick (live round) after the bot has looked for a target.
  //   s = { tgt, bd, atEnd (reached the end of its route / hold spot), thr: [x, z] point it watches }
  const ready = (b, g) => b.gcd <= 0 && (g.charges == null || b.gch > 0);
  function yawTo(b, x, z) { return Math.atan2(-(x - b.x), -(z - b.z)); }
  function bot(b, dt, s) {
    const g = GADGETS[b.gad], a = b.ai; if (!g || !a) return;
    // Ghost Walk: sneak in on approach, switch back (and give the bot a beat to draw its gun) the moment it sees someone.
    if (b.ghost && (s.tgt || s.atEnd || H.bomb.s !== 'none')) { cancelGhost(b); a.react = Math.max(a.react, .35); }
    a.gt = (a.gt || 0) - dt; if (a.gt > 0) return; a.gt = .2;
    switch (b.gad) {
      case 'smoke':   // spot an enemy down a long lane -> smoke the middle of it, then keep advancing
        if (s.tgt && s.bd > 8 * SCALE && ready(b, g)) use(b, { yaw: b.yaw, pitch: 0, d: s.bd * .45 });
        break;
      case 'breach':  // stuck against a breakable wall / barricade -> charge it
        if (a.mv && (a.unst > 0 || a.breach != null) && ready(b, g)) {
          const r = castWorldBox(b.x, b.y + 1.0, b.z, a.mv[0], 0, a.mv[1], g.range), w = r.bi >= 0 ? BOXES[r.bi] : null;
          if (w && ((w.brk && !w.rf) || w.bar !== undefined)) { b.yaw = Math.atan2(-a.mv[0], -a.mv[1]); use(b, { yaw: b.yaw, pitch: 0 }); }
        }
        break;
      case 'ghost':
        if (!b.ghost && !s.tgt && !s.atEnd && H.bomb.s === 'none' && b.gbar >= g.bar - 1.5 && a.mv) use(b, {});
        break;
      case 'rush':    // enemy in sight -> pop it
        if (s.tgt && s.bd < 25 * SCALE && ready(b, g) && b.gact <= 0) use(b, {});
        break;
      case 'recon':   // near the end of the route: send a drone ahead once
        if (!s.tgt && !a.did && a.pi >= Math.max(1, a.path.length - 2) && ready(b, g)) { a.did = 1; use(b, { yaw: b.yaw, pitch: 0, d: 14 }); }
        break;
      case 'shield':  // at the hold spot: panel across the chokepoint it is watching
        if (s.atEnd && !s.tgt && !a.did && ready(b, g)) { a.did = 1; b.yaw = yawTo(b, s.thr[0], s.thr[1]); use(b, { yaw: b.yaw, pitch: 0 }); }
        break;
      case 'reinforce': // at the hold spot: reinforce the nearest breakable wall it can see
        if (s.atEnd && !s.tgt && !a.did && ready(b, g)) {
          a.did = 1;
          const ex = b.x, ey = b.y + 1.55, ez = b.z; let best = -1, bd = 10;
          for (let i = 0; i < BOXES.length; i++) {
            const w = BOXES[i]; if (w.off || !w.brk || w.rf) continue;
            const cx = clamp(ex, w.x0, w.x1), cz = clamp(ez, w.z0, w.z1), d = Math.hypot(cx - ex, cz - ez);
            if (d >= bd) continue;
            const dx = cx - ex, dy = 1.5 - ey, dz = cz - ez, L = Math.hypot(dx, dy, dz) || 1;
            if (castWorldBox(ex, ey, ez, dx / L, dy / L, dz / L, 10).bi === i) { best = i; bd = d; }
          }
          if (best >= 0) {
            const w = BOXES[best], cx = clamp(ex, w.x0, w.x1), cz = clamp(ez, w.z0, w.z1), dx = cx - ex, dz = cz - ez;
            b.yaw = Math.atan2(-dx, -dz);
            use(b, { yaw: b.yaw, pitch: Math.atan2(1.5 - ey, Math.hypot(dx, dz)) });
          }
        }
        break;
      case 'beacon': case 'mine': { // at the hold spot: lay them in the lane, a bit further out each time
        if (s.atEnd && !s.tgt && ready(b, g) && (a.dn || 0) < 3) {
          const d = (p => p === 'beacon' ? [8, 5] : [4.5, 3, 6])(b.gad)[a.dn || 0];
          if (d == null) { a.dn = 9; break; }
          a.dn = (a.dn || 0) + 1; b.yaw = yawTo(b, s.thr[0], s.thr[1]); use(b, { yaw: b.yaw, pitch: 0, d });
        }
        break;
      }
      case 'fortify': // dig in when it sees someone far off; pick up again when the bomb goes down and nobody is in sight
        if (!b.fort && s.tgt && s.bd > 6 * SCALE && ready(b, g)) use(b, {});
        else if (b.fort && !s.tgt && a.lost > 4 && H.bomb.s === 'planted' && ready(b, g)) use(b, {});
        break;
    }
  }

  return { resetPlayer, resetRound, use, release, msg, tick, bot, cancelGhost, sendGS, mark: (e, side, secs) => mark(e, side, secs), flags };
}
