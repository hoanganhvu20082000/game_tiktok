// Overlay 9:16 "Đi Concert Tinh Hà Say Hi".
// Canvas: trời đêm, màn LED, sân khấu + Nhóm Tinh Hà, khán giả theo khu (thật + Bot Fan), hiệu ứng focus donate.
// DOM   : bài đang phát, Độ cháy, Top Fan, PiP Tier 1, toast, vote bài, hướng dẫn lệnh.
import { ConcertMusic } from './concert_music.js';

const params = new URLSearchParams(location.search);
const WITH_BG = params.get('bg') !== '0';
const W = 1080, H = 1920;
const ctx = document.getElementById('c').getContext('2d');
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

let manifest = { tinhHa: [], anhTrai: [] };
const music = new ConcertMusic();
let state = null;

// ---------- Avatar ----------
function initial(u) { return (String(u?.name || '?').trim()[0] || '?').toUpperCase(); }
function hue(s) { let h = 0; for (const ch of String(s || '')) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; }
function avatarHTML(u, cls = 'av') {
  const h = hue(u?.name);
  const fallback = `<div class="${cls}" style="background:linear-gradient(135deg,hsl(${h} 70% 55%),hsl(${(h + 50) % 360} 70% 45%))">${esc(initial(u))}</div>`;
  if (u?.avatar) return `<img class="${cls}" src="${esc(u.avatar)}" onerror="this.outerHTML=${esc(JSON.stringify(fallback))}">`;
  return fallback;
}
// Ảnh avatar tròn vẽ sẵn ra canvas nhỏ, mỗi frame chỉ drawImage (nhanh hơn clip từng avatar)
const spriteCache = new Map();
function avatarSprite(u) {
  const key = u.id + '|' + (u.avatar || '');
  let s = spriteCache.get(key);
  if (s) return s.canvas;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const h = hue(u.name);
  const grad = g.createLinearGradient(0, 0, 128, 128);
  grad.addColorStop(0, `hsl(${h} 70% 55%)`); grad.addColorStop(1, `hsl(${(h + 50) % 360} 70% 40%)`);
  g.fillStyle = grad; g.beginPath(); g.arc(64, 64, 64, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.font = '900 64px "Be Vietnam Pro", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(initial(u), 64, 70);
  s = { canvas: c };
  spriteCache.set(key, s);
  if (u.avatar) {
    // Không đặt crossOrigin: CDN TikTok không trả CORS; overlay chỉ vẽ, không đọc pixel
    const img = new Image();
    img.onload = () => { g.save(); g.beginPath(); g.arc(64, 64, 64, 0, 7); g.clip(); g.drawImage(img, 0, 0, 128, 128); g.restore(); };
    img.src = u.avatar;
  }
  if (spriteCache.size > 500) spriteCache.delete(spriteCache.keys().next().value);
  return c;
}
const glowCache = new Map();
function glowSprite(color) {
  if (!/^#[0-9a-f]{6}$/i.test(color || '')) color = '#f8fafc';
  if (glowCache.has(color)) return glowCache.get(color);
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  r.addColorStop(0, '#fff'); r.addColorStop(0.25, color); r.addColorStop(1, color + '00');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  glowCache.set(color, c);
  return c;
}

// ---------- Bố cục khu khán giả ----------
const ZONE_META = {
  svip:  { label: 'SVIP', color: '#facc15', rows: [{ y: 1078, n: 6, r: 40, x0: 150, x1: 930 }] },
  vip:   { label: 'VIP', color: '#f472b6', rows: [{ y: 1180, n: 8, r: 32, x0: 120, x1: 960 }, { y: 1255, n: 8, r: 32, x0: 160, x1: 920 }] },
  ga:    { label: 'GA', color: '#38bdf8', rows: [0, 1, 2, 3, 4].map((i) => ({ y: 1345 + i * 56, n: 12, r: 22, x0: 90 + (i % 2) * 20, x1: 990 - (i % 2) * 20 })) },
  stand: { label: 'KHÁN ĐÀI', color: '#a78bfa', rows: [0, 1, 2, 3, 4, 5].map((i) => ({ y: 1640 + i * 38, n: 20, r: 16, x0: 50 + (i % 2) * 12, x1: 1030 - (i % 2) * 12 })) },
};
const ZONE_ORDER = ['svip', 'vip', 'ga', 'stand'];
const seats = {};
const LIGHTS = ['#f472b6', '#38bdf8', '#facc15', '#a78bfa', '#f8fafc', '#ef4444'];
const lightAt = (i) => LIGHTS[((Math.floor(i) % LIGHTS.length) + LIGHTS.length) % LIGHTS.length];
for (const z of ZONE_ORDER) {
  seats[z] = [];
  for (const row of ZONE_META[z].rows) {
    for (let i = 0; i < row.n; i++) {
      const x = row.n === 1 ? (row.x0 + row.x1) / 2 : lerp(row.x0, row.x1, i / (row.n - 1));
      seats[z].push({ zone: z, x: x + rnd(-3, 3), y: row.y + rnd(-3, 3), r: row.r, fan: null, phase: rnd(0, 6.28), botRank: Math.random(),
        botLight: pick(LIGHTS), botHue: Math.floor(rnd(200, 300)), bubble: null, point: null });
    }
  }
  seats[z].byBot = [...seats[z]].sort((a, b) => a.botRank - b.botRank);
}
const fans = new Map(); // uid -> { user, zone, light, seat, lastActive }

function upsertFan(user, zone, light) {
  let f = fans.get(user.id);
  if (!f) { f = { user, zone, light: light || pick(LIGHTS), seat: null, lastActive: 0 }; fans.set(user.id, f); }
  f.user = user; f.zone = zone || f.zone || 'stand'; f.light = light || f.light; f.lastActive = performance.now();
  seatFan(f);
  return f;
}
function seatFan(f) {
  if (f.seat && f.seat.zone === f.zone && f.seat.fan === f.user.id) return f.seat;
  if (f.seat && f.seat.fan === f.user.id) f.seat.fan = null;
  f.seat = null;
  const list = seats[f.zone];
  const empty = list.filter((s) => !s.fan);
  let seat = null;
  if (empty.length) seat = f.zone === 'svip' || f.zone === 'vip' ? empty[0] : pick(empty);
  else {
    // Khu đầy: người lâu không tương tác nhất nhường chỗ
    const last = (s) => fans.get(s.fan)?.lastActive ?? 0;
    let oldest = list[0];
    for (const s of list) if (last(s) < last(oldest)) oldest = s;
    const evicted = fans.get(oldest.fan); if (evicted) evicted.seat = null;
    seat = oldest;
  }
  seat.fan = f.user.id;
  seat.bubble = null;
  f.seat = seat;
  return seat;
}
function seatOf(user) {
  const f = fans.get(user.id) || upsertFan(user, 'stand');
  return f.seat || seatFan(f);
}
// Ghế đang có Bot hiển thị (Bot chỉ lấp ghế trống, số lượng theo server)
function visibleBots(z) {
  const allowed = state?.audience?.zones?.[z]?.bots ?? (ZONE_META[z].rows.reduce((a, r) => a + r.n, 0));
  const out = [];
  for (const s of seats[z].byBot) { if (out.length >= allowed) break; if (!s.fan) out.push(s); }
  return out;
}

// ---------- Hạt hiệu ứng ----------
const parts = [];
function addPart(p) { if (parts.length < 900) parts.push(p); }
function hearts(x, y, n = 3, color = '#f472b6') {
  for (let i = 0; i < n; i++) addPart({ kind: 'heart', x: x + rnd(-10, 10), y, vx: rnd(-0.6, 0.6), vy: rnd(-3.2, -1.8), life: 1, decay: rnd(0.012, 0.02), s: rnd(10, 18), c: color });
}
function confetti(x, y, n = 30) {
  for (let i = 0; i < n; i++) addPart({ kind: 'conf', x, y, vx: rnd(-6, 6), vy: rnd(-12, -4), g: 0.3, life: 1, decay: rnd(0.008, 0.015), s: rnd(6, 12), c: pick(LIGHTS), rot: rnd(0, 6) });
}
function firework(x, y, color) {
  const c = color || pick(LIGHTS);
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2, v = rnd(4, 9);
    addPart({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0.08, drag: 0.97, life: 1, decay: rnd(0.012, 0.02), s: rnd(3, 5), c });
  }
}
function smoke(x, y, n = 14) {
  for (let i = 0; i < n; i++) addPart({ kind: 'smoke', x: x + rnd(-50, 50), y: y + rnd(-20, 20), vx: rnd(-1, 1), vy: rnd(-1.4, -0.3), life: 1, decay: rnd(0.008, 0.014), s: rnd(40, 80) });
}
function heartStream(x0, y0, x1, y1, n = 10) {
  for (let i = 0; i < n; i++) setTimeout(() => addPart({ kind: 'fly', x: x0, y: y0, x0, y0, x1, y1, t: 0, dt: rnd(0.012, 0.018), life: 1, decay: 0, s: rnd(16, 24), c: pick(['#f472b6', '#fb7185', '#facc15']) }), i * 160);
}
function drawHeart(g, x, y, s) {
  g.beginPath(); g.moveTo(x, y + s * 0.3);
  g.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.3);
  g.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.8, x, y + s);
  g.bezierCurveTo(x, y + s * 0.8, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3);
  g.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.3); g.fill();
}
function updateParts(g) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (p.kind === 'fly') {
      p.t += p.dt;
      const t = ease(p.t);
      p.x = lerp(p.x0, p.x1, t); p.y = lerp(p.y0, p.y1, t) - Math.sin(t * Math.PI) * 160;
      if (p.t >= 1) { hearts(p.x1, p.y1, 2); parts.splice(i, 1); continue; }
    } else {
      p.x += p.vx; p.y += p.vy; if (p.g) p.vy += p.g; if (p.drag) { p.vx *= p.drag; p.vy *= p.drag; }
      p.life -= p.decay;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
    }
    g.globalAlpha = clamp(p.life, 0, 1);
    if (p.kind === 'heart' || p.kind === 'fly') { g.fillStyle = p.c; drawHeart(g, p.x, p.y, p.s); }
    else if (p.kind === 'conf') { p.rot += 0.2; g.fillStyle = p.c; g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); g.restore(); }
    else if (p.kind === 'spark') { g.drawImage(glowSprite(p.c), p.x - p.s * 3, p.y - p.s * 3, p.s * 6, p.s * 6); }
    else if (p.kind === 'smoke') { g.globalAlpha = clamp(p.life, 0, 1) * 0.35; const r = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.s); r.addColorStop(0, '#e9d5ff'); r.addColorStop(1, '#e9d5ff00'); g.fillStyle = r; g.fillRect(p.x - p.s, p.y - p.s, p.s * 2, p.s * 2); p.s += 0.6; }
  }
  g.globalAlpha = 1;
}

