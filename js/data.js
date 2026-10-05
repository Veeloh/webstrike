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
// MAPS. Two Siege-style compounds: hollow multi-room buildings with breakable walls, doorways you can
// barricade, windows, reinforced walls around the objectives, and an enclosed Attack spawn outside.
//
//   Villa  a country house: central hall + lobby, four wing rooms, Site A in the NW library, Site B in the east study.
//   Bank   a bank: wide public lobby, a reinforced vault core (Site A), back offices, Site B in the executive office.
//
// Layout coordinates (map units, x right, z down, 62 x 62: x -29..29, z -29..30) are multiplied by SCALE when
// turned into boxes. Both maps share the same footprint, so floor / fog / minimap code does not care which is loaded.
// loadMap(id) rebuilds the shared arrays below IN PLACE (BOXES, DOORS, SITES, SPAWNS, ...), so every module that imported
// them keeps seeing the current map. The build is deterministic: BOXES indices match on every client.
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
const ROOF_OH = 0.4;

export const DOORS = [];       // doorway openings: { x, z, bi } (world centre, index of its barricade box)
export const SITES = {};       // { A: { x, z, r }, B: ... } world units
export const BOXES = [];
export const BUILDINGS = [];   // footprints in world units (for the minimap)
export const ROOFS = [];       // render-only gabled roofs, world units
export const SPAWNS = { T: [], CT: [] };
export const ROUTES = { A: [], B: [] };          // T attack routes: several per site, each a waypoint chain
export const HOLDS = { A: [], B: [], M: [] };    // CT hold routes: waypoint chains ending at the hold position
export const MAPINFO = { id: '', name: '', split: 8 * SCALE, thr: { W: [0, 0], E: [0, 0], M: [0, 0] } };
let BASE = 0, NAV = [], ADJ = [];

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

// One wall strip: thin axis a0..a1, running lo..hi, with window centres `ws` and doorway centres `ds`
// (both along the run). Windows that would overlap a doorway are dropped. rf = reinforced (cannot be broken).
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
// A wall run on a centre line. dir 'H' runs along x at z = pos, 'V' runs along z at x = pos; a..b are the run's end centre lines.
// flags: 'i' = ends butt into other walls (shell corners leave it off so they overlap), 'r' = reinforced.
function wallRun(dir, pos, a, b, flags, ws, ds) {
  const t = WALL_T, inner = flags.includes('i'), rf = flags.includes('r');
  const lo = inner ? a + t / 2 : a - t / 2, hi = inner ? b - t / 2 : b + t / 2;
  strip(dir === 'H', pos - t / 2, pos + t / 2, lo, hi, ws, ds, rf);
}

