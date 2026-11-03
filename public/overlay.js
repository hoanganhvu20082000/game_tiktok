// Overlay 9:16 Phóng Sanh Chim.
// Lớp #sky: cảnh trời (gradient, mặt trời/trăng, núi, mây, sao) - chỉ vẽ khi ?bg=1.
// Lớp #c  : chim, thư chim bay giữa 2 người, Chim Vàng, hạt hiệu ứng.
// DOM     : bảng phe, combo, toast tương tác, spotlight, Bức Tường Lời Nguyện.
import { ZenMusic } from './music.js';

const params = new URLSearchParams(location.search);
const WITH_BG = params.get('bg') === '1';
if (WITH_BG) document.body.classList.add('bg');

const W = 1080, H = 1920;
const ctx = document.getElementById('c').getContext('2d');
const sky = document.getElementById('sky').getContext('2d');
const MAX_BIRDS = 600;
const TEAMS = {};                       // id -> {name, color, icon}
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------- Avatar: ảnh TikTok, hoặc vòng tròn chữ cái đầu ----------
const avatarCache = new Map();
function avatarHTML(u, cls = 'av') {
  if (u?.avatar) return `<img class="${cls}" src="${esc(u.avatar)}" onerror="this.outerHTML='<div class=&quot;${cls}&quot;>${esc(initial(u))}</div>'">`;
  return `<div class="${cls}" style="background:${hueOf(u?.name)}">${esc(initial(u))}</div>`;
}
function initial(u) { return (String(u?.name || '?').trim()[0] || '?').toUpperCase(); }
function hueOf(s) {
  let h = 0; for (const ch of String(s || '')) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `linear-gradient(135deg, hsl(${h} 70% 55%), hsl(${(h + 50) % 360} 70% 45%))`;
}
function avatarImage(u) {
  if (!u?.avatar) return null;
  if (!avatarCache.has(u.avatar)) {
    const img = new Image(); img.crossOrigin = 'anonymous'; img.src = u.avatar;
    avatarCache.set(u.avatar, img);
    if (avatarCache.size > 300) avatarCache.delete(avatarCache.keys().next().value);
  }
  const img = avatarCache.get(u.avatar);
  return img.complete && img.naturalWidth ? img : null;
}

// ---------- Theme theo sự kiện ngày ----------
const THEMES = {
  default:  { sky: ['#1e1b4b', '#6d28d9', '#f472b6', '#fdba74'], sun: '#fde68a', stars: true, hills: ['#3b0764', '#581c87', '#7e22ce'], accent: '#fbbf24', particle: { kind: 'petal', colors: ['#fbcfe8', '#fde68a'], rate: 0.4 } },
  tet:      { sky: ['#450a0a', '#b91c1c', '#f97316', '#fde047'], sun: '#fef08a', hills: ['#450a0a', '#7f1d1d', '#991b1b'], accent: '#fde047', particle: { kind: 'petal', colors: ['#fde047', '#facc15', '#fb7185'], rate: 2 } },
  ram:      { sky: ['#020617', '#0f172a', '#1e1b4b', '#3730a3'], moon: true, hills: ['#020617', '#0f172a', '#1e293b'], accent: '#fef3c7', particle: { kind: 'star', colors: ['#fef9c3', '#e0f2fe'], rate: 0.6 } },
  vulan:    { sky: ['#0c0a1f', '#312e81', '#9d174d', '#f9a8d4'], moon: true, hills: ['#0c0a1f', '#1e1b4b', '#4c1d95'], accent: '#f9a8d4', particle: { kind: 'petal', colors: ['#fbcfe8', '#f9a8d4'], rate: 1 } },
  trungthu: { sky: ['#0f172a', '#1e3a8a', '#c2410c', '#fb923c'], moon: true, hills: ['#0f172a', '#172554', '#1e3a8a'], accent: '#fdba74', particle: { kind: 'lantern', colors: ['#ef4444', '#f97316', '#facc15'], rate: 0.5 } },
  love:     { sky: ['#4a044e', '#9d174d', '#fb7185', '#fecdd3'], sun: '#ffe4e6', hills: ['#4a044e', '#701a75', '#86198f'], accent: '#fda4af', particle: { kind: 'heart', colors: ['#fb7185', '#f472b6', '#fecdd3'], rate: 1.2 } },
  muathi:   { sky: ['#082f49', '#0369a1', '#38bdf8', '#fef08a'], sun: '#fef9c3', hills: ['#082f49', '#0c4a6e', '#075985'], accent: '#7dd3fc', particle: { kind: 'star', colors: ['#bae6fd', '#fef08a'], rate: 0.5 } },
};
let theme = THEMES.default;
let accessory = null;

