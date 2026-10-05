// WEBSTRIKE client: rendering, input, local player, HUD, menus.
import * as THREE from 'three';
import { G } from './state.js';
import { W, OPS, OPS_BY_SIDE, GADGETS, PREP_GADGETS, DOORS, BOXES, BUILDINGS, ROOFS, SITES, SCALE, MAPS, MAPINFO, loadMap, moveE, castWorldBox, rayPlayer, inSite, applyWorld, blockedAt, leanOff } from './data.js';
import { Host, MAX_BARR, SQ_NAMES } from './host.js';
import { Net } from './net.js';
import { sfx, initAudio, setVolume } from './audio.js';
import { Rank } from './rank.js';

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
const rfMat = new THREE.MeshLambertMaterial({ color: 0x8e98a6 });    // reinforced walls (cannot be broken)
const barMat = new THREE.MeshLambertMaterial({ color: 0x8a5a2b });   // barricades
const shieldMat = new THREE.MeshLambertMaterial({ color: 0x6fb8ff, transparent: true, opacity: .5, depthWrite: false, side: THREE.DoubleSide });   // deployable shields
// One mesh per BOXES entry. Boxes are never removed mid-round, only switched off (b.off), so the meshes just follow that flag.
// Carved wall pieces are appended to BOXES, so syncWorld() also grows/shrinks this list.
const bm = [];
function addBoxMesh(b) {
  const g = new THREE.BoxGeometry(b.w, b.h, b.d);
  const mat = b.c === 1 ? crateMat : b.c === 2 ? glassMat : b.c === 4 ? barMat : b.c === 5 ? shieldMat : b.rf ? rfMat : wallMat;
  const m = new THREE.Mesh(g, mat); m.position.set(b.x, b.y + b.h / 2, b.z); scene.add(m);
  let e = null;
  if (b.c !== 2) { e = new THREE.LineSegments(new THREE.EdgesGeometry(g), edgeMat); e.position.copy(m.position); scene.add(e); }
  bm.push({ m, e });
}
function syncWorld() {
  while (bm.length > BOXES.length) {          // new round: drop the carved pieces of the last one
    const o = bm.pop();
    scene.remove(o.m); o.m.geometry.dispose();
    if (o.e) { scene.remove(o.e); o.e.geometry.dispose(); }
  }
  for (let i = bm.length; i < BOXES.length; i++) addBoxMesh(BOXES[i]);
  for (let i = 0; i < BOXES.length; i++) {
    const b = BOXES[i], v = !b.off; bm[i].m.visible = v; if (bm[i].e) bm[i].e.visible = v;
    if (b.c === 0) { const mt = b.rf ? rfMat : wallMat; if (bm[i].m.material !== mt) bm[i].m.material = mt; }   // Reinforcer turns a wall grey
  }
}
// The static scenery (wall boxes, roofs, site markers) is built from whatever map is loaded and rebuilt when the host
// switches maps. Everything it adds is tracked so the old map can be removed completely.
const mapObjs = [];
let builtMap = null;
function clearMapScene() {
  for (const o of bm) { scene.remove(o.m); o.m.geometry.dispose(); if (o.e) { scene.remove(o.e); o.e.geometry.dispose(); } }
  bm.length = 0;
  for (const o of mapObjs) { scene.remove(o); o.geometry.dispose(); if (o.material.map) { o.material.map.dispose(); o.material.dispose(); } }
  mapObjs.length = 0;
}
function buildMapScene() {
  clearMapScene();
  for (const b of BOXES) addBoxMesh(b);
  syncWorld();
  // Gabled roofs (render-only): triangular prism along the building's long axis.
  for (const r of ROOFS) {
    const sh = new THREE.Shape(); sh.moveTo(-r.hw, 0); sh.lineTo(r.hw, 0); sh.lineTo(0, r.rise); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: r.len, bevelEnabled: false });
    g.translate(0, 0, -r.len / 2);
    if (r.alongX) g.rotateY(Math.PI / 2);
    const m = new THREE.Mesh(g, roofMat); m.position.set(r.x, r.y, r.z); scene.add(m); mapObjs.push(m);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), roofEdgeMat); e.position.copy(m.position); scene.add(e); mapObjs.push(e);
  }
  for (const k in SITES) {
    const s = SITES[k];
    const t = mkTex((x, w, h) => {
      x.strokeStyle = 'rgba(230,60,40,.9)'; x.lineWidth = 8; x.beginPath(); x.arc(w / 2, h / 2, w / 2 - 8, 0, 7); x.stroke();
      x.fillStyle = 'rgba(230,60,40,.85)'; x.font = 'bold 120px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(k, w / 2, h / 2 + 6);
    }, 256, 256);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s.r * 2, s.r * 2), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(s.x, .03, s.z); scene.add(m); mapObjs.push(m);
  }
  builtMap = MAPINFO.id;
}
buildMapScene();

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
  const add = (mesh, x, y, z, rx = 0) => { mesh.position.set(x, y, z); mesh.rotation.x += rx; g.add(mesh); return mesh; };
  switch (w.model || wid) {   // operator guns reuse an existing model but keep their own colour
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
  // Fortify Mode tripod (shown only while deployed)
  const tri = new THREE.Group(); tri.position.set(.22, 0, -.5); tri.visible = false;
  for (let i = 0; i < 3; i++) {
    const a = i * 2.094, leg = bx(.05, 1.15, .05, 0x2a2a2a);
    leg.position.set(Math.sin(a) * .2, .57, Math.cos(a) * .2); leg.rotation.z = Math.sin(a) * .36; leg.rotation.x = -Math.cos(a) * .36; tri.add(leg);
  }
  const tHead = bx(.1, .08, .1, 0x555555); tHead.position.y = 1.15; tri.add(tHead);
  g.add(tri); g.userData.tripod = tri;
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
function makeMarker() {   // red diamond over an enemy revealed by a drone / beacon, visible through walls
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  x.fillStyle = '#ff3b30'; x.strokeStyle = '#fff'; x.lineWidth = 5; x.beginPath(); x.moveTo(32, 4); x.lineTo(58, 32); x.lineTo(32, 60); x.lineTo(6, 32); x.closePath(); x.fill(); x.stroke();
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  sp.scale.set(.55, .55, 1); sp.position.y = 2.6; sp.renderOrder = 11; sp.visible = false; return sp;
}
const ents = new Map();
const fx = [];
function addTracer(a, b) {
  const g = new THREE.BufferGeometry().setFromPoints([a, b]);
  const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: .85 }));
  scene.add(l); fx.push({ o: l, t: .07 });
}
// Short-lived debris (wall holes, barricades, impacts). `v` = optional velocity.
const dustMat = new THREE.MeshLambertMaterial({ color: 0xcdbb8f }), plankMat = new THREE.MeshLambertMaterial({ color: 0x8a5a2b });
function addDebris(x, y, z, n, mat = dustMat, spread = 3) {
  for (let i = 0; i < n; i++) {
    const s = .08 + Math.random() * .16, o = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), mat);
    o.position.set(x + (Math.random() - .5) * 1.2, y + (Math.random() - .5) * 1.2, z + (Math.random() - .5) * 1.2);
    o.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    scene.add(o); fx.push({ o, t: .5 + Math.random() * .4, v: new THREE.Vector3((Math.random() - .5) * spread, Math.random() * spread * .8, (Math.random() - .5) * spread) });
  }
}
let bombMesh = null;
const snd = id => (W[id] && W[id].snd) || id;   // which existing shot sound an operator gun uses

