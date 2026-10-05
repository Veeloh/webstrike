// Shared constants, map, weapons, collision and ray helpers. Pure JS: runs in browser and Node.
export const R = 0.4, H_STAND = 1.75, H_CROUCH = 1.25, HS_MULT = 3;
const cl = (v, a, b) => Math.max(a, Math.min(b, v));

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
  // Operator guns. `model` = which existing gun model to draw, `snd` = which existing shot sound to play.
  carbine: { name: 'Carbine',        dmg: 27, delay: .075, mag: 25, res: 75,  spread: .014, auto: true,  price: 0, slot: 1, pellets: 1, range: 100, kick: .009, rl: 2.1, len: .55, col: 0x3a4a33, model: 'rifle',   snd: 'rifle' },
  dmr:     { name: 'Marksman Rifle', dmg: 58, delay: .30,  mag: 10, res: 40,  spread: .004, auto: false, price: 0, slot: 1, pellets: 1, range: 170, kick: .022, rl: 2.8, len: .75, col: 0x2f3a2f, model: 'rifle',   snd: 'rifle' },
  lmg:     { name: 'LMG',            dmg: 28, delay: .085, mag: 60, res: 120, spread: .020, auto: true,  price: 0, slot: 1, pellets: 1, range: 100, kick: .008, rl: 4.6, len: .70, col: 0x4a4a30, model: 'rifle',   snd: 'rifle' },
  autosg:  { name: 'Auto Shotgun',   dmg: 10, delay: .38,  mag: 8,  res: 32,  spread: .060, auto: false, price: 0, slot: 1, pellets: 7, range: 22,  kick: .03,  rl: 3.2, len: .55, col: 0x5a3a3a, model: 'shotgun', snd: 'shotgun' },
  pdw:     { name: 'PDW',            dmg: 23, delay: .06,  mag: 30, res: 90,  spread: .020, auto: true,  price: 0, slot: 1, pellets: 1, range: 60,  kick: .006, rl: 1.9, len: .40, col: 0x2a3a4a, model: 'smg',     snd: 'smg' },
  br:      { name: 'Battle Rifle',   dmg: 42, delay: .16,  mag: 20, res: 60,  spread: .009, auto: false, price: 0, slot: 1, pellets: 1, range: 130, kick: .016, rl: 2.6, len: .70, col: 0x5a5035, model: 'rifle',   snd: 'rifle' },
  mpistol: { name: 'Machine Pistol', dmg: 17, delay: .06,  mag: 20, res: 60,  spread: .028, auto: true,  price: 0, slot: 2, pellets: 1, range: 45,  kick: .008, rl: 1.7, len: .25, col: 0x2a2a2a, model: 'pistol',  snd: 'smg' },
  revolver:{ name: 'Revolver',       dmg: 60, delay: .55,  mag: 6,  res: 24,  spread: .005, auto: false, price: 0, slot: 2, pellets: 1, range: 90,  kick: .035, rl: 2.6, len: .30, col: 0x555555, model: 'deagle',  snd: 'deagle' },
};
// Ranged weapons need to reach across the bigger map; melee stays short (it's a lunge, not a sightline).
// Spread/kick are angular, so the lateral miss distance scales with range - without this,
// tripling the map would triple typical engagement distance and make hits far less likely.
for (const k in W) if (!W[k].melee) { W[k].range *= SCALE; W[k].spread /= SCALE; W[k].kick /= SCALE; }

