// WEBSTRIKE client: rendering, input, local player, HUD, menus.
import * as THREE from 'three';
import { G } from './state.js';
import { W, BOXES, BUILDINGS, ROOFS, SITES, SCALE, moveE, castWorld, rayPlayer, inSite } from './data.js';
import { Host } from './host.js';
import { Net } from './net.js';
import { sfx, initAudio, setVolume } from './audio.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = { sens: +(localStorage.ws_sens || 1), vol: +(localStorage.ws_vol || .5), name: localStorage.ws_name || '' };

// ---------------- three.js scene ----------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fb8e0);
scene.fog = new THREE.Fog(0x8fb8e0, 45 * SCALE, 120 * SCALE);
const cam = new THREE.PerspectiveCamera(75, 1, .05, 250 * SCALE);
cam.rotation.order = 'YXZ';
scene.add(cam);
scene.add(new THREE.HemisphereLight(0xffffff, 0x887766, 1.1));
const sun = new THREE.DirectionalLight(0xfff2d6, 1.4); sun.position.set(20, 40, 10); scene.add(sun);
function resize() { renderer.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

function mkTex(draw, w = 128, h = 128) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const floorTex = mkTex((x, w, h) => {
  x.fillStyle = '#c9b27c'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 600; i++) { x.fillStyle = `rgba(${100 + Math.random() * 60 | 0},${80 + Math.random() * 50 | 0},50,.12)`; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  x.strokeStyle = 'rgba(90,70,40,.35)'; x.strokeRect(0, 0, w, h);
});
floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(31 * SCALE, 31 * SCALE);
const crateTex = mkTex((x, w, h) => {
  x.fillStyle = '#a06f38'; x.fillRect(0, 0, w, h);
  x.strokeStyle = '#5a3a18'; x.lineWidth = 6; x.strokeRect(3, 3, w - 6, h - 6);
  x.lineWidth = 3; for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo(0, i * h / 4); x.lineTo(w, i * h / 4); x.stroke(); }
  x.beginPath(); x.moveTo(0, 0); x.lineTo(w, h); x.moveTo(w, 0); x.lineTo(0, h); x.stroke();
});
const floor = new THREE.Mesh(new THREE.PlaneGeometry(62 * SCALE, 62 * SCALE), new THREE.MeshLambertMaterial({ map: floorTex }));
floor.rotation.x = -Math.PI / 2; scene.add(floor);
const wallMat = new THREE.MeshLambertMaterial({ color: 0xd9c9a0 }), crateMat = new THREE.MeshLambertMaterial({ map: crateTex });
const edgeMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: .28 });
const glassMat = new THREE.MeshLambertMaterial({ color: 0x9fd8ff, transparent: true, opacity: .3, depthWrite: false });
const roofMat = new THREE.MeshLambertMaterial({ color: 0xa4553b }), roofEdgeMat = new THREE.LineBasicMaterial({ color: 0x3b1f17, transparent: true, opacity: .45 });
for (const b of BOXES) {
  const g = new THREE.BoxGeometry(b.w, b.h, b.d);
  const m = new THREE.Mesh(g, b.c === 1 ? crateMat : b.c === 2 ? glassMat : wallMat); m.position.set(b.x, b.y + b.h / 2, b.z); scene.add(m);
  if (b.c !== 2) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), edgeMat); e.position.copy(m.position); scene.add(e); }
}
// Gabled roofs (render-only): triangular prism along the building's long axis.
for (const r of ROOFS) {
  const sh = new THREE.Shape(); sh.moveTo(-r.hw, 0); sh.lineTo(r.hw, 0); sh.lineTo(0, r.rise); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: r.len, bevelEnabled: false });
  g.translate(0, 0, -r.len / 2);
  if (r.alongX) g.rotateY(Math.PI / 2);
  const m = new THREE.Mesh(g, roofMat); m.position.set(r.x, r.y, r.z); scene.add(m);
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), roofEdgeMat); e.position.copy(m.position); scene.add(e);
}
for (const k in SITES) {
  const s = SITES[k];
  const t = mkTex((x, w, h) => {
    x.strokeStyle = 'rgba(230,60,40,.9)'; x.lineWidth = 8; x.beginPath(); x.arc(w / 2, h / 2, w / 2 - 8, 0, 7); x.stroke();
    x.fillStyle = 'rgba(230,60,40,.85)'; x.font = 'bold 120px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(k, w / 2, h / 2 + 6);
  }, 256, 256);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(s.r * 2, s.r * 2), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(s.x, .03, s.z); scene.add(m);
}

