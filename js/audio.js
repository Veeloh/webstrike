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
  go() { tone(500, 800, 0.15, 0.3, 'triangle'); },
  plant() { tone(900, 900, 0.1, 0.3, 'square'); setTimeout(() => tone(700, 700, 0.15, 0.3, 'square'), 120); },
};
