// Renders the film in Chromium, one frame per timestamp, and pipes raw frames into ffmpeg.
//   node render.mjs stills 3.6,8.4   -> out/stills/*.png
//   node render.mjs video            -> out/video.mp4 (+ out/safe-area.json)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { W, H, FPS, DURATION, shots, titles } from './timeline.js';

const HERE = import.meta.dirname;
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(HERE, 'out');
const require = createRequire(path.join(ROOT, 'web', 'package.json'));
const { chromium } = require('playwright');
const { PNG } = require('pngjs');

const [mode = 'video', arg = ''] = process.argv.slice(2);

function screenshotSet() {
  const dir = path.join(ROOT, 'web', 'screenshots');
  const ref = process.env.PROMO_REF
    ?? fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, 'active')))
      .sort((a, b) => fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs)[0];
  const pick = (set, page) => {
    const f = fs.readdirSync(path.join(dir, ref, set)).find((n) => new RegExp(`^\\d+-${page}\\.png$`).test(n));
    if (!f) throw new Error(`no ${set}/*-${page}.png in ${ref}`);
    return `/web/screenshots/${ref}/${set}/${f}`;
  };
  return {
    home: pick('active', 'home-1'),
    plan: pick('active', 'workout-1'),
    route: pick('active', 'view-workout-route-2'),
    progress: pick('active', 'progress-1'),
    darkHome: pick('active-dark', 'home-1'),
    darkProgress: pick('active-dark', 'progress-1'),
    darkPlan: pick('active-dark', 'workout-1'),
  };
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
let onBody = null;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      await onBody(url, Buffer.concat(chunks));
      res.writeHead(204).end();
    });
    return;
  }
  const file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.error('[page error]', e));
await page.goto(`${origin}/promo/scene.html`);
await page.waitForFunction(() => window.filmReady);
const info = await page.evaluate((files) => window.film.init(files), {
  font: '/web/node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2',
  logo: '/web/src/assets/logo.svg',
  screens: screenshotSet(),
});
console.log('GPU:', info.renderer, '| title sizes', info.size1, info.size2);

fs.mkdirSync(OUT, { recursive: true });
const frames = Math.round(DURATION * FPS);

if (mode === 'stills') {
  const dir = path.join(OUT, 'stills');
  fs.mkdirSync(dir, { recursive: true });
  onBody = (url, buf) => {
    const png = new PNG({ width: W, height: H });
    for (let y = 0; y < H; y++) buf.copy(png.data, y * W * 4, (H - 1 - y) * W * 4, (H - y) * W * 4);
    fs.writeFileSync(path.join(dir, `${url.searchParams.get('name')}.png`), PNG.sync.write(png));
  };
  const times = arg.split(',').filter(Boolean).map(Number);
  await page.evaluate(async (times) => {
    for (const t of times) {
      window.film.renderAt(t);
      await fetch(`/still?name=t${t.toFixed(2).padStart(5, '0')}`, { method: 'POST', body: window.film.readFrame() });
    }
  }, times);
  console.log(`wrote ${times.length} stills to ${dir}`);
} else {
  // Reels safe area: from the first title on, no phone may reach below y 1550.
  const safe = await page.evaluate(({ frames, FPS, shots, from }) => shots.map((s) => {
    let max = -Infinity;
    for (let i = 0; i < frames; i++) {
      const t = i / FPS;
      if (t >= s.start && t < s.end && t >= from) max = Math.max(max, window.film.phoneBottomAt(t));
    }
    return { shot: s.name, maxPhoneBottom: Number.isFinite(max) ? Math.round(max) : null };
  }), { frames, FPS, shots, from: titles[0].start });
  fs.writeFileSync(path.join(OUT, 'safe-area.json'), JSON.stringify(safe, null, 2));
  console.log('safe area', safe);

  const video = path.join(OUT, 'video.mp4');
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
    '-vf', 'vflip,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-profile:v', 'high',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-movflags', '+faststart', video,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const started = Date.now();
  onBody = (url, buf) => new Promise((resolve) => {
    const i = Number(url.searchParams.get('i'));
    if (i % 30 === 0) console.log(`frame ${i}/${frames}  ${((Date.now() - started) / 1000).toFixed(0)}s`);
    if (ff.stdin.write(buf)) resolve();
    else ff.stdin.once('drain', resolve);
  });
  await page.evaluate(async ({ frames, FPS }) => {
    for (let i = 0; i < frames; i++) {
      window.film.renderAt(i / FPS);
      await fetch(`/frame?i=${i}`, { method: 'POST', body: window.film.readFrame() });
    }
  }, { frames, FPS });
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log(`wrote ${video} in ${((Date.now() - started) / 1000).toFixed(0)}s`);
}

await browser.close();
server.close();
