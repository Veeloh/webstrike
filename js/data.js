// Shared constants, map, weapons, collision and ray helpers. Pure JS: runs in browser and Node.
export const R = 0.4, H_STAND = 1.75, H_CROUCH = 1.25, HS_MULT = 3;

export const W = {
  knife:   { name: 'Knife',         dmg: 40,  delay: .5,  mag: 0,  res: 0,  spread: 0,    auto: false, price: 0,    slot: 3, pellets: 1, range: 2.6, melee: true, kick: 0,    rl: 0,   len: .3,  col: 0xcccccc },
  pistol:  { name: 'Pistol',        dmg: 26,  delay: .15, mag: 12, res: 36, spread: .010, auto: false, price: 0,    slot: 2, pellets: 1, range: 90,  kick: .012, rl: 1.5, len: .25, col: 0x333333 },
  deagle:  { name: 'Heavy Pistol',  dmg: 54,  delay: .33, mag: 7,  res: 35, spread: .006, auto: false, price: 700,  slot: 2, pellets: 1, range: 100, kick: .03,  rl: 2.0, len: .3,  col: 0x555555 },
  smg:     { name: 'SMG',           dmg: 21,  delay: .07, mag: 30, res: 90, spread: .022, auto: true,  price: 1250, slot: 1, pellets: 1, range: 70,  kick: .007, rl: 2.0, len: .45, col: 0x2a2a2a },
  shotgun: { name: 'Shotgun',       dmg: 12,  delay: .85, mag: 6,  res: 30, spread: .055, auto: false, price: 1800, slot: 1, pellets: 8, range: 25,  kick: .04,  rl: 3.0, len: .6,  col: 0x4a3a2a },
  rifle:   { name: 'Assault Rifle', dmg: 31,  delay: .095,mag: 30, res: 90, spread: .012, auto: true,  price: 2700, slot: 1, pellets: 1, range: 120, kick: .011, rl: 2.3, len: .65, col: 0x2b2f2b },
  awp:     { name: 'Sniper Rifle',  dmg: 115, delay: 1.35,mag: 5,  res: 20, spread: .001, auto: false, price: 4750, slot: 1, pellets: 1, range: 220, kick: .03,  rl: 3.4, len: .85, col: 0x1f2a1f, scope: true },
};

function B(x, y, z, w, h, d, c = 0) {
  return { x, y, z, w, h, d, c, x0: x - w / 2, x1: x + w / 2, y0: y, y1: y + h, z0: z - d / 2, z1: z + d / 2 };
}
// c: 0 = wall, 1 = crate
// Layout inspired by the classic bomb-defusal "two sites, three lanes" flow:
// T spawn (south) feeds a Long lane (east, to A), a Mid lane (center, branching
// to Catwalk->A and Tunnels->B), and an open west flank straight to B. CT spawn
// sits north-center between both sites.
export const BOXES = [
  // outer walls
  B(0, 0, -30.5, 62, 6, 1), B(0, 0, 30.5, 62, 6, 1), B(-30.5, 0, 0, 1, 6, 62), B(30.5, 0, 0, 1, 6, 62),

  // Long lane wall (east flank, T spawn up to site A)
  B(11, 0, -2, 1, 4, 36),
  // West flank wall (T spawn up to site B)
  B(-11, 0, -2, 1, 4, 36),

  // Mid lane walls, each split to leave a side-door through to Catwalk (east) / Tunnels (west)
  B(4, 0, 7, 1, 4, 18), B(4, 0, -11, 1, 4, 14),
  B(-4, 0, 7, 1, 4, 18), B(-4, 0, -11, 1, 4, 14),

  // T spawn cover
  B(-8, 0, 22, 2, 1.6, 2, 1), B(8, 0, 22, 2, 1.6, 2, 1), B(2, 0, 27, 3, 1.2, 2, 1),

  // Long lane cover
  B(20, 0, 6, 3, 1.6, 3, 1), B(20, 0, -6, 3, 1.6, 3, 1), B(23, 0, -14, 2, 1.2, 2, 1),

  // Mid cover
  B(0, 0, 2, 2, 1.2, 2, 1),
  // Catwalk cover (toward A)
  B(7, 0, -15, 2, 1.2, 2, 1),
  // Tunnels cover (toward B)
  B(-7, 0, -15, 2, 1.2, 2, 1),

  // CT spawn back cover
  B(0, 0, -29.5, 2, 1.2, 1, 1),

  // Site A cover
  B(17, 0, -22, 2, 1.6, 2, 1), B(23, 0, -17, 2, 1.6, 2, 1),
  // Site B cover
  B(-17, 0, -22, 2, 1.6, 2, 1), B(-23, 0, -17, 2, 1.6, 2, 1),
];

