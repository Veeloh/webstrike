// Shared constants, map, weapons, collision and ray helpers. Pure JS: runs in browser and Node.
export const R = 0.4, H_STAND = 1.75, H_CROUCH = 1.25, HS_MULT = 3;

// Overall map footprint multiplier (floor size, corridor lengths, site spacing).
// Player size/speed and melee range stay human-scale - only the level's x/z layout grows.
export const SCALE = 3;

export const W = {
  knife:   { name: 'Knife',         dmg: 40,  delay: .5,  mag: 0,  res: 0,  spread: 0,    auto: false, price: 0,    slot: 3, pellets: 1, range: 2.6, melee: true, kick: 0,    rl: 0,   len: .3,  col: 0xcccccc },
  pistol:  { name: 'Pistol',        dmg: 26,  delay: .15, mag: 12, res: 36, spread: .010, auto: false, price: 0,    slot: 2, pellets: 1, range: 90,  kick: .012, rl: 1.5, len: .25, col: 0x333333 },
  deagle:  { name: 'Heavy Pistol',  dmg: 54,  delay: .33, mag: 7,  res: 35, spread: .006, auto: false, price: 700,  slot: 2, pellets: 1, range: 100, kick: .03,  rl: 2.0, len: .3,  col: 0x555555 },
  smg:     { name: 'SMG',           dmg: 21,  delay: .07, mag: 30, res: 90, spread: .022, auto: true,  price: 1250, slot: 1, pellets: 1, range: 70,  kick: .007, rl: 2.0, len: .45, col: 0x2a2a2a },
  shotgun: { name: 'Shotgun',       dmg: 12,  delay: .85, mag: 6,  res: 30, spread: .055, auto: false, price: 1800, slot: 1, pellets: 8, range: 25,  kick: .04,  rl: 3.0, len: .6,  col: 0x4a3a2a },
  rifle:   { name: 'Assault Rifle', dmg: 31,  delay: .095,mag: 30, res: 90, spread: .012, auto: true,  price: 2700, slot: 1, pellets: 1, range: 120, kick: .011, rl: 2.3, len: .65, col: 0x2b2f2b },
  awp:     { name: 'Sniper Rifle',  dmg: 115, delay: 1.35,mag: 5,  res: 20, spread: .001, auto: false, price: 4750, slot: 1, pellets: 1, range: 220, kick: .03,  rl: 3.4, len: .85, col: 0x1f2a1f, scope: true },
};
// Ranged weapons need to reach across the bigger map; melee stays short (it's a lunge, not a sightline).
// Spread/kick are angular, so the lateral miss distance scales with range - without this,
// tripling the map would triple typical engagement distance and make hits far less likely.
for (const k in W) if (!W[k].melee) { W[k].range *= SCALE; W[k].spread /= SCALE; W[k].kick /= SCALE; }

// ---------------------------------------------------------------------------
// MAP: "Roofline"
// Layout coordinates below are in map units (x right, z down; 62 x 62, same as
// the old map). Everything is multiplied by SCALE when turned into boxes.
//
//   CT spawn  top centre (opens to the Plaza through a narrow Choke).
//   T spawn   walled-off bottom-left corner (no sightline to CT).
//   Site A    top-left room.  Reached via West Alley, or Plaza -> Choke -> A Door.
//   Site B    right-side room. Reached via East Yard, Plaza -> B Door, or North Hall.
//
// Every wall mass is a hollow, roofed building: shell walls with windows, a
// (render-only) gabled roof, and no way inside. Windows are glass boxes:
// they block movement but not bullets or line of sight (see castWorld), so
// you can shoot and spot through them, but not walk through.
// Box.c: 0 = wall, 1 = crate, 2 = window glass (collides, does not block rays)
// ---------------------------------------------------------------------------
const HB = 5, WIN_Y0 = 1.1, WIN_Y1 = 2.7, WALL_T = 0.5, WIN_W = 1.4;
const ROOF_OH = 0.4, ROOF_RISE = 1.6;

function B(x, y, z, w, h, d, c = 0) {
  x *= SCALE; z *= SCALE; w *= SCALE; d *= SCALE;
  return { x, y, z, w, h, d, c, x0: x - w / 2, x1: x + w / 2, y0: y, y1: y + h, z0: z - d / 2, z1: z + d / 2 };
}
// Box from layout-space corners.
function S(x0, z0, x1, z1, y0, y1, c = 0) { return B((x0 + x1) / 2, y0, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, c); }

