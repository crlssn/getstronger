// Muxes video + WAV, builds the contact sheet, and checks the deliverable.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { BEAT, FPS, DURATION, shots, moves, screens, titles, highlights, endCard, sfx } from './timeline.js';

const OUT = path.join(import.meta.dirname, 'out');
const film = path.join(OUT, 'getstronger-promo.mp4');
const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

run('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(OUT, 'video.mp4'), '-i', path.join(OUT, 'music.wav'),
  '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000',
  '-t', String(DURATION), '-movflags', '+faststart', film]);

// One frame per shot, from its middle.
const mids = shots.map((s) => Math.round(((s.start + s.end) / 2) * FPS));
mids[1] = Math.round(5.4 * FPS); // the hero once its title is in
mids[mids.length - 1] = Math.round(27.6 * FPS); // the end card once everything is in
run('ffmpeg', ['-y', '-loglevel', 'error', '-i', film, '-vf',
  `select='${mids.map((n) => `eq(n\\,${n})`).join('+')}',scale=360:640,tile=${mids.length}x1:padding=8:color=0x222222`,
  '-frames:v', '1', '-fps_mode', 'passthrough', path.join(OUT, 'contact-sheet.png')]);

// --- checks ---
const probe = JSON.parse(run('ffprobe', ['-v', 'error', '-count_frames', '-show_entries',
  'format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,nb_read_frames,duration', '-of', 'json', film]));
const v = probe.streams.find((s) => s.codec_type === 'video');
const a = probe.streams.find((s) => s.codec_type === 'audio');
const report = {
  duration: Number(probe.format.duration).toFixed(3),
  frames: Number(v.nb_read_frames),
  video: `${v.codec_name} ${v.width}x${v.height} @ ${v.r_frame_rate}`,
  audio: a.codec_name,
};
assert.equal(report.duration, '30.000');
assert.equal(report.frames, 900);
assert.equal(v.codec_name, 'h264');
assert.equal(a.codec_name, 'aac');
assert.equal(`${v.width}x${v.height}`, '1080x1920');
assert.equal(v.r_frame_rate, '30/1');

const ymax = (n) => Number(run('ffmpeg', ['-loglevel', 'error', '-i', film, '-vf',
  `select='eq(n\\,${n})',signalstats,metadata=print:key=lavfi.signalstats.YMAX:file=-`, '-frames:v', '1', '-fps_mode', 'passthrough', '-f', 'null', '-'])
  .match(/YMAX=(\d+)/)[1]);
report.firstFrameYMax = ymax(0);
report.lastFrameYMax = ymax(899);
assert.ok(report.firstFrameYMax <= 16 && report.lastFrameYMax <= 16, 'first and last frames must be black');

const onBeat = (t) => Math.abs(t / BEAT - Math.round(t / BEAT)) < 1e-9;
const times = {
  cuts: shots.flatMap((s) => [s.start, s.end]),
  moves: moves.flatMap((m) => [m.start, m.end, m.swap]),
  swaps: screens.map((s) => s.from),
  titles: titles.map((t) => t.start),
  overlays: highlights.map((h) => h.start),
  endCard: [endCard.icon, endCard.wordmark, endCard.tagline, endCard.store],
  sfx: [sfx.boom, sfx.chime, ...sfx.whooshes],
};
for (const [k, list] of Object.entries(times)) for (const t of list) assert.ok(onBeat(t), `${k} ${t} is off the beat`);
report.beats = Object.fromEntries(Object.entries(times).map(([k, l]) => [k, l.map((t) => Math.round(t / BEAT) + 1)]));

const safe = JSON.parse(fs.readFileSync(path.join(OUT, 'safe-area.json'), 'utf8'));
for (const s of safe) if (s.maxPhoneBottom !== null) assert.ok(s.maxPhoneBottom <= 1550, `${s.shot} reaches y ${s.maxPhoneBottom}`);
report.safeArea = Object.fromEntries(safe.map((s) => [s.shot, s.maxPhoneBottom]));

console.log(JSON.stringify(report, null, 2));
console.log('all checks passed');