// ---------------------------------------------------------------------------
// OPERATORS. Internal team ids stay 'T' (= Attack) and 'CT' (= Defense).
// Each operator is a fixed loadout (one primary, one secondary, an armour amount) plus one gadget (see GADGETS).
// ---------------------------------------------------------------------------
export const OPS = {
  vanguard: { name: 'Vanguard', side: 'T',  prim: 'rifle',   sec: 'pistol',   armor: 60, gad: 'smoke' },
  breacher: { name: 'Breacher', side: 'T',  prim: 'shotgun', sec: 'deagle',   armor: 100, gad: 'breach' },
  phantom:  { name: 'Phantom',  side: 'T',  prim: 'carbine', sec: 'pistol',   armor: 30, gad: 'ghost' },
  striker:  { name: 'Striker',  side: 'T',  prim: 'smg',     sec: 'mpistol',  armor: 60, gad: 'rush' },
  marksman: { name: 'Marksman', side: 'T',  prim: 'dmr',     sec: 'revolver', armor: 30, gad: 'recon' },
  warden:   { name: 'Warden',   side: 'CT', prim: 'lmg',     sec: 'pistol',   armor: 100, gad: 'shield' },
  anchor:   { name: 'Anchor',   side: 'CT', prim: 'autosg',  sec: 'revolver', armor: 100, gad: 'reinforce' },
  hawk:     { name: 'Hawk',     side: 'CT', prim: 'awp',     sec: 'deagle',   armor: 30, gad: 'beacon' },
  rook:     { name: 'Rook',     side: 'CT', prim: 'pdw',     sec: 'mpistol',  armor: 60, gad: 'mine' },
  bastion:  { name: 'Bastion',  side: 'CT', prim: 'br',      sec: 'pistol',   armor: 60, gad: 'fortify' },
};
export const OPS_BY_SIDE = {
  T: Object.keys(OPS).filter(k => OPS[k].side === 'T'),
  CT: Object.keys(OPS).filter(k => OPS[k].side === 'CT'),
};

// ---------------------------------------------------------------------------
// GADGETS. One per operator, used with G / Mouse 5. All tuning lives here.
//   charges : uses per round        cd : seconds before the next use
//   bar/regen/min : Ghost Walk's rechargeable bar (seconds of use, recharge per second, minimum to start)
//   dur : how long an effect lasts  r : radius (world units)
// ---------------------------------------------------------------------------
export const GADGETS = {
  smoke:     { name: 'Smoke Canister',    desc: 'Throw a canister that blocks sightlines for a few seconds.', charges: 2, cd: 1.5, dur: 8, r: 4.6, throwD: 22 },
  breach:    { name: 'Breach Charge',     desc: 'Instantly carves a hole in a breakable wall (not reinforced).', charges: 2, cd: 1.2, range: 5 },
  ghost:     { name: 'Ghost Walk',        desc: 'Hold to move silently with your knife out. Shooting, damage or planting cancels it. Backstabs hit hard.', bar: 6, regen: .75, min: 1, hold: true, stab: 3 },
  rush:      { name: 'Adrenaline Rush',   desc: 'Short burst of faster movement and reloading, plus reduced damage from behind.', cd: 22, dur: 4.5, speedMul: 1.35, reloadMul: .5, backMul: .5 },
  recon:     { name: 'Recon Drone',       desc: 'Scouts a room briefly and marks enemies on the minimap.', charges: 2, cd: 2, dur: 6, r: 16, throwD: 28 },
  shield:    { name: 'Deployable Shield', desc: 'A bullet-blocking panel that can be shot down.', charges: 2, cd: 1.5, hp: 220 },
  reinforce: { name: 'Reinforcer',        desc: 'Makes one breakable wall unbreakable for the round.', charges: 2, cd: 1, range: 6 },
  beacon:    { name: 'Spotter Beacon',    desc: 'Reveals any enemy who crosses it.', charges: 2, cd: 1, r: 2.8, mark: 5, throwD: 9 },
  mine:      { name: 'Trip Mine',         desc: 'Damages and slows the first attacker who steps on it.', charges: 3, cd: 1, r: 1.3, dmg: 35, slow: 3.5, slowMul: .5, throwD: 5 },
  fortify:   { name: 'Fortify Mode',      desc: 'Deploys a tripod and locks you in place: less damage, tighter and faster rifle. Loud to deploy.', cd: 2, toggle: true, dmgMul: .6, spreadMul: .35, rateMul: .65 },
};
// Gadgets a defender may use during the prep phase (placed things). Everything works in the live round.
export const PREP_GADGETS = new Set(['shield', 'reinforce', 'beacon', 'mine', 'fortify']);
// Leaning: sideways offset (world units) of the head at full lean. The hitbox moves with it.
export const LEAN_D = 0.6;

