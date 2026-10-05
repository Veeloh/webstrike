// Tiny synthesized sound effects (no audio files needed).
let ac = null, nb = null, vol = 0.5;
export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    nb = ac.createBuffer(1, ac.sampleRate * 0.6, ac.sampleRate);
    const d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { ac = null; }
}
export function setVolume(v) { vol = v; }

function noise(dur, f0, f1, v, type = 'lowpass') {
  if (!ac) return;
  const t = ac.currentTime, s = ac.createBufferSource(); s.buffer = nb;
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(v * vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(ac.destination); s.start(t); s.stop(t + dur);
}
function tone(f0, f1, dur, v, type = 'sine') {
  if (!ac) return;
  const t = ac.currentTime, o = ac.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(v * vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur);
}

export const sfx = {
  shot(id, v = 1) {
    if (v <= 0.02) return;
    if (id === 'awp') { noise(0.5, 3000, 120, 1.0 * v); tone(120, 40, 0.4, 0.7 * v, 'sawtooth'); }
    else if (id === 'shotgun') { noise(0.35, 2500, 150, 1.0 * v); tone(100, 40, 0.25, 0.6 * v, 'square'); }
    else if (id === 'pistol' || id === 'deagle') { noise(0.18, 3500, 300, 0.7 * v); tone(220, 60, 0.12, 0.4 * v, 'square'); }
    else if (id === 'knife') { noise(0.12, 1500, 4000, 0.3 * v, 'bandpass'); }
    else { noise(0.14, 4000, 400, 0.6 * v); tone(160, 50, 0.09, 0.35 * v, 'square'); }
  },
  reload() { noise(0.05, 3000, 1500, 0.25, 'bandpass'); setTimeout(() => noise(0.06, 2000, 900, 0.3, 'bandpass'), 450); },
  hit() { tone(1400, 900, 0.06, 0.25, 'square'); },
  hurt() { tone(160, 60, 0.18, 0.5, 'sawtooth'); },
  beep() { tone(1500, 1500, 0.07, 0.35, 'square'); },
  boom() { noise(1.2, 900, 40, 1.2); tone(70, 25, 1.0, 1.0, 'sine'); },
  crumble(v = 1) { if (v <= 0.02) return; noise(0.55, 1600, 120, 0.9 * v); tone(90, 35, 0.35, 0.5 * v, 'sine'); },   // wall hole / barricade broken
  thud(v = 1) { if (v <= 0.02) return; noise(0.12, 700, 150, 0.6 * v); tone(130, 60, 0.1, 0.4 * v, 'square'); },       // barricade placed
  go() { tone(500, 800, 0.15, 0.3, 'triangle'); },
  // ---- gadget sounds (v = 0..1 loudness by distance) ----
  smoke(v = 1) { if (v <= 0.02) return; noise(0.9, 5000, 1200, 0.55 * v, 'highpass'); tone(300, 120, 0.12, 0.25 * v, 'square'); },     // canister pop + hiss
  breach(v = 1) { if (v <= 0.02) return; noise(0.7, 2800, 90, 1.2 * v); tone(140, 30, 0.6, 1.0 * v, 'sawtooth'); },                     // sharp crack + low thump
  ghost(on = true) { if (on) tone(900, 220, 0.5, 0.18, 'sine'); else tone(220, 700, 0.3, 0.18, 'sine'); },                              // soft whoosh in / out
  rush(v = 1) { if (v <= 0.02) return; tone(250, 1100, 0.35, 0.35 * v, 'sawtooth'); setTimeout(() => tone(1100, 1300, 0.12, 0.2 * v, 'square'), 300); },
  drone(v = 1) { if (v <= 0.02) return; for (let i = 0; i < 5; i++) setTimeout(() => tone(700 + i * 90, 760 + i * 90, 0.05, 0.22 * v, 'square'), i * 55); },   // chirpy launch
  shield(v = 1) { if (v <= 0.02) return; noise(0.14, 2600, 700, 0.7 * v, 'bandpass'); tone(520, 330, 0.28, 0.4 * v, 'triangle'); },     // metal clang
  reinforce(v = 1) { if (v <= 0.02) return; for (let i = 0; i < 3; i++) setTimeout(() => { noise(0.08, 3000, 900, 0.6 * v, 'bandpass'); tone(200, 110, 0.07, 0.4 * v, 'square'); }, i * 110); },   // hammering
  set(v = 1) { if (v <= 0.02) return; noise(0.05, 2500, 1500, 0.35 * v, 'bandpass'); setTimeout(() => tone(1200, 1200, 0.04, 0.25 * v, 'square'), 90); },      // beacon / mine placed: click-click
  ping(v = 1) { if (v <= 0.02) return; tone(1500, 1500, 0.09, 0.4 * v, 'sine'); setTimeout(() => tone(2000, 2000, 0.16, 0.4 * v, 'sine'), 100); },            // beacon tripped
  mine(v = 1) { if (v <= 0.02) return; noise(0.5, 3500, 150, 1.0 * v); tone(180, 45, 0.3, 0.8 * v, 'sawtooth'); },
  fortify(v = 1) { if (v <= 0.02) return; noise(0.22, 1800, 250, 1.1 * v, 'bandpass'); tone(90, 40, 0.3, 0.9 * v, 'square'); setTimeout(() => { noise(0.22, 1500, 200, 1.0 * v, 'bandpass'); tone(70, 35, 0.35, 0.9 * v, 'square'); }, 260); },   // loud ratchet + clunk
  unfort(v = 1) { if (v <= 0.02) return; noise(0.15, 1500, 400, 0.4 * v, 'bandpass'); },
  foot(v = 1) { if (v <= 0.02) return; noise(0.07, 700 + Math.random() * 300, 200, 0.5 * v); },                                         // footstep
  deny() { tone(180, 120, 0.12, 0.3, 'square'); },
  swap() { tone(440, 440, 0.12, 0.3, 'triangle'); setTimeout(() => tone(660, 660, 0.12, 0.3, 'triangle'), 130); setTimeout(() => tone(880, 880, 0.2, 0.3, 'triangle'), 260); },
  plant() { tone(900, 900, 0.1, 0.3, 'square'); setTimeout(() => tone(700, 700, 0.15, 0.3, 'square'), 120); },
};