// ---------------- gadget visuals (smoke, drone, beacon, mine) ----------------
// The host sends the whole object list 4x a second ('gs'); meshes follow it by uid.
const gx = { o: [], mk: [], set: new Set() };   // world objects; ids of enemies revealed to my side
const gobjs = new Map();                        // uid -> { kind, g, t, at }
function mkObj(kind) {
  const g = new THREE.Group(), lam = c => new THREE.MeshLambertMaterial({ color: c }), bas = c => new THREE.MeshBasicMaterial({ color: c });
  if (kind === 'smoke') {
    const m = new THREE.Mesh(new THREE.SphereGeometry(GADGETS.smoke.r, 20, 14), new THREE.MeshLambertMaterial({ color: 0xc6cacf, transparent: true, opacity: .97, side: THREE.DoubleSide }));
    m.position.y = 1.2; g.add(m); g.userData.body = m;
  } else if (kind === 'drone') {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(.45, .12, .45), lam(0x222831)));
    g.userData.rot = [];
    for (const [x, z] of [[.28, .28], [-.28, .28], [.28, -.28], [-.28, -.28]]) {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, .02, 12), lam(0x89a)); r.position.set(x, .08, z); g.add(r); g.userData.rot.push(r);
    }
    const led = new THREE.Mesh(new THREE.SphereGeometry(.05), bas(0x4fd1ff)); led.position.y = -.08; g.add(led);
  } else if (kind === 'beacon') {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(.22, .28, .14, 12), lam(0x333a44)); b.position.y = .07; g.add(b);
    const a = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, .55, 6), lam(0x999999)); a.position.y = .4; g.add(a);
    const l = new THREE.Mesh(new THREE.SphereGeometry(.07), bas(0xffd24a)); l.position.y = .7; g.add(l); g.userData.led = l;
    const ring = new THREE.Mesh(new THREE.RingGeometry(GADGETS.beacon.r - .08, GADGETS.beacon.r, 40), new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: .35, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = .04; g.add(ring); g.userData.ring = ring;
  } else if (kind === 'mine') {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(.34, .38, .09, 14), lam(0x3b3f2c)); d.position.y = .05; g.add(d);
    const l = new THREE.Mesh(new THREE.SphereGeometry(.06), bas(0xff3030)); l.position.y = .12; g.add(l); g.userData.led = l;
  }
  scene.add(g); return g;
}
function syncObjs() {
  const me = meObj(), now = performance.now(), seen = new Set();
  for (const [k, u, x, z, side, t, armed] of gx.o) {
    seen.add(u);
    let o = gobjs.get(u);
    if (!o) { o = { kind: k, g: mkObj(k), t, at: now }; gobjs.set(u, o); }
    o.t = t; o.pos = [x, z]; o.side = side; o.armed = armed;
  }
  for (const [u, o] of gobjs) if (!seen.has(u)) { scene.remove(o.g); o.g.traverse(c => { if (c.geometry) c.geometry.dispose(); }); gobjs.delete(u); }
  for (const [u, o] of gobjs) {
    const rem = o.t - (now - gx.at) / 1000, ud = o.g.userData, mine = me && o.side === me.team;
    o.g.position.set(o.pos[0], 0, o.pos[1]);
    if (o.kind === 'smoke') {
      const age = GADGETS.smoke.dur - rem; ud.body.scale.setScalar(Math.min(1, .25 + age * 1.6));
      ud.body.material.opacity = .97 * clamp(rem / 1.2, 0, 1);
    } else if (o.kind === 'drone') {
      o.g.position.y = 2.6 + Math.sin(now / 260) * .12; for (const r of ud.rot) r.rotation.y = now / 25;
    } else if (o.kind === 'beacon') {
      ud.ring.material.opacity = .22 + .18 * Math.sin(now / 300); ud.led.visible = (now % 900) < 600;
    } else if (o.kind === 'mine') {
      o.g.visible = !!mine;                               // enemy mines are invisible to you
      ud.led.visible = o.armed ? (now % 300) < 150 : (now % 1000) < 700;
    }
  }
}
function gflags(p) { return (p && p.g && p.g.f) | 0; }
const gadOf = p => (p && p.op && OPS[p.op] ? OPS[p.op].gad : null);

// ---------------- state ----------------
let locked = false, started = false, opsOpen = false, boardOpen = false;
const ammo = {};
const keys = {};
const L = {
  vx: 0, vz: 0, vy: 0, ground: true, slot: 1, cd: 0, rl: 0, rlw: null, recoil: 0, scoped: false, mouse: false, edge: false,
  sendT: 0, useT: 0, using: false, cv: 0, eye: 1.6, sid: -1, deadT: 0, spec: null, dmg: 0, hitT: 0, hitHead: false,
  lastHp: 100, lastPrim: null, flashT: 0, kickV: 0, centerT: 0, beepT: 0, shake: 0, lastAlive: false,
  lean: 0, gh: { k: false, m: false }, gOn: false, ghostPrev: false, gSlot: 1,
};
const feed = [];
const meObj = () => G.players.get(G.myId);