// ---------------------------------------------------------------------------
// MAP: "Roofline"
// Layout coordinates below are in map units (x right, z down; 62 x 62, same as
// the old map). Everything is multiplied by SCALE when turned into boxes.
//
//   Defense spawn  top centre (opens to the Plaza through a narrow Choke).
//   Attack spawn   walled-off bottom-left corner (no sightline to Defense).
//   Site A    top-left room.  Reached via West Alley, or Plaza -> Choke -> A Door.
//   Site B    right-side room. Reached via East Yard, Plaza -> B Door, or North Hall.
//
// Every wall mass is a hollow, roofed building: shell walls with windows, doorways
// you can walk through, and a (render-only) gabled roof. Windows are glass boxes:
// they block movement but not bullets or line of sight (see castWorld).
//
// Box flags:
//   c: 0 = wall, 1 = crate, 2 = window glass (collides, does not block rays), 4 = barricade, 5 = deployable shield (sh = uid)
//   brk: breakable wall segment (shoot/knife it enough and a hole is carved, see carve())
//   rf:  reinforced wall (cannot be broken; drawn in a different colour)
//   bar: barricade, value = index into DOORS. Barricades start switched off.
//   off: box is currently inactive (carved away, or barricade not placed). Every collision/ray loop skips it.
// ---------------------------------------------------------------------------
const HB = 5, WIN_Y0 = 1.1, WIN_Y1 = 2.7, WALL_T = 0.5, WIN_W = 1.4;
const DOOR_W = 1.0, DOOR_H = 2.8;   // doorway: width in layout units (x SCALE), height in world units
const HOLE_W = 3.2, HOLE_H = 2.8;   // size of the hole carved into a breakable wall (world units)
const ROOF_OH = 0.4, ROOF_RISE = 1.6;

export const DOORS = [];       // doorway openings: { x, z, bi } (world centre, index of its barricade box)

// Sites in layout units; reinforced walls are chosen from these.
const SITE_L = { A: [-21, -19, 6], B: [22, 4, 6] };
export const SITES = Object.fromEntries(Object.entries(SITE_L).map(([k, [x, z, r]]) => [k, { x: x * SCALE, z: z * SCALE, r: r * SCALE }]));