// ---------------- gun models ----------------
// Builds a small group of primitives per weapon id, giving each a distinct silhouette.
// Convention: forward (muzzle) is -Z, origin sits roughly at the grip, matching the
// old single-box viewmodel so tracers/flash/hand positions still line up.
const metal = 0x161616, dark = 0x101010, wood = 0x5a3a1e;
function gBox(w, h, d, c) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: c })); }
function gCyl(r, h, c) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 10), new THREE.MeshLambertMaterial({ color: c }));
  m.rotation.x = Math.PI / 2; return m;
}
function buildGun(wid) {
  const w = W[wid], col = w.col, g = new THREE.Group();
  const add = (mesh, x, y, z, rx = 0) => { mesh.position.set(x, y, z); mesh.rotation.x = rx; g.add(mesh); return mesh; };
  switch (wid) {
    case 'knife':
      add(gBox(.03, .04, .26, 0xd8d8d8), 0, .01, -.17);
      add(gBox(.035, .045, .13), 0, 0, .04, 0).material.color.setHex(0x3a3a3a);
      break;
    case 'pistol':
      add(gBox(.055, .07, .18, col), 0, .03, -.09);
      add(gBox(.02, .02, .05, metal), 0, .03, -.21);
      add(gBox(.045, .12, .06, dark), 0, -.065, .03, .16);
      break;
    case 'deagle':
      add(gBox(.065, .08, .24, col), 0, .035, -.1);
      add(gBox(.02, .02, .05, metal), 0, .08, -.09);
      add(gBox(.025, .025, .06, metal), 0, .035, -.25);
      add(gBox(.05, .14, .07, dark), 0, -.075, .05, .14);
      break;
    case 'smg':
      add(gBox(.06, .08, .3, col), 0, .02, -.1);
      add(gBox(.035, .14, .05, dark), 0, -.08, -.05, -.25);
      add(gBox(.03, .04, .18, dark), 0, .02, .2);
      add(gBox(.035, .1, .05, dark), 0, -.07, .08, .2);
      add(gBox(.03, .05, .03, dark), 0, -.05, -.22);
      break;
    case 'shotgun':
      add(gCyl(.02, .42, metal), 0, .03, -.25);
      add(gBox(.06, .05, .14, wood), 0, -.01, -.3);
      add(gBox(.06, .08, .2, col), 0, .02, 0);
      add(gBox(.045, .08, .22, wood), 0, -.01, .2, .1);
      break;
    case 'rifle':
      add(gCyl(.014, .3, metal), 0, .03, -.32);
      add(gBox(.06, .09, .4, col), 0, .02, -.05);
      add(gBox(.045, .22, .06, dark), 0, -.14, -.05, -.3);
      add(gBox(.035, .05, .2, col), 0, 0, .25);
      add(gBox(.015, .04, .015, metal), 0, .09, -.3);
      add(gBox(.02, .02, .03, metal), 0, .08, .02);
      break;
    case 'awp':
      add(gCyl(.016, .5, metal), 0, .02, -.37);
      add(gBox(.06, .08, .45, col), 0, .02, -.02);
      add(gCyl(.03, .22, 0x0a0a0a), 0, .11, -.1);
      add(gBox(.045, .09, .3, wood), 0, -.01, .3, .07);
      add(gBox(.035, .1, .05, dark), 0, -.09, -.05);
      break;
  }
  return g;
}

// viewmodel
const vm = new THREE.Group(); cam.add(vm); vm.position.set(.22, -.2, -.5);
let vmGun = null;
const vmHand = new THREE.Mesh(new THREE.BoxGeometry(.08, .08, .12), new THREE.MeshLambertMaterial({ color: 0xe0b890 })); vmHand.position.set(0, -.07, .08); vm.add(vmHand);
const flash = new THREE.Mesh(new THREE.BoxGeometry(.09, .09, .06), new THREE.MeshBasicMaterial({ color: 0xffdd66 })); flash.visible = false; vm.add(flash);
function setVM(wid) {
  const w = W[wid];
  if (vmGun) vm.remove(vmGun);
  vmGun = buildGun(wid); vm.add(vmGun);
  flash.position.z = -w.len - .02 + .15;
}

// player models
function makeModel(p) {
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  const col = p.team === 'T' ? 0xb8803a : 0x3b5ba8, dark = p.team === 'T' ? 0x6e4a20 : 0x24376a;
  const bx = (w, h, d, c) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: c }));
  const torso = bx(.5, .6, .28, col); torso.position.y = 1.1; g.add(torso);
  const head = bx(.26, .28, .26, 0xe0b890); head.position.y = 1.56; g.add(head);
  const helm = bx(.3, .12, .3, dark); helm.position.y = 1.7; g.add(helm);
  const leg = x => { const pv = new THREE.Group(); pv.position.set(x, .8, 0); const l = bx(.2, .8, .22, dark); l.position.y = -.4; pv.add(l); g.add(pv); return pv; };
  g.userData.legL = leg(-.13); g.userData.legR = leg(.13);
  const arm = bx(.14, .5, .14, col); arm.position.set(.3, 1.15, -.15); arm.rotation.x = -1.1; g.add(arm);
  const arm2 = bx(.14, .5, .14, col); arm2.position.set(-.28, 1.15, -.2); arm2.rotation.x = -1.1; g.add(arm2);
  const gunMount = new THREE.Group(); gunMount.position.set(.22, 1.18, -.5); g.add(gunMount);
  g.userData.gunMount = gunMount; g.userData.gunWid = null;
  return g;
}
function syncGun(e, wid) {
  wid = wid || 'pistol';
  if (e.wid === wid) return;
  e.wid = wid;
  const mount = e.g.userData.gunMount;
  while (mount.children.length) mount.remove(mount.children[0]);
  mount.add(buildGun(wid));
}
function makeTag(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
  x.font = 'bold 34px sans-serif'; x.textAlign = 'center'; x.lineWidth = 6; x.strokeStyle = '#000'; x.fillStyle = '#fff';
  x.strokeText(text, 128, 44); x.fillText(text, 128, 44);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  s.scale.set(1.6, .4, 1); s.position.y = 2.15; s.renderOrder = 10; return s;
}
const ents = new Map();
const fx = [];
function addTracer(a, b) {
  const g = new THREE.BufferGeometry().setFromPoints([a, b]);
  const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: .85 }));
  scene.add(l); fx.push({ o: l, t: .07 });
}
let bombMesh = null;

