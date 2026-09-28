// The film as a pure function of time: renderAt(t) draws frame t onto the canvas.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as TL from './timeline.js';

const { W, H, FPS } = TL;
const DEG = Math.PI / 180;
const GOLD = '#b58a3a';
const GRAY = '#8a8780';
const FONT = 'PJS';

// ---------- maths ----------
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const lerp = (a, b, u) => a + (b - a) * u;
const logLerp = (a, b, u) => Math.exp(lerp(Math.log(a), Math.log(b), u));
const inOutCubic = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const inOutSine = (u) => -(Math.cos(Math.PI * u) - 1) / 2;
const outCubic = (u) => 1 - Math.pow(1 - u, 3);

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.setClearColor(0x000000, 1);
document.body.appendChild(renderer.domElement);
const gl = renderer.getContext();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(26, W / H, 0.1, 300);

// Light strips the metal and glass reflect: warm rim behind-left, cool rim behind-right, soft top key.
function buildEnvironment() {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x000000);
  const strip = (w, h, rgb, k, pos) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(...rgb).multiplyScalar(k), side: THREE.DoubleSide }),
    );
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    s.add(m);
  };
  strip(3, 18, [1.0, 0.8, 0.6], 6, [-5, 1, -8]);
  strip(3, 18, [0.62, 0.78, 1.0], 6, [5, 1, -8]);
  strip(14, 4, [1, 1, 1], 2.6, [0, 10, 1.5]);
  strip(10, 14, [1, 1, 1], 0.4, [0, 2, 12]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  return pmrem.fromScene(s, 0.015).texture;
}
scene.environment = buildEnvironment();
// A little direct light so the band's edge catches a clean highlight.
const rimL = new THREE.DirectionalLight(0xffe2c4, 1.4);
rimL.position.set(-6, 3, -5);
const rimR = new THREE.DirectionalLight(0xcfe0ff, 1.4);
rimR.position.set(6, 3, -5);
const key = new THREE.DirectionalLight(0xffffff, 0.6);
key.position.set(0, 10, 3);
scene.add(rimL, rimR, key);

// ---------- phone ----------
const SW = 3.9; // screen 390 × 844 pt, in hundreds of points
const SH = 8.44;
const PW = 4.24;
const PH = 8.78;
const PD = 0.46;
const CORNER = 0.62;
const FRONT = PD / 2 + 0.015;

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, 1.5 * Math.PI, false);
  return s;
}

function brushedTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(120,120,120)';
  g.fillRect(0, 0, 1024, 1024);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 5000; i++) {
    const v = 90 + rnd() * 70;
    g.fillStyle = `rgba(${v},${v},${v},0.35)`;
    g.fillRect(0, rnd() * 1024, 1024, 0.6 + rnd() * 1.6);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 4);
  return t;
}
const brushed = brushedTexture();

const titanium = new THREE.MeshPhysicalMaterial({
  color: 0xb8b4ad,
  metalness: 1,
  roughness: 0.3,
  roughnessMap: brushed,
  anisotropy: 0.7,
  anisotropyRotation: Math.PI / 2,
  envMapIntensity: 1.2,
});
const frontGlass = new THREE.MeshPhysicalMaterial({
  color: 0x020203, metalness: 0, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.2,
});
const backGlass = new THREE.MeshPhysicalMaterial({
  color: 0x8c8983, metalness: 0.25, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.35,
});
const plateauMat = new THREE.MeshPhysicalMaterial({
  color: 0x5a5854, metalness: 0.2, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.05,
});
const lensGlass = new THREE.MeshPhysicalMaterial({
  color: 0x030305, metalness: 0.3, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.5,
});
const islandMat = new THREE.MeshBasicMaterial({ color: 0x000000, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });

const bodyGeo = new RoundedBoxGeometry(PW, PH, CORNER * 2, 14, CORNER).scale(1, 1, PD / (CORNER * 2));
const glassGeo = new THREE.ExtrudeGeometry(roundedRect(PW - 0.22, PH - 0.22, CORNER - 0.11), {
  depth: 0.08, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 8, curveSegments: 32,
});
const screenGeo = (() => {
  const g = new THREE.ShapeGeometry(roundedRect(SW, SH, 0.47), 32);
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + SW / 2) / SW, (p.getY(i) + SH / 2) / SH);
  return g;
})();
const islandGeo = new THREE.ShapeGeometry(roundedRect(1.25, 0.37, 0.185), 24);
const plateauGeo = new THREE.ExtrudeGeometry(roundedRect(1.72, 1.72, 0.44), {
  depth: 0.02, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.03, bevelSegments: 5, curveSegments: 24,
});