export const SITES = { A: { x: 20, z: -20, r: 6 }, B: { x: -20, z: -20, r: 6 } };
const row = (z, yaw) => [-8, -4, 0, 4, 8].map(x => [x, z, yaw]);
export const SPAWNS = {
  T: [...row(26, 0), ...row(28, 0)],
  CT: [...row(-26, Math.PI), ...row(-28, Math.PI)],
};
export const ROUTES = {
  A: [[20, 22], [20, 8], [20, -4], [20, -14], [20, -20]],
  B: [[-20, 22], [-20, 8], [-20, -4], [-20, -14], [-20, -20]],
};
export const HOLDS = { A: [[16, -18]], B: [[-16, -18]], M: [[0, -18]] };

export function inSite(p) {
  for (const k in SITES) { const s = SITES[k]; if (Math.hypot(p.x - s.x, p.z - s.z) <= s.r) return k; }
  return null;
}

// ---- collision (axis-separated AABB vs cylinder-as-box). returns bit1=ground, bit2=ceiling
function overl(e, b, h) {
  return e.x + R > b.x0 && e.x - R < b.x1 && e.z + R > b.z0 && e.z - R < b.z1 && e.y + h > b.y0 && e.y < b.y1;
}
export function moveE(e, dx, dy, dz, h) {
  let flags = 0;
  e.x += dx;
  for (const b of BOXES) if (overl(e, b, h)) e.x = dx > 0 ? b.x0 - R - 1e-4 : b.x1 + R + 1e-4;
  e.z += dz;
  for (const b of BOXES) if (overl(e, b, h)) e.z = dz > 0 ? b.z0 - R - 1e-4 : b.z1 + R + 1e-4;
  e.y += dy;
  for (const b of BOXES) if (overl(e, b, h)) {
    if (dy > 0) { e.y = b.y0 - h - 1e-4; flags |= 2; } else { e.y = b.y1; flags |= 1; }
  }
  if (e.y <= 0) { e.y = 0; flags |= 1; }
  return flags;
}

// ---- rays
export function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let tn = 0, tf = 1e9;
  const o = [ox, oy, oz], d = [dx, dy, dz], lo = [x0, y0, z0], hi = [x1, y1, z1];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (o[i] < lo[i] || o[i] > hi[i]) return Infinity; }
    else {
      let a = (lo[i] - o[i]) / d[i], b = (hi[i] - o[i]) / d[i];
      if (a > b) { const t = a; a = b; b = t; }
      if (a > tn) tn = a; if (b < tf) tf = b;
      if (tn > tf) return Infinity;
    }
  }
  return tn;
}
export function castWorld(ox, oy, oz, dx, dy, dz, max) {
  let best = max;
  for (const b of BOXES) { const t = rayBox(ox, oy, oz, dx, dy, dz, b.x0, b.y0, b.z0, b.x1, b.y1, b.z1); if (t < best) best = t; }
  if (dy < 0) { const t = -oy / dy; if (t >= 0 && t < best) best = t; }
  return best;
}
export function rayPlayer(e, ox, oy, oz, dx, dy, dz) {
  const h = e.crouch ? H_CROUCH : H_STAND, hb = h - 0.28;
  const tb = rayBox(ox, oy, oz, dx, dy, dz, e.x - .32, e.y, e.z - .32, e.x + .32, e.y + hb, e.z + .32);
  const th = rayBox(ox, oy, oz, dx, dy, dz, e.x - .2, e.y + hb, e.z - .2, e.x + .2, e.y + h, e.z + .2);
  if (th === Infinity && tb === Infinity) return null;
  return th <= tb ? { t: th, head: true } : { t: tb, head: false };
}
export function losClear(x1, y1, z1, x2, y2, z2) {
  const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1, d = Math.hypot(dx, dy, dz);
  return castWorld(x1, y1, z1, dx / d, dy / d, dz / d, d) >= d - 0.02;
}