// ---------------- state ----------------
let locked = false, started = false, buyOpen = false, boardOpen = false;
const ammo = {};
const keys = {};
const L = {
  vx: 0, vz: 0, vy: 0, ground: true, slot: 1, cd: 0, rl: 0, rlw: null, recoil: 0, scoped: false, mouse: false, edge: false,
  sendT: 0, useT: 0, using: false, cv: 0, eye: 1.6, sid: -1, deadT: 0, spec: null, dmg: 0, hitT: 0, hitHead: false,
  lastHp: 100, lastPrim: null, flashT: 0, kickV: 0, centerT: 0, beepT: 0, shake: 0, lastAlive: false,
};
const feed = [];
const meObj = () => G.players.get(G.myId);

function curWid() {
  const me = meObj();
  if (L.slot === 3) return 'knife';
  if (L.slot === 1 && me.prim) return me.prim;
  return me.sec || 'knife';
}
function switchSlot(s) {
  const me = meObj(); if (!me || !me.alive) return;
  if (s === 1 && !me.prim) return;
  L.slot = s; L.rl = 0; L.scoped = false; setVM(curWid());
}

// ---------------- messages from host ----------------
function showCenter(text, secs = 3.5) {
  const c = $('center'); c.textContent = text; c.style.opacity = 1; L.centerT = secs;
}
function onMetaMe() {
  const me = meObj(); if (!me) return;
  if (me.alive && me.hp < L.lastHp) { L.dmg = Math.min(1, (L.lastHp - me.hp) / 50 + .3); sfx.hurt(); }
  L.lastHp = me.hp;
  for (const w of [me.prim, me.sec]) if (w && !ammo[w]) ammo[w] = { mag: W[w].mag, res: W[w].res };
  for (const k in ammo) if (k !== me.prim && k !== me.sec) delete ammo[k];
  if (me.prim !== L.lastPrim) { if (me.prim) L.slot = 1; L.lastPrim = me.prim; setVM(curWid()); }
  if (L.lastAlive && !me.alive) { L.scoped = false; L.deadT = 0; L.spec = null; }
  L.lastAlive = me.alive;
}
function handle(m) {
  switch (m.t) {
    case 'welcome': G.myId = m.id; break;
    case 'meta': {
      const ids = new Set();
      for (const q of m.p) {
        ids.add(q.id);
        let p = G.players.get(q.id);
        if (!p) { p = { id: q.id, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, w: 'pistol', crouch: 0 }; G.players.set(q.id, p); }
        p.name = q.name; p.team = q.team; p.hp = q.hp; p.armor = q.armor; p.alive = q.alive; p.money = q.money;
        p.k = q.k; p.d = q.d; p.isBot = q.bot; p.prim = q.prim; p.sec = q.sec; p.kit = q.kit;
      }
      if (!G.isHost) for (const id of [...G.players.keys()]) if (!ids.has(id)) G.players.delete(id);
      onMetaMe();
      if (!started && G.myId && G.players.has(G.myId)) beginPlay();
      break;
    }
    case 'snap': {
      if (G.isHost) break;
      for (const e of m.e) {
        if (e[0] === G.myId) continue;
        const p = G.players.get(e[0]); if (!p) continue;
        p.x = e[1]; p.y = e[2]; p.z = e[3]; p.yaw = e[4]; p.pitch = e[5]; p.w = e[6]; p.crouch = e[7];
      }
      break;
    }
    case 'rs': {
      const prev = G.rs.phase; G.rs = m;
      if (prev !== m.phase && m.phase === 'live') sfx.go();
      break;
    }
    case 'spawn': {
      L.sid = m.sid;
      for (const [id, x, z, yaw] of m.l) {
        const p = G.players.get(id); if (!p) continue;
        p.x = x; p.y = 0; p.z = z; p.yaw = yaw; p.pitch = 0; p.alive = true; p.hp = 100;
        const e = ents.get(id); if (e) { e.x = x; e.y = 0; e.z = z; }
        if (id === G.myId) {
          L.vx = L.vz = L.vy = 0; L.rl = 0; L.scoped = false; L.cd = .3; L.lastHp = 100; L.lastAlive = true; L.spec = null;
          L.slot = p.prim ? 1 : 2; for (const k in ammo) if (ammo[k]) ammo[k].mag = Math.max(ammo[k].mag, 0);
          setVM(curWid());
        }
      }
      break;
    }
    case 'shot': {
      if (m.id === G.myId) break;
      const d = Math.hypot(m.x - cam.position.x, m.z - cam.position.z);
      sfx.shot(m.w, clamp(1 - d / 70, 0, 1));
      if (W[m.w] && !W[m.w].melee) addTracer(new THREE.Vector3(m.x, m.y - .2, m.z), new THREE.Vector3(m.tx, m.ty, m.tz));
      break;
    }
    case 'kill': {
      const f = document.createElement('div');
      f.innerHTML = `<span class="t${m.kt}">${esc(m.kn || 'World')}</span> ${m.h ? '◎' : '▸'} <span style="opacity:.7">[${esc((W[m.w] || {}).name || '')}]</span> <span class="t${m.vt}">${esc(m.vn)}</span>`;
      $('feed').appendChild(f); setTimeout(() => f.remove(), 6000);
      while ($('feed').children.length > 6) $('feed').firstChild.remove();
      break;
    }
    case 'msg': showCenter(m.text, m.short ? 1.8 : 4.5); if (/planted/.test(m.text)) sfx.plant(); break;
    case 'boom': sfx.boom(); L.shake = 1; break;
    case 'full': alert('Server is full.'); location.reload(); break;
  }
}
G.handle = handle;