function buildPhone() {
  const phone = new THREE.Group();
  phone.rotation.order = 'YXZ';
  phone.add(new THREE.Mesh(bodyGeo, titanium));

  const front = new THREE.Mesh(glassGeo, frontGlass);
  front.position.z = 0.085;
  phone.add(front);
  const back = new THREE.Mesh(glassGeo, backGlass);
  back.rotation.y = Math.PI;
  back.position.z = -0.085;
  phone.add(back);

  // Offset so the screen never z-fights the glass it sits on.
  const screenMat = new THREE.MeshBasicMaterial({ toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const screen = new THREE.Mesh(screenGeo, screenMat);
  screen.position.z = FRONT + 0.004;
  phone.add(screen);
  const island = new THREE.Mesh(islandGeo, islandMat);
  island.position.set(0, SH / 2 - 0.11 - 0.185, FRONT + 0.008);
  phone.add(island);

  // Camera plateau: top-left seen from behind, which is +x in the phone's own frame.
  const plateau = new THREE.Group();
  const cx = PW / 2 - 0.2 - 0.86;
  const cy = PH / 2 - 0.2 - 0.86;
  plateau.position.set(cx, cy, -FRONT);
  plateau.rotation.y = Math.PI;
  plateau.add(new THREE.Mesh(plateauGeo, plateauMat));
  const lens = (x, y, r) => {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.12, 48), titanium);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, y, 0.1);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.78, r * 0.78, 0.13, 48), lensGlass);
    glass.rotation.x = Math.PI / 2;
    glass.position.set(x, y, 0.105);
    plateau.add(ring, glass);
  };
  // Mirrored because the group faces backwards.
  lens(0.4, 0.4, 0.31);
  lens(0.4, -0.4, 0.31);
  lens(-0.42, 0, 0.31);
  const flash = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 32), plateauMat);
  flash.rotation.x = Math.PI / 2;
  flash.position.set(-0.45, 0.55, 0.08);
  plateau.add(flash);
  phone.add(plateau);

  const button = (side, y, len) => {
    const b = new THREE.Mesh(new RoundedBoxGeometry(0.1, len, 0.17, 4, 0.04), titanium);
    b.position.set(side * (PW / 2 - 0.01), y, 0);
    phone.add(b);
  };
  button(1, 1.55, 1.0);
  button(-1, 2.45, 0.38);
  button(-1, 1.6, 0.66);
  button(-1, 0.75, 0.66);

  scene.add(phone);
  return { group: phone, screen };
}

const phones = [buildPhone(), buildPhone(), buildPhone()];

// ---------- screens ----------
const SB = 94; // 47 pt status bar at 2x
const SX = 780;
const SY = 1688;
const SCALE = (SY - SB) / SY; // 797 / 844
const GAP = (SX - SX * SCALE) / 2;
const toScreen = ([x0, y0, x1, y1]) => [GAP + x0 * SCALE, SB + y0 * SCALE, GAP + x1 * SCALE, SB + y1 * SCALE];

function rgbAt(d, i) {
  return [d[i], d[i + 1], d[i + 2]];
}
const near = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) <= 6;

// The strip under the status bar continues the screenshot's top row; text cut by
// the fold is replaced with the row's own background so it cannot streak.
function statusRow(img) {
  const c = document.createElement('canvas');
  c.width = SX;
  c.height = 1;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, SX, 1, 0, 0, SX, 1);
  const data = g.getImageData(0, 0, SX, 1);
  const d = data.data;
  const counts = new Map();
  for (let x = 0; x < SX; x++) {
    const k = rgbAt(d, x * 4).join();
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const mode = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number);
  const left = rgbAt(d, 0);
  const right = rgbAt(d, (SX - 1) * 4);
  for (let x = 0; x < SX; x++) {
    const p = rgbAt(d, x * 4);
    if (near(p, mode) || near(p, left) || near(p, right)) continue;
    d.set(mode, x * 4);
  }
  g.putImageData(data, 0, 0);
  return { canvas: c, mode, left, right };
}