// ranked: last-seen round scores and K/D, so only changes while I'm playing count
const rk = { sc: null, k: null, d: null };   // sc = last-seen squad scores
const rankMult = () => {
  const me = meObj(), foes = [...G.players.values()].filter(p => p.team !== me.team);
  return foes.length && foes.every(p => p.isBot) ? .5 : 1;
};

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
  // ranked: kills/deaths since last meta (re-baseline on first sight, before play starts, or on a stat reset)
  if (rk.k === null || !started || me.k < rk.k || me.d < rk.d) { rk.k = me.k; rk.d = me.d; }
  else if (me.k > rk.k || me.d > rk.d) { Rank.kd(me.k - rk.k, me.d - rk.d, rankMult()); rk.k = me.k; rk.d = me.d; }
  L.lastAlive = me.alive;
}
function handle(m) {
  switch (m.t) {
    case 'welcome': G.myId = m.id; break;
    case 'map': loadMap(m.id); if (builtMap !== MAPINFO.id) buildMapScene(); break;   // host switched maps (the host's own browser already loaded it)
    case 'meta': {
      const ids = new Set();
      for (const q of m.p) {
        ids.add(q.id);
        let p = G.players.get(q.id);
        if (!p) { p = { id: q.id, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, w: 'pistol', crouch: 0 }; G.players.set(q.id, p); }
        p.name = q.name; p.team = q.team; p.hp = q.hp; p.armor = q.armor; p.alive = q.alive;
        p.k = q.k; p.d = q.d; p.isBot = q.bot; p.op = q.op; p.prim = q.prim; p.sec = q.sec; p.sq = q.sq;
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
        p.x = e[1]; p.y = e[2]; p.z = e[3]; p.yaw = e[4]; p.pitch = e[5]; p.w = e[6]; p.crouch = e[7]; p.lean = e[8] || 0;
      }
      break;
    }
    case 'rs': {
      const prev = G.rs.phase, ps = rk.sc; G.rs = m;
      if (prev !== m.phase && m.phase === 'live') sfx.go();
      if (prev === 'freeze' && m.phase !== 'freeze' && opsOpen) setOps(false);   // prep is over: operator select closes
      // ranked: a squad's score going up means it won that round. Scores belong to squads, so swapping sides never looks like a win.
      rk.sc = m.sc.slice();
      const me = meObj();
      if (started && me && ps && me.sq !== undefined) {
        const won = m.sc[me.sq] > ps[me.sq], lost = m.sc[1 - me.sq] > ps[1 - me.sq];
        if (won || lost) Rank.round(won, rankMult());
      }
      break;
    }
    case 'spawn': {
      L.sid = m.sid;
      for (const [id, x, z, yaw] of m.l) {
        const p = G.players.get(id); if (!p) continue;
        p.x = x; p.y = 0; p.z = z; p.yaw = yaw; p.pitch = 0; p.alive = true; p.hp = 100;
        const e = ents.get(id); if (e) { e.x = x; e.y = 0; e.z = z; }
        if (id === G.myId) {
          L.vx = L.vz = L.vy = 0; L.rl = 0; L.scoped = false; L.cd = .3; L.lastHp = 100; L.lastAlive = true; L.spec = null; L.lean = 0; L.ghostPrev = false;
          L.slot = p.prim ? 1 : 2;
          for (const k of [p.prim, p.sec]) if (k && W[k]) ammo[k] = { mag: W[k].mag, res: W[k].res };   // fresh loadout every round
          setVM(curWid());
        }
      }
      if (m.swap && started) setOps(true);      // sides just swapped: pick an operator for the new side
      break;
    }
    case 'gs': {   // gadget state: per-player charges / cooldowns / mode flags, world objects, revealed enemies
      for (const [id, ch, cd, act, bar, f] of m.p) { const p = G.players.get(id); if (p) p.g = { ch, cd, act, bar, f }; }
      gx.o = m.o; gx.mk = m.mk; gx.at = performance.now();
      const me = meObj(); gx.set = new Set(me ? m.mk.filter(([, side]) => side === me.team).map(([id]) => id) : []);
      break;
    }
    case 'gfx': {  // one-shot gadget sounds / effects at a position
      const d = Math.hypot(m.x - cam.position.x, m.z - cam.position.z), near = (r = 45) => clamp(1 - d / (r * SCALE), 0, 1), me = meObj(), mineId = m.id === G.myId;
      switch (m.k) {
        case 'smoke': sfx.smoke(near()); break;
        case 'breach': sfx.breach(near(70)); addDebris(m.x, 1.4, m.z, 10); break;
        case 'ghost': if (mineId) sfx.ghost(true); break;       // silent for everyone else, that is the point
        case 'ghostoff': if (mineId) sfx.ghost(false); break;
        case 'rush': sfx.rush(near(30)); break;
        case 'drone': sfx.drone(near(35)); break;
        case 'shield': sfx.shield(near(40)); break;
        case 'reinforce': sfx.reinforce(near(40)); break;
        case 'beaconset': case 'mineset': sfx.set(near(18)); break;
        case 'ping': {
          const victim = G.players.get(m.id);
          if (victim && me && victim.team !== me.team) sfx.ping(.8);          // my side's beacon found someone
          else sfx.ping(near(25) * .6);
          if (mineId) showCenter('SPOTTED', 1.2);
          break;
        }
        case 'mine': sfx.mine(near(55)); addDebris(m.x, .4, m.z, 12, dustMat, 5); break;
        case 'fort': sfx.fortify(near(70)); break;                          // deploying is loud
        case 'unfort': sfx.unfort(near(30)); break;
      }
      break;
    }
    case 'shot': {
      if (m.id === G.myId) break;
      const d = Math.hypot(m.x - cam.position.x, m.z - cam.position.z);
      sfx.shot(snd(m.w), clamp(1 - d / (70 * SCALE), 0, 1));
      if (W[m.w] && !W[m.w].melee) addTracer(new THREE.Vector3(m.x, m.y - .2, m.z), new THREE.Vector3(m.tx, m.ty, m.tz));
      break;
    }
    case 'world': {   // walls carved / barricades placed or broken. applyWorld is idempotent (the host already applied it).
      for (const ev of m.ev) {
        applyWorld(ev);
        if (!started) continue;   // log replayed to a late joiner: no effects
        const near = (x, z) => clamp(1 - Math.hypot(x - cam.position.x, z - cam.position.z) / (45 * SCALE), 0, 1);
        if (ev.k === 'hole') { addDebris(ev.x, 1.4, ev.z, 14); sfx.crumble(near(ev.x, ev.z)); }
        else if (ev.k === 'barr') {
          const d = DOORS[ev.d | 0]; if (!d) continue;
          if (ev.on) sfx.thud(near(d.x, d.z));
          else { addDebris(d.x, 1.2, d.z, 10, plankMat, 4); sfx.crumble(near(d.x, d.z) * .7); }
        }
      }
      syncWorld();
      break;
    }
    case 'kill': {
      const f = document.createElement('div');
      f.innerHTML = `<span class="t${m.kt}">${esc(m.kn || 'World')}</span> ${m.h ? '◎' : '▸'} <span style="opacity:.7">[${esc((W[m.w] || GADGETS[m.w] || {}).name || '')}]</span> <span class="t${m.vt}">${esc(m.vn)}</span>`;
      $('feed').appendChild(f); setTimeout(() => f.remove(), 6000);
      while ($('feed').children.length > 6) $('feed').firstChild.remove();
      break;
    }
    case 'msg': showCenter(m.text, m.short ? 1.8 : 4.5); if (/planted/.test(m.text)) sfx.plant(); if (m.deny) sfx.deny(); if (m.swap) sfx.swap(); break;
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
  L.rl = w.rl * (gflags(meObj()) & 2 ? GADGETS.rush.reloadMul : 1); L.rlw = wid; L.scoped = false; sfx.reload();   // Adrenaline Rush: faster reload
}
function finishReload() {
  const a = ammo[L.rlw], w = W[L.rlw];
  if (a && curWid() === L.rlw) { const take = Math.min(w.mag - a.mag, a.res); a.mag += take; a.res -= take; }
  L.rl = 0;
}
function fire(me, wid, w) {
  const a = ammo[wid];
  if (!w.melee) { if (!a) return; if (a.mag <= 0) { startReload(wid); return; } a.mag--; }
  const fm = (gflags(me) & 4) && wid === me.prim ? GADGETS.fortify : null;   // Fortify Mode: faster, tighter rifle
  L.cd = w.delay * (fm ? fm.rateMul : 1);
  const lo = leanOff(me), ox = me.x + lo[0], oy = me.y + L.eye, oz = me.z + lo[1], speed = Math.hypot(L.vx, L.vz);
  let sp = w.spread + speed * .0022 + (L.ground ? 0 : .05) + L.recoil * .0035;
  if (wid === 'awp') sp = L.scoped ? .0008 + speed * .0004 : .07 + sp;
  if (L.cv > .5) sp *= .7;
  if (fm) sp *= fm.spreadMul;
  const agg = new Map(), walls = new Map(); let end = null;
  for (let i = 0; i < w.pellets; i++) {
    let [dx, dy, dz] = lookDir(me.yaw, me.pitch);
    if (!w.melee) { dx += (Math.random() - .5) * 2 * sp; dy += (Math.random() - .5) * 2 * sp; dz += (Math.random() - .5) * 2 * sp; const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l; }
    const wr = castWorldBox(ox, oy, oz, dx, dy, dz, w.range);
    let best = wr.t, wbi = wr.bi, hit = null, head = false;
    for (const e of G.players.values()) {
      if (!e.alive || e.team === me.team || e.id === me.id) continue;
      const r = rayPlayer(e, ox, oy, oz, dx, dy, dz);
      if (r && r.t < best) { best = r.t; hit = e; head = r.head; wbi = -1; }
    }
    const px = ox + dx * best, py = oy + dy * best, pz = oz + dz * best;
    if (i === 0) end = [px, py, pz];
    if (hit) { const g = agg.get(hit.id) || { n: 0, hs: 0 }; g.n++; if (head) g.hs++; agg.set(hit.id, g); }
    else if (wbi >= 0 && (BOXES[wbi].brk || BOXES[wbi].bar !== undefined || BOXES[wbi].sh !== undefined)) {   // breakable wall, barricade or shield: the host applies the damage
      const g = walls.get(wbi) || { n: 0, x: px, y: py, z: pz }; g.n++; walls.set(wbi, g);
    }
  }
  G.send({ t: 'fire', w: wid, x: ox, y: oy, z: oz, tx: end[0], ty: end[1], tz: end[2] });
  for (const [v, g] of agg) { G.send({ t: 'hit', v, w: wid, n: g.n, hs: g.hs }); L.hitT = .18; L.hitHead = g.hs > 0; sfx.hit(); }
  for (const [i, g] of walls) { G.send({ t: 'wall', i, w: wid, n: g.n, x: g.x, y: g.y, z: g.z }); addDebris(g.x, g.y, g.z, 3, BOXES[i].bar !== undefined ? plankMat : dustMat, 2); }
  sfx.shot(snd(wid), 1);
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
  // count gadget timers down between the host's 4 Hz updates (Ghost Walk's bar drains while active, recharges otherwise)
  for (const q of G.players.values()) if (q.g) {
    q.g.cd = Math.max(0, q.g.cd - dt); q.g.act = Math.max(0, q.g.act - dt);
    const gd = GADGETS[gadOf(q)]; if (gd && gd.bar) q.g.bar = q.g.f & 1 ? Math.max(0, q.g.bar - dt) : Math.min(gd.bar, q.g.bar + gd.regen * dt);
  }
  if (L.rl > 0) { L.rl -= dt; if (L.rl <= 0) finishReload(); }
  if (me.alive) {
    L.deadT = 0;
    const gf = gflags(me);   // gadget mode flags: 1 ghost, 2 rush, 4 fortified, 8 slowed
    // Ghost Walk: the knife comes out while it is on; letting go puts the previous weapon back (unless you drew a gun yourself)
    if ((gf & 1) && !L.ghostPrev) { L.gSlot = L.slot; switchSlot(3); }
    else if (!(gf & 1) && L.ghostPrev && L.slot === 3) switchSlot(L.gSlot || 1);
    L.ghostPrev = !!(gf & 1);
    // Prep phase: attackers are held in spawn, defenders can walk around (to place barricades). A deployed Bastion cannot move.
    const canMove = (rs.phase !== 'freeze' || me.team === 'CT') && !L.using && !opsOpen && !(gf & 4);
    let fx_ = 0, fz = 0;
    if (keys.KeyW) fz += 1; if (keys.KeyS) fz -= 1; if (keys.KeyD) fx_ += 1; if (keys.KeyA) fx_ -= 1;
    const len = Math.hypot(fx_, fz) || 1; fx_ /= len; fz /= len;
    const wid0 = curWid();
    L.cvT = keys.KeyC ? 1 : 0; L.cv += (L.cvT - L.cv) * Math.min(1, dt * 12);
    let sp = keys.ShiftLeft ? 2.6 : (L.cv > .5 ? 2.2 : 5.2);
    if (wid0 === 'awp') sp *= .85; if (wid0 === 'knife') sp *= 1.1; if (L.scoped) sp *= .5;
    if (gf & 2) sp *= GADGETS.rush.speedMul; if (gf & 8) sp *= GADGETS.mine.slowMul;
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

    // leaning (Q / E): the head moves sideways, but never into a wall
    const lt = opsOpen ? 0 : (keys.KeyE ? 1 : 0) - (keys.KeyQ ? 1 : 0);
    L.lean += (lt - L.lean) * Math.min(1, dt * 11);
    let ln = L.lean;
    if (Math.abs(ln) > .02) {
      const rx = Math.cos(me.yaw), rz = -Math.sin(me.yaw);
      for (const f of [1, .75, .5, .25, 0]) { if (!blockedAt(me.x + rx * ln * f * 0.6, me.z + rz * ln * f * 0.6)) { ln *= f; break; } }
    }
    me.lean = ln; const lo = leanOff(me);

    // use (plant / defuse)
    const eligible = rs.phase === 'live' && ((me.team === 'T' && rs.bomb.s === 'none' && inSite(me)) ||
      (me.team === 'CT' && rs.bomb.s === 'planted' && Math.hypot(me.x - rs.bomb.x, me.z - rs.bomb.z) < 2.2));
    const wantUse = !!keys.KeyF && eligible;
    if (wantUse) { L.useT -= dt; if (L.useT <= 0) { G.send({ t: 'use', on: true }); L.useT = .2; } }
    else if (L.using) G.send({ t: 'use', on: false });
    L.using = wantUse;

    // weapons
    const wid = curWid(), w = W[wid];
    const trigger = (w.auto ? L.mouse : L.edge) && locked && !opsOpen;
    if (trigger && rs.phase !== 'freeze' && L.cd <= 0 && L.rl <= 0 && !L.using) fire(me, wid, w);
    L.edge = false;
    if (ammo[wid] && ammo[wid].mag <= 0 && L.rl <= 0 && L.cd <= 0) startReload(wid);

    cam.position.set(me.x + lo[0], me.y + L.eye, me.z + lo[1]);
    cam.rotation.set(me.pitch, me.yaw, -me.lean * .16);
    cam.fov += ((L.scoped ? 22 : 75) - cam.fov) * Math.min(1, dt * 14); cam.updateProjectionMatrix();
    vm.visible = !L.scoped;
  } else {
    L.using = false; me.lean = 0; L.lean = 0; L.deadT += dt; L.scoped = false; cam.fov = 75; cam.updateProjectionMatrix(); vm.visible = false;
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
    G.send({ t: 'st', x: me.x, y: me.y, z: me.z, yaw: me.yaw, pitch: me.pitch, w: curWid(), c: me.crouch, l: +(me.lean || 0).toFixed(2), s: L.sid });
  }
}

// ---------------- entities ----------------
function syncEnts(dt) {
  const me = meObj();
  for (const [id, e] of ents) if (!G.players.has(id)) { scene.remove(e.g); ents.delete(id); }
  for (const p of G.players.values()) {
    if (p.id === G.myId) continue;
    let e = ents.get(p.id);
    const mine = !!(me && p.team === me.team);
    if (e && (e.team !== p.team || e.mine !== mine)) { scene.remove(e.g); ents.delete(p.id); e = null; }   // sides swapped: rebuild (colours, name tag)
    if (!e) {
      const g = makeModel(p); if (mine) g.add(makeTag(p.name || ''));
      const mk = makeMarker(); g.add(mk); g.userData.mk = mk;
      scene.add(g); e = { g, x: p.x, y: p.y, z: p.z, ph: 0, team: p.team, mine, lean: 0, step: 0 }; ents.set(p.id, e);
    }
    const k = Math.min(1, dt * 14), ox = e.x, oz = e.z;
    e.x += (p.x - e.x) * k; e.y += (p.y - e.y) * k; e.z += (p.z - e.z) * k;
    const sp = Math.hypot(e.x - ox, e.z - oz) / Math.max(dt, .001);
    e.ph += dt * 10;
    const sw = p.alive ? Math.sin(e.ph) * Math.min(sp / 4, 1) * .7 : 0;
    e.g.userData.legL.rotation.x = sw; e.g.userData.legR.rotation.x = -sw;
    e.g.position.set(e.x, e.y, e.z); e.g.rotation.y = p.yaw;
    syncGun(e, p.w);
    e.lean += ((p.alive ? (p.lean || 0) : 0) - e.lean) * k;
    e.g.rotation.z = -e.lean * .38;                                   // leaning: the model tilts the same way the hitbox moves
    if (p.alive) { e.g.rotation.x = 0; e.g.scale.y = p.crouch ? .75 : 1; }
    else { e.g.rotation.x = -1.5; e.g.rotation.z = 0; e.g.position.y = e.y + .2; e.g.scale.y = 1; }
    const gf = gflags(p);
    e.g.userData.tripod.visible = !!(gf & 4) && p.alive;
    e.g.userData.mk.visible = p.alive && !mine && gx.set.has(p.id);   // revealed by a drone / beacon: shows through walls
    // footsteps: running makes noise; walking (Shift), crouching, Ghost Walk and a deployed Bastion are silent
    if (p.alive && sp > 3.6 && e.y < .1 && !(gf & 5) && me) {
      e.step -= dt;
      if (e.step <= 0) { e.step = .36; const d = Math.hypot(e.x - cam.position.x, e.z - cam.position.z); sfx.foot(clamp(1 - d / (14 * SCALE), 0, 1) * (mine ? .45 : 1)); }
    } else e.step = 0;
  }
}
function fxUpdate(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.t -= dt;
    if (f.v) { f.v.y -= 14 * dt; f.o.position.addScaledVector(f.v, dt); f.o.rotation.x += dt * 5; if (f.o.position.y < .04) { f.o.position.y = .04; f.v.set(0, 0, 0); } }
    if (f.t <= 0) { scene.remove(f.o); f.o.geometry.dispose(); fx.splice(i, 1); }
  }
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
  mctx.fillStyle = '#5c5238';
  for (const b of BUILDINGS) mctx.fillRect(X(b.x0), Z(b.z0), (b.x1 - b.x0) * sc, (b.z1 - b.z0) * sc);
  for (const b of BOXES) if (!b.off && b.c !== 1 && b.c !== 5 && b.bar === undefined && b.y0 < 1) { mctx.fillStyle = b.rf ? '#a9b3c2' : '#d8c89c'; mctx.fillRect(X(b.x0), Z(b.z0), Math.max(1, b.w * sc), Math.max(1, b.d * sc)); }   // walls, grey = reinforced; carved holes and doorways show as gaps
  mctx.fillStyle = '#6f5a35';
  for (const b of BOXES) if (b.c === 1) mctx.fillRect(X(b.x0), Z(b.z0), b.w * sc, b.d * sc);
  mctx.fillStyle = '#e8a13a';   // placed barricades
  for (const b of BOXES) if (b.bar !== undefined && !b.off) mctx.fillRect(X(b.x0), Z(b.z0), Math.max(2, b.w * sc), Math.max(2, b.d * sc));
  mctx.fillStyle = 'rgba(230,60,40,.9)'; mctx.font = 'bold 12px sans-serif'; mctx.textAlign = 'center';
  for (const k in SITES) mctx.fillText(k, X(SITES[k].x), Z(SITES[k].z) + 4);
  // my side's gadgets (enemy mines are never shown)
  for (const [k, , x, z, side, , armed] of gx.o) {
    if (side !== me.team) { if (k === 'smoke') { mctx.fillStyle = 'rgba(200,200,200,.5)'; mctx.beginPath(); mctx.arc(X(x), Z(z), GADGETS.smoke.r * sc, 0, 7); mctx.fill(); } continue; }
    if (k === 'smoke') { mctx.fillStyle = 'rgba(200,200,200,.5)'; mctx.beginPath(); mctx.arc(X(x), Z(z), GADGETS.smoke.r * sc, 0, 7); mctx.fill(); }
    else if (k === 'drone') { mctx.strokeStyle = '#4fd1ff'; mctx.lineWidth = 1; mctx.beginPath(); mctx.arc(X(x), Z(z), GADGETS.recon.r * sc, 0, 7); mctx.stroke(); mctx.fillStyle = '#4fd1ff'; mctx.fillRect(X(x) - 2, Z(z) - 2, 4, 4); }
    else if (k === 'beacon') { mctx.fillStyle = '#ffd24a'; mctx.beginPath(); mctx.arc(X(x), Z(z), 2.5, 0, 7); mctx.fill(); }
    else if (k === 'mine') { mctx.fillStyle = '#ff5050'; mctx.fillRect(X(x) - 1.5, Z(z) - 1.5, 3, 3); }
  }
  for (const p of G.players.values()) {
    if (!p.alive || p.id === me.id) continue;
    if (p.team === me.team) { mctx.fillStyle = p.team === 'T' ? '#f0b050' : '#6fa0ff'; mctx.beginPath(); mctx.arc(X(p.x), Z(p.z), 3, 0, 7); mctx.fill(); }
    else if (gx.set.has(p.id)) { mctx.fillStyle = '#ff3b30'; mctx.strokeStyle = '#fff'; mctx.lineWidth = 1; mctx.beginPath(); mctx.arc(X(p.x), Z(p.z), 3.5, 0, 7); mctx.fill(); mctx.stroke(); }   // revealed by a drone / beacon
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
  $('hp').textContent = me.hp; $('ar').textContent = me.armor | 0; $('opname').textContent = me.op && OPS[me.op] ? OPS[me.op].name : '';
  updateGadHud(me);
  const wid = curWid(), w = W[wid], a = ammo[wid];
  $('wname').textContent = w.name + (L.rl > 0 ? ' (reloading)' : '');
  $('ammo').textContent = w.melee ? '—' : (a ? `${a.mag} / ${a.res}` : '');
  // top bar: each cell shows the squad currently on that side and its score
  const sqOnSide = side => (side === rs.sq1 ? 0 : 1);
  for (const side of ['CT', 'T']) {
    const q = sqOnSide(side), el = $(side === 'T' ? 'scT' : 'scCT');
    el.querySelector('b').textContent = rs.sc ? rs.sc[q] : 0;
    el.querySelector('small').textContent = `${SQ_NAMES[q].toUpperCase()} · ${side === 'T' ? 'ATTACK' : 'DEFENSE'}${me.sq === q ? ' (YOU)' : ''}`;
  }
  let t = rs.bomb && rs.bomb.s === 'planted' ? rs.bomb.t : rs.tm;
  t = Math.max(0, Math.ceil(t));
  $('timer').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  $('timer').style.color = rs.bomb && rs.bomb.s === 'planted' ? '#ff6060' : '#fff';
  const swapRound = rs.round > 1 && (rs.round - 1) % 3 === 0, finalRound = rs.sc && rs.sc[0] === 7 && rs.sc[1] === 7;
  const ph = rs.phase === 'freeze' ? (swapRound ? 'SIDES SWAPPED — pick an operator (B)' : me.team === 'CT' ? 'PREP — B: operator · F: barricade · G: gadget' : 'PREP — B: operator') : rs.bomb && rs.bomb.s === 'planted' ? 'BOMB PLANTED' : finalRound ? `Round ${rs.round} — FINAL ROUND` : `Round ${rs.round}`;
  $('phase').textContent = ph;
  // hold bar
  const hb = $('holdbar');
  if (rs.hold) {
    hb.classList.remove('hidden'); $('holdfill').style.width = Math.min(100, rs.hold.p / rs.hold.need * 100) + '%';
    $('holdtxt').textContent = rs.hold.type === 'plant' ? 'Planting…' : 'Defusing…';
  } else hb.classList.add('hidden');
  // hint
  let hint = null;
  if (me.alive && rs.phase === 'live' && ((me.team === 'T' && rs.bomb.s === 'none' && inSite(me)) || (me.team === 'CT' && rs.bomb.s === 'planted' && Math.hypot(me.x - rs.bomb.x, me.z - rs.bomb.z) < 2.2))) hint = `Hold F to ${me.team === 'T' ? 'plant' : 'defuse'}`;
  else if (me.alive && rs.phase === 'freeze' && me.team === 'CT' && !opsOpen) {
    const di = nearDoor(me);
    if (di !== null) {
      const on = !BOXES[DOORS[di].bi].off, used = barricadesUsed();
      hint = on ? `F — remove barricade (${used}/${MAX_BARR})` : used >= MAX_BARR ? `Barricade limit reached (${MAX_BARR})` : `F — place barricade (${used}/${MAX_BARR})`;
    }
  }
  if (hint && !rs.hold && L.centerT <= 0) { $('center').textContent = hint; $('center').style.opacity = .9; L.hint = true; }
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
      const sq = team === rs.sq1 ? 0 : 1;
      const rows = [...G.players.values()].filter(p => p.team === team).sort((x, y) => y.k - x.k)
        .map(p => `<tr style="${p.id === me.id ? 'background:rgba(255,255,255,.12)' : ''};opacity:${p.alive ? 1 : .5}"><td>${esc(p.name)}</td><td>${p.k}</td><td>${p.d}</td><td>${esc(OPS[p.op] ? OPS[p.op].name : '')}</td></tr>`).join('');
      return `<table><tr><th class="t${team}">${SQ_NAMES[sq]} · ${team === 'T' ? 'Attack' : 'Defense'}${me.sq === sq ? ' (you)' : ''} — ${rs.sc ? rs.sc[sq] : 0}</th><th>K</th><th>D</th><th>Operator</th></tr>${rows}</table>`;
    }).join('');
    if (h !== lastHud) { $('board').innerHTML = h; lastHud = h; }
  }
  if (opsOpen) updateOps();
}