export const BOXES = [];
export const BUILDINGS = [];   // footprints in world units (for the minimap)
export const ROOFS = [];       // render-only gabled roofs, world units

// Map boundary (inner faces at x = +-29, z = -29 and z = 30)
BOXES.push(B(0, 0, -29.5, 61, 6, 1), B(0, 0, 30.5, 61, 6, 1), B(-29.5, 0, 0.5, 1, 6, 62), B(29.5, 0, 0.5, 1, 6, 62));

// [x0, z0, x1, z1] footprints
const BLD = [
  [-20, -12, -13, 16],                                                    // Alley Block (west of Plaza)
  [-13, -29, -8, -24], [-13, -19, -8, -12],                               // CT annexes either side of A Door
  [-8, -18, -3, -14], [1, -18, 8, -14],                                   // Choke buildings
  [8, -29, 12, -26], [8, -21, 12, -14], [8, -14, 12, -4],                 // North Hall west wall (CT door gap z -26..-21)
  [10, -4, 14, 2], [10, 7, 14, 12],                                       // B West (B Door gap z 2..7)
  [14, -8, 18, -4], [26, -8, 29, -4],                                     // B Gate (opening x 18..26)
  [22, 11, 29, 15],                                                       // B South (East Yard opening x 16..22)
  [-17, 16, -3, 22], [3, 16, 12, 22],                                     // T Band (Mid Door gap x -3..3)
  [12, 12, 16, 22],                                                       // Yard Block
  [18, -20, 21, -12],                                                     // Hall Hut
  [-29, 8, -23.5, 14], [-25.5, -4, -20, 2],                               // Warehouses: stagger West Alley into an S-bend (no spawn -> A sightline)
  [-17, 27, -12, 30],                                                     // Depot (south side of T spawn exit)
];

// Window centres along a face. Opposite faces use different phases (.25 vs .75) so windows never line up
// straight across a building: no long axis-aligned sightlines through a hollow shell.
function wins(lo, hi, ph) {
  const L = hi - lo, k = Math.floor(L / 4.5), r = [];
  for (let i = 0; i < k; i++) r.push(lo + (i + ph) * L / k);
  return r;
}
// One wall strip: thin axis a0..a1, running lo..hi, with window centres `ws` (sorted).
function strip(horiz, a0, a1, lo, hi, ws) {
  const mk = (p0, p1, y0, y1, c = 0) => horiz ? S(p0, a0, p1, a1, y0, y1, c) : S(a0, p0, a1, p1, y0, y1, c);
  let cur = lo;
  for (const w of ws) {
    const w0 = w - WIN_W / 2, w1 = w + WIN_W / 2;
    if (w0 > cur) BOXES.push(mk(cur, w0, 0, HB));
    BOXES.push(mk(w0, w1, 0, WIN_Y0), mk(w0, w1, WIN_Y1, HB), mk(w0, w1, WIN_Y0, WIN_Y1, 2));
    cur = w1;
  }
  if (hi > cur) BOXES.push(mk(cur, hi, 0, HB));
}
function building(self) {
  const [x0, z0, x1, z1] = self, t = WALL_T, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
  // windows only on faces that look at open ground (not another building, not the map edge)
  const adj = (px, pz) => BLD.some(o => o !== self && px > o[0] && px < o[2] && pz > o[1] && pz < o[3]);
  const okN = z0 > -28.9 && !adj(mx, z0 - .3), okS = z1 < 29.9 && !adj(mx, z1 + .3);
  const okW = x0 > -28.9 && !adj(x0 - .3, mz), okE = x1 < 28.9 && !adj(x1 + .3, mz);
  strip(true, z0, z0 + t, x0, x1, okN ? wins(x0, x1, .25) : []);
  strip(true, z1 - t, z1, x0, x1, okS ? wins(x0, x1, .75) : []);
  strip(false, x0, x0 + t, z0 + t, z1 - t, okW ? wins(z0, z1, .25) : []);
  strip(false, x1 - t, x1, z0 + t, z1 - t, okE ? wins(z0, z1, .75) : []);
  BUILDINGS.push({ x0: x0 * SCALE, z0: z0 * SCALE, x1: x1 * SCALE, z1: z1 * SCALE });
  const w = x1 - x0, d = z1 - z0, alongX = w >= d, short = Math.min(w, d);
  ROOFS.push({
    x: mx * SCALE, z: mz * SCALE, y: HB,
    alongX, len: (alongX ? w : d) * SCALE + ROOF_OH * 2 * SCALE,
    hw: (short / 2 + ROOF_OH) * SCALE, rise: ROOF_RISE,
  });
}
for (const b of BLD) building(b);

