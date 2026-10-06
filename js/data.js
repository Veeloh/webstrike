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
// MAPS. Two Siege-style compounds, each a real two-storey building: hollow rooms, breakable walls, doorways you can
// barricade, windows, reinforced walls around the objectives, stairwells between the floors, and a fenced Attack spawn outside.
//
//   Villa  a country house. Site A = ground-floor library (NW), Site B = upstairs trophy room (east wing).
//   Bank   a bank. Site A = the reinforced vault (ground floor), Site B = the executive office upstairs.
//
// Layout coordinates (map units, x right, z down, 62 x 62: x -29..29, z -29..30) are multiplied by SCALE when turned
// into boxes. Heights are world units: every storey is FH tall, floor f stands at y = f * FH.
// loadMap(id) rebuilds the shared arrays below IN PLACE (BOXES, DOORS, SITES, SPAWNS, ...), so every module that imported
// them keeps seeing the current map. The build is deterministic: BOXES indices match on every client.
//
// Box flags:
//   c: 0 = wall, 1 = crate, 2 = window glass (collides, does not block rays), 4 = barricade, 5 = deployable shield (sh = uid),
//      6 = floor slab (slab) or stair step (stair)
//   brk: breakable wall segment (shoot/knife it enough and a hole is carved, see carve())
//   rf:  reinforced wall (cannot be broken; drawn in a different colour)    int: interior partition (drawn in the inside colour)
//   bar: barricade, value = index into DOORS. Barricades start switched off.
//   off: box is currently inactive (carved away, or barricade not placed). Every collision/ray loop skips it.
// ---------------------------------------------------------------------------
export const FH = 3.6;              // height of one storey (floor surface to floor surface)
const SLAB = 0.4;                   // floor slab thickness (the slab's top is the floor surface)
const STEP_H = 0.55;                // highest ledge you walk up without jumping (stairs rise 0.45 per step)
const RISERS = 8;                   // risers per staircase (the last one is the slab edge)
const WIN_Y0 = 1.1, WIN_Y1 = 2.7, WALL_T = 0.5, WIN_W = 1.4;   // window sill / head height above the floor, wall thickness, width
const DOOR_W = 1.0, DOOR_H = 2.8;   // doorway: width in layout units (x SCALE), height in world units
const HOLE_W = 3.2, HOLE_H = 2.8;   // size of the hole carved into a breakable wall (world units)
const ROOF_OH = 0.4;
export const floorOf = y => Math.max(0, Math.floor(((y || 0) + 0.6) / FH));   // which storey a feet-height y belongs to
export const floorY = f => f * FH;

export const DOORS = [];       // doorway openings: { x, z, y, bi } (world centre, floor height, index of its barricade box)
export const SITES = {};       // { A: { x, z, r, y }, B: ... } world units
export const BOXES = [];
export const BUILDINGS = [];   // footprints in world units (for the minimap / indoor floors)
export const ROOFS = [];       // render-only gabled roofs, world units
export const STAIRS = [];      // { x0, z0, x1, z1, fl, bot: [x, z, y], top: [x, z, y] } world units
export const VOIDS = [];       // stairwell openings in the upper floors: { x0, z0, x1, z1, y } (you fall through these)
export const SPAWNS = { T: [], CT: [] };         // [x, z, yaw, y]
export const ROUTES = { A: [], B: [] };          // T attack routes: several per site, each a waypoint chain [x, z, y]
export const HOLDS = { A: [], B: [], M: [] };    // CT hold routes: waypoint chains ending at the hold position
export const MAPINFO = { id: '', name: '', theme: null, split: 8 * SCALE, thr: { W: [0, 0], E: [0, 0], M: [0, 0] } };
let BASE = 0, NAV = [], ADJ = [];

function B(x, y, z, w, h, d, c = 0) {
  x *= SCALE; z *= SCALE; w *= SCALE; d *= SCALE;
  return { x, y, z, w, h, d, c, x0: x - w / 2, x1: x + w / 2, y0: y, y1: y + h, z0: z - d / 2, z1: z + d / 2 };
}
// Box from layout-space corners (heights in world units).
function S(x0, z0, x1, z1, y0, y1, c = 0) { return B((x0 + x1) / 2, y0, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, c); }
// Box from world-space corners.
function wbox(x0, y0, z0, x1, y1, z1, c = 0) {
  return { x: (x0 + x1) / 2, y: y0, z: (z0 + z1) / 2, w: x1 - x0, h: y1 - y0, d: z1 - z0, c, x0, x1, y0, y1, z0, z1 };
}