// ---------------- gadget HUD ----------------
const GICON = {   // 24x24 line icons
  smoke: '<circle cx="8" cy="15" r="4"/><circle cx="14" cy="11" r="5"/><circle cx="18" cy="16" r="3.5"/>',
  breach: '<path d="M12 2l2 6 6-2-3 5 5 2-6 2 2 6-6-3-6 3 2-6-6-2 5-2-3-5 6 2z"/>',
  ghost: '<path d="M5 21V11a7 7 0 0114 0v10l-3-2-2 2-2-2-2 2-2-2z"/><circle cx="9.5" cy="11" r="1"/><circle cx="14.5" cy="11" r="1"/>',
  rush: '<path d="M13 2L5 14h6l-1 8 9-13h-6z"/>',
  recon: '<circle cx="12" cy="12" r="3"/><path d="M5 5l4 4M19 5l-4 4M5 19l4-4M19 19l-4-4"/><circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/>',
  shield: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.500-2-8-6-8-11V5z"/><path d="M12 6v12"/>',
  reinforce: '<path d="M3 6h18v12H3zM3 12h18M9 6v6M15 12v6"/>',
  beacon: '<circle cx="12" cy="14" r="2"/><path d="M12 16v6M7 9a7 7 0 000 10M17 9a7 7 0 010 10M4 6a11 11 0 000 16M20 6a11 11 0 010 16"/>',
  mine: '<circle cx="12" cy="13" r="6"/><path d="M12 3v4M12 19v4M2 13h4M18 13h4M5 6l3 3M19 6l-3 3"/>',
  fortify: '<path d="M12 4v6M12 10L5 21M12 10l7 11M12 10l-1 11M8 4h8"/>',
};
function updateGadHud(me) {
  const id = gadOf(me), g = GADGETS[id], box = $('gad');
  if (!g) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  if (box.dataset.id !== id) { box.dataset.id = id; $('gicon').innerHTML = GICON[id] || ''; $('gname').textContent = g.name; }
  const st = me.g || { ch: 0, cd: 0, act: 0, bar: g.bar || 0, f: 0 }, f = st.f | 0;
  const phaseOk = G.rs.phase === 'live' || (G.rs.phase === 'freeze' && me.team === 'CT' && PREP_GADGETS.has(id));
  let can = me.alive && phaseOk, on = false, txt = '', cd = 0;
  if (g.charges != null) { txt = '×' + st.ch; cd = st.cd / g.cd; can = can && st.ch > 0 && st.cd <= 0; }
  else if (g.bar) {                                            // Ghost Walk
    on = !!(f & 1); txt = on ? 'ACTIVE ' + st.bar.toFixed(1) + 's' : st.bar < g.min ? 'RECHARGING' : Math.round(st.bar / g.bar * 100) + '%';
    cd = 1 - st.bar / g.bar; can = can && (on || st.bar >= g.min);
  } else if (g.toggle) {                                       // Fortify Mode
    on = !!(f & 4); txt = on ? 'DEPLOYED' : st.cd > 0 ? Math.ceil(st.cd) + 's' : 'READY'; cd = st.cd / g.cd; can = can && st.cd <= 0;
  } else {                                                     // cooldown gadget (Adrenaline Rush)
    on = st.act > 0; txt = on ? Math.ceil(st.act) + 's' : st.cd > 0 ? Math.ceil(st.cd) + 's' : 'READY'; cd = on ? 0 : st.cd / g.cd; can = can && st.cd <= 0 && !on;
  }
  box.classList.toggle('off', !can && !on); box.classList.toggle('on', on);
  $('gtxt').textContent = txt; $('gcd').style.width = Math.max(0, Math.min(1, cd)) * 100 + '%';
}