// Crates: [cx, cz, w, d, h]
for (const [cx, cz, w, d, h] of [
  [-24, -22, 3, 3, 1.6], [-17, -16, 2, 2, 1.2],                      // Site A
  [-27, 17, 2, 2, 1.2], [-27, -9, 2, 2, 1.2],                        // West Alley
  [-3, 2, 4, 4, 1.2], [5, 8, 2, 2, 1.2], [-8, -4, 2, 2, 1.2], [5, -6, 2, 2, 1.2],   // Plaza
  [24, 6.5, 3, 3, 1.6], [17, 0, 2, 2, 1.2], [27, 0.5, 2, 2, 1.2],     // Site B
  [24, -14, 3, 3, 1.6], [16, -22, 2, 2, 1.2], [22, -24, 2, 2, 1.2],  // North Hall
  [24, 19.5, 3, 3, 1.6], [18, 26.5, 2, 2, 1.2],                      // East Yard
  [8, 26.5, 3, 2, 1.2], [-2, 28.2, 3, 2, 1.2],                       // South Lane
  [-26, 20, 2, 1.6, 1.2],                                            // T spawn
]) BOXES.push(B(cx, 0, cz, w, h, d, 1));

export const SITES = { A: { x: -21 * SCALE, z: -19 * SCALE, r: 6 * SCALE }, B: { x: 22 * SCALE, z: 4 * SCALE, r: 6 * SCALE } };
const pt = (x, z) => [x * SCALE, z * SCALE];
const sp = (list, yaw) => list.map(([x, z]) => [x * SCALE, z * SCALE, yaw]);
export const SPAWNS = {
  // T: walled corner, facing the exits (north-east)
  T: sp([[-26, 29], [-23.5, 29], [-21, 29], [-18.5, 29], [-27, 27], [-24.5, 27], [-22, 27], [-19.5, 27], [-27, 24.5], [-24, 24.5]], -0.7),
  // CT: top centre, facing south
  CT: sp([[-6, -28.2], [-3, -28.2], [0, -28.2], [3, -28.2], [6, -28.2], [-6, -21.5], [-3, -21.5], [0, -21.5], [3, -21.5], [6, -21.5]], Math.PI),
};
// T attack routes: several per site, each a waypoint chain (bots walk straight between waypoints).
export const ROUTES = {
  A: [
    [pt(-22.5, 19.5), pt(-21.5, 11), pt(-22, 5), pt(-27.5, 3), pt(-27.5, -5), pt(-23, -10), pt(-22, -15.5), pt(-21, -19)],   // West Alley (S-bend)
    [pt(-19, 24.2), pt(-6, 24.5), pt(0, 23.5), pt(0, 19), pt(0, 12), pt(0, -5), pt(-1, -13), pt(-1, -19.5),
     pt(-5, -21.5), pt(-10.5, -21.5), pt(-17, -19.5), pt(-20, -19)],                                    // Mid -> Choke -> A Door
  ],
  B: [
    [pt(-19, 24.2), pt(10, 23.2), pt(18.5, 22.5), pt(19, 16), pt(19.5, 9), pt(20.5, 5.5)],              // East Yard
    [pt(-19, 24.2), pt(-6, 24.5), pt(0, 23.5), pt(0, 19), pt(0, 12), pt(1, 6), pt(9, 4.5), pt(12, 4.5), pt(17, 4.5), pt(20, 4.5)],   // Mid -> B Door
  ],
};
// CT hold routes: waypoint chains ending at the hold position.
export const HOLDS = {
  A: [pt(-4, -22), pt(-10.5, -21.5), pt(-17, -19)],
  B: [pt(6, -22), pt(10, -23.5), pt(14, -20), pt(16, -11), pt(22, -8), pt(21, -1)],
  M: [pt(-1, -21), pt(-1, -10)],
};