function B(x, y, z, w, h, d, c = 0) {
  x *= SCALE; z *= SCALE; w *= SCALE; d *= SCALE;
  return { x, y, z, w, h, d, c, x0: x - w / 2, x1: x + w / 2, y0: y, y1: y + h, z0: z - d / 2, z1: z + d / 2 };
}
// Box from layout-space corners.
function S(x0, z0, x1, z1, y0, y1, c = 0) { return B((x0 + x1) / 2, y0, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, c); }
// Box from world-space corners.
function wbox(x0, y0, z0, x1, y1, z1, c = 0) {
  return { x: (x0 + x1) / 2, y: y0, z: (z0 + z1) / 2, w: x1 - x0, h: y1 - y0, d: z1 - z0, c, x0, x1, y0, y1, z0, z1 };
}

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
// One wall strip: thin axis a0..a1, running lo..hi, with window centres `ws` (sorted)
// and doorway centres `ds`. Windows that would overlap a doorway are dropped.
// rf = reinforced building (its walls cannot be broken).
function strip(horiz, a0, a1, lo, hi, ws, ds, rf) {
  const mk = (p0, p1, y0, y1, c = 0) => {
    const b = horiz ? S(p0, a0, p1, a1, y0, y1, c) : S(a0, p0, a1, p1, y0, y1, c);
    if (c === 0 && rf) b.rf = true;
    return b;
  };
  const wall = (p0, p1) => { const b = mk(p0, p1, 0, HB); b.brk = true; return b; };   // full-height solid segment: breakable
  const clearDist = (DOOR_W + WIN_W) / 2 + 0.3;
  const ops = [];
  for (const d of ds) ops.push({ c: d, door: true });
  for (const w of ws) if (!ds.some(d => Math.abs(d - w) < clearDist)) ops.push({ c: w, door: false });
  ops.sort((p, q) => p.c - q.c);
  let cur = lo;
  for (const o of ops) {
    const half = (o.door ? DOOR_W : WIN_W) / 2, w0 = o.c - half, w1 = o.c + half;
    if (w0 > cur) BOXES.push(wall(cur, w0));
    if (o.door) {
      BOXES.push(mk(w0, w1, DOOR_H, HB));                 // lintel: the gap below is walkable
      const bb = mk(w0, w1, 0, DOOR_H, 4);                // barricade plug, off until a defender places it
      bb.off = true; bb.bar = DOORS.length;
      DOORS.push({ x: bb.x, z: bb.z, bi: BOXES.length });
      BOXES.push(bb);
    } else BOXES.push(mk(w0, w1, 0, WIN_Y0), mk(w0, w1, WIN_Y1, HB), mk(w0, w1, WIN_Y0, WIN_Y1, 2));
    cur = w1;
  }
  if (hi > cur) BOXES.push(wall(cur, hi));
}
// Door phase per face. Opposite faces use different phases so doors never line up
// straight across a building (same idea as the windows).
const DOOR_PH = { N: .35, S: .65, W: .35, E: .65 };
function building(self) {
  const [x0, z0, x1, z1] = self, t = WALL_T, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
  // windows only on faces that look at open ground (not another building, not the map edge)
  const adj = (px, pz) => BLD.some(o => o !== self && px > o[0] && px < o[2] && pz > o[1] && pz < o[3]);
  const okN = z0 > -28.9 && !adj(mx, z0 - .3), okS = z1 < 29.9 && !adj(mx, z1 + .3);
  const okW = x0 > -28.9 && !adj(x0 - .3, mz), okE = x1 < 28.9 && !adj(x1 + .3, mz);
  // Buildings next to a site are reinforced (their walls can't be broken).
  const rf = Object.values(SITE_L).some(([sx, sz, sr]) => Math.hypot(cl(sx, x0, x1) - sx, cl(sz, z0, z1) - sz) <= sr + 3);
  // Doorway for a face: first phase along the face where the whole opening (and a bit of
  // approach space in front of it) is open ground. Returns [] if the face has no usable spot.
  const doorFor = face => {
    const horiz = face === 'N' || face === 'S';
    const a = horiz ? x0 : z0, b = horiz ? x1 : z1;
    const lo = a + t + DOOR_W / 2 + .15, hi = b - t - DOOR_W / 2 - .15;
    if (hi < lo) return [];
    const off = face === 'N' ? z0 - .8 : face === 'S' ? z1 + .8 : face === 'W' ? x0 - .8 : x1 + .8;
    if (!(horiz ? off > -28.9 && off < 29.9 : off > -28.9 && off < 28.9)) return [];
    for (const f of [DOOR_PH[face], .5, .25, .75]) {
      const c = cl(a + f * (b - a), lo, hi);
      if ([c - DOOR_W / 2, c, c + DOOR_W / 2].every(p => !(horiz ? adj(p, off) : adj(off, p)))) return [c];
    }
    return [];
  };
  strip(true, z0, z0 + t, x0, x1, okN ? wins(x0, x1, .25) : [], doorFor('N'), rf);
  strip(true, z1 - t, z1, x0, x1, okS ? wins(x0, x1, .75) : [], doorFor('S'), rf);
  strip(false, x0, x0 + t, z0 + t, z1 - t, okW ? wins(z0, z1, .25) : [], doorFor('W'), rf);
  strip(false, x1 - t, x1, z0 + t, z1 - t, okE ? wins(z0, z1, .75) : [], doorFor('E'), rf);
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

// ---------------------------------------------------------------------------
// DESTRUCTION. BOXES indices are the same on every client (the map is built deterministically), so the
// host only has to send small events: { k:'hole', i, x, z }, { k:'barr', d, on }, { k:'reset' }.
// Boxes are never removed during a round, only switched off; carved pieces are appended in event order.
// ---------------------------------------------------------------------------
const BASE = BOXES.length;

// Carve a doorway-sized hole out of breakable wall box i around (px, pz). Idempotent.
export function carve(i, px, pz) {
  const b = BOXES[i];
  if (!b || b.off || !b.brk) return;
  b.off = true;
  const alongX = b.w >= b.d, lo = alongX ? b.x0 : b.z0, hi = alongX ? b.x1 : b.z1, c = alongX ? px : pz;
  let h0 = cl(c - HOLE_W / 2, lo, hi), h1 = cl(c + HOLE_W / 2, lo, hi);
  if (h0 - lo < 1.2) h0 = lo;          // don't leave tiny slivers at the ends
  if (hi - h1 < 1.2) h1 = hi;
  const add = (a0, a1, y0, y1, brk) => {
    if (a1 - a0 < 0.05 || y1 - y0 < 0.05) return;
    const n = alongX ? wbox(a0, y0, b.z0, a1, y1, b.z1, 0) : wbox(b.x0, y0, a0, b.x1, y1, a1, 0);
    if (b.rf) n.rf = true;
    if (brk) n.brk = true;
    BOXES.push(n);
  };
  add(lo, h0, b.y0, b.y1, true);       // left piece
  add(h1, hi, b.y0, b.y1, true);       // right piece
  add(h0, h1, HOLE_H, b.y1, false);    // lintel over the hole
}
// ---- gadget world state. Smokes only matter to the host (bot sight); shields are real boxes so everybody collides with them.
export const SMOKES = [];                 // { x, z, r }
export const SHIELDS = new Map();         // shield uid -> index into BOXES
const SH_W = 3.4, SH_T = 0.35, SH_H = 2.3;
function addShield(u, x, z, alongX) {
  if (SHIELDS.has(u)) return;             // applyWorld may run twice on a browser host: stay idempotent
  const hw = (alongX ? SH_W : SH_T) / 2, hd = (alongX ? SH_T : SH_W) / 2;
  const b = wbox(x - hw, 0, z - hd, x + hw, SH_H, z + hd, 5);
  b.sh = u;
  SHIELDS.set(u, BOXES.length); BOXES.push(b);
}
// Shield footprint for a centre and orientation (used to test whether there is room before placing).
export function shieldRect(x, z, alongX) {
  const hw = (alongX ? SH_W : SH_T) / 2, hd = (alongX ? SH_T : SH_W) / 2;
  return { x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd };
}
// Does the segment (x1,z1)-(x2,z2) pass through a smoke cloud? (Bot sight check.)
export function smokeCut(x1, z1, x2, z2) {
  if (!SMOKES.length) return false;
  const dx = x2 - x1, dz = z2 - z1, L2 = dx * dx + dz * dz;
  for (const s of SMOKES) {
    let t = L2 ? ((s.x - x1) * dx + (s.z - z1) * dz) / L2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    if (Math.hypot(x1 + dx * t - s.x, z1 + dz * t - s.z) < s.r) return true;
  }
  return false;
}
// Back to the start-of-round map: all walls whole, no barricades, no shields, no reinforcements.
export function resetWorld() {
  BOXES.length = BASE;
  for (const b of BOXES) { b.off = b.bar !== undefined; if (b.rfx) { b.rf = false; b.rfx = false; } }
  SHIELDS.clear(); SMOKES.length = 0;
}
export function applyWorld(ev) {
  if (!ev) return;
  if (ev.k === 'reset') resetWorld();
  else if (ev.k === 'hole') { if (Number.isFinite(+ev.x) && Number.isFinite(+ev.z)) carve(ev.i | 0, +ev.x, +ev.z); }
  else if (ev.k === 'barr') { const d = DOORS[ev.d | 0]; if (d) BOXES[d.bi].off = !ev.on; }
  else if (ev.k === 'shield') { if (Number.isFinite(+ev.x) && Number.isFinite(+ev.z)) addShield(ev.u | 0, +ev.x, +ev.z, !!ev.ax); }
  else if (ev.k === 'shieldoff') { const i = SHIELDS.get(ev.u | 0); if (i !== undefined) BOXES[i].off = true; }
  else if (ev.k === 'rf') { const b = BOXES[ev.i | 0]; if (b && b.brk && !b.rf) { b.rf = true; b.rfx = true; } }   // Reinforcer
}

const pt = (x, z) => [x * SCALE, z * SCALE];
const sp = (list, yaw) => list.map(([x, z]) => [x * SCALE, z * SCALE, yaw]);
export const SPAWNS = {
  // T (Attack): walled corner, facing the exits (north-east)
  T: sp([[-26, 29], [-23.5, 29], [-21, 29], [-18.5, 29], [-27, 27], [-24.5, 27], [-22, 27], [-19.5, 27], [-27, 24.5], [-24, 24.5]], -0.7),
  // CT (Defense): top centre, facing south
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
  for (const b of BOXES) if (!b.off && b.y0 < H_STAND && b.x1 > lx && b.x0 < hx && b.z1 > lz && b.z0 < hz) near.push(b);
  if (!near.length) return true;
  const d = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.ceil(d / 0.6));
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t;
    for (const b of near) if (x + PR > b.x0 && x - PR < b.x1 && z + PR > b.z0 && z - PR < b.z1) return false;
  }
  return true;
}
export function blockedAt(x, z) {
  // Buildings are enterable (doorways), so interiors are only blocked by the wall boxes below.
  for (const b of BOXES) if (!b.off && b.y0 < H_STAND && x + R > b.x0 && x - R < b.x1 && z + R > b.z0 && z - R < b.z1) return true;
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
  return !b.off && e.x + R > b.x0 && e.x - R < b.x1 && e.z + R > b.z0 && e.z - R < b.z1 && e.y + h > b.y0 && e.y < b.y1;
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
    if (b.off || b.c === 2) continue; // switched-off boxes and window glass: bullets and sight pass through
    const t = rayBox(ox, oy, oz, dx, dy, dz, b.x0, b.y0, b.z0, b.x1, b.y1, b.z1); if (t < best) best = t;
  }
  if (dy < 0) { const t = -oy / dy; if (t >= 0 && t < best) best = t; }
  return best;
}
// Same as castWorld but also says which box was hit (bi = index into BOXES, or -1 for floor / nothing).
export function castWorldBox(ox, oy, oz, dx, dy, dz, max) {
  let best = max, bi = -1;
  for (let i = 0; i < BOXES.length; i++) {
    const b = BOXES[i];
    if (b.off || b.c === 2) continue;
    const t = rayBox(ox, oy, oz, dx, dy, dz, b.x0, b.y0, b.z0, b.x1, b.y1, b.z1); if (t < best) { best = t; bi = i; }
  }
  if (dy < 0) { const t = -oy / dy; if (t >= 0 && t < best) { best = t; bi = -1; } }
  return { t: best, bi };
}
// Sideways offset of the head when leaning (right vector of the player's yaw), see LEAN_D.
export function leanOff(e) {
  const l = (e.lean || 0) * LEAN_D;
  return l ? [Math.cos(e.yaw || 0) * l, -Math.sin(e.yaw || 0) * l] : [0, 0];
}
export function rayPlayer(e, ox, oy, oz, dx, dy, dz) {
  const h = e.crouch ? H_CROUCH : H_STAND, hb = h - 0.28;
  // Leaning: the head moves the full offset, the torso half of it, the feet stay put. The hitbox follows what other players see.
  const [lx, lz] = leanOff(e), bx = e.x + lx * .5, bz = e.z + lz * .5, hx = e.x + lx, hz = e.z + lz;
  const tb = rayBox(ox, oy, oz, dx, dy, dz, bx - .32, e.y, bz - .32, bx + .32, e.y + hb, bz + .32);
  const th = rayBox(ox, oy, oz, dx, dy, dz, hx - .2, e.y + hb, hz - .2, hx + .2, e.y + h, hz + .2);
  if (th === Infinity && tb === Infinity) return null;
  return th <= tb ? { t: th, head: true } : { t: tb, head: false };
}
export function losClear(x1, y1, z1, x2, y2, z2) {
  const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1, d = Math.hypot(dx, dy, dz);
  return castWorld(x1, y1, z1, dx / d, dy / d, dz / d, d) >= d - 0.02;
}