// ---------------- local player ----------------
const lookDir = (yaw, pitch) => [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];

function startReload(wid) {
  const w = W[wid], a = ammo[wid];
  if (!a || w.melee || L.rl > 0 || a.mag >= w.mag || a.res <= 0) return;
  L.rl = w.rl; L.rlw = wid; L.scoped = false; sfx.reload();
}
function finishReload() {
  const a = ammo[L.rlw], w = W[L.rlw];
  if (a && curWid() === L.rlw) { const take = Math.min(w.mag - a.mag, a.res); a.mag += take; a.res -= take; }
  L.rl = 0;
}
function fire(me, wid, w) {
  const a = ammo[wid];
  if (!w.melee) { if (!a) return; if (a.mag <= 0) { startReload(wid); return; } a.mag--; }
  L.cd = w.delay;
  const ox = me.x, oy = me.y + L.eye, oz = me.z, speed = Math.hypot(L.vx, L.vz);
  let sp = w.spread + speed * .0022 + (L.ground ? 0 : .05) + L.recoil * .0035;
  if (wid === 'awp') sp = L.scoped ? .0008 + speed * .0004 : .07 + sp;
  if (L.cv > .5) sp *= .7;
  const agg = new Map(); let end = null;
  for (let i = 0; i < w.pellets; i++) {
    let [dx, dy, dz] = lookDir(me.yaw, me.pitch);
    if (!w.melee) { dx += (Math.random() - .5) * 2 * sp; dy += (Math.random() - .5) * 2 * sp; dz += (Math.random() - .5) * 2 * sp; const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l; }
    let best = castWorld(ox, oy, oz, dx, dy, dz, w.range), hit = null, head = false;
    for (const e of G.players.values()) {
      if (!e.alive || e.team === me.team || e.id === me.id) continue;
      const r = rayPlayer(e, ox, oy, oz, dx, dy, dz);
      if (r && r.t < best) { best = r.t; hit = e; head = r.head; }
    }
    if (i === 0) end = [ox + dx * best, oy + dy * best, oz + dz * best];
    if (hit) { const g = agg.get(hit.id) || { n: 0, hs: 0 }; g.n++; if (head) g.hs++; agg.set(hit.id, g); }
  }
  G.send({ t: 'fire', w: wid, x: ox, y: oy, z: oz, tx: end[0], ty: end[1], tz: end[2] });
  for (const [v, g] of agg) { G.send({ t: 'hit', v, w: wid, n: g.n, hs: g.hs }); L.hitT = .18; L.hitHead = g.hs > 0; sfx.hit(); }
  sfx.shot(wid, 1);
  if (!w.melee) {
    L.recoil = Math.min(L.recoil + 1, 10); me.pitch = clamp(me.pitch + w.kick, -1.5, 1.5); me.yaw += (Math.random() - .5) * w.kick * .6;
    L.flashT = .05; L.kickV = 1;
    cam.updateMatrixWorld();
    addTracer(new THREE.Vector3(.22, -.25, -.9).applyMatrix4(cam.matrixWorld), new THREE.Vector3(end[0], end[1], end[2]));
  } else L.kickV = 1;
}