// ---------------- operator select (replaces the old buy menu) ----------------
// Each operator is a fixed loadout. You can only change it during the prep phase; it is applied at once and kept for later rounds.
function buildOps() {
  const me = meObj(); if (!me) return;
  const card = id => {
    const o = OPS[id], p = W[o.prim], s = W[o.sec], gd = GADGETS[o.gad];
    const stats = w => `${w.dmg}${w.pellets > 1 ? '×' + w.pellets : ''} dmg · ${Math.round(60 / w.delay)} rpm · ${w.mag} rds`;
    return `<button data-i="${id}"><b>${esc(o.name)}</b><span class="arm">Armor ${o.armor}</span>` +
      `<em>${esc(p.name)}</em><i>${stats(p)}</i><em>${esc(s.name)}</em><i>${stats(s)}</i>` +
      `<span class="gd"><b>${esc(gd.name)}</b> — ${esc(gd.desc)}</span></button>`;
  };
  $('ops').innerHTML = `<h2><span>SELECT OPERATOR</span><span id="opside">${me.team === 'T' ? 'ATTACK' : 'DEFENSE'}</span></h2>` +
    `<div class="grid">${OPS_BY_SIDE[me.team].map(card).join('')}</div><small id="opnote"></small>`;
  $('ops').querySelectorAll('button').forEach(b => b.onclick = () => { G.send({ t: 'op', op: b.dataset.i }); initAudio(); });
}
function updateOps() {
  const me = meObj(); if (!me) return;
  const prep = G.rs.phase === 'freeze';
  $('ops').querySelectorAll('button').forEach(b => { b.classList.toggle('sel', b.dataset.i === me.op); b.disabled = !prep; });
  $('opnote').textContent = prep ? 'Pick your operator during prep (each has a gadget: G or Mouse 5). Press B to close.' : 'Operators can only be changed during the prep phase. Press B to close.';
}
function setOps(on) {
  opsOpen = on; $('ops').classList.toggle('hidden', !on);
  $('pause').classList.toggle('hidden', on || locked);
  if (on) { buildOps(); updateOps(); document.exitPointerLock(); }
  else if (started) { const r = renderer.domElement.requestPointerLock(); if (r && r.catch) r.catch(() => {}); }
}