// ---- the maps -----------------------------------------------------------------
// walls : [dir, pos, a, b, flags, windows[], doors[]]
// solid : [x0, z0, x1, z1] plain unbreakable fences (the Attack spawn compound, which has open gaps instead of doors)
// bld   : [x0, z0, x1, z1] roofed footprints (minimap + roofs)
// crates: [cx, cz, w, d, h]
// routes/holds: key points (layout units); the loader fills in the waypoints between them with the nav graph.
const VILLA = {
  id: 'villa', name: 'Villa',
  sites: { A: [-13, -16, 4.6], B: [13, -5.5, 4] },
  walls: [
    // shell: 36 x 30
    ['H', -22, -18, 18, '', [-13, -4, 13], [3]],              // north: library, hall, north-east room windows; rear door into the hall
    ['H', 8, -18, 18, '', [-15, -11, 11, 15], [-2]],          // south: front door into the lobby, windows on both wings
    ['V', -18, -22, 8, 'i', [-5, -19], [3, -15]],             // west: doors into the library and the south-west room
    ['V', 18, -22, 8, 'i', [-17, 3], [-5]],                   // east: door into the study
    // hall / lobby partition and wing walls (the two walls shielding the hall from the site rooms are reinforced)
    ['V', -8, -22, -10, 'ir', [], [-15]],
    ['V', -8, -10, 8, 'i', [], [-4, 4]],
    ['V', 8, -22, -10, 'ir', [], [-15]],
    ['V', 8, -10, 8, 'i', [], [-6, 3]],
    ['H', -10, -18, -8, 'i', [], [-14]],
    ['H', -1, -18, -8, 'i', [], [-12]],
    ['H', -10, 8, 18, 'i', [], [14]],
    ['H', -1, 8, 18, 'i', [], [11]],
    ['H', -8, -8, 8, 'i', [], [-5, 5]],
    // garage (east yard) and tool shed (west yard)
    ['H', 11, 22, 28, '', [], [25]], ['H', 19, 22, 28, '', [25], []], ['V', 22, 11, 19, 'i', [], [15]], ['V', 28, 11, 19, 'i', [], []],
    ['H', -8, -28, -22, '', [-25], []], ['H', 0, -28, -22, '', [], [-24.5]], ['V', -28, -8, 0, 'i', [], []], ['V', -22, -8, 0, 'i', [], [-4]],
  ],
  // Attack compound at the south edge: exits north, west and east
  solid: [[-9.25, 20.75, -8.75, 24], [-9.25, 27, -8.75, 30], [8.75, 20.75, 9.25, 24], [8.75, 27, 9.25, 30], [-9.25, 20.75, -3, 21.25], [3, 20.75, 9.25, 21.25]],
  bld: [[-18, -22, 18, 8], [22, 11, 28, 19], [-28, -8, -22, 0]],
  crates: [
    [-4, -3, 2, 2, 1.2], [4, 2, 2, 2, 1.2],                                   // lobby
    [-15, -19.5, 2, 2, 1.2], [16, -3, 2, 2, 1.2], [13, -17, 2, 2, 1.2],      // library, study, north-east room
    [-15, 3, 2, 2, 1.2], [15, 3, 2, 2, 1.2],                                  // south wing rooms
    [-13, 15, 2.5, 2.5, 1.2], [12, 16, 2.5, 2.5, 1.6], [0, 13, 2, 2, 1.2],  // front yard
    [-25, 12, 2, 2, 1.2], [-25, -14, 2, 2, 1.2], [-26, -24, 3, 2, 1.2],     // west yard
    [25, 3, 2, 2, 1.2], [25, -8, 3, 3, 1.6], [24, -18, 2, 2, 1.2],          // east yard
    [-6, -26, 3, 2, 1.2], [6, -26, 3, 2, 1.2], [22, -26, 2, 2, 1.2],        // rear garden
  ],
  spawns: {
    T: { pts: [[-6, 28], [-3, 28], [0, 28], [3, 28], [6, 28], [-6, 25.5], [-3, 25.5], [0, 25.5], [3, 25.5], [6, 25.5]], yaw: 0 },
    CT: { pts: [[-6, -20], [-3, -20], [0, -20], [3, -20], [6, -20], [-6, -15], [-3, -15], [0, -15], [3, -15], [6, -15]], yaw: Math.PI },
  },
  routes: {
    A: [[[0, 25], [-8, 25.5], [-20, 16], [-20, -8], [-20, -15], [-13, -16]],     // west yard -> library door
        [[0, 25], [-2, 10], [-6, -5.5], [-13, -14]]],                            // front door -> lobby -> west wing -> library
    B: [[[0, 25], [8, 25.5], [20, 14], [20, 0], [20, -5], [13, -5.5]],           // east yard -> study door
        [[0, 25], [-2, 10], [2, 2], [5, -4], [13, -5.5]]],                       // front door -> lobby -> study
  },
  holds: {
    A: [[0, -16], [-5, -15], [-13, -16]],
    B: [[0, -16], [5, -12], [5, -4], [13, -5.5]],
    M: [[0, -16], [5, -10], [0, 2]],
  },
  thr: { W: [-20, 10], E: [20, 10], M: [0, 18] },
};