// ---------- Nhân vật chibi (Nhóm Tinh Hà, khách mời) ----------
function drawChibi(g, x, y, s, look, pose) {
  const { hair = '#1e293b', outfit = '#7c3aed', accent = '#facc15', skin = '#fde2c8', mic = false, silhouette = false } = look;
  const bob = pose.bob || 0, jump = pose.jump || 0;
  g.save(); g.translate(x, y - jump); g.scale(s, s);
  const fill = (c) => { g.fillStyle = silhouette ? '#0b0a1a' : c; };
  // chân
  g.lineCap = 'round'; g.lineWidth = 18; g.strokeStyle = silhouette ? '#0b0a1a' : '#1f2937';
  const step = pose.step || 0;
  g.beginPath(); g.moveTo(-16, -62 + bob); g.lineTo(-20 - step * 8, 0); g.moveTo(16, -62 + bob); g.lineTo(20 + step * 8, 0); g.stroke();
  // tay
  g.lineWidth = 15; g.strokeStyle = silhouette ? '#0b0a1a' : outfit;
  const arm = (side, ang) => { g.beginPath(); g.moveTo(side * 34, -140 + bob); g.lineTo(side * 34 + Math.sin(ang) * 58 * side, -140 + bob + Math.cos(ang) * 58); g.stroke(); };
  arm(-1, pose.armL ?? 0.3); arm(1, pose.armR ?? 0.3);
  // thân
  fill(outfit); roundRect(g, -38, -152 + bob, 76, 96, 22); g.fill();
  if (!silhouette) { g.fillStyle = accent; g.fillRect(-6, -150 + bob, 12, 92); g.fillRect(-38, -78 + bob, 76, 8); }
  // đầu
  fill(skin); g.beginPath(); g.arc(0, -205 + bob, 52, 0, 7); g.fill();
  fill(hair); g.beginPath(); g.arc(0, -214 + bob, 56, Math.PI * 1.02, Math.PI * 1.98); g.fill();
  g.beginPath(); g.moveTo(-54, -220 + bob); g.quadraticCurveTo(-20, -178 + bob, 10, -222 + bob); g.quadraticCurveTo(30, -186 + bob, 54, -214 + bob); g.lineTo(54, -232 + bob); g.lineTo(-54, -232 + bob); g.fill();
  if (!silhouette) {
    g.fillStyle = '#111827';
    g.beginPath(); g.ellipse(-18, -196 + bob, 6, 9, 0, 0, 7); g.ellipse(18, -196 + bob, 6, 9, 0, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(-16, -199 + bob, 2.4, 0, 7); g.arc(20, -199 + bob, 2.4, 0, 7); g.fill();
    g.fillStyle = '#fda4af88'; g.beginPath(); g.ellipse(-32, -180 + bob, 9, 5, 0, 0, 7); g.ellipse(32, -180 + bob, 9, 5, 0, 0, 7); g.fill();
    g.strokeStyle = '#9f1239'; g.lineWidth = 3; g.beginPath(); g.arc(0, -180 + bob, 8, 0.2, Math.PI - 0.2); g.stroke();
  }
  if (mic && !silhouette) { g.fillStyle = '#9ca3af'; g.fillRect(28, -150 + bob, 6, 26); g.fillStyle = '#111'; g.beginPath(); g.arc(31, -152 + bob, 8, 0, 7); g.fill(); }
  g.restore();
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function dancePose(beat, i, energy, frozen) {
  if (frozen) return { bob: 0, armL: 2.6, armR: 2.6, jump: 0, step: 0 };
  const b = beat + i * 0.5;
  const hit = Math.pow(Math.max(0, Math.cos(beat * Math.PI * 2)), 6);
  return {
    bob: Math.abs(Math.sin(b * Math.PI)) * 8 * energy,
    armL: 0.3 + (Math.sin(b * Math.PI) * 0.5 + 0.5) * 2.4 * energy,
    armR: 0.3 + (Math.cos(b * Math.PI) * 0.5 + 0.5) * 2.4 * energy,
    jump: energy > 0.9 ? hit * 26 : 0,
    step: Math.sin(b * Math.PI),
  };
}

// ---------- Sân khấu ----------
const STAGE = { floorY: 1000, members: [210, 375, 540, 705, 870], memberY: 905, guestSlots: [300, 540, 780], guestY: 990, led: { x: 140, y: 236, w: 800, h: 320 } };
const skyStars = Array.from({ length: 120 }, () => ({ x: rnd(0, W), y: rnd(0, 700), r: rnd(0.6, 2.2), p: rnd(0, 6) }));
let skyStatic = null;
function buildStatic() {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  if (WITH_BG) {
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#0b0322'); grad.addColorStop(0.35, '#1e0b3b'); grad.addColorStop(0.55, '#2a0d3f'); grad.addColorStop(1, '#090314');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
  }
  // khung truss
  g.strokeStyle = '#3f3f5a'; g.lineWidth = 10;
  g.strokeRect(70, 200, 940, 640);
  g.lineWidth = 3; g.strokeStyle = '#5b5b7a';
  for (let x = 70; x < 1010; x += 40) { g.beginPath(); g.moveTo(x, 195); g.lineTo(x + 20, 205); g.lineTo(x + 40, 195); g.stroke(); }
  // nền sau sân khấu
  const back = g.createLinearGradient(0, 560, 0, STAGE.floorY);
  back.addColorStop(0, '#1b1036'); back.addColorStop(1, '#3b0f4f');
  g.fillStyle = back; g.fillRect(75, 560, 930, STAGE.floorY - 600);
  // sàn sân khấu
  const floor = g.createLinearGradient(0, 880, 0, STAGE.floorY + 40);
  floor.addColorStop(0, '#2e1065'); floor.addColorStop(1, '#0f0524');
  g.fillStyle = floor; g.beginPath(); g.moveTo(90, 880); g.lineTo(990, 880); g.lineTo(1060, STAGE.floorY + 40); g.lineTo(20, STAGE.floorY + 40); g.closePath(); g.fill();
  g.strokeStyle = '#c084fc'; g.lineWidth = 4; g.beginPath(); g.moveTo(20, STAGE.floorY + 40); g.lineTo(1060, STAGE.floorY + 40); g.stroke();
  // rào chắn trước khu khán giả
  g.fillStyle = '#111827'; g.fillRect(0, STAGE.floorY + 44, W, 10);
  // nhãn khu
  for (const z of ZONE_ORDER) {
    const m = ZONE_META[z]; const y0 = m.rows[0].y - m.rows[0].r - 10, y1 = m.rows.at(-1).y + m.rows.at(-1).r + 8;
    g.fillStyle = m.color + '14'; g.fillRect(0, y0, W, y1 - y0);
    g.fillStyle = m.color; g.font = '800 18px "Be Vietnam Pro", sans-serif'; g.fillText(m.label, 12, y0 + 18);
  }
  skyStatic = c;
}

function drawLasers(g, t, beat, intensity) {
  if (intensity < 0.5) return;
  g.save(); g.globalCompositeOperation = 'lighter';
  const n = intensity >= 1 ? 6 : 3;
  for (let i = 0; i < n; i++) {
    for (const [ox, dir] of [[90, 1], [990, -1]]) {
      const a = Math.PI / 2 + dir * (0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t / 900 + i * 1.3 + beat * 0.25)));
      const c = lightAt(i + Math.floor(beat / 4));
      g.strokeStyle = c + '55'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(ox, 230); g.lineTo(ox - Math.cos(a) * 1900, 230 + Math.sin(a) * 1900); g.stroke();
    }
  }
  g.restore();
}