// ---------------- barricades (defenders, prep phase) ----------------
const barricadesUsed = () => DOORS.filter(d => !BOXES[d.bi].off).length;
// The doorway the player is looking at / standing nearest to (within the host's reach limit), or null.
function nearDoor(me) {
  const fx_ = -Math.sin(me.yaw), fz = -Math.cos(me.yaw);
  let best = null, bs = 1e9;
  for (let i = 0; i < DOORS.length; i++) {
    const d = DOORS[i], dx = d.x - me.x, dz = d.z - me.z, dist = Math.hypot(dx, dz);
    if (dist > 5.5) continue;
    const dot = (dx * fx_ + dz * fz) / (dist || 1);
    if (dot < .25) continue;                    // must be roughly in front of the player
    const s = dist * (1.7 - dot);
    if (s < bs) { bs = s; best = i; }
  }
  return best;
}
function toggleBarricade() {
  const me = meObj();
  if (!me || !me.alive || me.team !== 'CT' || G.rs.phase !== 'freeze') return;
  const i = nearDoor(me);
  if (i !== null) G.send({ t: 'barr', d: i });
}

// ---------------- input ----------------
addEventListener('keydown', e => {
  if (!started) return;
  if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
  if (e.repeat) return;
  keys[e.code] = true;
  const me = meObj(); if (!me) return;
  if (e.code === 'Tab') { boardOpen = true; $('board').classList.remove('hidden'); }
  else if (e.code === 'KeyB') setOps(!opsOpen);
  else if (e.code === 'KeyF') { if (G.rs.phase === 'freeze') toggleBarricade(); }   // live round: F is hold-to-plant/defuse (handled each frame)
  else if (e.code === 'KeyG') useGadget('k', true);
  else if (e.code === 'KeyR' && me.alive) startReload(curWid());
  else if (e.code === 'Digit1') switchSlot(1);
  else if (e.code === 'Digit2') switchSlot(2);
  else if (e.code === 'Digit3') switchSlot(3);
});
addEventListener('keyup', e => {
  keys[e.code] = false;
  if (e.code === 'KeyG' && started) useGadget('k', false);
  if (e.code === 'Tab') { boardOpen = false; $('board').classList.add('hidden'); }
});
addEventListener('blur', () => { for (const k in keys) keys[k] = false; L.mouse = false; useGadget('k', false); useGadget('m', false); });
// Gadget key: G or Mouse 5. Ghost Walk is hold-to-use, so release matters; the host ignores a release for the other gadgets.
function useGadget(src, on) {
  L.gh[src] = on;
  const want = L.gh.k || L.gh.m, me = meObj();
  if (want && !L.gOn) {
    if (!me || !me.alive || opsOpen || !locked) { L.gh[src] = false; return; }
    L.gOn = true;
    if (gadOf(me) === 'fortify') { L.vx = L.vz = 0; }
    G.send({ t: 'gad', on: true, yaw: me.yaw, pitch: me.pitch });
  } else if (!want && L.gOn) { L.gOn = false; G.send({ t: 'gad', on: false }); }
}
// Mouse 4 / Mouse 5 are the browser's back / forward buttons: swallow them (and the history navigation) during a match.
for (const ev of ['mousedown', 'mouseup', 'auxclick', 'pointerdown', 'pointerup']) addEventListener(ev, e => { if (started && (e.button === 3 || e.button === 4)) e.preventDefault(); }, true);   // preventDefault only: stopping propagation would also swallow the gadget handler
addEventListener('popstate', () => { if (started) history.pushState({ ws: 1 }, '', location.href); });
addEventListener('mousedown', e => {
  if (!started) return;
  initAudio();
  if (!locked) return;
  const me = meObj(); if (!me) return;
  if (e.button === 4) { useGadget('m', true); return; }
  if (e.button === 0) {
    if (!me.alive) { // cycle spectate target
      const alive = [...G.players.values()].filter(p => p.alive && p.team === me.team);
      if (alive.length) { const i = alive.findIndex(p => p.id === L.spec); L.spec = alive[(i + 1) % alive.length].id; }
    } else { L.mouse = true; L.edge = true; }
  } else if (e.button === 2 && me.alive && W[curWid()].scope && L.rl <= 0) L.scoped = !L.scoped;
});
addEventListener('mouseup', e => { if (e.button === 0) L.mouse = false; if (e.button === 4) useGadget('m', false); });
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mousemove', e => {
  if (!locked || !started) return;
  const me = meObj(); if (!me) return;
  const f = (cam.fov / 75) * .0022 * S.sens;
  me.yaw -= e.movementX * f; me.pitch = clamp(me.pitch - e.movementY * f, -1.5, 1.5);
});
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
  $('pause').classList.toggle('hidden', locked || opsOpen || !started);
  if (!locked) L.mouse = false;
});
$('pause').onclick = () => { initAudio(); renderer.domElement.requestPointerLock(); };

