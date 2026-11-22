'use strict';

/* Утилиты (должны быть объявлены до использования) */
const rand = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = k => k * k * (3 - 2 * k);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mix = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const rgb = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d', { alpha: false });
const clockEl = document.getElementById('clock');
const countdownEl = document.getElementById('countdown');
const weatherEl = document.getElementById('weather');

let W = 0, H = 0, S = 1;
let groundY = 0, sidewalkY = 0, sidewalkH = 0, roadY = 0, roadH = 0;

const CYCLE = 60;
let tNorm = 0.30;
let elapsed = 0;

let buildings = [], lights = [], people = [], cars = [], stars = [];
let shakeOffsetX = 0, shakeOffsetY = 0, lastDarkness = 0;

const ripples = [], rainDrops = [], snowflakes = [], lightnings = [], fireworks = [], ufos = [], flocks = [];
let lightningFlash = 0;

const weather = { type: 'clear', intensity: 0, timer: 0, duration: 40, nextFlash: 4 };
let currentWeatherType = 'clear';

let quakeT = 0, nextQuake = rand(40, 80), nextUfo = rand(30, 60), nextFlock = rand(15, 35);

const trafficLights = [];
const trafficState = { state: 'green', t: 0 };

const meteor = {
  triggered: false, phase: 'idle', phaseT: 0, incomingDur: 1.9, flash: 0, shake: 0,
  x0: 0, y0: 0, ix: 0, iy: 0, craterR: 0, craterTargetR: 0, fireUntil: 0
};
let boomParticles = [];

const grainCanvas = document.createElement('canvas');
grainCanvas.width = grainCanvas.height = 256;
{
  const g2 = grainCanvas.getContext('2d');
  const id = g2.createImageData(256, 256);
  for (let i = 0; i < id.data.length; i += 4) {
    const v = Math.random() * 255;
    id.data[i] = id.data[i+1] = id.data[i+2] = v; id.data[i+3] = 255;
  }
  g2.putImageData(id, 0, 0);
}
let grainPattern = null;

function roundRect(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* Небо */
const SKY = [
  { t: 0.00, top: [8, 10, 26],    bot: [22, 28, 54],    light: 0.05, stars: 1.0  },
  { t: 0.12, top: [26, 22, 60],   bot: [80, 60, 100],   light: 0.15, stars: 0.7  },
  { t: 0.20, top: [80, 110, 170], bot: [255, 160, 120], light: 0.60, stars: 0.05 },
  { t: 0.30, top: [70, 140, 215], bot: [190, 220, 245], light: 0.95, stars: 0    },
  { t: 0.50, top: [55, 135, 220], bot: [175, 215, 245], light: 1.00, stars: 0    },
  { t: 0.68, top: [70, 130, 210], bot: [240, 200, 160], light: 0.90, stars: 0    },
  { t: 0.78, top: [60, 50, 100],  bot: [255, 120, 90],  light: 0.50, stars: 0.10 },
  { t: 0.87, top: [20, 24, 58],   bot: [70, 50, 90],    light: 0.15, stars: 0.6  },
  { t: 1.00, top: [8, 10, 26],    bot: [22, 28, 54],    light: 0.05, stars: 1.0  },
];

function sampleSky(t) {
  t = ((t % 1) + 1) % 1;
  for (let i = 0; i < SKY.length - 1; i++) {
    const A = SKY[i], B = SKY[i + 1];
    if (t >= A.t && t <= B.t) {
      const k = smooth((t - A.t) / ((B.t - A.t) || 1));
      return { top: mix(A.top, B.top, k), bot: mix(A.bot, B.bot, k), light: lerp(A.light, B.light, k), stars: lerp(A.stars, B.stars, k) };
    }
  }
  return { top: SKY[0].top, bot: SKY[0].bot, light: 0, stars: 1 };
}

/* Генерация */
function generateCity() {
  buildings = [];
  const layers = [
    { color: [66, 82, 120], hMin: 0.26, hMax: 0.60, wMin: 46, wMax: 120, haze: 0.55, windows: false },
    { color: [42, 54, 88],  hMin: 0.32, hMax: 0.72, wMin: 42, wMax: 110, haze: 0.30, windows: true  },
    { color: [18, 24, 44],  hMin: 0.16, hMax: 0.44, wMin: 50, wMax: 130, haze: 0.10, windows: true  },
  ];
  layers.forEach((L, li) => {
    let x = -rand(20, 90) * S;
    while (x < W + 90 * S) {
      const w = rand(L.wMin, L.wMax) * S;
      const h = rand(L.hMin, L.hMax) * groundY;
      const b = { x, w, h, y: groundY - h, color: L.color, layer: li, haze: L.haze, tint: 0.85 + Math.random() * 0.3, antenna: Math.random() < 0.28, windows: [], lightOverride: null };
      if (L.windows) {
        const pad = 6 * S, gx = 10 * S, gy = 14 * S, ww = 4.5 * S, wh = 6.5 * S;
        const cols = Math.max(0, Math.floor((w - pad * 2) / gx));
        const rows = Math.max(0, Math.floor((h - pad * 2) / gy));
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            b.windows.push({ x: b.x + pad + c * gx + (gx - ww) / 2, y: b.y + pad + r * gy + (gy - wh) / 2, w: ww, h: wh, seed: Math.random(), warm: Math.random() < 0.72 });
          }
        }
      }
      buildings.push(b);
      x += w + rand(-8, 12) * S;
    }
  });
}

function generateLights() {
  lights = [];
  const spacing = 190 * S;
  for (let x = spacing * 0.6; x < W + spacing; x += spacing) lights.push({ x, override: null });
}

function initTrafficLights() {
  trafficLights.length = 0;
  trafficLights.push({ x: W * 0.32 }); trafficLights.push({ x: W * 0.72 });
}

function generateStars() {
  stars = [];
  const n = Math.round((W * H) / 7000);
  for (let i = 0; i < n; i++) {
    stars.push({ x: Math.random() * W, y: Math.random() * groundY * 0.85, r: rand(0.6, 1.8) * S, a: rand(0.25, 1), spd: rand(0.6, 2.4), ph: rand(0, Math.PI * 2) });
  }
}

const UMBRELLA_COLORS = ['#c84a4a', '#3a6ea5', '#d9b23a', '#4a8a6a', '#8a5ab0', '#e0e0e0'];

function makePerson(spawnAnywhere) {
  const depth = rand(0.2, 0.9);
  const y = sidewalkY + 6 * S + (sidewalkH - 12 * S) * depth;
  const dir = Math.random() < 0.5 ? 1 : -1;
  const rainy = currentWeatherType === 'rain' || currentWeatherType === 'storm';
  return {
    x: spawnAnywhere ? rand(-30 * S, W + 30 * S) : (dir > 0 ? -30 * S : W + 30 * S),
    y, dir, baseSpeed: rand(14, 34) * S, phase: rand(0, Math.PI * 2), scale: 0.78 + depth * 0.55,
    color: Math.random() < 0.5 ? '#151a2c' : '#20263c', pauseT: 0, jumpY: 0, jumpVy: 0, startleT: 0, waveT: 0, hover: false, abducted: false,
    umbrella: rainy && Math.random() < 0.75, umbrellaColor: UMBRELLA_COLORS[(Math.random() * UMBRELLA_COLORS.length) | 0],
  };
}

