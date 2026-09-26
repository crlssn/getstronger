// Synthesises the 100 BPM soundtrack to out/music.wav: kick, sub, hats, pad, boom, whooshes, chime.
import fs from 'node:fs';
import path from 'node:path';
import { BEAT, DURATION, sfx } from './timeline.js';

const SR = 48000;
const N = Math.round(DURATION * SR);
const L = new Float32Array(N);
const R = new Float32Array(N);
const verbL = new Float32Array(N); // reverb send
const verbR = new Float32Array(N);
const TAU = Math.PI * 2;
const BAR = BEAT * 4;
const DROP = sfx.boom; // groove starts on the reveal
const STOP = sfx.chime; // and ends on the logo

let seed = 1;
const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

function add(t0, len, fn, pan = 0, send = 0) {
  const i0 = Math.max(0, Math.round(t0 * SR));
  const i1 = Math.min(N, Math.round((t0 + len) * SR));
  const gl = Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = i0; i < i1; i++) {
    const v = fn((i - i0) / SR, i / SR);
    L[i] += v * gl;
    R[i] += v * gr;
    verbL[i] += v * gl * send;
    verbR[i] += v * gr * send;
  }
}

// RBJ biquad band-pass whose centre frequency is a function of time.
function bandpass(q) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x, f) => {
    const w = (TAU * f) / SR;
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    const y = ((alpha * x) - (alpha * x2) - (-2 * Math.cos(w)) * y1 - (1 - alpha) * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}
function lowpass(f) {
  const a = 1 - Math.exp((-TAU * f) / SR);
  let y = 0;
  return (x) => (y += a * (x - y));
}

// ---- kick, sub, hats ----
for (let t = DROP; t < STOP - 1e-6; t += BEAT) {
  add(t, 0.5, (u) => {
    const ph = TAU * (45 * u + (95 / 28) * (1 - Math.exp(-u * 28)));
    return 0.9 * Math.sin(ph) * Math.exp(-u * 7) + 0.15 * noise() * Math.exp(-u * 300);
  });
}
const chords = [ // Am, F, C, G (roots and voicings)
  { root: 45, notes: [57, 60, 64, 69] },
  { root: 41, notes: [57, 60, 65, 69] },
  { root: 48, notes: [55, 60, 64, 67] },
  { root: 43, notes: [55, 59, 62, 67] },
];
const chordAt = (t) => chords[Math.floor(Math.max(0, t - DROP) / BAR) % chords.length];
for (let t = DROP; t < STOP - 1e-6; t += BEAT / 2) {
  const off = Math.round((t - DROP) / (BEAT / 2)) % 2 === 1;
  const f = midi(chordAt(t).root - 12);
  if (off) add(t, 0.28, (u) => 0.32 * Math.sin(TAU * f * u) * Math.min(1, u * 200) * Math.exp(-u * 9));
  const hp = lowpass(7000);
  add(t + (off ? 0 : BEAT / 4), 0.08, (u) => { const n = noise(); return (off ? 0.16 : 0.07) * (n - hp(n)) * Math.exp(-u * 60); }, off ? 0.25 : -0.25, 0.2);
}

// ---- pad: detuned saws, filtered, crossfading per bar ----
{
  const lpL = lowpass(1400);
  const lpR = lowpass(1400);
  const phases = new Float64Array(64);
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const barIdx = Math.floor(Math.max(0, t - DROP) / BAR);
    const intro = t < DROP;
    const ch = intro ? chords[0] : chords[barIdx % 4];
    const end = t >= STOP;
    const notes = end ? [57, 64, 69, 71, 76] : ch.notes;
    let sl = 0, sr = 0;
    notes.forEach((n, k) => {
      [-7, 0, 7].forEach((cents, d) => {
        const idx = k * 3 + d;
        phases[idx] = (phases[idx] + (midi(n) * Math.pow(2, cents / 1200)) / SR) % 1;
        const v = phases[idx] * 2 - 1;
        if (d === 1) { sl += v * 0.5; sr += v * 0.5; } else if (d === 0) { sl += v; } else { sr += v; }
      });
    });
    const swell = intro ? Math.pow(t / DROP, 2) : 1; // phases carry across chord changes, so no click
    const level = end ? 1 - Math.min(1, (t - STOP) / (DURATION - STOP - 0.4)) : 1;
    const g = 0.022 * swell * level;
    L[i] += lpL(sl) * g;
    R[i] += lpR(sr) * g;
  }
}