// ---------------- start / menus ----------------
function status(t) { $('status').textContent = t; }
function beginPlay() {
  if (started) return;
  started = true;
  $('menu').classList.add('hidden'); $('hud').classList.remove('hidden'); $('pause').classList.remove('hidden');
  try { history.pushState({ ws: 1 }, '', location.href); } catch (_) { /* sandboxed frame: nothing to guard */ }
  setVM(curWid());
  initAudio();
  if (G.rs.phase === 'freeze') setOps(true);   // join during prep: open operator select straight away
}
function cfg() {
  S.name = ($('name').value.trim() || 'Player').slice(0, 16);
  localStorage.ws_name = S.name;
  return { name: S.name, team: $('team').value, size: +$('size').value, map: $('map').value };
}
// Bots scale with the host player's rank (re-read every round, so they keep up as you climb).
function announceBots() { setTimeout(() => showCenter(`Bot difficulty: ${Rank.info.tier.name}`, 3), 400); }
function startSolo() {
  const c = cfg();
  G.isHost = true; G.net = null; G.send = m => Host.onMsg('h', m);
  Host.init({ ...c, bots: true, levelFn: () => Rank.level });
  beginPlay(); announceBots();
}
function startHostP2P() {
  const c = cfg(); const code = ($('code').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')) || Math.random().toString(36).slice(2, 7).toUpperCase();
  $('code').value = code; status('Opening room…');
  const net = new Net(); G.net = net; G.isHost = true; G.send = m => Host.onMsg('h', m);
  net.onErr = e => status(e === 'unavailable-id' ? 'That room code is already in use. Try another.' : 'Network error: ' + e);
  net.onMsg = (from, m) => Host.onMsg(from, m);
  net.onLeave = id => Host.removePlayer(id);
  net.onOpen = () => { Host.init({ ...c, bots: $('fill').checked, levelFn: () => Rank.level }); beginPlay(); if ($('fill').checked) announceBots(); showCenter('Room code: ' + code + ' — share it with friends', 8); };
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
for (const m of MAPS) $('map').add(new Option(m.name, m.id));
$('map').value = localStorage.ws_map || 'rotate'; if ($('map').selectedIndex < 0) $('map').value = 'rotate';
$('map').onchange = e => { localStorage.ws_map = e.target.value; };
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
    cam.position.set(Math.sin(t) * 75, 48, Math.cos(t) * 75); cam.lookAt(0, 0, 0);   // slow orbit over the whole compound
    renderer.render(scene, cam); return;
  }
  if (G.isHost) Host.tick(dt);
  if (G.rs.tm > 0) G.rs.tm = Math.max(0, G.rs.tm - dt);
  if (G.rs.bomb && G.rs.bomb.s === 'planted') G.rs.bomb.t = Math.max(0, G.rs.bomb.t - dt);
  localUpdate(dt); syncEnts(dt); syncObjs(); fxUpdate(dt);
  renderer.render(scene, cam);
  hudT += dt; if (hudT > .06) { hud(hudT); hudT = 0; drawMini(); }
}
requestAnimationFrame(loop);