function generatePeople() {
  people = [];
  const n = clamp(Math.round(W / 55), 8, 46);
  for (let i = 0; i < n; i++) people.push(makePerson(true));
}

function makeCar() {
  const lane = Math.random() < 0.5 ? 0 : 1;
  const dir = lane === 0 ? 1 : -1;
  const palette = ['#c8494a', '#3a6ea5', '#d9b23a', '#dcdcdc', '#2b2b3c', '#4a8a6a', '#8a5ab0'];
  const sp = rand(70, 135) * S;
  return { x: rand(-260 * S, W + 260 * S), y: roadY + roadH * (lane === 0 ? 0.30 : 0.72), dir, baseSpeed: sp, currentSpeed: sp, color: palette[(Math.random() * palette.length) | 0], len: rand(46, 64) * S, h: rand(15, 19) * S };
}

function generateCars() {
  cars = [];
  const n = clamp(Math.round(W / 320), 2, 7);
  for (let i = 0; i < n; i++) cars.push(makeCar());
}

/* Отрисовка */
function drawCelestial(t) {
  if (t > 0.18 && t < 0.82) {
    const a = (t - 0.20) / 0.60, x = W * (0.06 + 0.88 * a), y = groundY - Math.sin(Math.PI * a) * groundY * 0.78, rad = 24 * S;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad * 5.5);
    g.addColorStop(0, 'rgba(255,240,190,0.85)'); g.addColorStop(0.22, 'rgba(255,205,125,0.32)'); g.addColorStop(1, 'rgba(255,160,80,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad * 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff7d8'; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
  }
  let tn = t; if (tn < 0.22) tn += 1;
  if (tn >= 0.78 && tn <= 1.22) {
    const a = (tn - 0.78) / 0.44, x = W * (0.06 + 0.88 * a), y = groundY - Math.sin(Math.PI * a) * groundY * 0.72, rad = 17 * S;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad * 5);
    g.addColorStop(0, 'rgba(205,220,255,0.45)'); g.addColorStop(1, 'rgba(180,200,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad * 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e9efff'; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(190,200,225,0.55)';
    ctx.beginPath(); ctx.arc(x - rad * 0.3, y - rad * 0.25, rad * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + rad * 0.35, y + rad * 0.15, rad * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + rad * 0.05, y + rad * 0.45, rad * 0.12, 0, Math.PI * 2); ctx.fill();
  }
}