function localUpdate(dt) {
  const me = meObj(); if (!me) return;
  const rs = G.rs;
  L.cd -= dt; L.recoil = Math.max(0, L.recoil - dt * 6); L.kickV = Math.max(0, L.kickV - dt * 8);
  if (L.rl > 0) { L.rl -= dt; if (L.rl <= 0) finishReload(); }
  if (me.alive) {
    L.deadT = 0;
    const canMove = rs.phase !== 'freeze' && !L.using;
    let fx_ = 0, fz = 0;
    if (keys.KeyW) fz += 1; if (keys.KeyS) fz -= 1; if (keys.KeyD) fx_ += 1; if (keys.KeyA) fx_ -= 1;
    const len = Math.hypot(fx_, fz) || 1; fx_ /= len; fz /= len;
    const wid0 = curWid();
    L.cvT = keys.KeyC ? 1 : 0; L.cv += (L.cvT - L.cv) * Math.min(1, dt * 12);
    let sp = keys.ShiftLeft ? 2.6 : (L.cv > .5 ? 2.2 : 5.2);
    if (wid0 === 'awp') sp *= .85; if (wid0 === 'knife') sp *= 1.1; if (L.scoped) sp *= .5;
    const sy = Math.sin(me.yaw), cy = Math.cos(me.yaw);
    const tvx = canMove ? ((-sy) * fz + cy * fx_) * sp : 0, tvz = canMove ? ((-cy) * fz + (-sy) * fx_) * sp : 0;
    const k = Math.min(1, (L.ground ? 12 : 2.5) * dt);
    L.vx += (tvx - L.vx) * k; L.vz += (tvz - L.vz) * k;
    if (keys.Space && L.ground && canMove) { L.vy = 6.6; L.ground = false; }
    L.vy -= 20 * dt;
    const h = 1.75 - .5 * L.cv;
    const fl = moveE(me, L.vx * dt, L.vy * dt, L.vz * dt, h);
    L.ground = !!(fl & 1); if (L.ground && L.vy < 0) L.vy = 0; if ((fl & 2) && L.vy > 0) L.vy = 0;
    me.crouch = L.cv > .5 ? 1 : 0;
    L.eye = 1.6 - .45 * L.cv;
    me.w = wid0;

    // use (plant / defuse)
    const eligible = rs.phase === 'live' && ((me.team === 'T' && rs.bomb.s === 'none' && inSite(me)) ||
      (me.team === 'CT' && rs.bomb.s === 'planted' && Math.hypot(me.x - rs.bomb.x, me.z - rs.bomb.z) < 2.2));
    const wantUse = !!keys.KeyE && eligible;
    if (wantUse) { L.useT -= dt; if (L.useT <= 0) { G.send({ t: 'use', on: true }); L.useT = .2; } }
    else if (L.using) G.send({ t: 'use', on: false });
    L.using = wantUse;

    // weapons
    const wid = curWid(), w = W[wid];
    const trigger = (w.auto ? L.mouse : L.edge) && locked && !buyOpen;
    if (trigger && rs.phase !== 'freeze' && L.cd <= 0 && L.rl <= 0 && !L.using) fire(me, wid, w);
    L.edge = false;
    if (ammo[wid] && ammo[wid].mag <= 0 && L.rl <= 0 && L.cd <= 0) startReload(wid);

    cam.position.set(me.x, me.y + L.eye, me.z);
    cam.rotation.set(me.pitch, me.yaw, 0);
    cam.fov += ((L.scoped ? 22 : 75) - cam.fov) * Math.min(1, dt * 14); cam.updateProjectionMatrix();
    vm.visible = !L.scoped;
  } else {
    L.using = false; L.deadT += dt; L.scoped = false; cam.fov = 75; cam.updateProjectionMatrix(); vm.visible = false;
    let tg = G.players.get(L.spec);
    if (L.deadT > 1.3 && (!tg || !tg.alive)) {
      tg = [...G.players.values()].find(p => p.alive && p.team === me.team && p.id !== me.id) || null; L.spec = tg ? tg.id : null;
    }
    if (L.deadT > 1.3 && tg) { cam.position.set(tg.x, tg.y + 1.6, tg.z); cam.rotation.set(tg.pitch, tg.yaw, 0); }
    else { cam.position.set(me.x, me.y + Math.max(.4, 1.6 - L.deadT), me.z); cam.rotation.set(me.pitch, me.yaw, 0); }
  }
  if (L.shake > 0) { L.shake = Math.max(0, L.shake - dt); cam.position.y += (Math.random() - .5) * L.shake * .3; }
  // viewmodel animation
  const bob = Math.hypot(L.vx, L.vz) > 1 ? Math.sin(performance.now() / 120) * .008 : 0;
  vm.position.set(.22, -.2 + bob - (L.rl > 0 ? .12 : 0), -.5 + L.kickV * .06);
  vm.rotation.x = L.kickV * .08;
  flash.visible = L.flashT > 0; L.flashT -= dt;
  // send state
  L.sendT -= dt;
  if (L.sendT <= 0 && me.alive && L.sid >= 0) {
    L.sendT = .05;
    G.send({ t: 'st', x: me.x, y: me.y, z: me.z, yaw: me.yaw, pitch: me.pitch, w: curWid(), c: me.crouch, s: L.sid });
  }
}