function drawFrontLights(g, beat) {
  for (let i = 0; i < 14; i++) {
    const x = 60 + i * 74;
    const on = (Math.floor(beat) + i) % 2 === 0;
    const c = lightAt(i + Math.floor(beat / 2));
    g.drawImage(glowSprite(c), x - (on ? 26 : 14), STAGE.floorY + 26 - (on ? 26 : 14), on ? 52 : 28, on ? 52 : 28);
  }
}

// ---------- Màn LED ----------
let ledMsg = null; // { user, l1, l2, until, color }
let chantUntil = 0;
function drawLED(g, t, bt) {
  const { x, y, w, h } = STAGE.led;
  g.save();
  g.fillStyle = '#05010f'; roundRect(g, x - 10, y - 10, w + 20, h + 20, 18); g.fill();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  const bg = g.createLinearGradient(x, y, x + w, y + h);
  bg.addColorStop(0, '#1e1b4b'); bg.addColorStop(1, '#4a044e');
  g.fillStyle = bg; g.fillRect(x, y, w, h);
  const now = performance.now();
  if (ledMsg && now < ledMsg.until) {
    const sp = avatarSprite(ledMsg.user);
    const r = 110 + Math.sin(t / 150) * 4;
    g.drawImage(glowSprite(ledMsg.color), x + 40, y + h / 2 - 170, 340, 340);
    g.drawImage(sp, x + 210 - r, y + h / 2 - r, r * 2, r * 2);
    g.strokeStyle = ledMsg.color; g.lineWidth = 8; g.beginPath(); g.arc(x + 210, y + h / 2, r, 0, 7); g.stroke();
    g.fillStyle = '#fff'; g.font = '900 46px "Be Vietnam Pro", sans-serif'; g.textBaseline = 'middle';
    fitText(g, ledMsg.l1, x + 360, y + h / 2 - 40, w - 390);
    g.fillStyle = ledMsg.color; g.font = '800 34px "Be Vietnam Pro", sans-serif';
    fitText(g, ledMsg.l2, x + 360, y + h / 2 + 30, w - 390);
  } else {
    // visualizer theo nhịp
    const bars = 32;
    for (let i = 0; i < bars; i++) {
      const v = (0.3 + 0.7 * Math.abs(Math.sin(bt.beat * Math.PI * 0.5 + i * 0.55) * Math.cos(i * 0.31 + bt.beat * 0.25))) * (0.4 + bt.intensity * 0.6);
      const bh = v * h * 0.8;
      g.fillStyle = `hsl(${(i * 9 + bt.beat * 10) % 360} 90% 60%)`;
      g.fillRect(x + 10 + i * (w - 20) / bars, y + h - bh, (w - 20) / bars - 6, bh);
    }
    const chant = now < chantUntil;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#fff'; g.shadowColor = '#f472b6'; g.shadowBlur = 30;
    g.font = `900 ${chant ? 96 : 84}px "Be Vietnam Pro", sans-serif`;
    const pulse = 1 + Math.pow(Math.max(0, Math.cos(bt.beat * Math.PI * 2)), 8) * 0.06;
    g.save(); g.translate(x + w / 2, y + h / 2 - 20); g.scale(pulse, pulse);
    g.fillText(chant ? (Math.floor(bt.beat) % 2 ? 'TINH HÀ!' : 'SAY HI!') : 'TINH HÀ SAY HI', 0, 0);
    g.restore();
    g.shadowBlur = 0; g.font = '700 28px "Be Vietnam Pro", sans-serif'; g.fillStyle = '#fbcfe8';
    g.fillText(chant ? 'Cả sân cùng hô!' : (state?.nowPlaying?.title || ''), x + w / 2, y + h / 2 + 60);
    g.textAlign = 'left';
  }
  // lưới điểm ảnh LED
  g.fillStyle = '#0000002a';
  for (let yy = y; yy < y + h; yy += 6) g.fillRect(x, yy, w, 2);
  g.restore();
}
function fitText(g, text, x, y, maxW) {
  let s = String(text || '');
  while (s.length > 1 && g.measureText(s).width > maxW) s = s.slice(0, -2) + '…';
  g.fillText(s, x, y);
}