// One wall strip on storey fl: thin axis a0..a1, running lo..hi, with window centres `ws` and doorway centres `ds`
// (both along the run). Windows that would overlap a doorway are dropped. rf = reinforced, inner = interior partition.
function strip(horiz, a0, a1, lo, hi, ws, ds, rf, fl = 0, inner = false) {
  const y0 = fl * FH, y1 = y0 + FH;
  const mk = (p0, p1, ya, yb, c = 0) => {
    const b = horiz ? S(p0, a0, p1, a1, ya, yb, c) : S(a0, p0, a1, p1, ya, yb, c);
    if (c === 0) { if (rf) b.rf = true; if (inner) b.int = true; }
    return b;
  };
  const wall = (p0, p1) => { const b = mk(p0, p1, y0, y1); b.brk = true; return b; };   // full-height solid segment: breakable
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
      BOXES.push(mk(w0, w1, y0 + DOOR_H, y1));              // lintel: the gap below is walkable
      const bb = mk(w0, w1, y0, y0 + DOOR_H, 4);            // barricade plug, off until a defender places it
      bb.off = true; bb.bar = DOORS.length;
      DOORS.push({ x: bb.x, z: bb.z, y: y0, bi: BOXES.length });
      BOXES.push(bb);
    } else BOXES.push(mk(w0, w1, y0, y0 + WIN_Y0), mk(w0, w1, y0 + WIN_Y1, y1), mk(w0, w1, y0 + WIN_Y0, y0 + WIN_Y1, 2));
    cur = w1;
  }
  if (hi > cur) BOXES.push(wall(cur, hi));
}
// A wall run on a centre line. dir 'H' runs along x at z = pos, 'V' runs along z at x = pos; a..b are the run's end centre lines.
// flags: 'i' = ends butt into other walls (shell corners leave it off so they overlap), 'r' = reinforced, 'n' = interior partition.
function wallRun(dir, pos, a, b, flags, ws, ds, fl = 0) {
  const t = WALL_T, inner = flags.includes('i'), rf = flags.includes('r');
  const lo = inner ? a + t / 2 : a - t / 2, hi = inner ? b - t / 2 : b + t / 2;
  strip(dir === 'H', pos - t / 2, pos + t / 2, lo, hi, ws, ds, rf, fl, flags.includes('n'));
}
// Floor slab for storey fl (>= 1) over a layout rectangle, with the stairwell openings cut out.
function slabs(x0, z0, x1, z1, fl, holes) {
  let rects = [[x0, z0, x1, z1]];
  for (const h of holes) {
    const next = [];
    for (const r of rects) {
      if (h[2] <= r[0] || h[0] >= r[2] || h[3] <= r[1] || h[1] >= r[3]) { next.push(r); continue; }
      if (h[0] > r[0]) next.push([r[0], r[1], h[0], r[3]]);
      if (h[2] < r[2]) next.push([h[2], r[1], r[2], r[3]]);
      const a = Math.max(r[0], h[0]), b = Math.min(r[2], h[2]);
      if (h[1] > r[1]) next.push([a, r[1], b, h[1]]);
      if (h[3] < r[3]) next.push([a, h[3], b, r[3]]);
    }
    rects = next;
  }
  for (const r of rects) { const b = S(r[0], r[1], r[2], r[3], fl * FH - SLAB, fl * FH, 6); b.slab = true; BOXES.push(b); }
}
// A staircase from storey fl up to fl+1: footprint (layout units), dir = direction you climb (N = towards -z). It is a row of
// solid steps (the engine lets you walk up ledges <= STEP_H), enclosed by walls on both storeys, with a hole in the slab above.
function addStair(def) {
  const [x0, z0, x1, z1, dir, fl] = def, t = WALL_T, off = 0.6;
  const alongX = dir === 'E' || dir === 'W', len = alongX ? x1 - x0 : z1 - z0, n = RISERS - 1, run = len / n, rise = FH / RISERS, base = fl * FH;
  for (let i = 0; i < n; i++) {
    const a = dir === 'E' || dir === 'S' ? i * run : len - (i + 1) * run, b = a + run;
    const s = alongX ? S(x0 + a, z0, x0 + b, z1, base, base + (i + 1) * rise, 6) : S(x0, z0 + a, x1, z0 + b, base, base + (i + 1) * rise, 6);
    s.stair = true; BOXES.push(s);
  }
  for (const f of [fl, fl + 1]) {                       // side walls on both storeys
    if (alongX) { strip(true, z0 - t, z0, x0, x1, [], [], false, f, true); strip(true, z1, z1 + t, x0, x1, [], [], false, f, true); }
    else { strip(false, x0 - t, x0, z0, z1, [], [], false, f, true); strip(false, x1, x1 + t, z0, z1, [], [], false, f, true); }
  }
  // closed end of the stairwell on the upper storey (the side you climb from)
  if (dir === 'N') strip(true, z1, z1 + t, x0 - t, x1 + t, [], [], false, fl + 1, true);
  else if (dir === 'S') strip(true, z0 - t, z0, x0 - t, x1 + t, [], [], false, fl + 1, true);
  else if (dir === 'E') strip(false, x0 - t, x0, z0 - t, z1 + t, [], [], false, fl + 1, true);
  else strip(false, x1, x1 + t, z0 - t, z1 + t, [], [], false, fl + 1, true);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const bot = dir === 'N' ? [cx, z1 + off] : dir === 'S' ? [cx, z0 - off] : dir === 'E' ? [x0 - off, cz] : [x1 + off, cz];
  const top = dir === 'N' ? [cx, z0 - off] : dir === 'S' ? [cx, z1 + off] : dir === 'E' ? [x1 + off, cz] : [x0 - off, cz];
  STAIRS.push({
    x0: x0 * SCALE, z0: z0 * SCALE, x1: x1 * SCALE, z1: z1 * SCALE, fl,
    bot: [bot[0] * SCALE, bot[1] * SCALE, base], top: [top[0] * SCALE, top[1] * SCALE, base + FH],
  });
  VOIDS.push({ x0: x0 * SCALE, z0: z0 * SCALE, x1: x1 * SCALE, z1: z1 * SCALE, y: base + FH });
}