function applyEvent(dayEvent, lunarLabel) {
  theme = THEMES[dayEvent?.theme] || THEMES.default;
  accessory = dayEvent?.accessory || null;
  document.documentElement.style.setProperty('--accent', theme.accent);
  $('eventBar').textContent = dayEvent ? `${dayEvent.banner}` : `📅 ${lunarLabel || 'Thả chim gửi nguyện ước'}`;
  music.setTheme(dayEvent?.theme);
  buildSkyStatic();
}

// ---------- Cảnh trời ----------
let clouds = [];
let skyStatic = null;     // canvas đã vẽ sẵn gradient + núi để mỗi frame chỉ cần drawImage
const stars = Array.from({ length: 140 }, () => ({ x: Math.random() * W, y: Math.random() * H * 0.6, r: rnd(0.6, 2.2), p: Math.random() * 6 }));

function buildSkyStatic() {
  if (!WITH_BG) return;
  const off = document.createElement('canvas'); off.width = W; off.height = H;
  const g = off.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, H);
  theme.sky.forEach((c, i) => grad.addColorStop(i / (theme.sky.length - 1), c));
  g.fillStyle = grad; g.fillRect(0, 0, W, H);

  // 3 lớp núi xa - gần
  theme.hills.forEach((c, i) => {
    const base = H - 520 + i * 150;
    g.fillStyle = c; g.globalAlpha = 0.75 + i * 0.1;
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 20) {
      const y = base - Math.sin(x / (190 - i * 30) + i * 2) * (70 - i * 12) - Math.sin(x / 63 + i) * 18;
      g.lineTo(x, y);
    }
    g.lineTo(W, H); g.closePath(); g.fill();
  });
  g.globalAlpha = 1;
  skyStatic = off;
  clouds = Array.from({ length: 7 }, (_, i) => ({ x: Math.random() * W, y: 380 + i * 150 + rnd(-40, 40), s: rnd(0.7, 1.5), v: rnd(0.15, 0.45) }));
}

function drawCloud(g, c) {
  g.save(); g.translate(c.x, c.y); g.scale(c.s, c.s); g.globalAlpha = 0.22;
  g.fillStyle = '#fff';
  for (const [x, y, r] of [[0, 0, 60], [55, -20, 50], [105, 0, 55], [50, 18, 55], [-45, 12, 40]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  g.restore();
}

function drawSky(t) {
  if (!WITH_BG || !skyStatic) return;
  sky.drawImage(skyStatic, 0, 0);
  if (theme.moon || theme.stars) {
    for (const s of stars) { sky.globalAlpha = 0.4 + Math.sin(t / 700 + s.p) * 0.35; sky.fillStyle = '#fff'; sky.fillRect(s.x, s.y, s.r, s.r); }
    sky.globalAlpha = 1;
  }
  // mặt trời / trăng
  const cx = 780, cy = 1180;
  const halo = sky.createRadialGradient(cx, cy, 20, cx, cy, 340);
  halo.addColorStop(0, (theme.moon ? '#fefce8' : theme.sun) + 'cc'); halo.addColorStop(1, '#0000');
  sky.fillStyle = halo; sky.fillRect(cx - 340, cy - 340, 680, 680);
  sky.fillStyle = theme.moon ? '#fefce8' : theme.sun;
  sky.beginPath(); sky.arc(cx, cy, theme.moon ? 110 : 130, 0, Math.PI * 2); sky.fill();
  if (theme.moon) { sky.fillStyle = '#0000000d'; sky.beginPath(); sky.arc(cx - 30, cy - 20, 24, 0, 7); sky.arc(cx + 35, cy + 30, 16, 0, 7); sky.fill(); }
  for (const c of clouds) { c.x += c.v; if (c.x > W + 200) c.x = -220; drawCloud(sky, c); }
}

// ---------- Sprite chim ----------
let manifest = { birds: {}, spotlightLottie: {}, music: '' };
const sheets = {};
async function loadSprites() {
  manifest = await fetch('assets/sprites.json').then((r) => r.json());
  await Promise.all(Object.entries(manifest.birds).map(([id, s]) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const off = document.createElement('canvas');
      off.width = s.frameW * s.frames; off.height = s.frameH;
      off.getContext('2d').drawImage(img, 0, 0, off.width, off.height);
      sheets[id] = { ...s, img: off };
      resolve();
    };
    img.onerror = resolve;
    img.src = s.src;
  })));
}

// ---------- Mô phỏng ----------
let birds = [];
let letters = [];        // thư chim bay từ người gửi đến người nhận
let particles = [];
let golden = null;       // Chim Vàng
let blessingUntil = 0;
const NEST = { x: W / 2, y: H - 300 };