// ---------- Camera + Focus ----------
const cam = { x: W / 2, y: H / 2, s: 1, tx: W / 2, ty: H / 2, ts: 1, k: 0.08 };
let focus = null;   // { f, t0, seat }
let anhTrai = [];   // [{ x, y, idx, t0, dur, side }]
let flyGuest = null; // { user, from, to, t0, dur }
let darkness = 0, darkTarget = 0, spot = null; // spot: {x,y,r,color}
let frozenUntil = 0;

function camTo(x, y, s, k = 0.08) {
  const hw = W / 2 / s, hh = H / 2 / s;
  cam.tx = clamp(x, hw, W - hw); cam.ty = clamp(y, hh, H - hh); cam.ts = s; cam.k = k;
}
function toScreen(x, y) { return { x: (x - cam.x) * cam.s + W / 2, y: (y - cam.y) * cam.s + H / 2 }; }

function startFocus(f) {
  const seat = seatOf(f.user);
  const t0 = performance.now();
  focus = { f, t0, seat, shown: {} };
  flyGuest = null; anhTrai = []; darkTarget = 0;
  bumpBotsNear(seat, f.tier);
  if (f.tier === 1) { music.ting(); }
  if (f.tier === 2) {
    ledMsg = { user: f.user, l1: f.user.name, l2: `🎁 ${f.gift.name || 'Quà'} · cảm ơn bạn!`, until: t0 + f.durationSec * 1000, color: '#38bdf8' };
    music.ting();
  }
  if (f.tier === 3) {
    ledMsg = { user: f.user, l1: `Cảm ơn @${f.user.name}`, l2: '💖 Anh Trai gửi lời cảm ơn', until: t0 + f.durationSec * 1000, color: '#f472b6' };
    music.whoosh();
  }
  if (f.tier === 4) {
    ledMsg = { user: f.user, l1: `@${f.user.name}`, l2: '⭐ LÊN SÂN KHẤU CÙNG CÁC ANH TRAI', until: t0 + f.durationSec * 1000, color: '#facc15' };
    music.fanfare();
  }
  const a = f.anhTraiAppearance;
  if (a?.enabled) {
    setTimeout(() => {
      if (focus?.f.focusId !== f.focusId) return;
      const now = performance.now();
      const dur = a.durationSec * 1000;
      if (a.members === 'ALL') {
        const slotX = STAGE.guestSlots[f.stageSlot ?? 1] ?? 540;
        const offs = [-230, -120, 120, 230, 0];
        anhTrai = manifestAnh().map((m, i) => ({ x: clamp(slotX + offs[i % offs.length], 110, 970), y: i === 4 ? STAGE.memberY - 20 : STAGE.guestY - 10, idx: i, t0: now, dur, scale: i === 4 ? 0.95 : 1.05 }));
        setTimeout(() => { flash(); music.shutter(); frozenUntil = performance.now() + 500; polaroid(`Tinh Hà Say Hi · @${f.user.name}`); }, 500);
      } else {
        const side = a.members % 2 ? -1 : 1;
        const x = side > 0 ? 960 : 120;
        anhTrai = [{ x, y: STAGE.guestY - 6, idx: a.members % Math.max(1, manifestAnh().length), t0: now, dur, scale: 1.1 }];
        const st = seatOf(f.user);
        heartStream(x, STAGE.guestY - 200, st.x, st.y, 12);
      }
      for (const p of anhTrai) smoke(p.x, p.y - 60, 12);
      music.whoosh();
      setTimeout(() => { for (const p of anhTrai) smoke(p.x, p.y - 60, 10); }, dur - 300);
    }, a.startAtSec * 1000);
  }
}
function manifestAnh() { return manifest.anhTrai?.length ? manifest.anhTrai : Array.from({ length: 5 }, () => ({ name: 'Anh Trai', image: '' })); }