// ---- the maps -----------------------------------------------------------------
// walls  : [dir, pos, a, b, flags, windows[], doors[], floor]   (floor 0 unless given)
// stairs : [x0, z0, x1, z1, dir, floor]  footprint 1.4 x 2.4 map units, climbing from `floor` to `floor + 1`
// slabs  : [x0, z0, x1, z1, floor]  floor slab of an upper storey (stairwell holes are cut automatically)
// solid  : [x0, z0, x1, z1] plain unbreakable fences (the Attack spawn compound, which has open gaps instead of doors)
// bld    : [x0, z0, x1, z1, storeys]  roofed footprints (minimap, indoor floor, roof)
// crates : [cx, cz, w, d, h, floor]
// spawns : pts [x, z, floor]; routes / holds: key points [x, z, floor] (the loader fills in the waypoints between them with the nav graph)
// theme  : colours (see applyTheme in game.js)
const VILLA = {
  id: 'villa', name: 'Villa',
  theme: {
    sky: 0xbfdcf2, fog: 0xd2e6f2, hemi: [0xffffff, 0x77804f, 1.05], sun: [0xfff0cf, 1.4],
    ground: { style: 'grass', base: '#6f9650' }, indoor: 0x9c6b43,
    wall: 0xf0e7d0, wallIn: 0xc9a47c, slab: 0x7d5232, stair: 0x5e3b20, roof: 0x9a3f2a, roofEdge: 0x2e140d,
    rf: 0x6e7480, bar: 0x6b4a22, glass: 0xa9d8f2, crate: ['#8a5a2b', '#4a2f14'], mini: ['#4d4428', '#e8dcc0', '#6b5330'],
  },
  sites: { A: [-13, -16, 4.6, 0], B: [13, -3, 4, 1] },
  walls: [
    // ground floor shell: 36 x 30
    ['H', -22, -18, 18, '', [-13, -4, 13], [3]],
    ['H', 8, -18, 18, '', [-15, -11, 11, 15], [-2]],
    ['V', -18, -22, 8, 'i', [-5, -19], [3, -15]],
    ['V', 18, -22, 8, 'i', [-17, 3], [-5]],
    // ground floor partitions (the two walls shielding the hall from the library and the garden-side room are reinforced)
    ['V', -8, -22, -10, 'inr', [], [-15]], ['V', -8, -10, 8, 'in', [], [-4, 4]],
    ['V', 8, -22, -10, 'inr', [], [-15]], ['V', 8, -10, 8, 'in', [], [-6, 3]],
    ['H', -10, -18, -8, 'in', [], [-14]], ['H', -1, -18, -8, 'in', [], [-12]],
    ['H', -10, 8, 18, 'in', [], [14]], ['H', -1, 8, 18, 'in', [], [11]],
    ['H', -8, -8, 8, 'in', [], [-5, 5]],
    // upper floor shell + partitions
    ['H', -22, -18, 18, '', [-13, -4, 4, 13], [], 1],
    ['H', 8, -18, 18, '', [-15, -11, -5, 5, 11, 15], [], 1],
    ['V', -18, -22, 8, 'i', [-15, -4, 5], [], 1],
    ['V', 18, -22, 8, 'i', [-15, -4, 5], [], 1],
    ['V', -8, -22, 8, 'in', [], [-15, -3.5, 4.5], 1],
    ['V', 8, -22, -8, 'inr', [], [-15], 1], ['V', 8, -8, 1, 'inr', [], [-3.5], 1], ['V', 8, 1, 8, 'in', [], [4.5], 1],
    ['H', -8, -18, -8, 'in', [], [-13], 1], ['H', 1, -18, -8, 'in', [], [-13], 1],
    ['H', -6, -8, 8, 'in', [], [0], 1],
    ['H', -8, 8, 18, 'inr', [], [13], 1], ['H', 1, 8, 18, 'inr', [], [12], 1],
    // garage (east yard) and tool shed (west yard)
    ['H', 11, 22, 28, '', [], [25]], ['H', 19, 22, 28, '', [25], []], ['V', 22, 11, 19, 'i', [], [15]], ['V', 28, 11, 19, 'i', [], []],
    ['H', -8, -28, -22, '', [-25], []], ['H', 0, -28, -22, '', [], [-24.5]], ['V', -28, -8, 0, 'i', [], []], ['V', -22, -8, 0, 'i', [], [-4]],
  ],
  stairs: [[-17.6, -5, -16.2, -2.6, 'N', 0], [15.2, 3.6, 16.6, 6, 'N', 0], [-7.4, -13.5, -6, -11.1, 'N', 0]],
  slabs: [[-18.25, -22.25, 18.25, 8.25, 1]],
  // Attack compound at the south edge: exits north, west and east
  solid: [[-9.25, 20.75, -8.75, 24], [-9.25, 27, -8.75, 30], [8.75, 20.75, 9.25, 24], [8.75, 27, 9.25, 30], [-9.25, 20.75, -3, 21.25], [3, 20.75, 9.25, 21.25]],
  bld: [[-18, -22, 18, 8, 2], [22, 11, 28, 19, 1], [-28, -8, -22, 0, 1]],
  crates: [
    [-4, -3, 2, 2, 1.2], [4, 2, 2, 2, 1.2],                                   // lobby
    [-15, -19.5, 2, 2, 1.2], [16, -3, 2, 2, 1.2], [13, -17, 2, 2, 1.2],      // library, study, north-east room
    [-15, 3, 2, 2, 1.2], [11, 6.5, 2, 2, 1.2],                                // south wing rooms
    [-13, 15, 2.5, 2.5, 1.2], [12, 16, 2.5, 2.5, 1.6], [0, 13, 2, 2, 1.2],  // front yard
    [-25, 12, 2, 2, 1.2], [-25, -14, 2, 2, 1.2], [-26, -24, 3, 2, 1.2],     // west yard
    [25, 3, 2, 2, 1.2], [25, -8, 3, 3, 1.6], [24, -18, 2, 2, 1.2],          // east yard
    [-6, -26, 3, 2, 1.2], [6, -26, 3, 2, 1.2], [22, -26, 2, 2, 1.2],        // rear garden
    // upstairs
    [-14, -19, 2, 2, 1.2, 1], [-14, 5, 2, 2, 1.2, 1], [3, -18, 3, 2, 1.2, 1], [-3, 4, 2, 2, 1.2, 1],
    [14, -18, 2, 2, 1.2, 1], [14.5, -3.5, 2, 2, 1.2, 1], [11, 6, 2, 2, 1.2, 1],
  ],
  spawns: {
    T: { pts: [[-6, 28], [-3, 28], [0, 28], [3, 28], [6, 28], [-6, 25.5], [-3, 25.5], [0, 25.5], [3, 25.5], [6, 25.5]], yaw: 0 },
    CT: { pts: [[-5, -20, 0], [0, -20, 0], [5, -20, 0], [-4, -16, 1], [4, -16, 1], [-3, -16, 0], [3, -16, 0], [-5, -16, 0], [5, -16, 0], [0, -16, 0]], yaw: Math.PI },
  },
  routes: {
    A: [[[0, 25], [-8, 25.5], [-20, 16], [-20, -8], [-20, -15], [-13, -16]],     // west yard -> library door
        [[0, 25], [-2, 10], [-6, -5.5], [-13, -14]]],                            // front door -> lobby -> west wing -> library
    B: [[[0, 25], [8, 25.5], [20, 14], [20, 0], [20, -5], [13, -3, 1]],          // east yard -> study -> south-east stairs -> trophy room
        [[0, 25], [-2, 10], [12, 4], [13, -3, 1]]],                              // front door -> lobby -> south-east stairs -> trophy room
  },
  holds: {
    A: [[0, -16], [-5, -15], [-13, -16]],
    B: [[0, -16], [0, -3, 1], [13, -3, 1]],
    M: [[0, -16], [5, -10], [0, 2]],
  },
  thr: { W: [-20, 10], E: [20, 10], M: [0, 18] },
};