// ---------------- entities ----------------
function syncEnts(dt) {
  const me = meObj();
  for (const [id, e] of ents) if (!G.players.has(id)) { scene.remove(e.g); ents.delete(id); }
  for (const p of G.players.values()) {
    if (p.id === G.myId) continue;
    let e = ents.get(p.id);
    if (!e) {
      const g = makeModel(p); if (me && p.team === me.team) g.add(makeTag(p.name || ''));
      scene.add(g); e = { g, x: p.x, y: p.y, z: p.z, ph: 0 }; ents.set(p.id, e);
    }
    const k = Math.min(1, dt * 14), ox = e.x, oz = e.z;
    e.x += (p.x - e.x) * k; e.y += (p.y - e.y) * k; e.z += (p.z - e.z) * k;
    const sp = Math.hypot(e.x - ox, e.z - oz) / Math.max(dt, .001);
    e.ph += dt * 10;
    const sw = p.alive ? Math.sin(e.ph) * Math.min(sp / 4, 1) * .7 : 0;
    e.g.userData.legL.rotation.x = sw; e.g.userData.legR.rotation.x = -sw;
    e.g.position.set(e.x, e.y, e.z); e.g.rotation.y = p.yaw;
    syncGun(e, p.w);
    if (p.alive) { e.g.rotation.x = 0; e.g.scale.y = p.crouch ? .75 : 1; }
    else { e.g.rotation.x = -1.5; e.g.position.y = e.y + .2; e.g.scale.y = 1; }
  }
}
function fxUpdate(dt) {
  for (let i = fx.length - 1; i >= 0; i--) { fx[i].t -= dt; if (fx[i].t <= 0) { scene.remove(fx[i].o); fx[i].o.geometry.dispose(); fx.splice(i, 1); } }
  const b = G.rs.bomb;
  if (b && b.s === 'planted') {
    if (!bombMesh) {
      bombMesh = new THREE.Group();
      bombMesh.add(new THREE.Mesh(new THREE.BoxGeometry(.5, .25, .35), new THREE.MeshLambertMaterial({ color: 0x2a2a2a })));
      const led = new THREE.Mesh(new THREE.SphereGeometry(.06), new THREE.MeshBasicMaterial({ color: 0xff2020 })); led.position.y = .17; bombMesh.add(led); bombMesh.userData.led = led;
      scene.add(bombMesh);
    }
    bombMesh.position.set(b.x, .13, b.z);
    bombMesh.userData.led.visible = (performance.now() % 600) < 300;
    L.beepT -= dt;
    if (L.beepT <= 0) { sfx.beep(); L.beepT = .12 + (b.t / 40) * .9; }
  } else if (bombMesh) { scene.remove(bombMesh); bombMesh = null; }
}

// ---------------- HUD ----------------
const mini = $('mini'), mctx = mini.getContext('2d');
function drawMini() {
  const me = meObj(); if (!me) return;
  const sc = 140 / (62 * SCALE), X = x => (x + 31 * SCALE) * sc, Z = z => (z + 31 * SCALE) * sc;
  mctx.clearRect(0, 0, 140, 140);
  mctx.fillStyle = '#9a8a62';
  for (const b of BUILDINGS) mctx.fillRect(X(b.x0), Z(b.z0), (b.x1 - b.x0) * sc, (b.z1 - b.z0) * sc);
  mctx.fillStyle = '#6f5a35';
  for (const b of BOXES) if (b.c === 1) mctx.fillRect(X(b.x0), Z(b.z0), b.w * sc, b.d * sc);
  mctx.fillStyle = 'rgba(230,60,40,.9)'; mctx.font = 'bold 12px sans-serif'; mctx.textAlign = 'center';
  for (const k in SITES) mctx.fillText(k, X(SITES[k].x), Z(SITES[k].z) + 4);
  for (const p of G.players.values()) {
    if (!p.alive || p.id === me.id || p.team !== me.team) continue;
    mctx.fillStyle = p.team === 'T' ? '#f0b050' : '#6fa0ff'; mctx.beginPath(); mctx.arc(X(p.x), Z(p.z), 3, 0, 7); mctx.fill();
  }
  const b = G.rs.bomb;
  if (b && b.s === 'planted') { mctx.fillStyle = '#f33'; mctx.fillRect(X(b.x) - 3, Z(b.z) - 3, 6, 6); }
  const cx = X(me.x), cz = Z(me.z);
  mctx.save(); mctx.translate(cx, cz); mctx.rotate(-me.yaw); mctx.fillStyle = '#fff';
  mctx.beginPath(); mctx.moveTo(0, -6); mctx.lineTo(4, 4); mctx.lineTo(-4, 4); mctx.fill(); mctx.restore();
}
let lastHud = '';
function hud(dt) {
  const me = meObj(), rs = G.rs; if (!me) return;
  $('hp').textContent = me.hp; $('ar').textContent = me.armor | 0; $('money').textContent = '$' + me.money;
  const wid = curWid(), w = W[wid], a = ammo[wid];
  $('wname').textContent = w.name + (L.rl > 0 ? ' (reloading)' : '');
  $('ammo').textContent = w.melee ? '—' : (a ? `${a.mag} / ${a.res}` : '');
  $('scT').textContent = rs.sT; $('scCT').textContent = rs.sCT;
  let t = rs.bomb && rs.bomb.s === 'planted' ? rs.bomb.t : rs.tm;
  t = Math.max(0, Math.ceil(t));
  $('timer').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  $('timer').style.color = rs.bomb && rs.bomb.s === 'planted' ? '#ff6060' : '#fff';
  const ph = rs.phase === 'freeze' ? 'BUY TIME — press B' : rs.bomb && rs.bomb.s === 'planted' ? 'BOMB PLANTED' : `Round ${rs.round}`;
  $('phase').textContent = ph;
  // hold bar
  const hb = $('holdbar');
  if (rs.hold) {
    hb.classList.remove('hidden'); $('holdfill').style.width = Math.min(100, rs.hold.p / rs.hold.need * 100) + '%';
    $('holdtxt').textContent = rs.hold.type === 'plant' ? 'Planting…' : 'Defusing…';
  } else hb.classList.add('hidden');
  // hint
  const hint = me.alive && rs.phase === 'live' && ((me.team === 'T' && rs.bomb.s === 'none' && inSite(me)) || (me.team === 'CT' && rs.bomb.s === 'planted' && Math.hypot(me.x - rs.bomb.x, me.z - rs.bomb.z) < 2.2));
  if (hint && !rs.hold && L.centerT <= 0) { $('center').textContent = `Hold E to ${me.team === 'T' ? 'plant' : 'defuse'}`; $('center').style.opacity = .9; L.hint = true; }
  else if (L.hint && !hint) { $('center').style.opacity = 0; L.hint = false; }
  if (L.centerT > 0) { L.centerT -= dt; if (L.centerT <= 0) $('center').style.opacity = 0; }
  // spectate label
  const sp = $('spec');
  if (!me.alive && L.deadT > 1.3) { const tg = G.players.get(L.spec); sp.textContent = tg ? `Spectating ${tg.name} (click to switch)` : 'You are dead'; sp.classList.remove('hidden'); } else sp.classList.add('hidden');
  // overlays
  L.dmg = Math.max(0, L.dmg - dt * 1.5); $('vig').style.opacity = L.dmg;
  L.hitT = Math.max(0, L.hitT - dt); $('hitm').style.opacity = L.hitT > 0 ? 1 : 0; $('hitm').style.borderColor = L.hitHead ? '#f44' : '#fff';
  $('scope').style.display = L.scoped ? 'block' : 'none';
  $('cross').style.display = L.scoped || !me.alive ? 'none' : 'block';
  // scoreboard
  if (boardOpen) {
    const h = ['CT', 'T'].map(team => {
      const rows = [...G.players.values()].filter(p => p.team === team).sort((x, y) => y.k - x.k)
        .map(p => `<tr style="${p.id === me.id ? 'background:rgba(255,255,255,.12)' : ''};opacity:${p.alive ? 1 : .5}"><td>${esc(p.name)}</td><td>${p.k}</td><td>${p.d}</td><td>$${p.money}</td></tr>`).join('');
      return `<table><tr><th class="t${team}">${team === 'T' ? 'Terrorists' : 'Counter-Terrorists'} — ${team === 'T' ? rs.sT : rs.sCT}</th><th>K</th><th>D</th><th>Money</th></tr>${rows}</table>`;
    }).join('');
    if (h !== lastHud) { $('board').innerHTML = h; lastHud = h; }
  }
  if (buyOpen) updateBuy();
}