function updateFocus(now) {
  if (!focus) {
    darkTarget = 0; spot = null; flyGuest = null;
    const bt = music.getBeat();
    camTo(W / 2, H / 2, bt.drop ? 1 + Math.pow(Math.max(0, Math.cos(bt.beat * Math.PI * 2)), 10) * 0.015 : 1, 0.05);
    return;
  }
  const { f, t0 } = focus;
  const seat = fans.get(f.user.id)?.seat || focus.seat;
  const el = (now - t0) / 1000;
  if (el > f.durationSec) { focus = null; spot = null; return; }
  if (f.tier === 1) {
    camTo(seat.x, seat.y - 60, 1.55, el < 0.3 ? 0.3 : 0.12);
  } else if (f.tier === 2) {
    camTo((seat.x + 540) / 2, (seat.y + 700) / 2, 1.2, 0.1);
    spot = { x: seat.x, y: seat.y, r: 90, color: '#bae6fd', fromX: 540, fromY: 200 };
  } else if (f.tier === 3) {
    const a = f.anhTraiAppearance;
    const gateX = a.members % 2 ? 120 : 960;
    if (el < a.startAtSec) camTo(gateX, 800, 1.35, 0.1);
    else camTo(W / 2, (seat.y + 800) / 2, 1.05, 0.08);
    spot = { x: seat.x, y: seat.y, r: 80, color: '#fbcfe8', fromX: gateX, fromY: 300 };
  } else if (f.tier === 4) {
    const slotX = STAGE.guestSlots[f.stageSlot ?? 1] ?? 540;
    if (el < 1.5) {
      darkTarget = 0.72; camTo(seat.x, seat.y - 40, 1.45, 0.1);
      spot = { x: seat.x, y: seat.y, r: 110, color: '#fde68a', fromX: 540, fromY: 200 };
    } else if (el < 3) {
      if (!flyGuest) flyGuest = { user: f.user, from: { x: seat.x, y: seat.y }, to: { x: slotX, y: STAGE.guestY }, t0: t0 + 1500, dur: 1500 };
      const p = guestFlyPos(now);
      camTo(p.x, p.y - 80, 1.2, 0.1);
      spot = { x: p.x, y: p.y, r: 120, color: '#fde68a', fromX: 540, fromY: 200 };
    } else {
      flyGuest = null;
      if (!focus.shown.fw) { focus.shown.fw = true; for (let i = 0; i < 5; i++) setTimeout(() => firework(rnd(150, 930), rnd(300, 700)), i * 350); confetti(slotX, 700, 80); music.cheer(); }
      darkTarget = el < 6 ? 0.45 : 0;
      camTo(slotX, 820, el < 6 ? 1.15 : 1, 0.06);
      spot = el < 6 ? { x: slotX, y: STAGE.guestY - 100, r: 260, color: '#fde68a', fromX: 540, fromY: 200 } : null;
    }
  }
}
function guestFlyPos(now) {
  if (!flyGuest) return { x: 540, y: 900 };
  const t = ease((now - flyGuest.t0) / flyGuest.dur);
  return { x: lerp(flyGuest.from.x, flyGuest.to.x, t), y: lerp(flyGuest.from.y, flyGuest.to.y, t) - Math.sin(t * Math.PI) * 260 };
}

function bumpBotsNear(seat, tier) {
  const lines = ['Đỉnh quá!', 'Chị đẹp ơi!', 'Wow!', 'Quá chịu chơi!', 'Cảm ơn bạn!', 'Xịn xò!'];
  const n = tier >= 3 ? 4 : tier === 2 ? 2 : 1;
  const near = ZONE_ORDER.flatMap((z) => visibleBots(z)).filter((s) => Math.hypot(s.x - seat.x, s.y - seat.y) < 320)
    .sort(() => Math.random() - 0.5).slice(0, n);
  const now = performance.now();
  for (const s of near) { s.bubble = { text: pick(lines), until: now + 2600, bot: true }; s.point = { x: seat.x, y: seat.y, until: now + 3000 }; }
  for (const z of ZONE_ORDER) for (const s of seats[z]) if (Math.hypot(s.x - seat.x, s.y - seat.y) < 260) s.point = { x: seat.x, y: seat.y, until: now + 3000 };
}

// ---------- Vẽ khán giả ----------
function drawAudience(g, bt, now) {
  const chant = now < chantUntil;
  const amp = 0.15 + bt.intensity * 0.45;
  const lv = state?.botLevel ?? 1;
  for (const z of ZONE_ORDER) {
    const bots = new Set(visibleBots(z));
    for (const s of seats[z]) {
      const fan = s.fan ? fans.get(s.fan) : null;
      const isBot = !fan && bots.has(s);
      if (!fan && !isBot) continue;
      const focused = focus && fan && focus.f.user.id === fan.user.id && !(flyGuest && flyGuest.user.id === fan.user.id);
      if (flyGuest && fan && flyGuest.user.id === fan.user.id) continue;
      // Fan đang đứng trên sân khấu thì ghế để trống (trừ 1,5s đầu Tier 4 khi spotlight còn soi tại chỗ)
      const stillInSeat = focused && focus.f.tier === 4 && now - focus.t0 < 1500;
      if (fan && !stillInSeat && state?.stageGuests?.some((gst) => gst.user.id === fan.user.id)) continue;
      const r = s.r;
      const light = fan ? fan.light : s.botLight;
      // góc lightstick
      let ang = Math.sin(bt.beat * Math.PI + s.phase * 0.3) * amp * (isBot ? 0.4 + lv * 0.6 : 1);
      if (chant) ang += Math.sin(bt.beat * Math.PI * 0.5 - s.x / 160) * 0.7;
      if (s.point && now < s.point.until) ang = lerp(ang, Math.atan2(s.point.x - s.x, -(s.point.y - s.y)) * 0.8, 0.8);
      const bob = Math.abs(Math.sin(bt.beat * Math.PI + s.phase)) * r * 0.12 * (bt.intensity + 0.3);
      const y = s.y - bob;
      // thân
      g.fillStyle = isBot ? '#374151' : '#1f1147';
      g.beginPath(); g.ellipse(s.x, y + r * 1.15, r * 0.95, r * 0.6, 0, Math.PI, 0); g.fill();
      // lightstick
      const lx = s.x + r * 0.75, ly = y + r * 0.5;
      const ex = lx + Math.sin(ang) * r * 1.7, ey = ly - Math.cos(ang) * r * 1.7;
      g.strokeStyle = '#d1d5db'; g.lineWidth = Math.max(2, r * 0.14); g.beginPath(); g.moveTo(lx, ly); g.lineTo(ex, ey); g.stroke();
      const gr = r * (fan ? 1.1 : 0.8);
      g.drawImage(glowSprite(light), ex - gr, ey - gr, gr * 2, gr * 2);
      // đầu
      if (fan) {
        const sc = focused && focus.f.tier === 1 ? 1 + 2 * ease(((now - focus.t0) / 1000) / 0.25) : 1;
        const rr = r * sc;
        if (focused) g.drawImage(glowSprite(focus.f.tier === 1 ? '#f472b6' : '#facc15'), s.x - rr * 2, y - rr * 2, rr * 4, rr * 4);
        g.drawImage(avatarSprite(fan.user), s.x - rr, y - rr, rr * 2, rr * 2);
        g.strokeStyle = focused ? (focus.f.tier === 1 ? '#f472b6' : '#facc15') : light; g.lineWidth = focused ? 6 : Math.max(2, r * 0.13);
        g.beginPath(); g.arc(s.x, y, rr, 0, 7); g.stroke();
        if (focused || z === 'svip' || z === 'vip') {
          g.font = `800 ${focused ? 30 : Math.round(r * 0.5)}px "Be Vietnam Pro", sans-serif`; g.textAlign = 'center';
          g.fillStyle = '#000a'; const label = String(fan.user.name).slice(0, focused ? 24 : 10);
          const tw = g.measureText(label).width + 14; g.fillRect(s.x - tw / 2, y + rr + 4, tw, focused ? 38 : r * 0.62);
          g.fillStyle = '#fff'; g.fillText(label, s.x, y + rr + (focused ? 32 : r * 0.5)); g.textAlign = 'left';
        }
      } else {
        // Bot: đầu minh họa chung, viền xám để phân biệt với người thật
        g.fillStyle = `hsl(${s.botHue} 12% 62%)`; g.beginPath(); g.arc(s.x, y, r * 0.86, 0, 7); g.fill();
        g.fillStyle = '#1f2937'; g.beginPath(); g.arc(s.x, y - r * 0.2, r * 0.9, Math.PI * 1.05, Math.PI * 1.95); g.fill();
        g.strokeStyle = '#9ca3af'; g.lineWidth = Math.max(1.5, r * 0.1); g.beginPath(); g.arc(s.x, y, r * 0.86, 0, 7); g.stroke();
      }
      if (s.bubble && now < s.bubble.until) drawBubble(g, s.x, y - r - 8, s.bubble.text, s.bubble.bot, r);
    }
  }
}
function drawBubble(g, x, y, text, bot, r) {
  const fs = Math.max(18, Math.round(r * 0.75));
  g.font = `700 ${fs}px "Be Vietnam Pro", sans-serif`;
  const t = String(text).slice(0, 28);
  const w = g.measureText(t).width + 22, h = fs + 14;
  const bx = clamp(x - w / 2, 6, W - w - 6), by = y - h - 6;
  g.fillStyle = bot ? '#4b5563ee' : '#ffffffee'; roundRect(g, bx, by, w, h, h / 2); g.fill();
  g.beginPath(); g.moveTo(x - 6, by + h); g.lineTo(x + 6, by + h); g.lineTo(x, by + h + 8); g.fill();
  g.fillStyle = bot ? '#f3f4f6' : '#111827'; g.fillText(t, bx + 11, by + h - 9);
}