const BANK = {
  id: 'bank', name: 'Bank',
  theme: {
    sky: 0x9fb0c4, fog: 0xaebccc, hemi: [0xe6efff, 0x4a4f58, 1.0], sun: [0xe8f0ff, 1.2],
    ground: { style: 'asphalt', base: '#575c64' }, indoor: 0xd9d4c8,
    wall: 0xaeb6c0, wallIn: 0xe9edf2, slab: 0x3d5a80, stair: 0x6e7b8a, roof: 0x3b4450, roofEdge: 0x14181d,
    rf: 0x59616d, bar: 0x5b4a2f, glass: 0x7fb9d8, crate: ['#4f6a7a', '#26343d'], mini: ['#2d3340', '#cfd6e0', '#4f6a7a'],
  },
  sites: { A: [0, -4, 3.4, 0], B: [14.5, -12, 4, 1] },
  walls: [
    // ground floor shell: 40 x 30
    ['H', -18, -20, 20, '', [-14, -4, 15], [4]],
    ['H', 12, -20, 20, '', [-17, -6, 2, 16], [-12, 9]],
    ['V', -20, -18, 12, 'i', [-14, 5, 9], [-4]],
    ['V', 20, -18, 12, 'i', [-2, 5, 9], [-14, -5]],
    // lobby / back-row divider
    ['H', 1, -20, -6, 'in', [], [-14, -7.5]],
    ['H', 1, 6, 20, 'in', [], [7.5, 14]],
    // vault core (reinforced): one door to the lobby, one to the back hall
    ['H', 1, -6, 6, 'nr', [], [2]],
    ['H', -9, -6, 6, 'nr', [], [-2.5]],
    ['V', -6, -9, 1, 'inr', [], []],
    ['V', 6, -9, 1, 'inr', [], []],
    // back-row side walls: corridors run beside the vault
    ['V', -9, -18, 1, 'in', [], [-14, -4]],
    ['V', 9, -18, 1, 'in', [], [-13, -5]],
    ['H', -9, -20, -9, 'in', [], [-15]],
    ['H', -9, 9, 20, 'in', [], [15]],
    // upper floor shell + partitions (server room / lounge / break room west, trading floor centre, executive suite east)
    ['H', -18, -20, 20, '', [-15, -4, 4, 15], [], 1],
    ['H', 12, -20, 20, '', [-17, -12, -6, 2, 9, 16], [], 1],
    ['V', -20, -18, 12, 'i', [-12, -1, 8], [], 1],
    ['V', 20, -18, 12, 'i', [-12, -1, 8], [], 1],
    ['V', -9, -18, 12, 'in', [], [-12, -1, 8], 1],
    ['V', 9, -18, -6, 'inr', [], [-12], 1], ['V', 9, -6, 12, 'in', [], [-1, 8], 1],
    ['H', -6, -20, -9, 'in', [], [-15], 1], ['H', 4, -20, -9, 'in', [], [-15], 1],
    ['H', -6, 9, 20, 'inr', [], [15], 1], ['H', 4, 9, 20, 'in', [], [15], 1],
    // outbuildings: cafe (west plaza), kiosk (centre), generator shed (east yard), loading dock (rear)
    ['H', 16, -28, -22, '', [-25], []], ['H', 24, -28, -22, '', [], [-24.5]], ['V', -28, 16, 24, 'i', [], []], ['V', -22, 16, 24, 'i', [], [20]],
    ['H', 18, -3, 3, '', [], [1.5]], ['H', 22, -3, 3, '', [], [-1.5]], ['V', -3, 18, 22, 'i', [], []], ['V', 3, 18, 22, 'i', [], []],
    ['H', -10, 24.5, 28.5, '', [], [26.5]], ['H', -2, 24.5, 28.5, '', [], []], ['V', 24.5, -10, -2, 'i', [], [-6]], ['V', 28.5, -10, -2, 'i', [], []],
    ['H', -27, -28, -22, '', [-25], []], ['H', -20, -28, -22, '', [], [-24]], ['V', -28, -27, -20, 'i', [], []], ['V', -22, -27, -20, 'i', [], [-23.5]],
  ],
  stairs: [[-19.6, -3, -18.2, -0.6, 'N', 0], [18.2, -3, 19.6, -0.6, 'N', 0], [-0.7, 7.1, 0.7, 9.5, 'N', 0]],
  slabs: [[-20.25, -18.25, 20.25, 12.25, 1]],
  // Attack compound in the south-east corner: exits west and north
  solid: [[13.75, 19.75, 14.25, 25], [13.75, 28, 14.25, 30], [13.75, 19.75, 22, 20.25], [26, 19.75, 29, 20.25]],
  bld: [[-20, -18, 20, 12, 2], [-28, 16, -22, 24, 1], [-3, 18, 3, 22, 1], [24.5, -10, 28.5, -2, 1], [-28, -27, -22, -20, 1]],
  crates: [
    [-13, 4, 8, 1.2, 1.1], [13, 4, 8, 1.2, 1.1],                              // teller counters
    [3, -6, 2, 2, 1.2], [-4, -2, 2, 2, 1.2],                                  // vault
    [-14, -14, 2, 2, 1.2], [-15, -4, 2, 2, 1.2], [15, -4, 2, 2, 1.2], [17.5, -13, 2, 2, 1.2],   // ground offices
    [-12, 18, 2.5, 2.5, 1.2], [8, 17, 2, 2, 1.2], [-8, 22, 2, 2, 1.2], [-18, 24, 2, 2, 1.2],    // plaza
    [26, 13, 2.5, 2.5, 1.2], [26, 4, 2, 2, 1.2], [-24, -4, 2, 2, 1.2],                          // side yards
    [-8, -24, 3, 2, 1.2], [8, -24, 3, 2, 1.2], [20, -24, 2, 2, 1.2],                            // back alley
    // upstairs: trading-floor desks, server racks, conference table, the executive desk
    [-5, -12, 3, 1.5, 1.1, 1], [5, -14, 3, 1.5, 1.1, 1], [0, -4, 3, 1.5, 1.1, 1], [-6, 3, 2, 2, 1.2, 1], [6, 2, 2, 2, 1.2, 1],
    [-15, -12, 2, 2, 1.2, 1], [-15, 0, 2, 2, 1.2, 1], [-15, 8, 2, 2, 1.2, 1], [14, 0, 4, 1.5, 1.1, 1], [14, 8, 2, 2, 1.2, 1], [17.5, -15, 2, 2, 1.2, 1],
  ],
  spawns: {
    T: { pts: [[16.5, 28], [19, 28], [21.5, 28], [24, 28], [26.5, 28], [16.5, 25.5], [19, 25.5], [21.5, 25.5], [24, 25.5], [26.5, 25.5]], yaw: 0.785 },
    CT: { pts: [[-3, -16.5, 0], [0, -16.5, 0], [3, -16.5, 0], [-3, -14, 1], [3, -14, 1], [-6, -12.5, 0], [-3, -12.5, 0], [0, -12.5, 0], [3, -12.5, 0], [6, -12.5, 0]], yaw: Math.PI },
  },
  routes: {
    A: [[[21, 25], [24, 18], [11, 15], [9, 8], [2, 4], [0, -4]],                               // east front door -> lobby -> vault door
        [[21, 25], [16, 22], [0, 15], [-12, 15], [-12, 9], [-5, 4], [0, -4]]],                // west front door -> lobby -> vault door
    B: [[[21, 25], [24, 18], [11, 15], [3, 10], [5, -12, 1], [14.5, -12, 1]],                 // lobby -> centre stairs -> trading floor -> executive suite
        [[21, 25], [24, 18], [22.3, 2], [22.3, -5], [16.5, -7], [14.5, -12, 1]]],               // east yard -> manager office -> east stairs -> executive suite
  },
  holds: {
    A: [[0, -14], [-2, -11], [0, -4]],
    B: [[3, -14], [3, -12, 1], [14.5, -12, 1]],
    M: [[0, -14], [-7.5, -8], [-7.5, -2]],
  },
  thr: { W: [-12, 14], E: [12, 14], M: [0, 16] },
};
export const MAPS = [VILLA, BANK];