const BANK = {
  id: 'bank', name: 'Bank',
  sites: { A: [0, -4, 3.4], B: [14.5, -13.5, 4] },
  walls: [
    // shell: 40 x 30
    ['H', -18, -20, 20, '', [-14, -4, 15], [4]],              // north: records room, back hall, executive office; rear door into the back hall
    ['H', 12, -20, 20, '', [-17, -6, 2, 16], [-12, 9]],       // south: two front doors into the public lobby
    ['V', -20, -18, 12, 'i', [-14, 5, 9], [-4]],              // west: staff room door
    ['V', 20, -18, 12, 'i', [-2, 5, 9], [-14, -5]],           // east: executive office door and manager office door
    // lobby / back-row divider
    ['H', 1, -20, -6, 'i', [], [-14, -7.5]],
    ['H', 1, 6, 20, 'i', [], [7.5, 14]],
    // vault core (reinforced): one door to the lobby, one to the back hall
    ['H', 1, -6, 6, 'r', [], [2]],
    ['H', -9, -6, 6, 'r', [], [-2.5]],
    ['V', -6, -9, 1, 'ir', [], []],
    ['V', 6, -9, 1, 'ir', [], []],
    // back-row side walls: corridors run beside the vault
    ['V', -9, -18, 1, 'i', [], [-14, -4]],
    ['V', 9, -18, 1, 'i', [], [-13, -5]],
    ['H', -9, -20, -9, 'i', [], [-15]],
    ['H', -9, 9, 20, 'i', [], [15]],
    // outbuildings: cafe (west plaza), kiosk (centre), generator shed (east yard), loading dock (rear)
    ['H', 16, -28, -22, '', [-25], []], ['H', 24, -28, -22, '', [], [-24.5]], ['V', -28, 16, 24, 'i', [], []], ['V', -22, 16, 24, 'i', [], [20]],
    ['H', 18, -3, 3, '', [], [1.5]], ['H', 22, -3, 3, '', [], [-1.5]], ['V', -3, 18, 22, 'i', [], []], ['V', 3, 18, 22, 'i', [], []],
    ['H', -10, 24.5, 28.5, '', [], [26.5]], ['H', -2, 24.5, 28.5, '', [], []], ['V', 24.5, -10, -2, 'i', [], [-6]], ['V', 28.5, -10, -2, 'i', [], []],
    ['H', -27, -28, -22, '', [-25], []], ['H', -20, -28, -22, '', [], [-24]], ['V', -28, -27, -20, 'i', [], []], ['V', -22, -27, -20, 'i', [], [-23.5]],
  ],
  // Attack compound in the south-east corner: exits west and north
  solid: [[13.75, 19.75, 14.25, 25], [13.75, 28, 14.25, 30], [13.75, 19.75, 22, 20.25], [26, 19.75, 29, 20.25]],
  bld: [[-20, -18, 20, 12], [-28, 16, -22, 24], [-3, 18, 3, 22], [24.5, -10, 28.5, -2], [-28, -27, -22, -20]],
  crates: [
    [-13, 4, 8, 1.2, 1.1], [13, 4, 8, 1.2, 1.1],                              // teller counters
    [3, -6, 2, 2, 1.2], [-4, -2, 2, 2, 1.2],                                  // vault
    [-14, -14, 2, 2, 1.2], [-15, -3, 2, 2, 1.2], [15, -3, 2, 2, 1.2], [17.5, -11.5, 2, 2, 1.2],   // offices
    [-12, 18, 2.5, 2.5, 1.2], [8, 17, 2, 2, 1.2], [-8, 22, 2, 2, 1.2], [-18, 24, 2, 2, 1.2],    // plaza
    [26, 13, 2.5, 2.5, 1.2], [26, 4, 2, 2, 1.2], [-24, -4, 2, 2, 1.2],                          // side yards
    [-8, -24, 3, 2, 1.2], [8, -24, 3, 2, 1.2], [20, -24, 2, 2, 1.2],                            // back alley
  ],
  spawns: {
    T: { pts: [[16.5, 28], [19, 28], [21.5, 28], [24, 28], [26.5, 28], [16.5, 25.5], [19, 25.5], [21.5, 25.5], [24, 25.5], [26.5, 25.5]], yaw: 0.785 },
    CT: { pts: [[-6, -16.5], [-3, -16.5], [0, -16.5], [3, -16.5], [6, -16.5], [-6, -12.5], [-3, -12.5], [0, -12.5], [3, -12.5], [6, -12.5]], yaw: Math.PI },
  },
  routes: {
    A: [[[21, 25], [24, 18], [11, 15], [9, 8], [2, 4], [0, -4]],                               // east front door -> lobby -> vault door
        [[21, 25], [16, 22], [0, 15], [-12, 15], [-12, 9], [-5, 4], [0, -4]]],                // west front door -> lobby -> vault door
    B: [[[21, 25], [24, 18], [11, 15], [9, 8], [18, 3], [14.5, -5], [14.5, -13]],              // lobby -> manager office -> executive office
        [[21, 25], [23, 18], [22.3, 2], [22.3, -14], [14.5, -13.5]]],                          // east yard -> executive office door
  },
  holds: {
    A: [[0, -14], [-2, -11], [0, -4]],
    B: [[0, -14], [9, -13], [14.5, -13.5]],
    M: [[0, -14], [-7.5, -8], [-7.5, -2]],
  },
  thr: { W: [-12, 14], E: [12, 14], M: [0, 16] },
};
export const MAPS = [VILLA, BANK];