// ---------- Vẽ sân khấu ----------
function drawStage(g, t, bt, now) {
  const frozen = now < frozenUntil;
  const energy = 0.45 + bt.intensity * 0.55;
  // ánh sáng nền sau sân khấu theo nhịp
  const pulse = Math.pow(Math.max(0, Math.cos(bt.beat * Math.PI * 2)), 6) * bt.intensity;
  g.globalAlpha = 0.25 + pulse * 0.35;
  g.drawImage(glowSprite(lightAt(bt.beat / 4)), 140, 560, 800, 440);
  g.globalAlpha = 1;
  // Nhóm Tinh Hà
  const members = manifest.tinhHa?.length ? manifest.tinhHa : [{}, {}, {}, {}, {}];
  STAGE.members.forEach((x, i) => {
    const look = members[i % members.length] || {};
    drawChibi(g, x, STAGE.memberY, 0.95, look, dancePose(bt.beat, i, energy, frozen));
    g.font = '800 20px "Be Vietnam Pro", sans-serif'; g.textAlign = 'center'; g.fillStyle = '#e9d5ff';
    g.fillText(look.name || 'Tinh Hà', x, STAGE.memberY + 26); g.textAlign = 'left';
  });
  // Khách mời Tier 4 trên sân khấu
  for (const gst of state?.stageGuests || []) {
    if (flyGuest && flyGuest.user.id === gst.user.id) continue;
    // 3s đầu Tier 4: fan còn ở chỗ ngồi / đang bay lên, chưa vẽ trên sân khấu
    if (focus && focus.f.tier === 4 && focus.f.user.id === gst.user.id && now - focus.t0 < 3000) continue;
    drawGuest(g, STAGE.guestSlots[gst.slot] ?? 540, STAGE.guestY, gst.user, dancePose(bt.beat, gst.slot + 2, energy, frozen), 1);
  }
  // Fan đang bay lên sân khấu
  if (flyGuest) { const p = guestFlyPos(now); drawGuest(g, p.x, p.y + 40, flyGuest.user, { bob: 0, armL: 2.4, armR: 2.4 }, 0.9); }
  // Anh Trai (chỉ 3s ở Tier 3/4)
  anhTrai = anhTrai.filter((a) => now < a.t0 + a.dur);
  for (const a of anhTrai) {
    const el = now - a.t0;
    const alpha = Math.min(1, el / 300, (a.dur - el) / 300);
    g.globalAlpha = clamp(alpha, 0, 1);
    drawAnhTrai(g, a, bt, frozen);
    g.globalAlpha = 1;
  }
  drawFrontLights(g, bt.beat);
}
const anhImgCache = new Map();
function drawAnhTrai(g, a, bt, frozen) {
  const info = manifestAnh()[a.idx] || {};
  g.drawImage(glowSprite('#facc15'), a.x - 150, a.y - 330, 300, 360);
  if (info.image) {
    let img = anhImgCache.get(info.image);
    if (!img) { img = new Image(); img.src = info.image; anhImgCache.set(info.image, img); }
    if (img.complete && img.naturalWidth) {
      const h = 300 * a.scale, w = h * img.naturalWidth / img.naturalHeight;
      g.drawImage(img, a.x - w / 2, a.y - h, w, h);
    }
  } else {
    // Hình bóng không nhận diện được + viền vàng
    g.save(); g.shadowColor = '#facc15'; g.shadowBlur = 26;
    drawChibi(g, a.x, a.y, a.scale, { silhouette: true }, frozen ? { bob: 0, armL: 2.7, armR: 0.4 } : { bob: Math.abs(Math.sin(bt.beat * Math.PI)) * 5, armL: 2.6, armR: 0.5 + Math.abs(Math.sin(bt.beat * Math.PI)) * 0.6 });
    g.restore();
  }
  g.font = '900 24px "Be Vietnam Pro", sans-serif'; g.textAlign = 'center'; g.fillStyle = '#facc15';
  g.fillText(info.name || 'Anh Trai', a.x, a.y + 30); g.textAlign = 'left';
}
function drawGuest(g, x, y, user, pose, s) {
  drawChibi(g, x, y, s, { outfit: '#facc15', accent: '#fff7d6', hair: '#00000000', skin: '#00000000' }, pose);
  const r = 54 * s, hy = y - (pose.jump || 0) + (-205 + (pose.bob || 0)) * s;
  g.drawImage(glowSprite('#facc15'), x - r * 2, hy - r * 2, r * 4, r * 4);
  g.drawImage(avatarSprite(user), x - r, hy - r, r * 2, r * 2);
  g.strokeStyle = '#facc15'; g.lineWidth = 6; g.beginPath(); g.arc(x, hy, r, 0, 7); g.stroke();
  g.font = `${Math.round(40 * s)}px serif`; g.textAlign = 'center'; g.fillText('👑', x, hy - r - 6);
  g.font = '900 22px "Be Vietnam Pro", sans-serif'; g.fillStyle = '#000b';
  const label = '⭐ ' + String(user.name).slice(0, 16); const tw = g.measureText(label).width + 16;
  g.fillRect(x - tw / 2, y + 6, tw, 30); g.fillStyle = '#facc15'; g.fillText(label, x, y + 29); g.textAlign = 'left';
}