function spawnBird(ev, i) {
  const big = ev.tier === 'hac' || ev.tier === 'phuonghoang';
  birds.push({
    tier: ev.tier, userId: ev.user.id,
    x: NEST.x + rnd(-200, 200), y: NEST.y - i * 5,
    vx: rnd(-1.6, 1.6), vy: -rnd(2.4, 4.6) / Math.sqrt(ev.size),
    size: 66 * ev.size,
    team: ev.team ? TEAMS[ev.team]?.color : null,
    t0: Math.random() * 1000,
    label: i === 0 ? (ev.wish || (ev.size >= 1.6 ? ev.user.name : '')) : '',
    glow: big || accessory === 'glow',
    acc: i === 0 || big ? accessory : null,
    life: 0,
  });
  if (birds.length > MAX_BIRDS) birds.splice(0, birds.length - MAX_BIRDS);
  burst(NEST.x, NEST.y - 30, ev.team ? TEAMS[ev.team]?.color : theme.accent, big ? 30 : 6);
}

function burst(x, y, color, n) {
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2, sp = rnd(2, 7);
    particles.push({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, c: color || '#fde68a', s: rnd(3, 7), life: 1 });
  }
}

// Thư chim: bồ câu ngậm phong thư, bay theo đường cong từ góc trái (người gửi) sang góc phải (người nhận)
function spawnLetter(ev) {
  const fromLeft = Math.random() < 0.5;
  const y = rnd(1150, 1450);
  letters.push({
    ...ev, t: 0, dur: 3.2,
    sx: fromLeft ? 120 : W - 120, sy: y,
    ex: fromLeft ? W - 120 : 120, ey: y - rnd(-120, 120),
    cy: y - rnd(380, 520),
  });
}

function drawSpriteBird(tier, x, y, size, t, t0, flip = false) {
  const sheet = sheets[tier] || sheets.se;
  if (!sheet) return;
  const f = Math.floor(((t + t0) / 1000) * sheet.fps) % sheet.frames;
  ctx.save(); ctx.translate(x, y); if (flip) ctx.scale(-1, 1);
  ctx.drawImage(sheet.img, f * sheet.frameW, 0, sheet.frameW, sheet.frameH, -size / 2, -size / 2, size, size);
  ctx.restore();
}

function drawAvatarBubble(u, x, y, r, ring) {
  ctx.save();
  ctx.shadowColor = ring; ctx.shadowBlur = 24;
  ctx.fillStyle = ring; ctx.beginPath(); ctx.arc(x, y, r + 5, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
  const img = avatarImage(u);
  if (img) ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
  else {
    ctx.fillStyle = '#7c3aed'; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.fillStyle = '#fff'; ctx.font = `900 ${r}px 'Be Vietnam Pro'`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(initial(u), x, y + 2);
  }
  ctx.restore();
}

function pill(text, x, y, bg, size = 26) {
  ctx.font = `800 ${size}px 'Be Vietnam Pro', 'Segoe UI'`;
  const w = Math.min(560, ctx.measureText(text).width + 30);
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - size * 0.85, w, size * 1.6, size); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text.length > 34 ? text.slice(0, 33) + '…' : text, x, y);
}

function drawLetters(t, dt) {
  letters = letters.filter((L) => {
    L.t += dt / L.dur;
    const k = Math.min(1, L.t);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const x = (1 - e) ** 2 * L.sx + 2 * (1 - e) * e * W / 2 + e * e * L.ex;
    const y = (1 - e) ** 2 * L.sy + 2 * (1 - e) * e * L.cy + e * e * L.ey;
    const a = Math.min(1, L.t * 4, (1.25 - L.t) * 4);
    ctx.save(); ctx.globalAlpha = Math.max(0, a);

    // đường bay mờ phía sau
    ctx.strokeStyle = '#fbcfe8'; ctx.lineWidth = 3; ctx.setLineDash([8, 14]); ctx.globalAlpha *= 0.5;
    ctx.beginPath(); ctx.moveTo(L.sx, L.sy); ctx.quadraticCurveTo(W / 2, L.cy, L.ex, L.ey); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = Math.max(0, a);

    const fromColor = TEAMS[L.fromTeam]?.color || '#a78bfa';
    const toColor = TEAMS[L.toTeam]?.color || '#f472b6';
    drawAvatarBubble(L.from, L.sx, L.sy, 52, fromColor);
    drawAvatarBubble(L.to, L.ex, L.ey, 52, toColor);
    pill(L.from.name, L.sx, L.sy + 86, '#0009', 22);
    pill(L.to.name, L.ex, L.ey + 86, '#0009', 22);

    drawSpriteBird('bocau', x, y, 110, t, 0, L.ex < L.sx);
    ctx.font = '44px serif'; ctx.textAlign = 'center'; ctx.fillText('💌', x, y + 46);
    if (L.message) pill(`“${L.message}”`, x, y - 82, 'rgba(190,24,93,.85)', 26);
    ctx.restore();

    if (L.t >= 1 && !L.done) { L.done = true; burst(L.ex, L.ey, '#f9a8d4', 26); }
    return L.t < 1.25;
  });
}

