// WEBSTRIKE ranked system. Rank lives in this browser's localStorage (no accounts).
// Self-contained: builds its own menu panel, HUD badge and toast. The game only calls
// Rank.round(won, mult) when a round ends and Rank.kd(kills, deaths, mult) when K/D changes.

const KEY = 'ws_rank_v1', PLACE = 10;                         // rounds needed before the rank is shown
const PTS = { win: 12, loss: -8, kill: 3, death: -1 };        // RP per event (scaled by `mult`)

export const TIERS = [
  { name: 'Bronze',   at: 0,    col: '#c9814a' },
  { name: 'Silver',   at: 300,  col: '#c7ced6' },
  { name: 'Gold',     at: 700,  col: '#f2c230' },
  { name: 'Platinum', at: 1200, col: '#4fd1c5' },
  { name: 'Diamond',  at: 1800, col: '#6ab7ff' },
  { name: 'Master',   at: 2500, col: '#c26bff' },
  { name: 'Legend',   at: 3300, col: '#ff5a4f' },
];
const DIV = ['III', 'II', 'I'];

// ---------------- storage ----------------
const blank = () => ({ rp: 0, peak: 0, rounds: 0, rw: 0, rl: 0, k: 0, d: 0 });
function clean(o) {
  const b = blank();
  if (!o || typeof o !== 'object') return b;
  for (const k in b) { const v = +o[k]; b[k] = Number.isFinite(v) && v >= 0 ? Math.min(99999, Math.floor(v)) : 0; }
  b.peak = Math.max(b.peak, b.rp);
  return b;
}
let R = (() => { try { return clean(JSON.parse(localStorage.getItem(KEY))); } catch { return blank(); } })();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(R)); } catch { /* private mode / storage full */ } };
const clampRP = v => Math.max(0, Math.min(99999, v));

// ---------------- rank maths ----------------
export function info(rp, rounds) {
  let i = TIERS.length - 1;
  while (i > 0 && rp < TIERS[i].at) i--;
  const t = TIERS[i], next = TIERS[i + 1];
  let label = t.name, prog = 1, toNext = 0;
  if (next) {
    const w = (next.at - t.at) / 3, d = Math.min(2, Math.floor((rp - t.at) / w));
    const lo = t.at + d * w, hi = lo + w;
    label += ' ' + DIV[d]; prog = (rp - lo) / (hi - lo); toNext = Math.ceil(hi - rp);
  }
  return { tier: t, label, prog, toNext, placed: rounds >= PLACE };
}

// ---------------- UI ----------------
const $ = id => document.getElementById(id);

const hudBadge = document.createElement('div');
hudBadge.style.cssText = 'position:fixed;left:50%;bottom:8px;transform:translateX(-50%);padding:3px 10px;border-radius:4px;' +
  'background:rgba(0,0,0,.45);font:bold 13px sans-serif;color:#fff;pointer-events:none;z-index:5';
($('hud') || document.body).appendChild(hudBadge);

const box = document.createElement('div');
box.style.cssText = 'width:100%;box-sizing:border-box;margin:0 0 10px;padding:10px;border-radius:6px;' +
  'background:rgba(255,255,255,.08);font:13px sans-serif;color:#fff;text-align:left';
const anchor = $('name');
if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(box, anchor);
else ($('menu') || document.body).prepend(box);

const toastEl = document.createElement('div');
toastEl.style.cssText = 'position:fixed;left:50%;top:18%;transform:translateX(-50%);padding:8px 18px;border-radius:6px;' +
  'background:rgba(0,0,0,.6);font:bold 22px sans-serif;color:#fff;opacity:0;transition:opacity .4s;pointer-events:none;z-index:20';
document.body.appendChild(toastEl);
let toastTimer = 0;
function toast(msg, col) {
  toastEl.textContent = msg; toastEl.style.color = col; toastEl.style.opacity = 1;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.style.opacity = 0; }, 3500);
}