// Navigation graph for bots going somewhere off their scripted routes (e.g. to a planted bomb).
// Edges are generated automatically wherever the straight line between two nodes is walkable.
const NAV = [
  [-23, 25], [-14.5, 24.5], [-6, 24.5], [0, 24], [10, 23.4], [18.5, 22.5],
  [27, 23], [27, 17.5], [20, 28.5], [19, 17], [19.5, 9], [20.5, 5.5], [21, 0], [16, 5], [26, 3], [21, -2], [25, 10], [22, -7],
  [0, 19], [0, 12], [1, 6], [-9, 8], [-10, 0], [-9, -9], [3, -3], [0, -10], [-1, -16], [-1, -21],
  [9, 4.5], [12, 4.5], [14, 6], [5, 14],
  [-5, -22], [5, -22], [0, -25], [-10.5, -21.5],
  [-17, -19], [-21, -19], [-20, -15], [-26, -18], [-22, -26], [-16, -25],
  [-22.5, 19.5], [-21.5, 11], [-22, 5], [-27.5, 3], [-27.5, -5], [-23, -10], [-22, -14],
  [10, -23.5], [14, -20], [16, -11], [22, -9], [25, -10], [26, -20], [15, -26], [27, -26],
].map(([x, z]) => [x * SCALE, z * SCALE]);

const PR = R + 0.15;
export function segClear(x1, z1, x2, z2) {
  const lx = Math.min(x1, x2) - PR, hx = Math.max(x1, x2) + PR, lz = Math.min(z1, z2) - PR, hz = Math.max(z1, z2) + PR;
  const near = [];
  for (const b of BOXES) if (b.y0 < H_STAND && b.x1 > lx && b.x0 < hx && b.z1 > lz && b.z0 < hz) near.push(b);
  if (!near.length) return true;
  const d = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.ceil(d / 0.6));
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t;
    for (const b of near) if (x + PR > b.x0 && x - PR < b.x1 && z + PR > b.z0 && z - PR < b.z1) return false;
  }
  return true;
}
export function blockedAt(x, z) {
  for (const f of BUILDINGS) if (x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1) return true; // hollow building interiors are unreachable
  for (const b of BOXES) if (b.y0 < H_STAND && x + R > b.x0 && x - R < b.x1 && z + R > b.z0 && z - R < b.z1) return true;
  return false;
}
const ADJ = NAV.map(() => []);
for (let i = 0; i < NAV.length; i++) for (let j = i + 1; j < NAV.length; j++) {
  const d = Math.hypot(NAV[i][0] - NAV[j][0], NAV[i][1] - NAV[j][1]);
  if (d <= 16 * SCALE && segClear(NAV[i][0], NAV[i][1], NAV[j][0], NAV[j][1])) { ADJ[i].push([j, d]); ADJ[j].push([i, d]); }
}
// Waypoints from (sx,sz) to (gx,gz), excluding the start, always ending at the goal.
export function navPath(sx, sz, gx, gz) {
  if (segClear(sx, sz, gx, gz)) return [[gx, gz]];
  const n = NAV.length, dist = new Array(n).fill(Infinity), prev = new Array(n).fill(-1), done = new Array(n).fill(false);
  for (let i = 0; i < n; i++) if (segClear(sx, sz, NAV[i][0], NAV[i][1])) dist[i] = Math.hypot(NAV[i][0] - sx, NAV[i][1] - sz);
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0) break;
    done[u] = true;
    for (const [v, w] of ADJ[u]) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
  }
  const cand = [];
  for (let i = 0; i < n; i++) if (dist[i] < Infinity) cand.push([dist[i] + Math.hypot(NAV[i][0] - gx, NAV[i][1] - gz), i]);
  cand.sort((a, b) => a[0] - b[0]);
  for (const [, i] of cand) if (segClear(NAV[i][0], NAV[i][1], gx, gz)) {
    const out = [[gx, gz]];
    for (let k = i; k >= 0; k = prev[k]) out.unshift(NAV[k]);
    return out;
  }
  return [[gx, gz]];
}

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
  for (const b of BOXES) {
    if (b.c === 2) continue; // window glass: bullets and sight pass through
    const t = rayBox(ox, oy, oz, dx, dy, dz, b.x0, b.y0, b.z0, b.x1, b.y1, b.z1); if (t < best) best = t;
  }
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