function drawSpot(g) {
  if (!spot) return;
  g.save(); g.globalCompositeOperation = 'lighter';
  const grad = g.createLinearGradient(spot.fromX, spot.fromY, spot.x, spot.y);
  grad.addColorStop(0, spot.color + '00'); grad.addColorStop(1, spot.color + '55');
  g.fillStyle = grad;
  g.beginPath(); g.moveTo(spot.fromX - 20, spot.fromY); g.lineTo(spot.fromX + 20, spot.fromY); g.lineTo(spot.x + spot.r, spot.y); g.lineTo(spot.x - spot.r, spot.y); g.closePath(); g.fill();
  g.globalAlpha = 0.6; g.drawImage(glowSprite(spot.color), spot.x - spot.r * 1.4, spot.y - spot.r * 0.7, spot.r * 2.8, spot.r * 1.4);
  g.restore();
}

// ---------- Vòng lặp vẽ ----------
let lastDrop = false;
// Lỗi vẽ 1 frame không được làm đứng cả overlay khi đang live
function frame(t) {
  try { draw(t); } catch (err) { console.error('[frame]', err); }
  requestAnimationFrame(frame);
}
function draw(t) {
  const now = performance.now();
  const bt = music.getBeat();
  if (bt.drop && !lastDrop) chantUntil = now + 6000; // vào điệp khúc: cả sân hô + sóng lightstick
  lastDrop = bt.drop;

  updateFocus(now);
  cam.x = lerp(cam.x, cam.tx, cam.k); cam.y = lerp(cam.y, cam.ty, cam.k); cam.s = lerp(cam.s, cam.ts, cam.k);
  darkness = lerp(darkness, darkTarget, 0.08);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.setTransform(cam.s, 0, 0, cam.s, W / 2 - cam.x * cam.s, H / 2 - cam.y * cam.s);
  if (skyStatic) ctx.drawImage(skyStatic, 0, 0);
  if (WITH_BG) for (const s of skyStars) { ctx.globalAlpha = 0.3 + Math.sin(t / 700 + s.p) * 0.3; ctx.fillStyle = '#fff'; ctx.fillRect(s.x, s.y, s.r, s.r); }
  ctx.globalAlpha = 1;
  drawLasers(ctx, t, bt.beat, bt.intensity);
  drawLED(ctx, t, bt);
  drawStage(ctx, t, bt, now);
  drawAudience(ctx, bt, now);
  drawSpot(ctx);
  updateParts(ctx);

  // Tier 4: tắt đèn toàn sân, chừa vòng sáng quanh người được soi
  if (darkness > 0.02) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const c = spot ? toScreen(spot.x, spot.y) : { x: W / 2, y: H / 2 };
    const rr = (spot?.r || 100) * cam.s * 1.6;
    const grad = ctx.createRadialGradient(c.x, c.y, rr * 0.5, c.x, c.y, rr * 2.2);
    grad.addColorStop(0, '#00000000'); grad.addColorStop(1, `rgba(0,0,0,${darkness})`);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
  }
}

// ---------- Giọng đọc (hàng đợi ưu tiên, hạ nhạc khi đọc) ----------
const voice = { queue: [], playing: null, last: 0 };
function say({ text, priority = 3, audio }) {
  if (priority >= 3 && Date.now() - voice.last < 5000) return;
  if (priority === 1) { voice.queue = []; voice.playing?.stop(); voice.playing = null; }
  voice.queue.push({ text, priority, audio });
  voice.queue.sort((a, b) => a.priority - b.priority);
  voice.queue = voice.queue.slice(0, 5);
  playNext();
}
function playNext() {
  if (voice.playing || !voice.queue.length) return;
  const item = voice.queue.shift();
  voice.last = Date.now();
  const done = () => { voice.playing = null; music.duck(false); setTimeout(playNext, 300); };
  music.duck(true, item.priority === 1 ? 0.3 : 0.4);
  if (item.audio) {
    const a = new Audio(item.audio); a.onended = a.onerror = done; a.play().catch(done);
    voice.playing = { stop: () => { a.pause(); music.duck(false); } };
  } else if ('speechSynthesis' in window) {
    const u = new SpeechSynthesisUtterance(item.text); u.lang = 'vi-VN';
    const vi = speechSynthesis.getVoices().find((v) => v.lang.startsWith('vi')); if (vi) u.voice = vi;
    u.onend = u.onerror = done; speechSynthesis.speak(u);
    voice.playing = { stop: () => { speechSynthesis.cancel(); music.duck(false); } };
  } else done();
}