function drawStatusBar(g, ink) {
  g.save();
  g.fillStyle = ink;
  g.font = `600 34px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('9:41', 136, 61);
  // Signal
  const bx = 546;
  [8, 12, 16, 21].forEach((h, i) => {
    g.beginPath();
    g.roundRect(bx + i * 10, 70 - h, 6, h, 1.5);
    g.fill();
  });
  // Wi-Fi
  const wx = 612;
  const wy = 72;
  g.lineCap = 'round';
  g.lineWidth = 4.2;
  g.strokeStyle = ink;
  [22, 14].forEach((r) => {
    g.beginPath();
    g.arc(wx, wy, r, -Math.PI * 0.75, -Math.PI * 0.25);
    g.stroke();
  });
  g.beginPath();
  g.arc(wx, wy - 2, 4, 0, Math.PI * 2);
  g.fill();
  // Battery
  g.globalAlpha = 0.4;
  g.lineWidth = 2.4;
  g.beginPath();
  g.roundRect(654, 49, 50, 24, 7);
  g.stroke();
  g.beginPath();
  g.roundRect(706.5, 56, 3.5, 10, [0, 2, 2, 0]);
  g.fill();
  g.globalAlpha = 1;
  g.beginPath();
  g.roundRect(658, 53, 42, 16, 4);
  g.fill();
  g.restore();
}

function buildScreen(img) {
  const base = document.createElement('canvas');
  base.width = SX;
  base.height = SY;
  const g = base.getContext('2d');
  g.imageSmoothingQuality = 'high';
  const row = statusRow(img);
  const w = SX * SCALE;
  // Side gaps: the screenshot's own edge columns, stretched.
  g.drawImage(img, 0, 0, 1, SY, 0, SB, GAP + 1, SY - SB);
  g.drawImage(img, SX - 1, 0, 1, SY, SX - GAP - 1, SB, GAP + 1, SY - SB);
  g.fillStyle = `rgb(${row.left})`;
  g.fillRect(0, 0, GAP + 1, SB);
  g.fillStyle = `rgb(${row.right})`;
  g.fillRect(SX - GAP - 1, 0, GAP + 1, SB);
  g.drawImage(row.canvas, 0, 0, SX, 1, GAP, 0, w, SB);
  g.drawImage(img, GAP, SB, w, SY - SB);
  const lum = 0.2126 * row.mode[0] + 0.7152 * row.mode[1] + 0.0722 * row.mode[2];
  drawStatusBar(g, lum < 128 ? '#ffffff' : '#000000');

  const work = document.createElement('canvas');
  work.width = SX;
  work.height = SY;
  work.getContext('2d').drawImage(base, 0, 0);
  const tex = new THREE.CanvasTexture(work);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return { base, work, tex, fx: false };
}

// ---------- overlays on the UI ----------
function drawHighlight(g, h, t) {
  const [x0, y0, x1, y1] = toScreen(h.rect);
  const r = h.radius * SCALE;
  const inA = outCubic(seg(t, h.start, h.start + 0.4));
  const outA = 1 - seg(t, h.end - 0.4, h.end);
  const a = inA * outA;
  const beat = 0.5 + 0.5 * Math.cos((2 * Math.PI * (t - h.start)) / (TL.BEAT * 2));
  g.save();
  if (h.kind === 'ring') {
    // Tap: a press ripple inside the button, then a pulsing ring around it.
    const tp = seg(t, h.start, h.start + 0.55);
    if (tp > 0 && tp < 1) {
      g.save();
      g.beginPath();
      g.roundRect(x0, y0, x1 - x0, y1 - y0, r);
      g.clip();
      g.globalAlpha = 0.16 * (1 - tp);
      g.fillStyle = GOLD;
      g.beginPath();
      g.arc((x0 + x1) / 2, (y0 + y1) / 2, 40 + 340 * outCubic(tp), 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    const off = 7 + 5 * beat;
    g.globalAlpha = a * (0.65 + 0.35 * beat);
    g.strokeStyle = GOLD;
    g.lineWidth = 5;
    g.shadowColor = GOLD;
    g.shadowBlur = 14;
    g.beginPath();
    g.roundRect(x0 - off, y0 - off, x1 - x0 + off * 2, y1 - y0 + off * 2, r + off);
    g.stroke();
  } else {
    g.globalAlpha = a * (0.7 + 0.3 * beat);
    g.strokeStyle = GOLD;
    g.shadowColor = GOLD;
    g.lineWidth = 3;
    for (const blur of [36, 18]) {
      g.shadowBlur = blur;
      g.beginPath();
      g.roundRect(x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4, r + 2);
      g.stroke();
    }
    g.globalCompositeOperation = 'lighter';
    g.shadowBlur = 0;
    g.globalAlpha = a * 0.1 * (0.6 + 0.4 * beat);
    g.fillStyle = GOLD;
    g.beginPath();
    g.roundRect(x0, y0, x1 - x0, y1 - y0, r);
    g.fill();
  }
  g.restore();
}

function updateScreenFx(key, s, t) {
  const active = TL.highlights.filter((h) => h.screen === key && t >= h.start && t <= h.end);
  if (!active.length && !s.fx) return;
  const g = s.work.getContext('2d');
  g.clearRect(0, 0, SX, SY);
  g.drawImage(s.base, 0, 0);
  for (const h of active) drawHighlight(g, h, t);
  s.fx = active.length > 0;
  s.tex.needsUpdate = true;
}

// ---------- titles and end card ----------
const overlay = document.createElement('canvas');
overlay.width = W;
overlay.height = H;
const og = overlay.getContext('2d');
const overlayTex = new THREE.CanvasTexture(overlay);
overlayTex.colorSpace = THREE.SRGBColorSpace;
overlayTex.minFilter = THREE.LinearFilter;
overlayTex.generateMipmaps = false;
const ovScene = new THREE.Scene();
const ovCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
ovScene.add(new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.MeshBasicMaterial({ map: overlayTex, transparent: true, toneMapped: false, depthTest: false }),
));

function measure(parts, size) {
  return parts.reduce((w, [text, weight = 600]) => {
    og.font = `${weight} ${size}px ${FONT}`;
    return w + og.measureText(text).width;
  }, 0);
}

let SIZE1 = 90;
let SIZE2 = 60;
function fitTitleSizes() {
  const max = W - 120;
  for (const tt of TL.titles) {
    SIZE1 = Math.min(SIZE1, (90 * max) / measure(tt.lines[0], 90));
    SIZE2 = Math.min(SIZE2, (60 * max) / measure(tt.lines[1], 60));
  }
  SIZE1 = Math.floor(SIZE1);
  SIZE2 = Math.floor(SIZE2);
}

function drawLine(parts, size, y, color) {
  let x = (W - measure(parts, size)) / 2;
  og.textBaseline = 'alphabetic';
  og.textAlign = 'left';
  for (const [text, weight = 600, gold] of parts) {
    og.font = `${weight} ${size}px ${FONT}`;
    og.fillStyle = gold ? GOLD : color;
    og.fillText(text, x, y);
    x += og.measureText(text).width;
  }
}

// Fade + 40 px slide up + blur-in over 0.5 s; a short fade out.
function entrance(t, start, end = Infinity) {
  const e = outCubic(seg(t, start, start + 0.5));
  const x = end === Infinity ? 1 : seg(t, end, end - 0.3);
  return { alpha: e * x, dy: 40 * (1 - e), blur: 14 * (1 - e) + 6 * (1 - x) };
}

function withEntrance(t, start, end, draw) {
  const { alpha, dy, blur } = entrance(t, start, end);
  if (alpha <= 0.001) return;
  og.save();
  og.globalAlpha = alpha;
  og.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : 'none';
  og.translate(0, dy);
  draw();
  og.restore();
}

let logoImg;
function drawEndCard(t) {
  const c = TL.endCard;
  withEntrance(t, c.icon, Infinity, () => {
    const s = 0.92 + 0.08 * outCubic(seg(t, c.icon, c.icon + 0.8));
    og.translate(W / 2, 770);
    og.scale(s, s);
    og.fillStyle = '#f2f1ed';
    og.beginPath();
    og.roundRect(-150, -150, 300, 300, 68);
    og.fill();
    og.drawImage(logoImg, -118, -118, 236, 236);
  });
  withEntrance(t, c.wordmark, Infinity, () => drawLine([['Get', 600], ['Stronger', 700]], 118, 1088, '#ffffff'));
  withEntrance(t, c.tagline, Infinity, () => drawLine([['Lift it. Log it. '], ['Beat it.', 600, true]], 60, 1186, GRAY));
  withEntrance(t, c.store, Infinity, () => drawLine([['Free on App Store and Google Play', 500]], 40, 1300, GRAY));
}

function drawOverlay(t) {
  og.clearRect(0, 0, W, H);
  const black = Math.max(1 - seg(t, 0, 0.6), inOutSine(seg(t, 24.9, 25.2)));
  if (black > 0) {
    og.fillStyle = `rgba(0,0,0,${black})`;
    og.fillRect(0, 0, W, H);
  }
  for (const tt of TL.titles) {
    withEntrance(t, tt.start, tt.end, () => {
      drawLine(tt.lines[0], SIZE1, 322, '#ffffff');
      drawLine(tt.lines[1], SIZE2, 322 + SIZE2 * 1.45, GRAY);
    });
  }
  drawEndCard(t);
  const fade = inOutSine(seg(t, ...TL.endCard.fadeOut));
  if (fade > 0) {
    og.fillStyle = `rgba(0,0,0,${fade})`;
    og.fillRect(0, 0, W, H);
  }
  overlayTex.needsUpdate = true;
  return black;
}

// ---------- choreography ----------
const D_HERO = 35.5;
const D_PUSH = 34.2;
const D_FAN = 52;
const AZ = 15 * DEG;
const EL = 6 * DEG;
const MACRO_DIR = new THREE.Vector3(0.45, -0.45, 1).normalize();
const MACRO_DIST = 5.0;

function yawAt(t) {
  if (t < 2.4) return lerp(-104, -97, t / 2.4) * DEG;
  if (t < 6.0) return lerp(-97, 0, inOutCubic(seg(t, 2.4, 4.2))) * DEG;
  if (t < 10.8) return 360 * inOutCubic(seg(t, 6.0, 7.2)) * DEG;
  if (t < 15.6) return 0;
  if (t < 20.4) {
    // Turn edge-on to the camera and back; the screen swaps at the apex.
    const edge = AZ - 90 * DEG;
    return t < 16.2 ? edge * inOutCubic(seg(t, 15.6, 16.2)) : edge * (1 - inOutCubic(seg(t, 16.2, 16.8)));
  }
  return -360 * inOutCubic(seg(t, 20.4, 21.6)) * DEG;
}

function pitchAt(t) {
  const flip = t >= 10.8 && t < 15.6 ? 2 * Math.PI * inOutCubic(seg(t, 10.8, 12.0)) : 0;
  return flip + 1.2 * DEG * Math.sin((2 * Math.PI * t) / 4.8);
}

function bandPoint(yaw, y) {
  const x = PW / 2;
  return new THREE.Vector3(x * Math.cos(yaw), y, -x * Math.sin(yaw));
}

const dirFrom = (az, el) => new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
// Keeps the phone's centre about 30 px below the frame's centre at any distance.
const heroTarget = (dist) => new THREE.Vector3(0, 0.0072 * dist, 0);

function cameraAt(t) {
  if (t < 2.4) {
    const u = t / 2.4;
    return { target: bandPoint(yawAt(t), lerp(-0.4, 2.3, u)), dir: MACRO_DIR.clone(), dist: MACRO_DIST };
  }
  if (t < 6.0) {
    const e = inOutCubic(seg(t, 2.4, 4.2));
    const dist = logLerp(MACRO_DIST, D_HERO, e);
    const f = (dist - MACRO_DIST) / (D_HERO - MACRO_DIST);
    const start = bandPoint(yawAt(2.4), 2.3);
    return {
      target: start.lerp(heroTarget(dist), f),
      dir: MACRO_DIR.clone().lerp(new THREE.Vector3(0, 0, 1), e).normalize(),
      dist,
    };
  }
  if (t < 10.8) {
    const dist = lerp(D_HERO, D_PUSH, inOutSine(seg(t, 6.0, 10.8)));
    return { target: heroTarget(dist), dir: dirFrom(0, 0), dist };
  }
  if (t < 15.6) {
    return { target: heroTarget(D_PUSH), dir: dirFrom(AZ * inOutSine(seg(t, 10.8, 15.6)), 0), dist: D_PUSH };
  }
  if (t < 20.4) {
    return { target: heroTarget(D_PUSH), dir: dirFrom(AZ, EL * inOutSine(seg(t, 15.6, 20.4))), dist: D_PUSH };
  }
  const e = inOutSine(seg(t, 20.4, 25.8));
  const dist = logLerp(D_PUSH, D_FAN, e);
  return { target: heroTarget(dist), dir: dirFrom(AZ * (1 - e), EL * (1 - e)), dist };
}

function screenAt(t) {
  let key = TL.screens[0].key;
  for (const s of TL.screens) if (t >= s.from) key = s.key;
  return key;
}

let SCREENS = {};

function applyState(t) {
  const bob = 0.05 * Math.sin((2 * Math.PI * t) / 4.8);
  const main = phones[0];
  main.group.position.set(0, bob, 0);
  main.group.rotation.set(pitchAt(t), yawAt(t), 0);
  main.screen.material.map = SCREENS[screenAt(t)].tex;

  // The fan: two phones hidden behind the first slide out to either side.
  const fanOn = t >= 21.6;
  const s = outCubic(seg(t, 21.6, 24.0));
  [
    [phones[1], -1, 'darkHome'],
    [phones[2], 1, 'darkPlan'],
  ].forEach(([p, side, key]) => {
    p.group.visible = fanOn;
    p.group.position.set(side * 4.1 * s, bob, lerp(-0.5, -1.4, s));
    p.group.rotation.set(pitchAt(t), -side * 24 * DEG * s, 0);
    p.screen.material.map = SCREENS[key].tex;
  });

  const c = cameraAt(t);
  camera.position.copy(c.target).addScaledVector(c.dir, c.dist);
  camera.near = Math.max(0.05, c.dist * 0.02);
  camera.updateProjectionMatrix();
  camera.lookAt(c.target);
  camera.updateMatrixWorld();
}

// ---------- motion blur ----------
const fbTex = new THREE.FramebufferTexture(W, H);
const accRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthBuffer: false });
const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quadVS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const quadFS = 'uniform sampler2D map; uniform float w; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(map, vUv).rgb * w, 1.0); }';
const accMat = new THREE.ShaderMaterial({
  uniforms: { map: { value: fbTex }, w: { value: 1 } },
  vertexShader: quadVS, fragmentShader: quadFS,
  blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  depthTest: false, depthWrite: false,
});
const outMat = new THREE.ShaderMaterial({
  uniforms: { map: { value: accRT.texture }, w: { value: 1 } },
  vertexShader: quadVS, fragmentShader: quadFS, blending: THREE.NoBlending, depthTest: false, depthWrite: false,
});
const accScene = new THREE.Scene();
accScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), accMat));
const outScene = new THREE.Scene();
outScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), outMat));

const SUBFRAMES = 8;
const SHUTTER = 0.5 / FPS; // 180°
const blurred = (t) => TL.moves.some((m) => t >= m.start - 0.05 && t <= m.end + 0.05);

// ---------- frame ----------
export function renderAt(t) {
  for (const [key, s] of Object.entries(SCREENS)) updateScreenFx(key, s, t);
  const black = drawOverlay(t);
  renderer.setRenderTarget(null);
  if (black >= 1) {
    renderer.clear();
  } else if (!blurred(t)) {
    applyState(t);
    renderer.render(scene, camera);
  } else {
    for (let k = 0; k < SUBFRAMES; k++) {
      applyState(t + ((k + 0.5) / SUBFRAMES - 0.5) * SHUTTER);
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      renderer.copyFramebufferToTexture(fbTex);
      renderer.setRenderTarget(accRT);
      if (k === 0) renderer.clear();
      accMat.uniforms.w.value = 1 / SUBFRAMES;
      renderer.autoClear = false;
      renderer.render(accScene, quadCam);
      renderer.autoClear = true;
    }
    renderer.setRenderTarget(null);
    renderer.render(outScene, quadCam);
  }
  renderer.autoClear = false;
  renderer.render(ovScene, ovCam);
  renderer.autoClear = true;
}

const pixels = new Uint8Array(W * H * 4);
export function readFrame() {
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return pixels;
}

// Screen-space bottom of every visible phone, for the Reels safe-area check.
export function phoneBottomAt(t) {
  applyState(t);
  scene.updateMatrixWorld();
  let bottom = -Infinity;
  const v = new THREE.Vector3();
  for (const p of phones) {
    if (!p.group.visible) continue;
    for (const [x, y] of [[-SW / 2, -SH / 2], [SW / 2, -SH / 2], [-SW / 2, SH / 2], [SW / 2, SH / 2]]) {
      v.set(x, y, FRONT).applyMatrix4(p.group.matrixWorld).project(camera);
      bottom = Math.max(bottom, ((1 - v.y) / 2) * H);
    }
  }
  return bottom;
}

export async function init(files) {
  const font = new FontFace(FONT, `url(${files.font})`, { weight: '200 800' });
  await font.load();
  document.fonts.add(font);
  const load = async (url) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  };
  logoImg = await load(files.logo);
  for (const [key, url] of Object.entries(files.screens)) SCREENS[key] = buildScreen(await load(url));
  fitTitleSizes();
  phones.forEach((p) => p.group.updateMatrixWorld());
  for (const s of Object.values(SCREENS)) renderer.initTexture(s.tex);
  return { renderer: gl.getParameter(renderer.extensions.get('WEBGL_debug_renderer_info')?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER), size1: SIZE1, size2: SIZE2 };
}