function drawBuildings(sky, darkness, hoveredBuilding) {
  const horizon = sky.bot, amb = 0.22 + sky.light * 0.78;
  for (const b of buildings) {
    let col = [b.color[0]*amb*b.tint, b.color[1]*amb*b.tint, b.color[2]*amb*b.tint];
    col = mix(col, horizon, b.haze);
    ctx.fillStyle = rgb(col); ctx.fillRect(b.x, b.y, b.w, b.h);
    if (b === hoveredBuilding) { ctx.strokeStyle = 'rgba(140,200,255,0.55)'; ctx.lineWidth = 1.5; ctx.strokeRect(b.x+0.75, b.y+0.75, b.w-1.5, b.h-1.5); }
    if (b.windows.length && b.lightOverride !== false) {
      let thr, warmA, coolA;
      if (b.lightOverride === true) { thr = 0.92; warmA = 0.95; coolA = 0.9; }
      else { thr = 0.05 + darkness * 0.84; warmA = 0.45 + darkness * 0.45; coolA = 0.35 + darkness * 0.35; }
      ctx.beginPath();
      for (const w of b.windows) { if (b.lightOverride !== true && Math.random() < 0.0007) w.seed = Math.random(); if (w.seed < thr && w.warm) ctx.rect(w.x, w.y, w.w, w.h); }
      ctx.fillStyle = `rgba(255,212,138,${warmA})`; ctx.fill();
      ctx.beginPath();
      for (const w of b.windows) { if (w.seed < thr && !w.warm) ctx.rect(w.x, w.y, w.w, w.h); }
      ctx.fillStyle = `rgba(170,208,255,${coolA})`; ctx.fill();
    }
    if (b.antenna) {
      ctx.fillStyle = rgb(col); ctx.fillRect(b.x + b.w * 0.5 - S, b.y - 20 * S, 2 * S, 20 * S);
      if (darkness > 0.25) {
        const blink = 0.5 + 0.5 * Math.sin(elapsed * 3 + b.x * 0.05);
        ctx.fillStyle = `rgba(255,70,70,${blink * darkness * 0.9})`; ctx.beginPath(); ctx.arc(b.x + b.w * 0.5, b.y - 20 * S, 2.2 * S, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
}

function drawRoad(sky) {
  const lit = 0.2 + sky.light * 0.8;
  ctx.fillStyle = `rgb(${(30*lit+8)|0},${(34*lit+8)|0},${(44*lit+10)|0})`; ctx.fillRect(0, roadY, W, roadH);
  const mid = roadY + roadH * 0.51;
  ctx.fillStyle = `rgba(230,225,200,${0.06 + sky.light * 0.22})`;
  const dash = 34 * S, gap = 26 * S, off = (elapsed * 40 * S) % (dash + gap);
  for (let x = -off; x < W; x += dash + gap) ctx.fillRect(x, mid, dash, 2 * S);
}

function drawSidewalk(sky) {
  const lit = 0.2 + sky.light * 0.8;
  const g = ctx.createLinearGradient(0, sidewalkY, 0, sidewalkY + sidewalkH);
  g.addColorStop(0, `rgb(${(108*lit+14)|0},${(113*lit+14)|0},${(132*lit+17)|0})`);
  g.addColorStop(1, `rgb(${(74*lit+10)|0},${(78*lit+10)|0},${(94*lit+13)|0})`);
  ctx.fillStyle = g; ctx.fillRect(0, sidewalkY, W, sidewalkH);
  ctx.strokeStyle = `rgba(0,0,0,${0.10 + sky.light * 0.06})`; ctx.lineWidth = 1;
  for (let k = 1; k < 3; k++) { const y = sidewalkY + (sidewalkH * k) / 3; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.fillStyle = `rgba(255,255,255,${0.04 + sky.light * 0.05})`; ctx.fillRect(0, sidewalkY + sidewalkH - 2 * S, W, 2 * S);
}

function drawTrafficLights() {
  for (const tl of trafficLights) {
    const poleX = tl.x, baseY = roadY + 2 * S, topY = roadY - 92 * S;
    ctx.fillStyle = '#1a1a22'; ctx.fillRect(poleX - 1.5 * S, topY, 3 * S, baseY - topY);
    const hw = 11 * S, hh = 30 * S, hx = poleX - hw / 2, hy = topY - hh;
    ctx.fillStyle = '#0b0b12'; roundRect(hx, hy, hw, hh, 3 * S); ctx.fill();
    const r = 3.4 * S, ys = [hy + 6 * S, hy + hh / 2, hy + hh - 6 * S];
    const cols = [trafficState.state === 'red' ? '#ff3a3a' : '#442020', trafficState.state === 'yellow' ? '#ffb838' : '#443522', trafficState.state === 'green' ? '#3aff66' : '#224422'];
    for (let i = 0; i < 3; i++) {
      if ((i === 0 && trafficState.state === 'red') || (i === 1 && trafficState.state === 'yellow') || (i === 2 && trafficState.state === 'green')) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const gl = ctx.createRadialGradient(poleX, ys[i], 0, poleX, ys[i], 12 * S);
        gl.addColorStop(0, cols[i]); gl.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(poleX, ys[i], 12 * S, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.arc(poleX, ys[i], r, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function isLightOn(L, darkness) {
  if (L.override === true) return true; if (L.override === false) return false; return darkness > 0.02;
}

function drawStreetlights(darkness, hoveredLight) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const L of lights) {
    if (!isLightOn(L, darkness)) continue;
    const intensity = L.override === true ? Math.max(0.75, darkness) : darkness;
    const topY = sidewalkY - 84 * S, lx = L.x + 26 * S;
    const cone = ctx.createLinearGradient(lx, topY, lx, sidewalkY + sidewalkH);
    cone.addColorStop(0, `rgba(255,222,155,${0.16 * intensity})`); cone.addColorStop(1, `rgba(255,205,125,${0.01 * intensity})`);
    ctx.fillStyle = cone; ctx.beginPath(); ctx.moveTo(lx - 6 * S, topY + 4 * S); ctx.lineTo(lx + 6 * S, topY + 4 * S); ctx.lineTo(lx + 78 * S, sidewalkY + sidewalkH * 0.95); ctx.lineTo(lx - 78 * S, sidewalkY + sidewalkH * 0.95); ctx.closePath(); ctx.fill();
    const cy = sidewalkY + sidewalkH * 0.6, rx = 92 * S, ry = sidewalkH * 0.72;
    ctx.save(); ctx.translate(lx, cy); ctx.scale(1, ry / rx);
    const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    pool.addColorStop(0, `rgba(255,203,124,${0.30 * intensity})`); pool.addColorStop(1, 'rgba(255,180,90,0)');
    ctx.fillStyle = pool; ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  ctx.restore();
  for (const L of lights) {
    const on = isLightOn(L, darkness), topY = sidewalkY - 84 * S, lx = L.x + 26 * S;
    ctx.strokeStyle = `rgba(${(18+darkness*14)|0},${(21+darkness*14)|0},${(30+darkness*16)|0},0.95)`; ctx.lineWidth = 3 * S; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(L.x, sidewalkY + sidewalkH * 0.1); ctx.lineTo(L.x, topY); ctx.lineTo(lx, topY); ctx.stroke();
    ctx.fillStyle = on ? `rgba(255,224,158,${0.55 + (L.override === true ? 0.45 : darkness * 0.45)})` : 'rgba(60,62,76,1)';
    ctx.beginPath(); ctx.ellipse(lx, topY + 3 * S, 6 * S, 3 * S, 0, 0, Math.PI * 2); ctx.fill();
    if (on) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const haloR = 34 * S, hi = L.override === true ? Math.max(0.75, darkness) : darkness;
      const halo = ctx.createRadialGradient(lx, topY + 3 * S, 0, lx, topY + 3 * S, haloR);
      halo.addColorStop(0, `rgba(255,225,160,${0.35 * hi})`); halo.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(lx, topY + 3 * S, haloR, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    if (L === hoveredLight) { ctx.strokeStyle = 'rgba(255,235,180,0.85)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(lx, topY + 3 * S, 16 * S, 0, Math.PI * 2); ctx.stroke(); }
  }
}

function drawPerson(p) {
  const sc = p.scale * S, walking = p.pauseT <= 0 || p.startleT > 0, swing = walking ? Math.sin(p.phase) : 0;
  const bob = walking ? Math.abs(Math.cos(p.phase)) * 1.1 * sc : 0, jumpOff = p.jumpY || 0;
  ctx.save(); ctx.translate(p.x, p.y - bob + jumpOff); ctx.scale(p.dir, 1);
  ctx.strokeStyle = p.color; ctx.fillStyle = p.color; ctx.lineWidth = 1.8 * sc; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const hipY = -7 * sc, shoulderY = -14 * sc, headY = -16.6 * sc, legSwing = walking ? swing * 3.2 * sc : 1.1 * sc;
  const airborne = jumpOff < -2 * sc, legLift = airborne ? 3.2 * sc : 0;
  ctx.beginPath(); ctx.moveTo(0, hipY); ctx.lineTo(legSwing, -legLift); ctx.moveTo(0, hipY); ctx.lineTo(-legSwing, -legLift); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, hipY); ctx.lineTo(0, shoulderY); ctx.stroke();
  if (p.waveT > 0) {
    const wave = Math.sin(elapsed * 22);
    ctx.beginPath(); ctx.moveTo(0, shoulderY + sc); ctx.lineTo(3 * sc + wave * 2 * sc, shoulderY - 4 * sc); ctx.moveTo(0, shoulderY + sc); ctx.lineTo(-3 * sc - wave * 2 * sc, shoulderY - 4 * sc); ctx.stroke();
  } else {
    const armSwing = walking ? -swing * 2.6 * sc : 0.7 * sc;
    ctx.beginPath(); ctx.moveTo(0, shoulderY + sc); ctx.lineTo(armSwing, shoulderY + 6 * sc); ctx.moveTo(0, shoulderY + sc); ctx.lineTo(-armSwing, shoulderY + 6 * sc); ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(0, headY, 2.4 * sc, 0, Math.PI * 2); ctx.fill();
  if (p.umbrella && (currentWeatherType === 'rain' || currentWeatherType === 'storm')) {
    const uy = headY - 8 * sc; ctx.strokeStyle = '#2a2a33'; ctx.lineWidth = 1 * sc;
    ctx.beginPath(); ctx.moveTo(0, uy + 4 * sc); ctx.lineTo(0, headY); ctx.stroke();
    ctx.fillStyle = p.umbrellaColor; ctx.beginPath(); ctx.arc(0, uy + 4 * sc, 6.5 * sc, Math.PI, 0); ctx.fill();
  }
  if (p.hover) { ctx.strokeStyle = 'rgba(255,230,130,0.85)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, headY - 5 * sc, 8 * sc, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
}

function drawPeople() {
  people.sort((a, b) => a.y - b.y);
  for (const p of people) drawPerson(p);
}

function drawCars(darkness) {
  for (const car of cars) {
    ctx.save(); ctx.translate(car.x, car.y); ctx.scale(car.dir, 1);
    const L = car.len, Ch = car.h;
    if (darkness > 0.4 && car.currentSpeed > 20) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const trailW = L * 1.4, tg = ctx.createLinearGradient(-L / 2 - trailW, 0, -L / 2, 0);
      tg.addColorStop(0, 'rgba(255,180,80,0)'); tg.addColorStop(1, `rgba(255,180,80,${0.10 * darkness})`);
      ctx.fillStyle = tg; ctx.fillRect(-L / 2 - trailW, -Ch * 0.6, trailW, Ch * 0.5); ctx.restore();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.beginPath(); ctx.ellipse(0, Ch * 0.08, L * 0.55, Ch * 0.18, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = car.color; roundRect(-L / 2, -Ch, L, Ch, 3 * S); ctx.fill(); roundRect(-L * 0.24, -Ch * 1.55, L * 0.52, Ch * 0.62, 3 * S); ctx.fill();
    ctx.fillStyle = `rgba(150,205,255,${0.22 + darkness * 0.32})`;
    roundRect(-L * 0.18, -Ch * 1.45, L * 0.19, Ch * 0.42, 1.5 * S); ctx.fill(); roundRect(L * 0.03, -Ch * 1.45, L * 0.19, Ch * 0.42, 1.5 * S); ctx.fill();
    ctx.fillStyle = '#090b12'; ctx.beginPath(); ctx.arc(-L * 0.28, 0, Ch * 0.34, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(L * 0.28, 0, Ch * 0.34, 0, Math.PI * 2); ctx.fill();
    if (darkness > 0.15) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const hx = L / 2, hy = -Ch * 0.45;
      const cone = ctx.createLinearGradient(hx, hy, hx + L * 2.6, hy);
      cone.addColorStop(0, `rgba(255,242,200,${0.42 * darkness})`); cone.addColorStop(1, 'rgba(255,242,200,0)');
      ctx.fillStyle = cone; ctx.beginPath(); ctx.moveTo(hx, -Ch * 0.62); ctx.lineTo(hx, -Ch * 0.28); ctx.lineTo(hx + L * 2.6, -Ch * 1.5); ctx.lineTo(hx + L * 2.6, Ch * 0.75); ctx.closePath(); ctx.fill();
      const tx = -L / 2, tail = ctx.createRadialGradient(tx, -Ch * 0.5, 0, tx, -Ch * 0.5, L * 0.5);
      tail.addColorStop(0, `rgba(255,70,60,${0.35 * darkness})`); tail.addColorStop(1, 'rgba(255,70,60,0)');
      ctx.fillStyle = tail; ctx.beginPath(); ctx.arc(tx, -Ch * 0.5, L * 0.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    ctx.restore();
  }
}

/* Погода */
function cycleWeather() {
  const order = ['clear', 'rain', 'snow', 'fog', 'storm'];
  const i = order.indexOf(weather.type);
  setWeather(order[(i + 1) % order.length]);
}

function setWeather(type) {
  weather.type = type; weather.intensity = 0; weather.timer = 0; weather.duration = rand(35, 60); weather.nextFlash = rand(2, 5); currentWeatherType = type;
  rainDrops.length = 0; snowflakes.length = 0; lightnings.length = 0;
  const rainy = type === 'rain' || type === 'storm';
  for (const p of people) p.umbrella = rainy && Math.random() < 0.75;
  const labels = { clear: '☀ Ясно', rain: '🌧 Дождь', snow: '❄ Снег', fog: '🌫 Туман', storm: '⛈ Гроза' };
  weatherEl.textContent = labels[type] || '';
}

function spawnLightning() {
  const x0 = rand(W * 0.1, W * 0.9), y0 = 0, y1 = groundY * rand(0.6, 0.95), steps = 9;
  const path = [{ x: x0, y: y0 }];
  for (let i = 1; i <= steps; i++) path.push({ x: x0 + rand(-26, 26) * (1 - i / steps) + rand(-10, 10), y: y0 + (y1 - y0) * (i / steps) });
  lightnings.push({ path, life: 0.28, maxLife: 0.28 });
  lightningFlash = Math.max(lightningFlash, 0.75);
}

function updateWeather(dt) {
  weather.timer += dt; if (weather.timer > weather.duration) cycleWeather();
  const target = weather.type === 'clear' ? 0 : 1;
  weather.intensity = lerp(weather.intensity, target, dt * 0.9);
  if (weather.type === 'rain' || weather.type === 'storm') {
    const want = Math.floor((weather.type === 'storm' ? 420 : 220) * weather.intensity);
    while (rainDrops.length < want) rainDrops.push({ x: Math.random() * (W + 100) - 50, y: -20 - Math.random() * 40, vy: rand(750, 1150) * S, len: rand(11, 20) * S, wind: rand(-50, 50) });
    while (rainDrops.length > want) rainDrops.pop();
    for (const r of rainDrops) {
      r.x += r.wind * dt; r.y += r.vy * dt;
      if (r.y > H + 20) { r.y = -20; r.x = Math.random() * (W + 100) - 50; }
    }
    if (weather.type === 'storm') { weather.nextFlash -= dt; if (weather.nextFlash <= 0) { spawnLightning(); weather.nextFlash = rand(3, 8); } }
  } else rainDrops.length = 0;

  if (weather.type === 'snow') {
    const want = Math.floor(180 * weather.intensity);
    while (snowflakes.length < want) snowflakes.push({ x: Math.random() * W, y: -10 - Math.random() * 20, vx: rand(-15, 15), vy: rand(25, 65) * S, r: rand(1.2, 3.5) * S, phase: rand(0, Math.PI * 2) });
    while (snowflakes.length > want) snowflakes.pop();
    for (const f of snowflakes) {
      f.phase += dt * 2; f.x += (f.vx + Math.sin(f.phase) * 22) * dt; f.y += f.vy * dt;
      if (f.y > H + 10) { f.y = -10; f.x = Math.random() * W; }
    }
  } else snowflakes.length = 0;

  for (let i = lightnings.length - 1; i >= 0; i--) { lightnings[i].life -= dt; if (lightnings[i].life <= 0) lightnings.splice(i, 1); }
  if (lightningFlash > 0) lightningFlash = Math.max(0, lightningFlash - dt * 2.5);
}

function drawRain() {
  if (!rainDrops.length) return;
  ctx.strokeStyle = `rgba(170,200,230,${0.35 * weather.intensity})`; ctx.lineWidth = 1; ctx.beginPath();
  for (const r of rainDrops) { ctx.moveTo(r.x, r.y); ctx.lineTo(r.x - r.wind * 0.025, r.y - r.len); }
  ctx.stroke();
}

function drawSnow() {
  if (!snowflakes.length) return;
  ctx.fillStyle = `rgba(255,255,255,${0.85 * weather.intensity})`;
  for (const f of snowflakes) { ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill(); }
}

function drawFog() {
  if (weather.type !== 'fog') return;
  const k = weather.intensity;
  ctx.fillStyle = `rgba(180,195,215,${0.18 * k})`; ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, groundY - 120 * S, 0, H);
  g.addColorStop(0, 'rgba(200,210,225,0)'); g.addColorStop(0.3, `rgba(200,210,225,${0.42 * k})`); g.addColorStop(1, `rgba(200,210,225,${0.72 * k})`);
  ctx.fillStyle = g; ctx.fillRect(0, groundY - 120 * S, W, H - groundY + 120 * S);
}

function drawLightnings() {
  for (const L of lightnings) {
    const a = L.life / L.maxLife;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(210,225,255,${a})`; ctx.lineWidth = 2.4 * S; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(L.path[0].x, L.path[0].y);
    for (let i = 1; i < L.path.length; i++) ctx.lineTo(L.path[i].x, L.path[i].y);
    ctx.stroke();
    ctx.strokeStyle = `rgba(190,210,255,${a * 0.6})`; ctx.lineWidth = 1 * S;
    for (let i = 2; i < L.path.length - 1; i += 2) { const p = L.path[i]; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + rand(-40, 40), p.y + rand(30, 70)); ctx.stroke(); }
    ctx.restore();
  }
}

/* Салюты, НЛО, Птицы */
function launchFirework(x, y) {
  fireworks.push({ startX: x + rand(-30, 30) * S, startY: groundY - rand(0, 20) * S, targetX: x, targetY: y, t: 0, dur: rand(0.7, 1.0), hue: rand(0, 360), sparks: [], exploded: false });
}

function explodeFirework(fw) {
  const n = 80;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand(-0.08, 0.08), sp = rand(120, 340) * S;
    fw.sparks.push({ x: fw.targetX, y: fw.targetY, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(1.0, 1.9), maxLife: 1.9, hue: fw.hue + rand(-25, 25) });
  }
}

function updateFireworks(dt) {
  for (let i = fireworks.length - 1; i >= 0; i--) {
    const fw = fireworks[i]; fw.t += dt;
    if (!fw.exploded) { if (fw.t >= fw.dur) { fw.exploded = true; explodeFirework(fw); } }
    else {
      for (let j = fw.sparks.length - 1; j >= 0; j--) {
        const s = fw.sparks[j]; s.life -= dt;
        if (s.life <= 0) { fw.sparks.splice(j, 1); continue; }
        s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 200 * S * dt; s.vx *= Math.pow(0.72, dt); s.vy *= Math.pow(0.72, dt);
      }
      if (fw.sparks.length === 0 && fw.t > fw.dur + 2.5) fireworks.splice(i, 1);
    }
  }
}

function drawFireworks() {
  for (const fw of fireworks) {
    if (!fw.exploded) {
      const k = fw.t / fw.dur, e = 1 - Math.pow(1 - k, 2.5), x = lerp(fw.startX, fw.targetX, e), y = lerp(fw.startY, fw.targetY, e);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const tg = ctx.createLinearGradient(x, y + 22 * S, x, y);
      tg.addColorStop(0, 'rgba(255,200,100,0)'); tg.addColorStop(1, `hsla(${fw.hue}, 100%, 70%, 0.9)`);
      ctx.strokeStyle = tg; ctx.lineWidth = 2.2 * S;
      ctx.beginPath(); ctx.moveTo(x, y + 22 * S); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = `hsla(${fw.hue}, 100%, 82%, 1)`; ctx.beginPath(); ctx.arc(x, y, 3.2 * S, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    } else {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const s of fw.sparks) {
        const a = Math.min(1, (s.life / s.maxLife) * 1.6);
        ctx.fillStyle = `hsla(${s.hue}, 100%, 70%, ${a})`; ctx.beginPath(); ctx.arc(s.x, s.y, 2 * S, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }
}

function spawnUfo() {
  const fromLeft = Math.random() < 0.5;
  ufos.push({ x: fromLeft ? -120 * S : W + 120 * S, y: groundY * rand(0.15, 0.30), tx: W * rand(0.35, 0.65), ty: groundY * rand(0.15, 0.30), dir: fromLeft ? 1 : -1, phase: 'entering', phaseT: 0, victim: null, beam: 0 });
}

function updateUfos(dt) {
  for (let i = ufos.length - 1; i >= 0; i--) {
    const u = ufos[i]; u.phaseT += dt;
    if (u.phase === 'entering') {
      u.x = lerp(u.x, u.tx, dt * 1.4); u.y = lerp(u.y, u.ty, dt * 1.4);
      if (Math.abs(u.x - u.tx) < 6 && Math.abs(u.y - u.ty) < 6) {
        u.phase = 'beaming'; u.phaseT = 0;
        let best = null, bestD = Infinity;
        for (const p of people) { if (p.abducted) continue; const d = Math.abs(p.x - u.x); if (d < bestD) { bestD = d; best = p; } }
        if (best && bestD < 350 * S) { u.victim = best; best.abducted = true; best.waveT = 2; best.startleT = 2; }
      }
    } else if (u.phase === 'beaming') {
      u.beam = Math.min(1, u.phaseT * 2.2);
      if (u.victim) { u.victim.x = lerp(u.victim.x, u.x, dt * 2.6); u.victim.y = lerp(u.victim.y, u.y + 15 * S, dt * 2.6); u.victim.jumpY = 0; }
      if (u.phaseT > 2.6) {
        u.phase = 'leaving'; u.phaseT = 0;
        if (u.victim) { const idx = people.indexOf(u.victim); if (idx >= 0) people.splice(idx, 1); people.push(makePerson(false)); u.victim = null; }
      }
    } else if (u.phase === 'leaving') {
      u.x += u.dir * 260 * S * dt; u.y -= 40 * S * dt; u.beam = Math.max(0, u.beam - dt * 2);
      if (u.x < -220 * S || u.x > W + 220 * S) ufos.splice(i, 1);
    }
  }
}

function drawUfos() {
  for (const u of ufos) {
    if (u.beam > 0.01) {
      const bx = u.x, by = u.y + 8 * S, tX = u.victim ? u.victim.x : u.x, tY = u.victim ? u.victim.y : groundY;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(bx, by, tX, tY);
      g.addColorStop(0, `rgba(180,255,180,${0.5 * u.beam})`); g.addColorStop(1, 'rgba(120,255,140,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(bx - 14 * S, by); ctx.lineTo(bx + 14 * S, by); ctx.lineTo(tX + 26 * S, tY); ctx.lineTo(tX - 26 * S, tY); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    ctx.save(); ctx.translate(u.x, u.y);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const gg = ctx.createRadialGradient(0, 0, 0, 0, 0, 26 * S);
    gg.addColorStop(0, 'rgba(200,255,200,0.7)'); gg.addColorStop(1, 'rgba(100,200,120,0)');
    ctx.fillStyle = gg; ctx.beginPath(); ctx.ellipse(0, 0, 26 * S, 10 * S, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#9aa89a'; ctx.beginPath(); ctx.ellipse(0, 0, 22 * S, 8 * S, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(150,220,180,0.9)'; ctx.beginPath(); ctx.arc(0, -3 * S, 9 * S, Math.PI, 0); ctx.fill();
    for (let k = -2; k <= 2; k++) { const blink = 0.4 + 0.6 * Math.abs(Math.sin(elapsed * 4 + k)); ctx.fillStyle = `rgba(255,200,200,${blink})`; ctx.beginPath(); ctx.arc(k * 7 * S, 3 * S, 1.4 * S, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
}

function spawnFlock() {
  const fromLeft = Math.random() < 0.5;
  const flock = { x: fromLeft ? -80 * S : W + 80 * S, y: rand(groundY * 0.10, groundY * 0.35), dir: fromLeft ? 1 : -1, speed: rand(85, 140) * S, birds: [] };
  const n = Math.floor(rand(6, 14));
  for (let i = 0; i < n; i++) flock.birds.push({ offX: rand(-50, 50) * S, offY: rand(-25, 25) * S, phase: rand(0, Math.PI * 2) });
  flocks.push(flock);
}

function updateFlocks(dt) {
  for (let i = flocks.length - 1; i >= 0; i--) {
    const f = flocks[i]; f.x += f.dir * f.speed * dt;
    if (f.x < -220 * S || f.x > W + 220 * S) flocks.splice(i, 1);
  }
}

function drawBirds() {
  if (!flocks.length) return;
  ctx.strokeStyle = 'rgba(30,34,44,0.9)'; ctx.lineWidth = 1.6 * S; ctx.lineCap = 'round';
  for (const f of flocks) {
    for (const b of f.birds) {
      const x = f.x + b.offX, y = f.y + b.offY + Math.sin(elapsed * 5 + b.phase) * 3 * S, flap = Math.sin(elapsed * 12 + b.phase) * 4 * S, wing = 5 * S;
      ctx.beginPath(); ctx.moveTo(x - wing, y + flap * 0.3); ctx.lineTo(x, y); ctx.lineTo(x + wing, y + flap * 0.3); ctx.stroke();
    }
  }
}

/* Метеорит */
function triggerMeteor() {
  if (meteor.triggered) return;
  meteor.triggered = true; meteor.phase = 'incoming'; meteor.phaseT = 0;
  const fromRight = Math.random() < 0.5;
  meteor.x0 = fromRight ? W * rand(1.0, 1.25) : W * rand(-0.25, 0); meteor.y0 = -H * 0.35;
  meteor.ix = fromRight ? rand(W * 0.15, W * 0.65) : rand(W * 0.35, W * 0.85); meteor.iy = groundY + sidewalkH * 0.4;
  meteor.craterTargetR = rand(62, 98) * S;
}

function doImpact() {
  meteor.phase = 'impact'; meteor.phaseT = 0; meteor.flash = 1.0; meteor.shake = 55; meteor.fireUntil = elapsed + 14; meteor.craterR = 10 * S;
  spawnBoom();
  for (const p of people) {
    const dx = p.x - meteor.ix, dy = p.y - meteor.iy;
    if (Math.hypot(dx, dy) < 360 * S) { p.dir = dx >= 0 ? 1 : -1; p.baseSpeed *= 2.4; p.pauseT = 0; p.startleT = 3; }
  }
}

function spawnBoom() {
  const ix = meteor.ix, iy = meteor.iy;
  for (let i = 0; i < 70; i++) { const a = rand(-Math.PI * 0.95, -Math.PI * 0.05), sp = rand(150, 480), life = rand(1.5, 3.5); boomParticles.push({ x: ix + rand(-15, 15), y: iy - rand(0, 10), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, maxLife: life, size: rand(2.5, 7) * S, type: 'debris' }); }
  for (let i = 0; i < 130; i++) { const a = rand(-Math.PI * 0.95, -Math.PI * 0.05), sp = rand(200, 760), life = rand(0.4, 1.4); boomParticles.push({ x: ix + rand(-20, 20), y: iy + rand(-15, 5), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, maxLife: life, size: rand(1.2, 3.2) * S, type: 'spark' }); }
  for (let i = 0; i < 45; i++) { const a = rand(-Math.PI * 0.85, -Math.PI * 0.15), sp = rand(40, 180), life = rand(2.5, 5); boomParticles.push({ x: ix + rand(-30, 30), y: iy + rand(-10, 10), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6 - rand(20, 50), life, maxLife: life, size: rand(15, 35) * S, type: 'dust' }); }
}

function spawnFireParticle() {
  const r = Math.random() * meteor.craterR * 0.85, a = rand(0, Math.PI * 2), fx = meteor.ix + Math.cos(a) * r, fy = meteor.iy + Math.sin(a) * r * 0.3, life = rand(0.7, 1.5);
  boomParticles.push({ x: fx, y: fy, vx: rand(-8, 8), vy: rand(-55, -30), life, maxLife: life, size: rand(5, 11) * S, type: 'fire' });
}

function updateMeteor(dt) {
  if (!meteor.triggered && elapsed >= CYCLE * 2) triggerMeteor();
  if (meteor.phase === 'incoming') { meteor.phaseT += dt; if (meteor.phaseT >= meteor.incomingDur) doImpact(); }
  else if (meteor.phase === 'impact') meteor.phaseT += dt;
  if (meteor.flash > 0) meteor.flash = Math.max(0, meteor.flash - dt * 2.4);
  if (meteor.shake > 0) meteor.shake = Math.max(0, meteor.shake - dt * 75);
  if (meteor.craterR < meteor.craterTargetR) meteor.craterR = Math.min(meteor.craterTargetR, meteor.craterR + dt * meteor.craterTargetR * 3.5);
  if (meteor.phase !== 'idle' && elapsed < meteor.fireUntil) { if (Math.random() < 18 * dt) spawnFireParticle(); }
  for (let i = boomParticles.length - 1; i >= 0; i--) {
    const p = boomParticles[i]; p.life -= dt;
    if (p.life <= 0) { boomParticles.splice(i, 1); continue; }
    if (p.type === 'dust') { p.vx *= Math.pow(0.4, dt); p.vy = p.vy * Math.pow(0.4, dt) - 15 * dt; p.size += 25 * dt * S; }
    else if (p.type === 'fire') { p.vy -= 20 * dt; p.vx *= Math.pow(0.6, dt); p.size *= Math.pow(0.55, dt); }
    else { p.vy += 450 * dt; p.vx *= Math.pow(0.75, dt); }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.type === 'debris' && p.y > meteor.iy + 8 * S) { p.y = meteor.iy + 8 * S; p.vy = -Math.abs(p.vy) * 0.3; p.vx *= 0.55; }
  }
}

function drawMeteorTrail() {
  if (meteor.phase !== 'incoming') return;
  const k = meteor.phaseT / meteor.incomingDur, t = k * k, mx = lerp(meteor.x0, meteor.ix, t), my = lerp(meteor.y0, meteor.iy, t);
  const dx = meteor.ix - meteor.x0, dy = meteor.iy - meteor.y0, len = Math.hypot(dx, dy) || 1, nx = dx / len, ny = dy / len;
  const trailLen = (120 + 300 * t) * S, tx = mx - nx * trailLen, ty = my - ny * trailLen;
  const grad = ctx.createLinearGradient(tx, ty, mx, my);
  grad.addColorStop(0, 'rgba(255,90,30,0)'); grad.addColorStop(0.6, 'rgba(255,160,80,0.55)'); grad.addColorStop(1, 'rgba(255,240,210,0.95)');
  ctx.strokeStyle = grad; ctx.lineWidth = (6 + 7 * t) * S; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(mx, my); ctx.stroke();
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const hg = ctx.createRadialGradient(mx, my, 0, mx, my, 55 * S);
  hg.addColorStop(0, 'rgba(255,250,220,0.9)'); hg.addColorStop(0.3, 'rgba(255,200,130,0.5)'); hg.addColorStop(1, 'rgba(255,140,60,0)');
  ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(mx, my, 55 * S, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  ctx.fillStyle = '#fffbe0'; ctx.beginPath(); ctx.arc(mx, my, 6 * S, 0, Math.PI * 2); ctx.fill();
}

function drawCrater() {
  if (meteor.craterR < 1) return;
  const cx = meteor.ix, cy = meteor.iy, r = meteor.craterR;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(1, 0.35);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, 'rgba(12,6,3,0.95)'); g.addColorStop(0.55, 'rgba(30,15,8,0.9)'); g.addColorStop(0.85, 'rgba(70,45,25,0.65)'); g.addColorStop(1, 'rgba(90,65,40,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  if (elapsed < meteor.fireUntil) {
    const k = Math.min(1, (meteor.fireUntil - elapsed) / 5), flicker = 0.75 + Math.sin(elapsed * 9) * 0.25;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(cx, cy); ctx.scale(1, 0.4);
    const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.2);
    rg.addColorStop(0, `rgba(255,160,60,${0.55 * k * flicker})`); rg.addColorStop(0.5, `rgba(255,80,20,${0.22 * k})`); rg.addColorStop(1, 'rgba(255,50,10,0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(0, 0, r * 2.2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
}

function drawBoomParticles() {
  for (const p of boomParticles) { if (p.type !== 'dust') continue; const a = p.life / p.maxLife; ctx.fillStyle = `rgba(90,70,55,${a * 0.35})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); }
  for (const p of boomParticles) { if (p.type !== 'debris') continue; const a = Math.min(1, (p.life / p.maxLife) * 1.5); ctx.fillStyle = `rgba(45,30,22,${a})`; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const p of boomParticles) {
    if (p.type !== 'spark' && p.type !== 'fire') continue;
    const a = Math.min(1, p.life / p.maxLife);
    if (p.type === 'spark') { const gcol = (150 + 105 * a) | 0, bcol = (40 * a) | 0; ctx.fillStyle = `rgba(255,${gcol},${bcol},${a})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); }
    else { const sz = Math.max(0.5, p.size); const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, sz); grad.addColorStop(0, `rgba(255,230,150,${a * 0.9})`); grad.addColorStop(0.5, `rgba(255,130,40,${a * 0.6})`); grad.addColorStop(1, 'rgba(255,60,20,0)'); ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(p.x, p.y, sz, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}

function drawShockwave() {
  if (meteor.phase !== 'impact') return;
  const k = meteor.phaseT / 1.5; if (k >= 1) return;
  const r = k * Math.max(W, H) * 0.7;
  ctx.save(); ctx.strokeStyle = `rgba(255,220,180,${(1 - k) * 0.55})`; ctx.lineWidth = (5 * (1 - k) + 1) * S;
  ctx.beginPath(); ctx.ellipse(meteor.ix, meteor.iy, r, r * 0.35, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
}

function drawRipples() {
  for (const r of ripples) {
    const a = r.life / r.maxLife, [cr, cg, cb] = r.color;
    ctx.strokeStyle = `rgba(${cr},${cg},${cb},${a * 0.9})`; ctx.lineWidth = 2 * S;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
  }
}

/* Обновление */
function update(dt) {
  for (const p of people) {
    if (p.jumpY !== 0 || p.jumpVy !== 0) { p.jumpVy += 900 * S * dt; p.jumpY += p.jumpVy * dt; if (p.jumpY >= 0) { p.jumpY = 0; p.jumpVy = 0; } }
    if (p.waveT > 0) p.waveT -= dt; if (p.startleT > 0) p.startleT -= dt;
    if (p.pauseT > 0 && p.startleT <= 0) { p.pauseT -= dt; continue; }
    const speedMult = p.startleT > 0 ? 3.0 : 1;
    p.x += p.dir * p.baseSpeed * speedMult * dt; p.phase += p.baseSpeed * speedMult * dt * 0.38;
    if (p.startleT <= 0 && Math.random() < 0.012 * dt * 60) p.pauseT = rand(0.8, 3.2);
    const margin = 40 * S;
    if (p.dir > 0 && p.x > W + margin) Object.assign(p, makePerson(false), { x: -margin });
    else if (p.dir < 0 && p.x < -margin) Object.assign(p, makePerson(false), { x: W + margin });
  }

  for (const car of cars) {
    let targetSpeed = car.baseSpeed, frontX = car.x + car.dir * car.len * 0.5;
    for (const tl of trafficLights) {
      const dist = (tl.x - frontX) * car.dir;
      if (dist > 0 && dist < 90 * S && (trafficState.state === 'red' || (trafficState.state === 'yellow' && dist > 30 * S))) targetSpeed = 0;
    }
    car.currentSpeed = lerp(car.currentSpeed, targetSpeed, dt * 3);
    car.x += car.dir * car.currentSpeed * dt;
    const m = 260 * S;
    if (car.dir > 0 && car.x > W + m) Object.assign(car, makeCar(), { x: -m });
    else if (car.dir < 0 && car.x < -m) Object.assign(car, makeCar(), { x: W + m });
  }

  trafficState.t += dt;
  if (trafficState.state === 'green' && trafficState.t > 8) { trafficState.state = 'yellow'; trafficState.t = 0; }
  else if (trafficState.state === 'yellow' && trafficState.t > 2.5) { trafficState.state = 'red'; trafficState.t = 0; }
  else if (trafficState.state === 'red' && trafficState.t > 7) { trafficState.state = 'green'; trafficState.t = 0; }

  for (let i = ripples.length - 1; i >= 0; i--) { const r = ripples[i]; r.life -= dt; if (r.life <= 0) ripples.splice(i, 1); else r.r = r.maxR * (1 - r.life / r.maxLife); }

  nextQuake -= dt; if (nextQuake <= 0) { quakeT = rand(3, 5); nextQuake = rand(50, 100); } if (quakeT > 0) quakeT -= dt;
  nextUfo -= dt; if (nextUfo <= 0) { spawnUfo(); nextUfo = rand(30, 60); }
  nextFlock -= dt; if (nextFlock <= 0) { spawnFlock(); nextFlock = rand(15, 35); }
}

/* Взаимодействие */
let hoveredPerson = null, hoveredLight = null, hoveredBuilding = null;

function canvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left - shakeOffsetX, y: e.clientY - rect.top - shakeOffsetY };
}

function hitPerson(x, y) {
  let best = null, bestY = -Infinity;
  for (const p of people) {
    const sc = p.scale * S, py = p.y - 9 * sc + (p.jumpY || 0);
    if (Math.abs(x - p.x) < 10 * sc && Math.abs(y - py) < 13 * sc && p.y > bestY) { best = p; bestY = p.y; }
  }
  return best;
}
function hitLight(x, y) {
  for (const L of lights) { const lx = L.x + 26 * S, ly = sidewalkY - 84 * S + 3 * S; if (Math.hypot(x - lx, y - ly) < 24 * S) return L; }
  return null;
}
function hitBuilding(x, y) {
  for (let i = buildings.length - 1; i >= 0; i--) { const b = buildings[i]; if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b; }
  return null;
}
function hitRoad(x, y) { return y >= roadY && y <= roadY + roadH; }

function updateHover(x, y) {
  if (hoveredPerson) hoveredPerson.hover = false;
  hoveredPerson = hitPerson(x, y); hoveredLight = hitLight(x, y);
  hoveredBuilding = hoveredPerson || hoveredLight ? null : hitBuilding(x, y);
  if (hoveredPerson) { hoveredPerson.hover = true; canvas.style.cursor = 'pointer'; return; }
  if (hoveredLight || hoveredBuilding) { canvas.style.cursor = 'pointer'; return; }
  if (hitRoad(x, y)) { canvas.style.cursor = 'copy'; return; }
  canvas.style.cursor = 'default';
}

canvas.addEventListener('pointermove', (e) => { const { x, y } = canvasCoords(e); updateHover(x, y); });
canvas.addEventListener('pointerleave', () => {
  if (hoveredPerson) hoveredPerson.hover = false;
  hoveredPerson = hoveredLight = hoveredBuilding = null; canvas.style.cursor = 'default';
});

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const { x, y } = canvasCoords(e);
  const p = hitPerson(x, y);
  if (p) { p.jumpVy = -260 * S; p.jumpY = 0; p.waveT = 1.4; p.startleT = 2.6; p.pauseT = 0; p.dir = x > p.x ? -1 : 1; ripples.push({ x, y, r: 0, maxR: 44 * S, life: 0.6, maxLife: 0.6, color: [255, 220, 120] }); return; }
  const L = hitLight(x, y);
  if (L) { L.override = L.override === null ? false : L.override === false ? true : null; ripples.push({ x, y, r: 0, maxR: 44 * S, life: 0.6, maxLife: 0.6, color: [255, 235, 170] }); return; }
  const b = hitBuilding(x, y);
  if (b) { b.lightOverride = b.lightOverride === null ? false : b.lightOverride === false ? true : null; ripples.push({ x, y, r: 0, maxR: 44 * S, life: 0.6, maxLife: 0.6, color: [255, 215, 140] }); return; }
  if (hitRoad(x, y)) {
    const lane = (y - roadY) / roadH < 0.5 ? 0 : 1, dir = lane === 0 ? 1 : -1, palette = ['#c8494a', '#3a6ea5', '#d9b23a', '#dcdcdc', '#2b2b3c', '#4a8a6a', '#8a5ab0'], sp = rand(70, 135) * S;
    cars.push({ x, y: roadY + roadH * (lane === 0 ? 0.30 : 0.72), dir, baseSpeed: sp, currentSpeed: sp, color: palette[(Math.random() * palette.length) | 0], len: rand(46, 64) * S, h: rand(15, 19) * S });
    ripples.push({ x, y, r: 0, maxR: 44 * S, life: 0.6, maxLife: 0.6, color: [150, 200, 255] }); return;
  }
  if (lastDarkness > 0.4) launchFirework(x, y);
  else ripples.push({ x, y, r: 0, maxR: 44 * S, life: 0.6, maxLife: 0.6, color: [220, 230, 255] });
});

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'm' || k === 'ь') triggerMeteor();
  else if (k === 'w' || k === 'ц') cycleWeather();
  else if (k === 'e' || k === 'у') quakeT = 3;
  else if (k === 'u' || k === 'г') spawnUfo();
});

/* Главный цикл */
let lastT = performance.now(), clockCache = '', cdCache = '';

function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now; elapsed += dt; tNorm = (tNorm + dt / CYCLE) % 1;
  const sky = sampleSky(tNorm), darkness = 1 - sky.light; lastDarkness = darkness;

  update(dt); updateMeteor(dt); updateWeather(dt); updateFireworks(dt); updateUfos(dt); updateFlocks(dt);

  let shakeAmount = meteor.shake; if (quakeT > 0) shakeAmount = Math.max(shakeAmount, 8);
  const shaking = shakeAmount > 0.5;
  if (shaking) {
    shakeOffsetX = rand(-shakeAmount, shakeAmount); shakeOffsetY = rand(-shakeAmount, shakeAmount);
    ctx.save(); ctx.translate(shakeOffsetX, shakeOffsetY);
  } else { shakeOffsetX = shakeOffsetY = 0; }

  ctx.fillStyle = rgb(sky.bot); ctx.fillRect(-80, -80, W + 160, H + 160);
  const g = ctx.createLinearGradient(0, 0, 0, groundY);
  g.addColorStop(0, rgb(sky.top)); g.addColorStop(1, rgb(sky.bot));
  ctx.fillStyle = g; ctx.fillRect(-80, -80, W + 160, groundY + 80);

  if (sky.stars > 0.01) {
    for (const st of stars) { const tw = 0.55 + 0.45 * Math.sin(elapsed * st.spd + st.ph); ctx.fillStyle = `rgba(255,255,255,${sky.stars * st.a * tw})`; ctx.fillRect(st.x, st.y, st.r, st.r); }
  }

  drawCelestial(tNorm); drawBuildings(sky, darkness, hoveredBuilding); drawTrafficLights();
  drawRoad(sky); drawSidewalk(sky); drawStreetlights(darkness, hoveredLight); drawCrater(); drawBirds();
  drawPeople(); drawCars(darkness); drawUfos(); drawFireworks(); drawRain(); drawSnow(); drawLightnings();
  drawMeteorTrail(); drawBoomParticles(); drawShockwave(); drawRipples();

  if (shaking) ctx.restore();
  drawFog();
  if (lightningFlash > 0) { ctx.fillStyle = `rgba(200,220,255,${lightningFlash * 0.4})`; ctx.fillRect(0, 0, W, H); }
  if (meteor.flash > 0) { ctx.fillStyle = `rgba(255,245,220,${meteor.flash})`; ctx.fillRect(0, 0, W, H); }

  if (grainPattern) { ctx.save(); ctx.globalAlpha = 0.04; ctx.fillStyle = grainPattern; ctx.fillRect(0, 0, W, H); ctx.restore(); }

  const vg = ctx.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.32, W / 2, H * 0.55, Math.max(W, H) * 0.78);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${0.32 + darkness * 0.28})`);
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

  const totalMin = Math.floor(tNorm * 24 * 60), hh = String(Math.floor(totalMin / 60)).padStart(2, '0'), mm = String(totalMin % 60).padStart(2, '0');
  if (`${hh}:${mm}` !== clockCache) { clockCache = `${hh}:${mm}`; clockEl.textContent = clockCache; }

  if (!meteor.triggered) {
    const remain = Math.max(0, CYCLE * 2 - elapsed), s = Math.ceil(remain), cm = String(Math.floor(s / 60)).padStart(2, '0'), cs = String(s % 60).padStart(2, '0'), txt = `☄ ${cm}:${cs}`;
    if (txt !== cdCache) { cdCache = txt; countdownEl.textContent = txt; countdownEl.classList.toggle('urgent', remain <= 10); }
  } else if (countdownEl.style.display !== 'none') countdownEl.style.display = 'none';

  requestAnimationFrame(frame);
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = canvas.clientWidth; H = canvas.clientHeight; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  S = Math.max(0.62, H / 850); groundY = H * 0.70; sidewalkY = groundY; sidewalkH = H * 0.11; roadY = sidewalkY + sidewalkH; roadH = H - roadY;
  generateStars(); generateCity(); generateLights(); initTrafficLights(); generatePeople(); generateCars();
  if (meteor.triggered) meteor.iy = groundY + sidewalkH * 0.4;
  grainPattern = ctx.createPattern(grainCanvas, 'repeat');
}

window.addEventListener('resize', resize);
resize();
requestAnimationFrame(frame);