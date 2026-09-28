// The film's timing, shared by the scene, the synth and the checks.
export const W = 1080;
export const H = 1920;
export const FPS = 30;
export const DURATION = 30;
export const BEAT = 0.6; // 100 BPM

export const shots = [
  { name: 'cold-open', start: 0.0, end: 2.4 },
  { name: 'hero', start: 2.4, end: 6.0 },
  { name: 'plan', start: 6.0, end: 10.8 },
  { name: 'route', start: 10.8, end: 15.6 },
  { name: 'progress', start: 15.6, end: 20.4 },
  { name: 'fan', start: 20.4, end: 25.2 },
  { name: 'end', start: 25.2, end: 30.0 },
];

// Moves fast enough to need motion blur: spin, flip, turn, spin.
export const moves = [
  { kind: 'spin', start: 6.0, end: 7.2, swap: 6.6 },
  { kind: 'flip', start: 10.8, end: 12.0, swap: 11.4 },
  { kind: 'turn', start: 15.6, end: 16.8, swap: 16.2 },
  { kind: 'spin', start: 20.4, end: 21.6, swap: 21.0 },
];

// Main phone's screen from each time on; swaps sit on the moves above.
export const screens = [
  { from: 0, key: 'home' },
  { from: 6.6, key: 'plan' },
  { from: 11.4, key: 'route' },
  { from: 16.2, key: 'progress' },
  { from: 21.0, key: 'darkProgress' },
];

const G = true;
export const titles = [
  { start: 4.2, end: 6.0, lines: [[['Get', 600], ['Stronger', 700]], [['Lift it. Log it. '], ['Beat it.', 600, G]]] },
  { start: 7.2, end: 10.8, lines: [[['Follow the '], ['plan', 600, G], ['.']], [['Always know what’s next.']]] },
  { start: 12.0, end: 15.6, lines: [[['Every run, '], ['mapped', 600, G], ['.']], [['Walks and runs, round by round.']]] },
  { start: 16.8, end: 20.4, lines: [[['Watch it '], ['climb', 600, G], ['.']], [['Volume, streaks, personal bests.']]] },
  { start: 22.2, end: 25.2, lines: [[['Everything you lift,']], [['logged.', 600, G]]] },
];

// Overlays on the UI, in screenshot pixels (780×1688).
export const highlights = [
  { kind: 'ring', screen: 'plan', start: 8.4, end: 10.5, rect: [72, 602, 708, 700], radius: 22 },
  { kind: 'glow', screen: 'progress', start: 18.0, end: 20.1, rect: [428, 148, 748, 216], radius: 34 },
];

export const endCard = { icon: 25.2, wordmark: 25.8, tagline: 26.4, store: 27.0, fadeOut: [28.8, 29.7] };

export const sfx = { boom: 2.4, chime: 25.2, whooshes: moves.map((m) => m.swap) };