function drawGolden(t, dt) {
  if (!golden) return;
  golden.x += golden.vx;
  golden.y = golden.baseY + Math.sin(t / 380) * 80;
  if (golden.x > W + 120 || golden.x < -120) golden.vx *= -1;
  ctx.save();
  ctx.shadowColor = '#fde047'; ctx.shadowBlur = 60;
  ctx.filter = 'sepia(1) saturate(6) hue-rotate(5deg) brightness(1.25)';
  drawSpriteBird('bocau', golden.x, golden.y, 170, t, 0, golden.vx < 0);
  ctx.restore();
  if (Math.random() < 0.6) particles.push({ kind: 'spark', x: golden.x - golden.vx * 6, y: golden.y, vx: -golden.vx * 0.3, vy: rnd(-1, 1), c: '#fde047', s: rnd(3, 6), life: 1 });
}

function drawAccessory(kind, s) {
  if (!kind || kind === 'glow') return;
  ctx.save(); ctx.translate(0, s * 0.42);
  if (kind === 'lantern') {
    ctx.strokeStyle = '#fde68a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, s * 0.15); ctx.stroke();
    ctx.shadowColor = '#fb923c'; ctx.shadowBlur = 20; ctx.fillStyle = '#ef4444';
    ctx.beginPath(); ctx.ellipse(0, s * 0.27, s * 0.1, s * 0.13, 0, 0, Math.PI * 2); ctx.fill();
  } else if (kind === 'lixi') {
    ctx.fillStyle = '#dc2626'; ctx.fillRect(-s * 0.08, s * 0.08, s * 0.16, s * 0.22);
    ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.arc(0, s * 0.19, s * 0.035, 0, Math.PI * 2); ctx.fill();
  } else if (kind === 'heart') {
    ctx.font = `${Math.round(s * 0.28)}px serif`; ctx.textAlign = 'center'; ctx.fillText('❤️', 0, s * 0.3);
  } else if (kind === 'scroll') {
    ctx.fillStyle = '#fef3c7'; ctx.fillRect(-s * 0.12, s * 0.1, s * 0.24, s * 0.1);
    ctx.fillStyle = '#b45309'; ctx.fillRect(-s * 0.14, s * 0.09, s * 0.04, s * 0.12); ctx.fillRect(s * 0.1, s * 0.09, s * 0.04, s * 0.12);
  } else if (kind === 'lotus') {
    ctx.fillStyle = '#f9a8d4';
    for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.ellipse(k * s * 0.04, s * 0.2, s * 0.035, s * 0.09, k * 0.4, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}

function drawBird(b, t) {
  ctx.save();
  ctx.translate(b.x, b.y); ctx.rotate(b.vx * 0.06);
  if (b.glow) { ctx.shadowColor = b.tier === 'phuonghoang' ? '#fb923c' : theme.accent; ctx.shadowBlur = 30; }
  const sheet = sheets[b.tier] || sheets.se;
  if (sheet) {
    const f = Math.floor(((t + b.t0) / 1000) * sheet.fps) % sheet.frames;
    ctx.drawImage(sheet.img, f * sheet.frameW, 0, sheet.frameW, sheet.frameH, -b.size / 2, -b.size / 2, b.size, b.size);
  }
  ctx.shadowBlur = 0;
  if (b.team) { ctx.fillStyle = b.team; ctx.beginPath(); ctx.arc(0, b.size * 0.1, b.size * 0.07, 0, Math.PI * 2); ctx.fill(); }
  drawAccessory(b.acc, b.size);
  ctx.restore();
  if (b.label && b.life < 240) pill(b.label, b.x, b.y + b.size * 0.55 + 18, 'rgba(15,12,40,.7)', 24);
}

// Lồng sen: điểm xuất phát, nhịp sáng theo combo
let comboMult = 1;
function drawNest(t) {
  const { x, y } = NEST;
  const pulse = 1 + Math.sin(t / 260) * 0.04 * comboMult;
  ctx.save(); ctx.translate(x, y); ctx.scale(pulse, pulse);
  const halo = ctx.createRadialGradient(0, 0, 10, 0, 0, 260);
  halo.addColorStop(0, theme.accent + 'aa'); halo.addColorStop(1, '#0000');
  ctx.fillStyle = halo; ctx.fillRect(-260, -260, 520, 520);
  for (let ring = 0; ring < 2; ring++) {
    const n = ring ? 8 : 10, len = ring ? 70 : 105, wdt = ring ? 30 : 40;
    ctx.fillStyle = ring ? '#fbcfe8' : '#f9a8d4';
    for (let i = 0; i < n; i++) {
      ctx.save(); ctx.rotate(-Math.PI / 2 + ((i - (n - 1) / 2) / n) * Math.PI * 1.25);
      ctx.beginPath(); ctx.ellipse(0, -len * 0.6, wdt, len, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
  ctx.fillStyle = '#fde68a'; ctx.shadowColor = '#fde68a'; ctx.shadowBlur = 40;
  ctx.beginPath(); ctx.arc(0, -10, 38, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function spawnAmbient() {
  const p = theme.particle;
  if (p && Math.random() < p.rate * 0.2) {
    particles.push({ kind: p.kind, x: Math.random() * W, y: -30, vx: rnd(-0.5, 0.5), vy: rnd(0.8, 2), rot: Math.random() * 6, c: p.colors[Math.floor(Math.random() * p.colors.length)], s: rnd(8, 16), life: 1 });
  }
  if (performance.now() < blessingUntil) {
    for (let i = 0; i < 5; i++) particles.push({ kind: 'petal', x: Math.random() * W, y: -10, vx: rnd(-1, 1), vy: rnd(3, 7), rot: 0, c: ['#fde68a', '#f9a8d4', '#a5f3fc', '#c4b5fd'][i % 4], s: rnd(8, 14), life: 1 });
  }
}

function drawParticle(p) {
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot || 0); ctx.globalAlpha = Math.max(0, Math.min(1, p.life)); ctx.fillStyle = p.c;
  if (p.kind === 'petal') { ctx.beginPath(); ctx.ellipse(0, 0, p.s * 0.45, p.s, 0, 0, Math.PI * 2); ctx.fill(); }
  else if (p.kind === 'heart') { ctx.font = `${p.s * 2}px serif`; ctx.fillText('💗', 0, 0); }
  else if (p.kind === 'lantern') { ctx.shadowColor = p.c; ctx.shadowBlur = 16; ctx.beginPath(); ctx.ellipse(0, 0, p.s * 0.7, p.s, 0, 0, Math.PI * 2); ctx.fill(); }
  else if (p.kind === 'star') { ctx.beginPath(); ctx.arc(0, 0, p.s * 0.2, 0, Math.PI * 2); ctx.fill(); }
  else { ctx.shadowColor = p.c; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(0, 0, p.s, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

let lastT = 0;
function frame(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016); lastT = t;
  drawSky(t);
  ctx.clearRect(0, 0, W, H);
  spawnAmbient();
  particles = particles.filter((p) => {
    p.x += p.vx; p.y += p.vy; if (p.rot !== undefined) p.rot += 0.02;
    if (p.kind === 'spark') { p.vy += 0.12; p.life -= 0.022; }
    return p.life > 0 && p.y < H + 40;
  });
  if (particles.length > 900) particles.splice(0, particles.length - 900);

  drawNest(t);
  for (const b of birds) {
    b.life++;
    b.vx += Math.sin((t + b.t0) / 700) * 0.05; b.vx *= 0.99;
    b.x += b.vx; b.y += b.vy;
    if (b.x < 40 || b.x > W - 40) b.vx *= -1;
    drawBird(b, t);
  }
  birds = birds.filter((b) => b.y > -140);
  for (const p of particles) drawParticle(p);
  drawGolden(t, dt);
  drawLetters(t, dt);
  requestAnimationFrame(frame);
}

// ---------- Lottie spotlight (tùy chọn) ----------
function playLottie(tier) {
  const url = manifest.spotlightLottie?.[tier];
  if (!url || !window.lottie) return;
  const box = $('lottie'); box.innerHTML = '';
  const anim = window.lottie.loadAnimation({ container: box, renderer: 'svg', loop: false, autoplay: true, path: url });
  anim.addEventListener('complete', () => { anim.destroy(); box.innerHTML = ''; });
}

// ---------- Âm thanh ----------
const music = new ZenMusic();
const voice = { queue: [], playing: null, last: 0 };
function say({ text, priority = 3, audio }) {
  if (priority >= 3 && Date.now() - voice.last < 5000) return;
  if (priority === 1) { voice.queue = []; voice.playing?.stop(); voice.playing = null; }
  voice.queue.push({ text, priority, audio });
  voice.queue.sort((a, b) => a.priority - b.priority);
  voice.queue = voice.queue.slice(0, 4);
  playNext();
}
function playNext() {
  if (voice.playing || !voice.queue.length) return;
  const item = voice.queue.shift();
  voice.last = Date.now();
  const done = () => { voice.playing = null; duck(false); playNext(); };
  duck(true);
  if (item.audio) {
    const a = new Audio(item.audio);
    a.onended = a.onerror = done; a.play().catch(done);
    voice.playing = { stop: () => { a.pause(); duck(false); } };
  } else if ('speechSynthesis' in window) {
    const u = new SpeechSynthesisUtterance(item.text); u.lang = 'vi-VN';
    const vi = speechSynthesis.getVoices().find((v) => v.lang.startsWith('vi')); if (vi) u.voice = vi;
    u.onend = u.onerror = done; speechSynthesis.speak(u);
    voice.playing = { stop: () => { speechSynthesis.cancel(); duck(false); } };
  } else done();
}
function duck(on) {
  if (!music.master) return;
  music.master.gain.setTargetAtTime(music.enabled ? (on ? music.volume * 0.35 : music.volume) : 0, music.ctx.currentTime, 0.3);
}
async function startAudio() {
  await music.start(manifest.music || null);
  $('soundHint').style.display = music.ctx?.state === 'running' ? 'none' : 'block';
}
document.addEventListener('click', () => { music.ctx?.resume(); $('soundHint').style.display = 'none'; });

// ---------- UI ----------
function feed(user, html) {
  const d = document.createElement('div');
  d.className = 'fi';
  d.innerHTML = `${user ? avatarHTML(user) : ''}<span>${html}</span>`;
  $('feed').prepend(d);
  while ($('feed').children.length > 5) $('feed').lastChild.remove();
}

function toast(html, cls = '') {
  const d = document.createElement('div');
  d.className = 'toast ' + cls; d.innerHTML = html;
  $('toasts').prepend(d);
  while ($('toasts').children.length > 3) $('toasts').lastChild.remove();
  setTimeout(() => d.remove(), 5200);
}

let bannerTimer;
function spotlight(user, title, sub, sec) {
  const b = $('banner');
  b.innerHTML = `<div class="ring">${avatarHTML(user, 'av')}</div><div class="bt">${title}</div>${sub ? `<div class="bs">${sub}</div>` : ''}`;
  b.classList.remove('on'); void b.offsetWidth; b.classList.add('on');
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => b.classList.remove('on'), sec * 1000);
}

// Hướng dẫn lệnh: luôn hiện 6 ô, nhấp nháy ô liên quan khi có người dùng
const COMMANDS = [
  { k: '🙏', c: '!suckhoe · !tailoc', d: '!tinhduyen · !hocvan chọn phe' },
  { k: '🕊️', c: '!tha <lời nguyện>', d: 'thả chim, lời nguyện lên trời' },
  { k: '💌', c: '!tang @tên <lời chúc>', d: 'gửi thư chim cho bạn' },
  { k: '✨', c: '!chuc @tên', d: 'chúc phúc, cộng điểm phe bạn ấy' },
  { k: '🐦', c: '!bat', d: 'bắt Chim Vàng khi xuất hiện' },
  { k: '❤️', c: '15 tim = 1 chim', d: 'quà lớn = Hạc / Phượng Hoàng' },
];
$('cmds').innerHTML = COMMANDS.map((c, i) => `<div class="cmd" id="cmd${i}"><div class="k">${c.k}</div><div><b>${esc(c.c)}</b>${esc(c.d)}</div></div>`).join('');
function flashCmd(i) { const el = $('cmd' + i); el.classList.remove('hl'); void el.offsetWidth; el.classList.add('hl'); }

let lastScores = {};
function renderState(s) {
  const m = Math.floor(s.remaining / 60), sec = String(s.remaining % 60).padStart(2, '0');
  $('timerTxt').textContent = s.state === 'RUNNING' ? `${m}:${sec}` : '✨';
  const total = 180;
  $('timerArc').style.strokeDashoffset = String(119.4 * (1 - Math.min(1, s.remaining / total)));

  const sum = s.teams.reduce((a, t) => a + t.score, 0) || 1;
  const leader = [...s.teams].sort((a, b) => b.score - a.score)[0];
  $('race').innerHTML = s.teams.map((t) => `<i style="width:${sum === 1 && t.score === 0 ? 25 : (t.score / sum) * 100}%;background:${t.color}"></i>`).join('');

  $('teams').innerHTML = s.teams.map((t) => {
    TEAMS[t.id] = { name: t.name, color: t.color, icon: t.icon };
    const isLead = leader.score > 0 && t.id === leader.id;
    const bump = lastScores[t.id] !== undefined && t.score > lastScores[t.id] ? ' bump' : '';
    const x = t.multiplier > 1 ? `<div class="x">x${t.multiplier}</div>` : '';
    const top = t.top ? `<div class="tp">${avatarHTML(t.top)}<span>${esc(t.top.name)}</span></div>` : '<div class="tp">&nbsp;</div>';
    const cmd = { suckhoe: '!suckhoe', tailoc: '!tailoc', tinhduyen: '!tinhduyen', hocvan: '!hocvan' }[t.id] || '';
    return `<div class="team${isLead ? ' lead' : ''}${bump}" style="--c:${t.color}">${x}
      <div class="ic">${t.icon || '🕊️'}</div><div class="nm">${esc(t.name)}</div><div class="cmd">${cmd}</div>
      <div class="sc">${t.score.toLocaleString('vi-VN')}</div><div class="mb">👥 ${t.members} người</div>${top}</div>`;
  }).join('');
  lastScores = Object.fromEntries(s.teams.map((t) => [t.id, t.score]));

  $('meter').style.width = Math.min(100, (s.meter / s.meterGoal) * 100) + '%';
  $('meterTxt').textContent = `${s.meter.toLocaleString('vi-VN')} / ${s.meterGoal.toLocaleString('vi-VN')}`;

  $('donorList').innerHTML = s.topDonors.length
    ? s.topDonors.map((d, i) => `<div class="donor"><span class="rk">${['🥇', '🥈', '🥉'][i]}</span>${avatarHTML(d)}<span class="nm">${esc(d.name)}</span><span class="dm">${d.diamonds}💎</span></div>`).join('')
    : '<div class="muted">Tặng quà để thả Hạc, Phượng Hoàng và lên bảng</div>';

  comboMult = s.combo?.mult || 1;
  $('comboMult').textContent = `x${comboMult.toFixed(1)}`;
  $('comboUsers').textContent = `${s.combo?.users || 0} người · 10 giây`;
  $('comboBar').style.width = `${Math.min(100, ((comboMult - 1) / 1) * 100)}%`;
  $('combo').classList.toggle('hot', comboMult > 1);

  if (s.golden) $('goldenCd').textContent = s.golden.remaining;
  if (s.dayEvent?.id !== currentEventId) { currentEventId = s.dayEvent?.id; applyEvent(s.dayEvent, s.lunarLabel); }
}
let currentEventId;

let wallTimer;
function showWall(ev) {
  const list = ev.wishWall || [];
  $('wallWinner').innerHTML = `🏆 Phe <b style="color:${ev.winner.color}">${esc(ev.winner.icon || '')} ${esc(ev.winner.name)}</b> dẫn đầu · ${ev.winner.score.toLocaleString('vi-VN')} điểm phúc · ${ev.totalBirds} chim đã bay`;
  $('wallList').innerHTML = list.length
    ? list.map((w, i) => `<div class="wish" style="--c:${TEAMS[w.team]?.color || '#fde68a'};animation-delay:${0.3 + i * 0.3}s">
        <div class="rank">${['🥇', '🥈', '🥉'][i] || i + 1}</div>${avatarHTML(w)}
        <div class="txt"><div class="w">“${esc(w.wish)}”</div><div class="n">${esc(w.name)}${w.team ? ' · ' + esc(TEAMS[w.team]?.name) : ''}</div></div>
        <div class="p">${w.points}✨<small>${w.blessings ? `🙏 ${w.blessings} lời chúc` : ''}</small></div></div>`).join('')
    : '<div style="text-align:center;font-size:36px;opacity:.8">Đợt này chưa có lời nguyện.<br>Gõ <b>!tha &lt;lời nguyện&gt;</b> ở đợt sau nhé!</div>';
  let left = ev.pauseSec || 20;
  const foot = () => ($('wallFoot').innerHTML = `Đợt mới sau <b>${left}s</b> · <b>!chuc @tên</b> để lời nguyện của bạn bè được xếp cao hơn`);
  foot(); clearInterval(wallTimer);
  wallTimer = setInterval(() => { left--; if (left <= 0) clearInterval(wallTimer); else foot(); }, 1000);
  $('wall').classList.add('on');
}

function onMessage(ev) {
  switch (ev.event) {
    case 'STATE': renderState(ev); break;
    case 'SAY': say(ev); break;
    case 'MUSIC': music.setEnabled(ev.on); music.setVolume(ev.volume); break;

    case 'BIRD_RELEASE': {
      for (let i = 0; i < ev.count; i++) spawnBird(ev, i);
      if (ev.wish) { feed(ev.user, `<b>${esc(ev.user.name)}</b> 🕊️ “${esc(ev.wish)}”`); flashCmd(1); }
      if (ev.spotlight > 0) {
        const sub = ev.to ? `💌 dành tặng <b>${esc(ev.to.name)}</b>` : 'Chúc bạn vạn sự như ý';
        spotlight(ev.user, `${esc(ev.user.name)}<br>phóng sanh ${esc(ev.tierName)}!`, sub, ev.spotlight + 1);
        music.chime(ev.tier === 'phuonghoang' ? 2 : 1);
        playLottie(ev.tier);
      } else if (ev.giftName) {
        feed(ev.user, `<b>${esc(ev.user.name)}</b> thả ${ev.count} ${esc(ev.tierName)}${ev.to ? ` tặng <b>${esc(ev.to.name)}</b>` : ''}`);
      }
      break;
    }

    case 'LETTER':
      spawnLetter(ev);
      flashCmd(2);
      toast(`${avatarHTML(ev.from)}<span class="arrow">💌</span>${avatarHTML(ev.to)}
        <div><b>${esc(ev.from.name)}</b> gửi thư chim cho <b>${esc(ev.to.name)}</b>${ev.message ? `<span class="msg">“${esc(ev.message)}”</span>` : ''}</div>`);
      break;

    case 'BLESS':
      flashCmd(3);
      toast(`${avatarHTML(ev.from)}<span class="arrow">✨</span>${avatarHTML(ev.to)}
        <div><b>${esc(ev.from.name)}</b> chúc phúc <b>${esc(ev.to.name)}</b><span class="msg">🙏 ${ev.count} lời chúc${ev.toTeam ? ` · +điểm phe ${esc(TEAMS[ev.toTeam]?.name)}` : ''}</span></div>`, 'bless');
      break;

    case 'GOLDEN_START':
      golden = { x: -100, vx: 4.5, baseY: 1000 };
      $('golden').classList.add('on'); $('goldenCd').textContent = ev.seconds;
      flashCmd(4); music.chime(2);
      break;
    case 'GOLDEN_CAUGHT':
      if (golden) burst(golden.x, golden.y, '#fde047', 60);
      golden = null; $('golden').classList.remove('on');
      toast(`${avatarHTML(ev.user)}<div><b>${esc(ev.user.name)}</b> bắt được Chim Vàng! 🐦✨<span class="msg">+${ev.points} điểm phúc${ev.team ? ` cho phe ${esc(TEAMS[ev.team]?.name)}` : ''}</span></div>`, 'gold');
      music.chime(3);
      break;
    case 'GOLDEN_ESCAPE':
      golden = null; $('golden').classList.remove('on');
      feed(null, '🐦 Chim Vàng đã bay mất... lần sau nhanh tay hơn nhé!');
      break;

    case 'COMBO_UP':
      $('combo').classList.remove('pop'); void $('combo').offsetWidth; $('combo').classList.add('pop');
      break;

    case 'JOIN_TEAM': {
      const t = TEAMS[ev.team];
      feed(ev.user, `<b>${esc(ev.user.name)}</b> vào phe <b style="color:${t?.color}">${esc(t?.icon || '')} ${esc(t?.name || ev.team)}</b>`);
      flashCmd(0);
      break;
    }
    case 'BLESSING_RAIN':
      blessingUntil = performance.now() + ev.durationSec * 1000;
      spotlight({ name: '☁️' }, '🌈 MƯA PHÚC LÀNH 🌈', 'Cả phòng đã lấp đầy Bầu Trời Bình An!', 5);
      music.chime(2);
      break;
    case 'VIP_ENTER':
      spotlight(ev.user, `👑 ${esc(ev.title || 'Người Gieo Phúc')}<br>${esc(ev.user.name)}`, 'đã trở lại phòng live!', 4);
      break;
    case 'WISH_HIDDEN':
      birds.forEach((b) => { if (b.userId === ev.userId) b.label = ''; });
      break;
    case 'ROUND_START':
      birds = []; letters = []; golden = null;
      $('golden').classList.remove('on'); $('wall').classList.remove('on');
      currentEventId = ev.dayEvent?.id; applyEvent(ev.dayEvent, ev.lunarLabel);
      feed(null, '🌅 Đợt phóng sanh mới bắt đầu!');
      break;
    case 'ROUND_END':
      golden = null; $('golden').classList.remove('on');
      showWall(ev); music.chime(2);
      break;
  }
}

function connect() {
  const ws = new WebSocket(`ws://${location.host}`);
  ws.onmessage = (m) => onMessage(JSON.parse(m.data));
  ws.onclose = () => setTimeout(connect, 2000);
}

await loadSprites();
buildSkyStatic();
requestAnimationFrame(frame);
startAudio();
connect();