// buy menu
const BUY = [['rifle', 'Assault Rifle'], ['smg', 'SMG'], ['shotgun', 'Shotgun'], ['awp', 'Sniper Rifle'], ['deagle', 'Heavy Pistol'], ['armor', 'Armor', 650], ['kit', 'Defuse Kit', 400]];
function buildBuy() {
  $('buy').innerHTML = `<h2><span>BUY MENU</span><span id="bm" style="color:#7ee07e"></span></h2><div class="grid">${BUY.map(([id, n, pr]) =>
    `<button data-i="${id}">${n}<span>$${pr || W[id].price}</span></button>`).join('')}</div><small>Buying works during buy time and the first seconds of a round. Press B to close.</small>`;
  $('buy').querySelectorAll('button').forEach(b => b.onclick = () => { G.send({ t: 'buy', item: b.dataset.i }); initAudio(); });
}
function updateBuy() {
  const me = meObj(); $('bm').textContent = '$' + me.money;
  $('buy').querySelectorAll('button').forEach(b => {
    const i = b.dataset.i, pr = i === 'armor' ? 650 : i === 'kit' ? 400 : W[i].price;
    b.disabled = me.money < pr || (i === 'kit' && me.team !== 'CT') || !me.alive;
  });
}
function setBuy(on) {
  buyOpen = on; $('buy').classList.toggle('hidden', !on);
  $('pause').classList.toggle('hidden', on || locked);
  if (on) { buildBuy(); document.exitPointerLock(); } else if (started) renderer.domElement.requestPointerLock();
}