// ---------- DOM ----------
function toast(html, cls = '') {
  const d = document.createElement('div');
  d.className = 'toast ' + cls; d.innerHTML = html;
  $('toasts').prepend(d);
  while ($('toasts').children.length > 3) $('toasts').lastChild.remove();
  setTimeout(() => d.remove(), 4500);
}
function addPip(f) {
  const d = document.createElement('div');
  d.className = 'pipi';
  d.innerHTML = `${avatarHTML(f.user)}<div><div class="t">${esc(f.user.name)}</div><div class="g">🌹 ${esc(f.gift?.name || 'Quà')}</div></div>`;
  $('pip').prepend(d);
  while ($('pip').children.length > 4) $('pip').lastChild.remove();
  music.ting();
  hearts(seatOf(f.user).x, seatOf(f.user).y - 20, 4);
  setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 400); }, 2500);
}
function flash() { const f = $('flash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }
function polaroid(text) { const p = $('polaroid'); $('plText').textContent = text; p.classList.remove('on'); void p.offsetWidth; p.classList.add('on'); }
let mcTimer;
function mcLine(text) {
  $('mc').innerHTML = `<small>🎙️ MC ảo</small>${esc(text)}`;
  $('mc').classList.add('on');
  clearTimeout(mcTimer); mcTimer = setTimeout(() => $('mc').classList.remove('on'), 5000);
}
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function renderState(st) {
  state = st;
  music.syncClock(st.serverNow);
  const np = st.nowPlaying;
  if (np) {
    $('npTitle').textContent = np.title;
    $('npSub').textContent = `${np.playlist} · ${np.bpm} BPM · Remix`;
    const total = Math.max(1, (np.endAt - np.startedAt) / 1000);
    const pos = clamp((st.serverNow - np.startedAt) / 1000, 0, total);
    $('npTime').textContent = fmt(Math.max(0, total - pos));
    $('npBar').style.width = `${(pos / total) * 100}%`;
  }
  const pct = Math.round((st.hype / st.hypeGoal) * 100);
  $('hypeFill').style.width = `${pct}%`;
  $('hypeTxt').textContent = `${pct}%`;
  $('hype').classList.toggle('hot', pct >= 80);
  $('topFans').innerHTML = st.topFans.length
    ? `<span class="lbl">Top Fan</span>` + st.topFans.map((f, i) => `<div class="tf">${avatarHTML(f)}<b>${['🥇', '🥈', '🥉'][i]}</b></div>`).join('')
    : `<span class="lbl">Top Fan</span><span style="font-size:20px;opacity:.7">chờ bạn!</span>`;
  const v = st.vote;
  $('vote').classList.toggle('on', !!v);
  if (v) {
    const total = v.options.reduce((a, o) => a + o.votes, 0) || 1;
    const left = Math.max(0, Math.round((v.endsAt - st.serverNow) / 1000));
    $('vote').innerHTML = `<div class="vh"><span>🎶 Chọn bài tiếp theo: gõ !bai 1 / 2 / 3</span><span>${left}s</span></div><div class="vo">` +
      v.options.map((o) => `<div class="op"><i style="width:${(o.votes / total) * 100}%"></i><b>${o.n}</b><span>${esc(o.title)}</span><em>${o.votes} phiếu</em></div>`).join('') + '</div>';
  }
}

const HELP = [
  [['🎫', '!vao', 'vào khu GA'], ['💡', '!light hong/xanh/vang/tim', 'đổi màu lightstick']],
  [['🎶', '!bai 1/2/3', 'chọn bài tiếp theo'], ['❤️', 'Thả tim', 'tăng Độ cháy']],
  [['🌹', '1-9 xu', 'zoom avatar'], ['🍦', '10-99 xu', 'spotlight + màn LED']],
  [['🐶', '100-499 xu', 'Anh Trai xuất hiện'], ['🦁', '≥500 xu', 'lên sân khấu']],
];
let helpIdx = 0;
function renderHelp() {
  const t = state?.tiers;
  const rows = HELP.map((r) => r.map((c) => [...c]));
  if (t) { rows[2][0][1] = `1-${t[1] - 1} xu`; rows[2][1][1] = `${t[1]}-${t[2] - 1} xu`; rows[3][0][1] = `${t[2]}-${t[3] - 1} xu`; rows[3][1][1] = `≥${t[3]} xu`; }
  $('help').innerHTML = rows[helpIdx % rows.length].map(([k, c, d]) => `<div class="cmd">${k} <b>${esc(c)}</b> ${esc(d)}</div>`).join('');
  helpIdx++;
}
setInterval(renderHelp, 5000);

// ---------- Sự kiện từ server ----------
function onFan(ev) {
  const f = upsertFan(ev.user, ev.zone, ev.light);
  const s = f.seat;
  if (!s) return;
  const now = performance.now();
  switch (ev.act) {
    case 'like': if (Math.random() < 0.7) hearts(s.x, s.y - s.r, Math.min(4, 1 + Math.floor((ev.count || 1) / 10)), f.light); break;
    case 'chat': if (ev.text) s.bubble = { text: ev.text, until: now + 3000 }; break;
    case 'follow': confetti(s.x, s.y, 24); toast(`${avatarHTML(ev.user)}<span>➕ <b>${esc(ev.user.name)}</b> vừa thành Fan mới!</span>`, 'follow'); break;
    case 'share': confetti(s.x, s.y, 18); break;
    case 'move': case 'join': for (let i = 0; i < 6; i++) addPart({ kind: 'spark', x: s.x + rnd(-20, 20), y: s.y + rnd(-20, 20), vx: rnd(-1, 1), vy: rnd(-2, 0), life: 1, decay: 0.03, s: 3, c: ZONE_META[f.zone].color }); break;
    case 'light': hearts(s.x, s.y - s.r, 2, f.light); break;
  }
}

function onMessage(ev) {
  switch (ev.event) {
    case 'CONCERT_FULL':
      for (const z of ZONE_ORDER) for (const s of seats[z]) { s.fan = null; s.bubble = null; }
      fans.clear();
      for (const f of ev.fans.slice().reverse()) upsertFan(f.user, f.zone, f.light);
      renderState(ev.state);
      if (ev.nowPlaying) music.play(ev.nowPlaying);
      break;
    case 'CONCERT_STATE': renderState(ev); break;
    case 'NOW_PLAYING':
      music.play(ev);
      if (ev.track) toast(`<span>🎵 <b>${esc(ev.track.title)}</b> · ${esc(ev.playlist?.name || '')}</span>`, 'song');
      break;
    case 'MUSIC_SEEK': music.seek(ev); break;
    case 'MUSIC': music.setEnabled(ev.on); music.setVolume(ev.volume); break;
    case 'FAN': onFan(ev); break;
    case 'FOCUS_EVENT': if (ev.pip) addPip(ev); else startFocus(ev); break;
    case 'STAGE_LEAVE': { const x = STAGE.guestSlots[ev.slot] ?? 540; smoke(x, STAGE.guestY - 80, 10); break; }
    case 'STAGE_CLEAR': for (const x of STAGE.guestSlots) smoke(x, STAGE.guestY - 80, 6); break;
    case 'HYPE_BURST':
      chantUntil = performance.now() + 8000;
      for (let i = 0; i < 10; i++) setTimeout(() => firework(rnd(120, 960), rnd(260, 820)), i * 300);
      confetti(540, 900, 120); music.cheer();
      ledMsg = null;
      break;
    case 'VIP_ENTER': {
      const c = $('carpet');
      c.innerHTML = `${avatarHTML(ev.user)}<span>👑 ${esc(ev.title || 'Fan cứng')} <b>${esc(ev.user.name)}</b> đã tới concert!</span>`;
      c.classList.remove('on'); void c.offsetWidth; c.classList.add('on');
      music.fanfare();
      break;
    }
    case 'BOT_CHAT': {
      const list = visibleBots(ev.zone);
      if (list.length) pick(list).bubble = { text: ev.text, until: performance.now() + 2800, bot: true };
      break;
    }
    case 'MC_LINE': mcLine(ev.text); break;
    case 'SAY': say(ev); break;
  }
}

function connect() {
  const ws = new WebSocket(`ws://${location.host}`);
  ws.onmessage = (m) => onMessage(JSON.parse(m.data));
  ws.onclose = () => setTimeout(connect, 2000);
}

document.addEventListener('click', () => { music.ctx?.resume(); $('soundHint').style.display = 'none'; });
fetch('assets/concert/manifest.json').then((r) => r.json()).then((m) => { manifest = m; }).catch(() => {});
buildStatic();
renderHelp();
requestAnimationFrame(frame);
music.start().then(() => { $('soundHint').style.display = music.ctx?.state === 'running' ? 'none' : 'block'; });
connect();