// ---- 3D walkability for the nav graph and bot steering. y = floor height the walker stands at.
// Stair steps are obstacles like any other ledge higher than STEP_H: you cannot cut across a staircase, only climb it from the foot
// (the nav graph links the foot and head of each staircase explicitly). Floor slabs only matter as support.
const solidFor = (b, y) => !b.off && b.y1 > y + STEP_H && b.y0 < y + H_STAND;
function supported(x, z, y) {
  if (y < 0.5) return true;
  for (const b of BOXES) if (b.slab && Math.abs(b.y1 - y) < 0.02 && x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return true;
  return false;
}
function inVoid(x, z, y, pad) {
  for (const v of VOIDS) if (Math.abs(v.y - y) < 0.02 && x > v.x0 - pad && x < v.x1 + pad && z > v.z0 - pad && z < v.z1 + pad) return true;
  return false;
}
function freeAt(x, z, pad, y) {
  for (const b of BOXES) if (solidFor(b, y) && x + pad > b.x0 && x - pad < b.x1 && z + pad > b.z0 && z - pad < b.z1) return false;
  return supported(x, z, y) && !inVoid(x, z, y, pad);
}
// Navigation graph for bots going somewhere off their scripted routes (e.g. to a planted bomb): a coarse grid of free spots on
// every storey, three nodes at every doorway (in front, in it, behind it), and the foot / head of every staircase (linked to each other).
// Edges exist wherever the straight line is walkable.
function buildNav() {
  NAV = [];
  const GS = 4 * SCALE;
  for (let f = 0; f < 3; f++) {
    const y = f * FH;
    for (let x = -28 * SCALE; x <= 28 * SCALE; x += GS) for (let z = -28 * SCALE; z <= 29 * SCALE; z += GS) if (freeAt(x, z, 1.6, y)) NAV.push([x, z, y]);
  }
  for (const d of DOORS) {
    const b = BOXES[d.bi], alongX = b.w >= b.d, off = (alongX ? b.d : b.w) / 2 + 1.7;
    for (const s of [-1, 0, 1]) {
      const x = d.x + (alongX ? 0 : s * off), z = d.z + (alongX ? s * off : 0);
      if (freeAt(x, z, PR, d.y)) NAV.push([x, z, d.y]);
    }
  }
  const links = [];
  for (const s of STAIRS) { const a = NAV.length; NAV.push([...s.bot]); NAV.push([...s.top]); links.push([a, a + 1, Math.hypot(s.x1 - s.x0, s.z1 - s.z0) * 1.6 + 12]); }
  ADJ = NAV.map(() => []);
  for (let i = 0; i < NAV.length; i++) for (let j = i + 1; j < NAV.length; j++) {
    if (NAV[i][2] !== NAV[j][2]) continue;
    const d = Math.hypot(NAV[i][0] - NAV[j][0], NAV[i][1] - NAV[j][1]);
    if (d <= 16 * SCALE && segClear(NAV[i][0], NAV[i][1], NAV[j][0], NAV[j][1], NAV[i][2])) { ADJ[i].push([j, d]); ADJ[j].push([i, d]); }
  }
  for (const [a, b, w] of links) { ADJ[a].push([b, w]); ADJ[b].push([a, w]); }
}
// Key points (layout units, [x, z, floor]) -> a full waypoint chain of world [x, z, y]: the first point, then the nav path between each pair.
function expand(keys) {
  const k = keys.map(([x, z, f = 0]) => [x * SCALE, z * SCALE, f * FH]), out = [k[0]];
  for (let i = 1; i < k.length; i++) out.push(...navPath(k[i - 1][0], k[i - 1][1], k[i - 1][2], k[i][0], k[i][1], k[i][2]));
  return out;
}

// Switch the shared world arrays to map `id`. Returns false when that map is already loaded.
export function loadMap(id) {
  const def = MAPS.find(m => m.id === id) || MAPS[0];
  if (MAPINFO.id === def.id) return false;
  BOXES.length = 0; DOORS.length = 0; BUILDINGS.length = 0; ROOFS.length = 0; STAIRS.length = 0; VOIDS.length = 0;
  SHIELDS.clear(); SMOKES.length = 0;
  for (const k in SITES) delete SITES[k];
  for (const k in def.sites) { const [x, z, r, f = 0] = def.sites[k]; SITES[k] = { x: x * SCALE, z: z * SCALE, r: r * SCALE, y: f * FH }; }

  // Map boundary (inner faces at x = +-29, z = -29 and z = 30), taller than two storeys plus a jump
  BOXES.push(B(0, 0, -29.5, 61, 12, 1), B(0, 0, 30.5, 61, 12, 1), B(-29.5, 0, 0.5, 1, 12, 62), B(29.5, 0, 0.5, 1, 12, 62));
  for (const [dir, pos, a, b, flags, ws, ds, fl = 0] of def.walls) wallRun(dir, pos, a, b, flags, ws, ds, fl);
  for (const s of def.stairs) addStair(s);
  for (const [x0, z0, x1, z1, fl] of def.slabs) slabs(x0, z0, x1, z1, fl, def.stairs.filter(s => s[5] + 1 === fl).map(s => [s[0], s[1], s[2], s[3]]));
  for (const [x0, z0, x1, z1] of def.solid) BOXES.push(S(x0, z0, x1, z1, 0, FH + 1.4));
  for (const [x0, z0, x1, z1, lv = 1] of def.bld) {
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0, alongX = w >= d, short = Math.min(w, d);
    BUILDINGS.push({ x0: x0 * SCALE, z0: z0 * SCALE, x1: x1 * SCALE, z1: z1 * SCALE, lv });
    ROOFS.push({
      x: mx * SCALE, z: mz * SCALE, y: lv * FH, alongX, len: (alongX ? w : d) * SCALE + ROOF_OH * 2 * SCALE,
      hw: (short / 2 + ROOF_OH) * SCALE, rise: Math.min(4, Math.max(1.6, short * 0.15)),
    });
  }
  for (const [cx, cz, w, d, h, fl = 0] of def.crates) BOXES.push(B(cx, fl * FH, cz, w, h, d, 1));
  BASE = BOXES.length;

  for (const side of ['T', 'CT']) {
    SPAWNS[side].length = 0;
    for (const [x, z, f = 0] of def.spawns[side].pts) SPAWNS[side].push([x * SCALE, z * SCALE, def.spawns[side].yaw, f * FH]);
  }
  buildNav();
  for (const k in ROUTES) { ROUTES[k].length = 0; for (const r of def.routes[k]) ROUTES[k].push(expand(r)); }
  for (const k in HOLDS) { HOLDS[k].length = 0; HOLDS[k].push(...expand(def.holds[k])); }
  MAPINFO.id = def.id; MAPINFO.name = def.name; MAPINFO.theme = def.theme; MAPINFO.split = 8 * SCALE;
  for (const k of ['W', 'E', 'M']) MAPINFO.thr[k] = [def.thr[k][0] * SCALE, def.thr[k][1] * SCALE];
  return true;
}
// Where a bot standing at world x watches / throws its gadgets: west side, east side or the middle of the map.
export function watchPoint(x) { return x < -MAPINFO.split ? MAPINFO.thr.W : x > MAPINFO.split ? MAPINFO.thr.E : MAPINFO.thr.M; }

// ---------------------------------------------------------------------------
// DESTRUCTION. BOXES indices are the same on every client (the map is built deterministically), so the
// host only has to send small events: { k:'hole', i, x, z }, { k:'barr', d, on }, { k:'reset' }.
// Boxes are never removed during a round, only switched off; carved pieces are appended in event order.
// ---------------------------------------------------------------------------

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
    if (b.int) n.int = true;
    if (brk) n.brk = true;
    BOXES.push(n);
  };
  add(lo, h0, b.y0, b.y1, true);                // left piece
  add(h1, hi, b.y0, b.y1, true);                // right piece
  add(h0, h1, b.y0 + HOLE_H, b.y1, false);      // lintel over the hole
}
// ---- gadget world state. Smokes only matter to the host (bot sight); shields are real boxes so everybody collides with them.
export const SMOKES = [];                 // { x, z, r }
export const SHIELDS = new Map();         // shield uid -> index into BOXES
const SH_W = 3.4, SH_T = 0.35, SH_H = 2.3;
function addShield(u, x, z, alongX, y = 0) {
  if (SHIELDS.has(u)) return;             // applyWorld may run twice on a browser host: stay idempotent
  const hw = (alongX ? SH_W : SH_T) / 2, hd = (alongX ? SH_T : SH_W) / 2;
  const b = wbox(x - hw, y, z - hd, x + hw, y + SH_H, z + hd, 5);
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
  else if (ev.k === 'shield') { if (Number.isFinite(+ev.x) && Number.isFinite(+ev.z)) addShield(ev.u | 0, +ev.x, +ev.z, !!ev.ax, Number.isFinite(+ev.y) ? +ev.y : 0); }
  else if (ev.k === 'shieldoff') { const i = SHIELDS.get(ev.u | 0); if (i !== undefined) BOXES[i].off = true; }
  else if (ev.k === 'rf') { const b = BOXES[ev.i | 0]; if (b && b.brk && !b.rf) { b.rf = true; b.rfx = true; } }   // Reinforcer
}