const BTN = 'background:none;border:1px solid rgba(255,255,255,.3);color:#fff;border-radius:4px;padding:2px 8px;cursor:pointer;font-size:12px;margin-right:6px';
function render() {
  const i = info(R.rp, R.rounds), col = i.placed ? i.tier.col : '#9aa4ad', name = i.placed ? i.label : 'Unranked';
  hudBadge.innerHTML = `<span style="color:${col}">${name}</span> · ${R.rp} RP`;
  const sub = i.placed
    ? (i.tier.name === 'Legend' ? 'Top rank reached' : `${i.toNext} RP to next division`)
    : `Placement: ${R.rounds}/${PLACE} rounds played`;
  box.innerHTML =
    `<div style="display:flex;justify-content:space-between;align-items:baseline"><b style="font-size:18px;color:${col}">${name}</b><span>${R.rp} RP</span></div>` +
    `<div style="height:6px;margin:6px 0;background:rgba(255,255,255,.15);border-radius:3px;overflow:hidden"><div style="height:100%;width:${Math.round((i.placed ? i.prog : R.rounds / PLACE) * 100)}%;background:${col}"></div></div>` +
    `<div style="opacity:.75">${sub}</div>` +
    `<div style="opacity:.75;margin:2px 0 8px">Rounds ${R.rw}W-${R.rl}L · K/D ${R.k}/${R.d} · Peak ${info(R.peak, R.rounds).label}</div>` +
    `<button style="${BTN}" data-a="code">Copy rank code</button><button style="${BTN}" data-a="load">Load code</button><button style="${BTN}" data-a="reset">Reset</button>`;
}
box.onclick = e => {
  const a = e.target.dataset && e.target.dataset.a;
  if (a === 'code') prompt('Your rank code (keep it somewhere safe, paste it into "Load code" on another browser):', btoa(JSON.stringify(R)));
  else if (a === 'load') {
    const s = prompt('Paste a rank code:'); if (!s) return;
    try {
      const o = clean(JSON.parse(atob(s.trim()))), li = info(o.rp, o.rounds);
      if (confirm(`Load ${li.placed ? li.label : 'Unranked'} (${o.rp} RP)? This replaces your current rank.`)) { R = o; save(); render(); }
    } catch { alert('That code is not valid.'); }
  } else if (a === 'reset') {
    if (confirm('Reset your rank to 0 RP? This cannot be undone.')) { R = blank(); save(); render(); }
  }
};

// ---------------- scoring ----------------
function finish(a, before, isRound) {
  R.peak = Math.max(R.peak, R.rp); save(); render();
  const b = info(R.rp, R.rounds);
  let msg = null;
  if (!a.placed && b.placed) msg = 'PLACED: ' + b.label;
  else if (b.placed && b.label !== a.label) msg = (R.rp > before ? 'RANK UP: ' : 'RANK DOWN: ') + b.label;
  if (msg) toast(msg, b.tier.col);
  else if (isRound) { const d = R.rp - before; toast((d >= 0 ? '+' : '') + d + ' RP', d >= 0 ? '#7ee07e' : '#ff7a7a'); }
}

export const Rank = {
  // A round ended and my team won (true) or lost (false). mult scales the RP (e.g. .5 vs bots).
  round(won, mult = 1) {
    const a = info(R.rp, R.rounds), before = R.rp;
    R.rounds++; if (won) R.rw++; else R.rl++;
    R.rp = clampRP(R.rp + Math.round((won ? PTS.win : PTS.loss) * mult));
    finish(a, before, true);
  },
  // New kills / deaths since last time (both >= 0).
  kd(k, d, mult = 1) {
    k = Math.max(0, k | 0); d = Math.max(0, d | 0);
    if (!k && !d) return;
    const a = info(R.rp, R.rounds), before = R.rp;
    R.k += k; R.d += d;
    R.rp = clampRP(R.rp + Math.round(k * PTS.kill * mult) + Math.round(d * PTS.death * mult));
    finish(a, before, false);
  },
  get info() { return info(R.rp, R.rounds); },
  get rp() { return R.rp; },
};

render();