// ---- riser into the reveal, then the boom ----
{
  const bp = bandpass(3);
  add(0.6, DROP - 0.6, (u) => { const p = u / (DROP - 0.6); return 0.25 * p * p * bp(noise(), 400 + 5000 * p * p); }, 0, 0.4);
  add(DROP, 3.2, (u) => {
    const ph = TAU * (28 * u + (30 / 2.2) * (1 - Math.exp(-u * 2.2)));
    return 1.1 * Math.sin(ph) * Math.exp(-u * 1.3) * Math.min(1, u * 400);
  });
  const lp = lowpass(900);
  add(DROP, 1.5, (u) => 0.6 * lp(noise()) * Math.exp(-u * 4), 0, 0.6);
}

// ---- whooshes: a band-passed noise sweep peaking on each screen swap ----
for (const c of sfx.whooshes) {
  const bp = bandpass(1.6);
  const len = 1.2;
  add(c - len / 2, len, (u) => {
    const p = u / len;
    const env = Math.pow(Math.sin(Math.PI * p), 2);
    return 0.55 * env * bp(noise(), 250 + 3200 * Math.sin(Math.PI * p));
  }, 0, 0.3);
}

// ---- chime on the logo: inharmonic bell partials, arpeggiated on the beat ----
[[0, 81], [BEAT, 88], [BEAT * 2, 93]].forEach(([dt, n], k) => {
  const f = midi(n);
  add(STOP + dt, 4.2 - dt, (u) => {
    let v = 0;
    [[1, 1, 1.6], [2.76, 0.35, 3.5], [5.4, 0.18, 6], [8.93, 0.08, 9]].forEach(([r, a, d]) => {
      v += a * Math.sin(TAU * f * r * u) * Math.exp(-u * d);
    });
    return (k === 0 ? 0.32 : 0.2) * v * Math.min(1, u * 800);
  }, [0, -0.35, 0.35][k], 0.7);
});

// ---- reverb: Schroeder combs + allpasses on the send ----
function reverb(src, spread) {
  const out = new Float32Array(N);
  for (const [d, g] of [[1557, 0.84], [1617, 0.83], [1491, 0.85], [1422, 0.86]]) {
    const len = Math.round(((d + spread) * SR) / 44100);
    const buf = new Float32Array(len);
    let j = 0, lp = 0;
    for (let i = 0; i < N; i++) {
      const y = buf[j];
      lp = y * 0.7 + lp * 0.3;
      buf[j] = src[i] + lp * g;
      out[i] += y * 0.25;
      j = (j + 1) % len;
    }
  }
  for (const d of [556, 441]) {
    const len = Math.round(((d + spread) * SR) / 44100);
    const buf = new Float32Array(len);
    let j = 0;
    for (let i = 0; i < N; i++) {
      const b = buf[j];
      const x = out[i];
      buf[j] = x + b * 0.5;
      out[i] = b - x * 0.5;
      j = (j + 1) % len;
    }
  }
  return out;
}
const wl = reverb(verbL, 0);
const wr = reverb(verbR, 23);

// ---- master: sum, soft clip, normalise, loop-friendly edges ----
let peak = 0;
for (let i = 0; i < N; i++) {
  L[i] = Math.tanh((L[i] + wl[i] * 0.5) * 1.1);
  R[i] = Math.tanh((R[i] + wr[i] * 0.5) * 1.1);
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const gain = Math.pow(10, -1 / 20) / peak;
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const edge = Math.min(1, t / 0.05, (DURATION - t) / 0.6);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * gain * edge)) * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * gain * edge)) * 32767), 46 + i * 4);
}
const out = path.join(import.meta.dirname, 'out', 'music.wav');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, buf);
console.log(`wrote ${out} (${DURATION}s, peak gain ${gain.toFixed(2)})`);