const PR = R + 0.15;
// Can a walker standing at floor height y walk the straight line (x1,z1)-(x2,z2)? Checks walls and crates at that storey,
// stairwell holes and (on upper storeys) that there is floor underneath. y defaults to the ground floor.
export function segClear(x1, z1, x2, z2, y = 0) {
  const lx = Math.min(x1, x2) - PR, hx = Math.max(x1, x2) + PR, lz = Math.min(z1, z2) - PR, hz = Math.max(z1, z2) + PR;
  const near = [];
  for (const b of BOXES) if (solidFor(b, y) && b.x1 > lx && b.x0 < hx && b.z1 > lz && b.z0 < hz) near.push(b);
  if (!near.length && y < 0.5) return true;
  const d = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.ceil(d / 0.6));
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t;
    for (const b of near) if (x + PR > b.x0 && x - PR < b.x1 && z + PR > b.z0 && z - PR < b.z1) return false;
    if (y >= 0.5 && (!supported(x, z, y) || inVoid(x, z, y, PR))) return false;
  }
  return true;
}
// Is standing at (x, z) with feet at height y impossible (inside a wall / crate, over a stairwell hole, or off the floor)?
export function blockedAt(x, z, y = 0) {
  for (const b of BOXES) if (solidFor(b, y) && x + R > b.x0 && x - R < b.x1 && z + R > b.z0 && z - R < b.z1) return true;
  return y >= 0.5 && (!supported(x, z, y) || inVoid(x, z, y, R));
}
// Waypoints from (sx,sz,sy) to (gx,gz,gy), excluding the start, always ending at the goal. Each waypoint is [x, z, floorHeight];
// when the two ends are on different storeys the path runs through a staircase.
export function navPath(sx, sz, sy, gx, gz, gy) {
  const fs = floorOf(sy) * FH, fg = floorOf(gy) * FH;
  if (fs === fg && segClear(sx, sz, gx, gz, fs)) return [[gx, gz, fg]];
  const n = NAV.length, dist = new Array(n).fill(Infinity), prev = new Array(n).fill(-1), done = new Array(n).fill(false);
  for (let i = 0; i < n; i++) if (NAV[i][2] === fs && segClear(sx, sz, NAV[i][0], NAV[i][1], fs)) dist[i] = Math.hypot(NAV[i][0] - sx, NAV[i][1] - sz);
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0) break;
    done[u] = true;
    for (const [v, w] of ADJ[u]) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
  }
  const cand = [];
  for (let i = 0; i < n; i++) if (NAV[i][2] === fg && dist[i] < Infinity) cand.push([dist[i] + Math.hypot(NAV[i][0] - gx, NAV[i][1] - gz), i]);
  cand.sort((a, b) => a[0] - b[0]);
  for (const [, i] of cand) if (segClear(NAV[i][0], NAV[i][1], gx, gz, fg)) {
    const out = [[gx, gz, fg]];
    for (let k = i; k >= 0; k = prev[k]) out.unshift(NAV[k]);
    return out;
  }
  return [[gx, gz, fg]];
}