function freeAt(x, z, pad) {
  for (const b of BOXES) if (!b.off && b.y0 < H_STAND && x + pad > b.x0 && x - pad < b.x1 && z + pad > b.z0 && z - pad < b.z1) return false;
  return true;
}
// Navigation graph for bots going somewhere off their scripted routes (e.g. to a planted bomb): a coarse grid of
// free spots plus three nodes at every doorway (in front, in it, behind it). Edges exist wherever the straight line is walkable.
function buildNav() {
  NAV = [];
  const GS = 4 * SCALE;
  for (let x = -28 * SCALE; x <= 28 * SCALE; x += GS) for (let z = -28 * SCALE; z <= 29 * SCALE; z += GS) if (freeAt(x, z, 1.6)) NAV.push([x, z]);
  for (const d of DOORS) {
    const b = BOXES[d.bi], alongX = b.w >= b.d, off = (alongX ? b.d : b.w) / 2 + 1.7;
    for (const s of [-1, 0, 1]) {
      const x = d.x + (alongX ? 0 : s * off), z = d.z + (alongX ? s * off : 0);
      if (freeAt(x, z, PR)) NAV.push([x, z]);
    }
  }
  ADJ = NAV.map(() => []);
  for (let i = 0; i < NAV.length; i++) for (let j = i + 1; j < NAV.length; j++) {
    const d = Math.hypot(NAV[i][0] - NAV[j][0], NAV[i][1] - NAV[j][1]);
    if (d <= 16 * SCALE && segClear(NAV[i][0], NAV[i][1], NAV[j][0], NAV[j][1])) { ADJ[i].push([j, d]); ADJ[j].push([i, d]); }
  }
}
// Key points (layout units) -> a full waypoint chain: the first point, then the nav path between each pair.
function expand(keys) {
  const k = keys.map(([x, z]) => [x * SCALE, z * SCALE]), out = [k[0]];
  for (let i = 1; i < k.length; i++) out.push(...navPath(k[i - 1][0], k[i - 1][1], k[i][0], k[i][1]));
  return out;
}

// Switch the shared world arrays to map `id`. Returns false when that map is already loaded.
export function loadMap(id) {
  const def = MAPS.find(m => m.id === id) || MAPS[0];
  if (MAPINFO.id === def.id) return false;
  BOXES.length = 0; DOORS.length = 0; BUILDINGS.length = 0; ROOFS.length = 0;
  SHIELDS.clear(); SMOKES.length = 0;
  for (const k in SITES) delete SITES[k];
  for (const k in def.sites) { const [x, z, r] = def.sites[k]; SITES[k] = { x: x * SCALE, z: z * SCALE, r: r * SCALE }; }

  // Map boundary (inner faces at x = +-29, z = -29 and z = 30)
  BOXES.push(B(0, 0, -29.5, 61, 6, 1), B(0, 0, 30.5, 61, 6, 1), B(-29.5, 0, 0.5, 1, 6, 62), B(29.5, 0, 0.5, 1, 6, 62));
  for (const [dir, pos, a, b, flags, ws, ds] of def.walls) wallRun(dir, pos, a, b, flags, ws, ds);
  for (const [x0, z0, x1, z1] of def.solid) BOXES.push(S(x0, z0, x1, z1, 0, HB));
  for (const [x0, z0, x1, z1] of def.bld) {
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0, alongX = w >= d, short = Math.min(w, d);
    BUILDINGS.push({ x0: x0 * SCALE, z0: z0 * SCALE, x1: x1 * SCALE, z1: z1 * SCALE });
    ROOFS.push({
      x: mx * SCALE, z: mz * SCALE, y: HB, alongX, len: (alongX ? w : d) * SCALE + ROOF_OH * 2 * SCALE,
      hw: (short / 2 + ROOF_OH) * SCALE, rise: Math.min(4, Math.max(1.6, short * 0.15)),
    });
  }
  for (const [cx, cz, w, d, h] of def.crates) BOXES.push(B(cx, 0, cz, w, h, d, 1));
  BASE = BOXES.length;

  for (const side of ['T', 'CT']) {
    SPAWNS[side].length = 0;
    for (const [x, z] of def.spawns[side].pts) SPAWNS[side].push([x * SCALE, z * SCALE, def.spawns[side].yaw]);
  }
  buildNav();
  for (const k in ROUTES) { ROUTES[k].length = 0; for (const r of def.routes[k]) ROUTES[k].push(expand(r)); }
  for (const k in HOLDS) { HOLDS[k].length = 0; HOLDS[k].push(...expand(def.holds[k])); }
  MAPINFO.id = def.id; MAPINFO.name = def.name; MAPINFO.split = 8 * SCALE;
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

// Load the default map (last, so the helpers above are all defined).
loadMap(MAPS[0].id);