// ---------------- input ----------------
addEventListener('keydown', e => {
  if (!started) return;
  if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
  if (e.repeat) return;
  keys[e.code] = true;
  const me = meObj(); if (!me) return;
  if (e.code === 'Tab') { boardOpen = true; $('board').classList.remove('hidden'); }
  else if (e.code === 'KeyB') setBuy(!buyOpen);
  else if (e.code === 'KeyR' && me.alive) startReload(curWid());
  else if (e.code === 'Digit1') switchSlot(1);
  else if (e.code === 'Digit2') switchSlot(2);
  else if (e.code === 'Digit3') switchSlot(3);
});
addEventListener('keyup', e => {
  keys[e.code] = false;
  if (e.code === 'Tab') { boardOpen = false; $('board').classList.add('hidden'); }
});
addEventListener('blur', () => { for (const k in keys) keys[k] = false; L.mouse = false; });
addEventListener('mousedown', e => {
  if (!started) return;
  initAudio();
  if (!locked) return;
  const me = meObj(); if (!me) return;
  if (e.button === 0) {
    if (!me.alive) { // cycle spectate target
      const alive = [...G.players.values()].filter(p => p.alive && p.team === me.team);
      if (alive.length) { const i = alive.findIndex(p => p.id === L.spec); L.spec = alive[(i + 1) % alive.length].id; }
    } else { L.mouse = true; L.edge = true; }
  } else if (e.button === 2 && me.alive && W[curWid()].scope && L.rl <= 0) L.scoped = !L.scoped;
});
addEventListener('mouseup', e => { if (e.button === 0) L.mouse = false; });
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mousemove', e => {
  if (!locked || !started) return;
  const me = meObj(); if (!me) return;
  const f = (cam.fov / 75) * .0022 * S.sens;
  me.yaw -= e.movementX * f; me.pitch = clamp(me.pitch - e.movementY * f, -1.5, 1.5);
});
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
  $('pause').classList.toggle('hidden', locked || buyOpen || !started);
  if (!locked) L.mouse = false;
});
$('pause').onclick = () => { initAudio(); renderer.domElement.requestPointerLock(); };

// ---------------- start / menus ----------------
function status(t) { $('status').textContent = t; }
function beginPlay() {
  if (started) return;
  started = true;
  $('menu').classList.add('hidden'); $('hud').classList.remove('hidden'); $('pause').classList.remove('hidden');
  setVM(curWid());
  initAudio();
}
function cfg() {
  S.name = ($('name').value.trim() || 'Player').slice(0, 16);
  localStorage.ws_name = S.name;
  return { name: S.name, team: $('team').value, size: +$('size').value };
}
function startSolo() {
  const c = cfg();
  G.isHost = true; G.net = null; G.send = m => Host.onMsg('h', m);
  Host.init({ ...c, bots: true });
  beginPlay();
}
function startHostP2P() {
  const c = cfg(); const code = ($('code').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')) || Math.random().toString(36).slice(2, 7).toUpperCase();
  $('code').value = code; status('Opening room…');
  const net = new Net(); G.net = net; G.isHost = true; G.send = m => Host.onMsg('h', m);
  net.onErr = e => status(e === 'unavailable-id' ? 'That room code is already in use. Try another.' : 'Network error: ' + e);
  net.onMsg = (from, m) => Host.onMsg(from, m);
  net.onLeave = id => Host.removePlayer(id);
  net.onOpen = () => { Host.init({ ...c, bots: $('fill').checked }); beginPlay(); showCenter('Room code: ' + code + ' — share it with friends', 8); };
  net.hostP2P(code);
}
function startClient(kind) {
  const c = cfg(); const net = new Net(); G.net = net; G.isHost = false; G.send = m => net.sendHost(m);
  net.onErr = e => status(e === 'peer-unavailable' ? 'Room not found.' : 'Connection failed: ' + e);
  net.onOpen = () => { status('Connected, joining…'); net.sendHost({ t: 'hello', name: c.name }); };
  net.onMsg = (_, m) => handle(m);
  net.onClose = () => { if (started) { alert('Disconnected from host.'); } location.reload(); };
  if (kind === 'p2p') {
    const code = $('code').value.trim().toUpperCase(); if (!code) return status('Enter a room code.');
    status('Connecting…'); net.joinP2P(code);
  } else {
    const url = $('srv').value.trim(); if (!/^wss?:\/\//.test(url)) return status('Enter a server URL like ws://192.168.1.10:8080');
    status('Connecting…'); net.joinWS(url);
  }
}
$('name').value = S.name; $('sens').value = S.sens; $('vol').value = S.vol; setVolume(S.vol);
$('sens').oninput = e => { S.sens = +e.target.value; localStorage.ws_sens = S.sens; };
$('vol').oninput = e => { S.vol = +e.target.value; localStorage.ws_vol = S.vol; setVolume(S.vol); };
$('btnSolo').onclick = startSolo;
$('btnHost').onclick = startHostP2P;
$('btnJoin').onclick = () => startClient('p2p');
$('btnSrv').onclick = () => startClient('ws');
if (/^https?:$/.test(location.protocol) && !/github\.io$/.test(location.hostname) && location.hostname) {
  $('srv').value = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
}
const qc = new URLSearchParams(location.search).get('room'); if (qc) $('code').value = qc.toUpperCase();

// ---------------- main loop ----------------
let last = performance.now(), hudT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  if (!started) {
    const t = now / 1000 * .08;
    cam.position.set(Math.sin(t) * 38, 14, Math.cos(t) * 38); cam.lookAt(0, 0, 0);
    renderer.render(scene, cam); return;
  }
  if (G.isHost) Host.tick(dt);
  if (G.rs.tm > 0) G.rs.tm = Math.max(0, G.rs.tm - dt);
  if (G.rs.bomb && G.rs.bomb.s === 'planted') G.rs.bomb.t = Math.max(0, G.rs.bomb.t - dt);
  localUpdate(dt); syncEnts(dt); fxUpdate(dt);
  renderer.render(scene, cam);
  hudT += dt; if (hudT > .06) { hud(hudT); hudT = 0; drawMini(); }
}
requestAnimationFrame(loop);