// The bomb sites are discs on one storey: you are "in" a site when inside the disc and standing on that storey.
export function inSite(p) {
  const y = p.y || 0;
  for (const k in SITES) { const s = SITES[k]; if (Math.hypot(p.x - s.x, p.z - s.z) <= s.r && y >= s.y - 0.8 && y < s.y + 2.4) return k; }
  return null;
}

// ---- collision (axis-separated AABB vs cylinder-as-box). returns bit1=ground, bit2=ceiling
function overl(e, b, h) {
  return !b.off && e.x + R > b.x0 && e.x - R < b.x1 && e.z + R > b.z0 && e.z - R < b.z1 && e.y + h > b.y0 && e.y < b.y1;
}
// Walking into a low ledge (a stair step, up to STEP_H high) lifts you onto it instead of stopping you, as long as there is headroom.
function stepUp(e, b, h) {
  const up = b.y1 - e.y;
  if (up <= 0 || up > STEP_H) return false;
  const oy = e.y; e.y = b.y1 + 1e-4;
  for (const o of BOXES) if (overl(e, o, h)) { e.y = oy; return false; }
  return true;
}
export function moveE(e, dx, dy, dz, h) {
  let flags = 0;
  e.x += dx;
  for (const b of BOXES) if (overl(e, b, h)) { if (dx !== 0 && stepUp(e, b, h)) continue; e.x = dx > 0 ? b.x0 - R - 1e-4 : b.x1 + R + 1e-4; }
  e.z += dz;
  for (const b of BOXES) if (overl(e, b, h)) { if (dz !== 0 && stepUp(e, b, h)) continue; e.z = dz > 0 ? b.z0 - R - 1e-4 : b.z1 + R + 1e-4; }
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

// Load the default map (last, so the helpers above are all defined).
loadMap(MAPS[0].id);
