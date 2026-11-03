// Overlay "Cây Thông Kết Nối" 9:16.
// #bg   : đêm, trăng, tuyết xa, đồi tuyết (chỉ ?bg=1)
// #scene: cây, dây đèn, quả châu, ngôi sao, hộp quà
// #fx   : tia sáng chạy dọc dây, bông tuyết gần, pháo hoa, xe tuần lộc
import { ZenMusic } from './music.js';
import { TREE, SLOTS, TIER_RADIUS, GIFT_PILE, halfWidthAt } from './tree_layout.js';

const params = new URLSearchParams(location.search);
const WITH_BG = params.get('bg') === '1';
if (WITH_BG) document.body.classList.add('bg');

const W = 1080, H = 1920;
const bg = document.getElementById('bg').getContext('2d');
const sc = document.getElementById('scene').getContext('2d');
const fx = document.getElementById('fx').getContext('2d');
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rnd = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, k) => a + (b - a) * k;

// ---------- Trạng thái phía client ----------
const orns = new Map();     // num -> {num,id,name,avatar,tier,slot,degree,wish,star, x,y,r, tx,ty,tr, born, pulse, snow}
const wires = new Map();    // "a>b" -> {from,to,kind,double,born,msg,msgUntil}
let constellations = [];
let st = { light: 0, goal: 60, stage: 0, state: 'GROWING', pile: 0, combo: { mult: 1 } };
let shownLight = 0;
let warmNum = 0;
let litUntil = 0;
const sparks = [];          // hạt pháo hoa
const runners = [];         // tia sáng chạy dọc dây
let santa = null;

// ---------- Avatar ----------
const imgCache = new Map();
function imgOf(url) {
  if (!url) return null;
  if (!imgCache.has(url)) {
    const im = new Image(); im.src = url;              // không crossOrigin: CDN TikTok không có CORS
    imgCache.set(url, im);
    if (imgCache.size > 400) imgCache.delete(imgCache.keys().next().value);
  }
  const im = imgCache.get(url);
  return im.complete && im.naturalWidth ? im : null;
}
function hue(s) { let h = 0; for (const ch of String(s || '')) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; }
function initial(n) { return (String(n || '?').trim()[0] || '?').toUpperCase(); }
function avatarHTML(u, size = 48) {
  const st = `width:${size}px;height:${size}px`;
  if (u?.avatar) return `<img class="av" style="${st}" src="${esc(u.avatar)}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'av',textContent:'${esc(initial(u.name))}'}))">`;
  const h = hue(u?.name);
  return `<div class="av" style="${st};background:linear-gradient(135deg,hsl(${h} 70% 55%),hsl(${(h + 50) % 360} 70% 42%))">${esc(initial(u?.name))}</div>`;
}

// Màu bóng đèn theo người nối: ổn định theo tên để mỗi người nhận ra dây của mình
const BULBS = ['#ef4444', '#facc15', '#22c55e', '#3b82f6', '#ec4899', '#f97316', '#a855f7', '#14b8a6'];
const bulbOf = (num) => BULBS[(num * 7) % BULBS.length];
const ORN_COL = { 1: ['#dc2626', '#16a34a', '#2563eb', '#db2777'], 2: ['#cbd5e1'], 3: ['#facc15'], 4: ['#a5f3fc'] };

// ---------- Nền đêm tuyết ----------
let bgStatic = null;
const farSnow = Array.from({ length: 160 }, () => ({ x: rnd(0, W), y: rnd(0, H), r: rnd(0.8, 2), v: rnd(0.3, 0.8), p: rnd(0, 6) }));
const nearSnow = Array.from({ length: 50 }, () => ({ x: rnd(0, W), y: rnd(0, H), r: rnd(2.5, 5), v: rnd(1.2, 2.4), p: rnd(0, 6) }));
const stars = Array.from({ length: 120 }, () => ({ x: rnd(0, W), y: rnd(0, 900), r: rnd(0.6, 1.8), p: rnd(0, 6) }));

function buildBg() {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#020617'); gr.addColorStop(0.45, '#0c1a3a'); gr.addColorStop(0.75, '#1e3a5f'); gr.addColorStop(1, '#334e73');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // trăng
  const mx = 880, my = 270;
  const halo = g.createRadialGradient(mx, my, 30, mx, my, 260);
  halo.addColorStop(0, '#fef9c3aa'); halo.addColorStop(1, '#0000');
  g.fillStyle = halo; g.fillRect(mx - 260, my - 260, 520, 520);
  g.fillStyle = '#fefce8'; g.beginPath(); g.arc(mx, my, 70, 0, Math.PI * 2); g.fill();
  // rặng thông xa
  for (let layer = 0; layer < 2; layer++) {
    g.fillStyle = layer ? '#0f2744' : '#13304f';
    for (let x = -40; x < W + 40; x += 46 + layer * 20) {
      const h = rnd(120, 220) - layer * 40, base = 1480 + layer * 30;
      g.beginPath(); g.moveTo(x, base); g.lineTo(x + 30 + layer * 8, base - h); g.lineTo(x + 60 + layer * 16, base); g.fill();
    }
  }
  // đồi tuyết
  const sn = g.createLinearGradient(0, 1450, 0, H);
  sn.addColorStop(0, '#e2e8f0'); sn.addColorStop(1, '#94a3b8');
  g.fillStyle = sn;
  g.beginPath(); g.moveTo(0, H);
  for (let x = 0; x <= W; x += 20) g.lineTo(x, 1500 - Math.sin(x / 230) * 30 - Math.sin(x / 71) * 8);
  g.lineTo(W, H); g.fill();
  bgStatic = c;
}

function drawBg(t) {
  if (!WITH_BG) return;
  bg.drawImage(bgStatic, 0, 0);
  for (const s of stars) { bg.globalAlpha = 0.35 + Math.sin(t / 800 + s.p) * 0.3; bg.fillStyle = '#fff'; bg.fillRect(s.x, s.y, s.r, s.r); }
  bg.globalAlpha = 0.7; bg.fillStyle = '#fff';
  for (const s of farSnow) {
    s.y += s.v; s.x += Math.sin(t / 1500 + s.p) * 0.3;
    if (s.y > H) { s.y = -5; s.x = rnd(0, W); }
    bg.beginPath(); bg.arc(s.x, s.y, s.r, 0, Math.PI * 2); bg.fill();
  }
  bg.globalAlpha = 1;
}

// ---------- Cây thông (vẽ sẵn 1 lần) ----------
let treeImg = null;
function buildTree() {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const { cx, apexY, baseY } = TREE;
  // thân
  const tg = g.createLinearGradient(cx - 40, 0, cx + 40, 0);
  tg.addColorStop(0, '#3f2414'); tg.addColorStop(0.5, '#6b3f22'); tg.addColorStop(1, '#3f2414');
  g.fillStyle = tg; g.fillRect(cx - 38, baseY - 30, 76, 120);
  // 6 tầng lá chồng nhau, mỗi tầng có viền răng cưa và phủ tuyết
  const layers = 6;
  for (let i = 0; i < layers; i++) {
    const top = lerp(apexY - 30, baseY - 260, i / (layers - 1)) - (i ? 60 : 0);
    const bot = lerp(apexY + 190, baseY, (i + 1) / layers);
    const half = halfWidthAt(bot) * 1.08;
    const grd = g.createLinearGradient(cx - half, 0, cx + half, 0);
    grd.addColorStop(0, '#052e16'); grd.addColorStop(0.35, '#166534'); grd.addColorStop(0.55, '#15803d'); grd.addColorStop(1, '#052e16');
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(cx, top);
    const teeth = 7 + i * 2;
    g.lineTo(cx + half, bot);
    for (let k = teeth; k >= 0; k--) {
      const x = cx - half + (2 * half * k) / teeth;
      g.quadraticCurveTo(x + half / teeth, bot + 26, x, bot);
    }
    g.lineTo(cx - half, bot); g.closePath(); g.fill();
    // bóng tối dưới tầng
    g.fillStyle = '#0003';
    g.beginPath(); g.ellipse(cx, bot - 6, half * 0.9, 14, 0, 0, Math.PI * 2); g.fill();
    // tuyết phủ mép
    g.fillStyle = '#f8fafc';
    for (let k = 0; k <= teeth; k++) {
      const x = cx - half + (2 * half * k) / teeth;
      g.beginPath(); g.ellipse(x, bot + 4, half / teeth * 0.7, 9, 0, 0, Math.PI * 2); g.fill();
    }
  }
  // gốc tuyết
  g.fillStyle = '#e2e8f0';
  g.beginPath(); g.ellipse(cx, baseY + 90, 300, 40, 0, 0, Math.PI * 2); g.fill();
  treeImg = c;
}

// ---------- Hình học quả châu ----------
function slotPos(o) {
  if (o.tier >= 1 && o.slot != null) {
    const s = SLOTS[o.tier][o.slot];
    return { x: s.x, y: s.y, r: s.r };
  }
  return { x: GIFT_PILE.x + rnd(-120, 120), y: GIFT_PILE.y + 20, r: 0 };   // rơi xuống gốc
}

function upsertOrn(d) {
  let o = orns.get(d.num);
  const p = slotPos(d);
  if (!o) {
    o = { ...d, x: TREE.cx, y: GIFT_PILE.y, r: 0, born: performance.now(), pulse: 0, snow: 0 };
    orns.set(d.num, o);
  }
  Object.assign(o, d, { tx: p.x, ty: p.y, tr: p.r });
  return o;
}

// ---------- Vẽ cảnh ----------
function drawWire(w, t, lit) {
  const a = orns.get(w.from), b = orns.get(w.to);
  if (!a || !b || !a.tr || !b.tr) return;
  const sag = Math.min(90, Math.hypot(b.x - a.x, b.y - a.y) * 0.18 + 14);
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + sag;
  const age = (t - w.born) / 1000;
  const alpha = Math.min(1, age * 2);
  sc.save(); sc.globalAlpha = alpha;
  sc.strokeStyle = w.kind === 'gold' ? '#facc15' : '#0f172a';
  sc.lineWidth = w.double ? 4 : 2;
  sc.beginPath(); sc.moveTo(a.x, a.y); sc.quadraticCurveTo(mx, my, b.x, b.y); sc.stroke();

  // bóng đèn dọc dây
  const n = w.double ? 8 : 5;
  for (let i = 1; i < n; i++) {
    const k = i / n;
    const x = (1 - k) ** 2 * a.x + 2 * (1 - k) * k * mx + k * k * b.x;
    const y = (1 - k) ** 2 * a.y + 2 * (1 - k) * k * my + k * k * b.y;
    const on = lit || w.double || Math.sin(t / 380 + i * 1.7 + w.from) > -0.2;
    const col = w.kind === 'gold' ? '#fde047' : bulbOf(i % 2 ? w.from : w.to);
    sc.fillStyle = on ? col : '#334155';
    if (on) { sc.shadowColor = col; sc.shadowBlur = lit ? 22 : 12; }
    sc.beginPath(); sc.ellipse(x, y + 3, 4.5, 6.5, 0, 0, Math.PI * 2); sc.fill();
    sc.shadowBlur = 0;
  }
  // lời chúc chạy dọc dây
  if (w.msg && performance.now() < w.msgUntil) {
    pill(`“${w.msg}”`, mx, my + 26, 'rgba(159,18,57,.88)', 22, sc);
  }
  sc.restore();
}

function pill(text, x, y, bgc, size, g = sc) {
  g.font = `800 ${size}px 'Be Vietnam Pro','Segoe UI'`;
  const label = text.length > 32 ? text.slice(0, 31) + '…' : text;
  const w = g.measureText(label).width + 26;
  const left = Math.max(10, Math.min(W - 160 - w, x - w / 2));
  g.fillStyle = bgc;
  g.beginPath(); g.roundRect(left, y - size * 0.85, w, size * 1.6, size); g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(label, left + w / 2, y);
}

function drawOrn(o, t, lit) {
  if (!o.r || o.r < 2) return;
  const { x, y, r } = o;
  const lonely = o.degree === 0 && !o.star;
  const shiver = lonely ? Math.sin(t / 60 + o.num) * 1.4 : 0;
  const glow = lit ? 1 : Math.min(1, 0.25 + o.degree * 0.18) + o.pulse;
  const warm = o.num === warmNum;
  sc.save(); sc.translate(x + shiver, y);

  // dây treo + móc
  sc.strokeStyle = '#fde68a'; sc.lineWidth = 2;
  sc.beginPath(); sc.moveTo(0, -r - 14); sc.lineTo(0, -r); sc.stroke();
  sc.fillStyle = '#d4a017'; sc.fillRect(-r * 0.22, -r - 4, r * 0.44, 8);

  // quầng sáng
  if (glow > 0.3 || warm) {
    sc.shadowColor = warm ? '#fb923c' : o.star ? '#fde047' : '#fef3c7';
    sc.shadowBlur = (warm ? 40 : 10 + glow * 24) * (lit ? 1.6 : 1);
  }
  // vỏ quả châu
  if (o.star) {
    drawStar(sc, 0, 0, r * 1.25, r * 0.55, t);
  } else {
    const cols = ORN_COL[o.tier] || ORN_COL[1];
    const col = cols[o.num % cols.length];
    const gr = sc.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.1);
    gr.addColorStop(0, '#fff'); gr.addColorStop(0.25, col); gr.addColorStop(1, shade(col, -45));
    sc.fillStyle = gr;
    sc.beginPath(); sc.arc(0, 0, r + 5, 0, Math.PI * 2); sc.fill();
  }
  sc.shadowBlur = 0;

  // avatar trong quả châu
  const ar = o.star ? r * 0.62 : r;
  sc.save();
  sc.beginPath(); sc.arc(0, o.star ? 2 : 0, ar, 0, Math.PI * 2); sc.clip();
  const im = imgOf(o.avatar);
  if (im) sc.drawImage(im, -ar, -ar + (o.star ? 2 : 0), ar * 2, ar * 2);
  else {
    sc.fillStyle = `hsl(${hue(o.name)} 60% 45%)`; sc.fillRect(-ar, -ar, ar * 2, ar * 2);
    sc.fillStyle = '#fff'; sc.font = `900 ${Math.round(ar)}px 'Be Vietnam Pro'`; sc.textAlign = 'center'; sc.textBaseline = 'middle';
    sc.fillText(initial(o.name), 0, 2);
  }
  // quả châu cô đơn: phủ lớp băng xanh
  if (lonely && !lit) { sc.fillStyle = 'rgba(147,197,253,.38)'; sc.fillRect(-ar, -ar, ar * 2, ar * 2); }
  sc.restore();

  // bóng phản chiếu
  sc.fillStyle = 'rgba(255,255,255,.35)';
  sc.beginPath(); sc.ellipse(-r * 0.38, -r * 0.42, r * 0.22, r * 0.12, -0.6, 0, Math.PI * 2); sc.fill();

  // số thứ tự (luôn hiện, đọc được trên điện thoại)
  const fs = Math.max(20, Math.round(r * 0.62));
  sc.font = `900 ${fs}px 'Be Vietnam Pro','Segoe UI'`;
  sc.textAlign = 'center'; sc.textBaseline = 'middle';
  const label = String(o.num);
  const lw = sc.measureText(label).width + 12;
  sc.fillStyle = warm ? '#ea580c' : o.star ? '#a16207' : '#0f172aee';
  sc.beginPath(); sc.roundRect(-lw / 2, r - fs * 0.35, lw, fs * 1.05, fs * 0.5); sc.fill();
  sc.fillStyle = '#fff'; sc.fillText(label, 0, r + fs * 0.18);

  if (lonely && !lit) { sc.font = `${Math.round(r * 0.6)}px serif`; sc.fillText('🥶', r * 0.85, -r * 0.75); }
  sc.restore();

  // điều ước / tên ở tầng cao
  if (o.wish && (o.tier >= 3 || o.pulse > 0.2 || o.wishUntil > performance.now())) pill(`✨ ${o.wish}`, x, y - r - 34, 'rgba(15,23,42,.8)', 20);
  else if (o.tier >= 4 || o.star) pill(o.name, x, y - r - (o.star ? 44 : 30), o.star ? 'rgba(161,98,7,.9)' : 'rgba(14,116,144,.85)', 22);
}

function drawStar(g, x, y, R, r, t) {
  g.save(); g.translate(x, y); g.rotate(Math.sin(t / 1500) * 0.05);
  const gr = g.createRadialGradient(0, 0, 4, 0, 0, R);
  gr.addColorStop(0, '#fffbeb'); gr.addColorStop(0.5, '#fde047'); gr.addColorStop(1, '#ca8a04');
  g.fillStyle = gr;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r : R;
    g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.closePath(); g.fill();
  g.restore();
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, v + amt));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

function drawPile(t) {
  // Hộp quà dưới gốc: số người đang chờ chỗ trên cây
  const n = Math.min(9, Math.max(3, Math.ceil(st.pile / 8) + 3));
  const cols = [['#dc2626', '#fde047'], ['#16a34a', '#fef2f2'], ['#2563eb', '#fde047'], ['#db2777', '#fff'], ['#7c3aed', '#fde047']];
  for (let i = 0; i < n; i++) {
    const w = 70 + (i % 3) * 14, h = 54 + (i % 2) * 16;
    const x = GIFT_PILE.x - 230 + (i * 460) / (n - 1 || 1) - w / 2;
    const y = GIFT_PILE.y + 64 - h - (i % 2) * 6;
    const [c1, c2] = cols[i % cols.length];
    sc.fillStyle = c1; sc.fillRect(x, y, w, h);
    sc.fillStyle = c2; sc.fillRect(x + w / 2 - 6, y, 12, h); sc.fillRect(x, y + h / 2 - 5, w, 10);
    sc.beginPath(); sc.ellipse(x + w / 2 - 12, y - 6, 12, 8, -0.5, 0, Math.PI * 2); sc.ellipse(x + w / 2 + 12, y - 6, 12, 8, 0.5, 0, Math.PI * 2); sc.fill();
  }
  if (st.pile > 0) pill(`🎁 ${st.pile} người đang chờ chỗ · tương tác để được treo`, GIFT_PILE.x, GIFT_PILE.y + 110, 'rgba(15,23,42,.85)', 22);
}

// Chuỗi đèn trang trí mặc định quấn quanh cây: sáng dần theo mốc (cây trống vẫn có sức sống)
function drawGarland(t, lit) {
  const rows = [[560, 650], [720, 830], [900, 1010], [1080, 1190], [1260, 1380]];
  rows.forEach(([y1, y2], ri) => {
    const on = lit || ri >= 4 - st.stage;   // tầng dưới sáng trước
    const w1 = halfWidthAt(y1) * 1.02, w2 = halfWidthAt(y2) * 1.02;
    const n = 9 + ri * 2;
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      const x = lerp(TREE.cx - w1, TREE.cx + w2, k);
      const y = lerp(y1, y2, k) + Math.sin(k * Math.PI) * 26;
      const col = ['#fde047', '#f87171', '#86efac', '#93c5fd'][(i + ri) % 4];
      const blink = on && Math.sin(t / 300 + i + ri) > -0.5;
      sc.fillStyle = blink ? col : '#1e293b';
      if (blink) { sc.shadowColor = col; sc.shadowBlur = lit ? 20 : 10; }
      sc.beginPath(); sc.arc(x, y, 5, 0, Math.PI * 2); sc.fill();
      sc.shadowBlur = 0;
    }
  });
}

function drawTopStar(t, lit) {
  // Ngôi sao trang trí khi chưa có người giữ ngôi sao
  const hasStar = [...orns.values()].some((o) => o.star && o.r > 2);
  if (hasStar) return;
  sc.save();
  if (lit || st.stage >= 4) { sc.shadowColor = '#fde047'; sc.shadowBlur = 60; }
  sc.globalAlpha = lit ? 1 : 0.45 + st.stage * 0.12;
  drawStar(sc, TREE.cx, TREE.apexY - 26, 58, 24, t);
  sc.restore();
  if (!lit) pill('⭐ Chỗ dành cho người tặng ≥ 500 xu', TREE.cx, TREE.apexY - 104, 'rgba(161,98,7,.85)', 20);
}

function drawConstellations(t) {
  for (const tri of constellations) {
    const ps = tri.map((n) => orns.get(n)).filter((o) => o?.r > 2);
    if (ps.length !== 3) continue;
    sc.save();
    sc.globalAlpha = 0.18 + Math.sin(t / 500) * 0.06;
    sc.fillStyle = '#a5f3fc';
    sc.beginPath(); sc.moveTo(ps[0].x, ps[0].y); sc.lineTo(ps[1].x, ps[1].y); sc.lineTo(ps[2].x, ps[2].y); sc.closePath(); sc.fill();
    sc.restore();
  }
}

// ---------- Hiệu ứng ----------
function burst(x, y, colors, n = 30, power = 7) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = rnd(1, power);
    sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, c: colors[i % colors.length], life: 1, r: rnd(2, 4) });
  }
}

function runner(w) {
  runners.push({ from: w.from, to: w.to, t0: performance.now(), dur: 1100, gold: w.kind === 'gold' });
}

function drawFx(t) {
  fx.clearRect(0, 0, W, H);
  // tuyết gần
  fx.fillStyle = '#fff';
  for (const s of nearSnow) {
    s.y += s.v * (st.stage >= 3 ? 1.5 : 1); s.x += Math.sin(t / 900 + s.p) * 0.6;
    if (s.y > H) { s.y = -10; s.x = rnd(0, W); }
    fx.globalAlpha = 0.85; fx.beginPath(); fx.arc(s.x, s.y, s.r, 0, Math.PI * 2); fx.fill();
  }
  fx.globalAlpha = 1;
  // tia sáng chạy dọc dây
  for (let i = runners.length - 1; i >= 0; i--) {
    const r = runners[i];
    const a = orns.get(r.from), b = orns.get(r.to);
    const k = (t - r.t0) / r.dur;
    if (!a || !b || k > 1) { runners.splice(i, 1); if (b && k > 1) burst(b.x, b.y, ['#fde68a', '#fff'], 14, 4); continue; }
    const sag = Math.min(90, Math.hypot(b.x - a.x, b.y - a.y) * 0.18 + 14);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + sag;
    const x = (1 - k) ** 2 * a.x + 2 * (1 - k) * k * mx + k * k * b.x;
    const y = (1 - k) ** 2 * a.y + 2 * (1 - k) * k * my + k * k * b.y;
    fx.shadowColor = r.gold ? '#fde047' : '#fff'; fx.shadowBlur = 30;
    fx.fillStyle = r.gold ? '#fde047' : '#fff';
    fx.beginPath(); fx.arc(x, y, 9, 0, Math.PI * 2); fx.fill();
    fx.shadowBlur = 0;
  }
  // pháo hoa
  for (let i = sparks.length - 1; i >= 0; i--) {
    const p = sparks[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.vx *= 0.99; p.life -= 0.016;
    if (p.life <= 0) { sparks.splice(i, 1); continue; }
    fx.globalAlpha = p.life; fx.fillStyle = p.c; fx.shadowColor = p.c; fx.shadowBlur = 10;
    fx.beginPath(); fx.arc(p.x, p.y, p.r, 0, Math.PI * 2); fx.fill();
  }
  fx.globalAlpha = 1; fx.shadowBlur = 0;
  if (sparks.length > 1500) sparks.splice(0, sparks.length - 1500);
  // pháo hoa liên tục khi cây bừng sáng
  if (performance.now() < litUntil && Math.random() < 0.08) burst(rnd(120, 840), rnd(300, 900), ['#fde047', '#f87171', '#86efac', '#93c5fd', '#fff'], 60, 8);
  // xe tuần lộc
  if (santa) {
    santa.x += santa.v;
    const y = 520 + Math.sin(santa.x / 120) * 40;
    fx.font = '92px serif'; fx.textAlign = 'center';
    fx.fillText('🦌🦌🛷🎅', santa.x, y);
    if (Math.random() < 0.5) sparks.push({ x: santa.x + 140, y: y - 20, vx: rnd(-1, 1), vy: rnd(0, 2), c: '#fde047', life: 1, r: 3 });
    if (santa.x > W + 400) santa = null;
  }
}

// ---------- Vòng lặp ----------
function frame(t) {
  drawBg(t);
  sc.clearRect(0, 0, W, H);
  const lit = st.state === 'LIT';
  sc.drawImage(treeImg, 0, 0);
  drawGarland(t, lit);
  drawPile(t);

  for (const o of orns.values()) {
    o.x = lerp(o.x, o.tx, 0.12); o.y = lerp(o.y, o.ty, 0.12); o.r = lerp(o.r, o.tr, 0.15);
    o.pulse *= 0.95;
  }
  drawConstellations(t);
  for (const w of wires.values()) drawWire(w, t, lit);
  const list = [...orns.values()].sort((a, b) => a.tier - b.tier);
  for (const o of list) drawOrn(o, t, lit);
  drawTopStar(t, lit);
  drawFx(t);

  // thanh tiến độ chạy mượt
  shownLight = lerp(shownLight, st.light, 0.1);
  const pct = Math.min(100, (shownLight / st.goal) * 100);
  $('barFill').style.width = `${pct}%`;
  $('barPct').textContent = lit ? '🌟 BỪNG SÁNG' : `${Math.floor(pct)}%`;
  $('barTxt').textContent = `${Math.round(shownLight).toLocaleString('vi-VN')} / ${st.goal.toLocaleString('vi-VN')} ✨`;
  requestAnimationFrame(frame);
}

// ---------- Âm thanh ----------
const music = new ZenMusic();
music.scale = [0, 4, 7, 9, 12];          // âm giai trưởng, vui hơn nhạc thiền
music.setTheme('xmas');
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
    const a = new Audio(item.audio); a.onended = a.onerror = done; a.play().catch(done);
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
document.addEventListener('click', () => { music.ctx?.resume(); $('soundHint').style.display = 'none'; });

// ---------- UI ----------
function toast(html, cls = '') {
  const d = document.createElement('div');
  d.className = 'toast ' + cls; d.innerHTML = html;
  $('toasts').prepend(d);
  while ($('toasts').children.length > 2) $('toasts').lastChild.remove();
  setTimeout(() => d.remove(), 6000);
}

let spotTimer;
function spotlight(user, title, sub, sec) {
  const s = $('spot');
  s.innerHTML = `<div class="ring">${avatarHTML(user, 174)}</div><div class="t">${title}</div>${sub ? `<div class="s">${sub}</div>` : ''}`;
  s.classList.remove('on'); void s.offsetWidth; s.classList.add('on');
  clearTimeout(spotTimer); spotTimer = setTimeout(() => s.classList.remove('on'), sec * 1000);
}

function chip(id, on) { $(id).classList.toggle('on', !!on); }

const TIPS = [
  '💡 Số trên quả châu là số của bạn · gõ !so để tìm',
  '💞 Nối lại người đã nối bạn = DÂY ĐÔI, sáng gấp 3',
  '🥶 Quả châu đóng băng chưa có ai nối · nối đầu tiên được thưởng',
  '🔺 3 người nối đôi với nhau = CHÒM SAO',
  '🎁 Quà ≥ 10 xu tự nối dây vàng tới người đang lạnh',
  '⭐ Người tặng nhiều nhất lên ĐỈNH CÂY',
  '🔗 Nối từ 3 dây trở lên được lên tầng cao hơn, không cần quà',
  '🎶 8 người cùng gõ "Merry Christmas" = cả cây được thưởng',
];
let tipI = 0;
function rotateTip() {
  const el = $('tip');
  el.style.opacity = 0;
  setTimeout(() => { el.textContent = TIPS[tipI++ % TIPS.length]; el.style.opacity = 1; }, 400);
}
rotateTip(); setInterval(rotateTip, 6000);

function renderTitles(t) {
  const item = (ic, label, u) => `<div class="ttl"><span class="ic">${ic}</span>${u ? avatarHTML(u, 44) : '<div class="av" style="width:44px;height:44px;background:#ffffff18">?</div>'}
    <div><small>${label}</small><b>${u ? esc(u.name) : 'Đang chờ…'}</b></div></div>`;
  $('titles').innerHTML = item('⭐', 'Ngôi Sao', t.star) + item('💞', 'Trái Tim Của Cây', t.heart) + item('🔥', 'Người Sưởi Ấm', t.warmer);
}

let lastTitlesKey = '';
function renderState(s) {
  const prevStage = st.stage;
  st = s;
  $('treeNo').textContent = `Cây số ${s.index}`;
  $('sPeople').textContent = s.people;
  $('sWires').textContent = s.wires;
  $('sLonely').textContent = s.lonely;
  $('comboMult').textContent = `x${s.combo.mult.toFixed(1)}`;
  $('combo').classList.toggle('hot', s.combo.mult > 1);
  const key = JSON.stringify([s.titles.star?.id, s.titles.heart?.id, s.titles.warmer?.id]);
  if (key !== lastTitlesKey) { lastTitlesKey = key; renderTitles(s.titles); }

  chip('golden', s.golden > 0);
  if (s.golden > 0) $('goldenCd').textContent = `${Math.floor(s.golden / 60)}:${String(s.golden % 60).padStart(2, '0')}`;
  chip('mystery', s.mystery > 0); $('mysCd').textContent = s.mystery;
  chip('warm', !!s.warm);
  warmNum = s.warm?.num || 0;
  if (s.warm) { $('warmNum').textContent = `#${s.warm.num}`; $('warmCmd').textContent = `!noi ${s.warm.num}`; $('warmCd').textContent = s.warm.remaining; }
  chip('chorus', s.state === 'GROWING' && s.chorus.count > 0 && !s.chorus.cooldown);
  $('chorusN').textContent = `${s.chorus.count}/${s.chorus.need}`;
  if (s.stage > prevStage && s.state === 'GROWING') music.chime(s.stage);
}

function wireKey(a, b) { return `${a}>${b}`; }
function addWire(w, animate) {
  const k = wireKey(w.from, w.to);
  const now = performance.now();
  const rec = { from: w.from, to: w.to, kind: w.kind, double: w.double, born: animate ? now : now - 2000, msg: w.msg || '', msgUntil: now + 6000 };
  wires.set(k, rec);
  if (w.double) {
    const back = wires.get(wireKey(w.to, w.from));
    if (back) back.double = true;
    // Vẽ 1 dây dày cho cặp dây đôi: ẩn chiều ngược lại
    wires.delete(wireKey(w.to, w.from));
    wires.set(k, { ...rec, double: true });
  }
  if (animate) runner(rec);
}

function onMessage(ev) {
  switch (ev.event) {
    case 'TREE_FULL':
      orns.clear(); wires.clear();
      for (const o of ev.ornaments) upsertOrn(o);
      for (const w of ev.wires) if (!(w.double && wires.has(wireKey(w.to, w.from)))) addWire(w, false);
      constellations = ev.constellations || [];
      renderState(ev.state);
      break;
    case 'TREE_STATE': renderState(ev); break;
    case 'SAY': say(ev); break;
    case 'MUSIC': music.setEnabled(ev.on); music.setVolume(ev.volume); break;

    case 'ORN': {
      const isNew = !orns.has(ev.num);
      const o = upsertOrn(ev);
      if (ev.wishNew) {
        o.wishUntil = performance.now() + 8000;
        toast(`${avatarHTML(o)}<span><b>#${o.num} ${esc(o.name)}</b> ước: <i>“${esc(ev.wish)}”</i></span>`);
      } else if (isNew && o.tr) music.ting(0.03);
      break;
    }
    case 'ORN_REMOVE':
      orns.delete(ev.num);
      for (const k of [...wires.keys()]) { const [a, b] = k.split('>').map(Number); if (a === ev.num || b === ev.num) wires.delete(k); }
      break;
    case 'FIND': {
      const o = orns.get(ev.num);
      if (o) { o.pulse = 1.5; burst(o.x, o.y, ['#fff', '#fde047'], 30, 5); }
      break;
    }
    case 'HIDE_TEXT': {
      const o = orns.get(ev.num); if (o) o.wish = '';
      for (const w of wires.values()) if (w.from === ev.num) w.msg = '';
      break;
    }

    case 'WIRE': {
      addWire(ev, true);
      const a = orns.get(ev.from), b = orns.get(ev.to);
      if (a) a.degree = Math.max(a.degree, 1);
      if (b) { b.degree = Math.max(b.degree, 1); b.pulse = ev.double ? 1.2 : 0.7; }
      music.ting(ev.double ? 0.12 : 0.07);
      if (ev.silent) break;
      const msg = ev.msg ? ` <i>“${esc(ev.msg)}”</i>` : '';
      if (ev.double) {
        toast(`${avatarHTML(ev.fromUser)}<span class="ar">💞</span>${avatarHTML(ev.toUser)}<span><b>${esc(ev.fromUser.name)}</b> & <b>${esc(ev.toUser.name)}</b> nối DÂY ĐÔI!${msg}</span>`, 'double');
        if (a && b) burst((a.x + b.x) / 2, (a.y + b.y) / 2, ['#fda4af', '#fff'], 30, 5);
      } else {
        const extra = ev.warm ? ' 🔥 sưởi ấm!' : ev.lonely ? ' 🥶→😊 người đầu tiên!' : '';
        toast(`${avatarHTML(ev.fromUser)}<span class="ar">💡</span>${avatarHTML(ev.toUser)}<span><b>#${ev.from}</b> nối <b>#${ev.to} ${esc(ev.toUser.name)}</b>${extra}${msg}</span>`);
      }
      break;
    }
    case 'WIRE_CUT':
      wires.delete(wireKey(ev.a, ev.b)); wires.delete(wireKey(ev.b, ev.a));
      break;
    case 'CONSTELLATION': {
      constellations.push(ev.nums);
      const ps = ev.nums.map((n) => orns.get(n)).filter(Boolean);
      for (const p of ps) burst(p.x, p.y, ['#a5f3fc', '#fff'], 24, 5);
      toast(`<span class="ar">🔺</span><span>CHÒM SAO: <b>${ev.names.map(esc).join(' · ')}</b></span>`, 'star');
      music.chime(2);
      break;
    }
    case 'GOLD_WIRES':
      toast(`${avatarHTML(ev.by)}<span><b>${esc(ev.by.name)}</b> nối dây vàng tới ${ev.nums.map((n) => '#' + n).join(', ')} 🥶→✨</span>`, 'gold');
      break;
    case 'SNOW_LUCK':
      for (const n of ev.nums) { const o = orns.get(n); if (o) { o.pulse = 1.2; burst(o.x, o.y, ['#e0f2fe', '#fff'], 16, 4); } }
      toast(`<span class="ar">❄️</span><span>Bông tuyết may mắn${ev.by ? ` từ <b>${esc(ev.by.name)}</b>` : ''} sưởi ấm ${ev.nums.length} quả châu</span>`, 'star');
      break;
    case 'SANTA':
      santa = { x: -420, v: 7 };
      music.jingle();
      for (const n of ev.nums) { const o = orns.get(n); if (o) o.pulse = 1.5; }
      break;
    case 'SPOTLIGHT': {
      const sub = ev.to ? `💝 dành tặng <b>${esc(ev.to.name)}</b>` : `Quả châu #${ev.num}`;
      spotlight(ev.user, `${esc(ev.user.name)}<br>tặng ${esc(ev.giftName)}!`, sub, ev.seconds + 1);
      music.chime(ev.diamonds >= 500 ? 3 : 1);
      break;
    }
    case 'STAR_CHANGE':
      spotlight(ev.star, `⭐ ${esc(ev.star.name)}`, 'là Ngôi Sao mới trên đỉnh cây!', 4);
      burst(TREE.cx, TREE.apexY, ['#fde047', '#fff'], 80, 9);
      break;
    case 'TOAST':
      toast(`${ev.user ? avatarHTML(ev.user) : ''}<span><b>${esc(ev.user?.name || '')}</b> ${esc(ev.text)}</span>`, ev.kind === 'rise' ? 'star' : '');
      break;
    case 'VIP_ENTER':
      spotlight(ev.user, `👑 ${esc(ev.title || 'Khách quý')}<br>${esc(ev.user.name)}`, 'đã trở lại cây thông!', 4);
      break;

    case 'STAGE_UP':
      burst(TREE.cx, 1400 - ev.stage * 250, ['#fde047', '#f87171', '#86efac'], 60, 7);
      toast(`<span class="ar">🌟</span><span>Đã sáng <b>${ev.stage * 25}%</b> cây thông!</span>`, 'gold');
      break;
    case 'COMBO_UP':
      $('combo').classList.remove('pop'); void $('combo').offsetWidth; $('combo').classList.add('pop');
      break;
    case 'GOLDEN_HOUR': music.chime(2); break;
    case 'MYSTERY_START': music.jingle(); break;
    case 'MYSTERY_OPEN':
      burst(GIFT_PILE.x, GIFT_PILE.y, ['#f5d0fe', '#fde047', '#fff'], 70, 8);
      toast(`${avatarHTML(ev.user)}<span><b>#${ev.num} ${esc(ev.user.name)}</b> mở hộp quà: ${esc(ev.text)}</span>`, 'gold');
      break;
    case 'MYSTERY_GONE': toast('<span>🎁 Hộp quà bí ẩn đã biến mất… lần sau nhanh tay hơn!</span>'); break;
    case 'WARM_START': { const o = orns.get(ev.num); if (o) o.pulse = 1.5; break; }
    case 'CHORUS':
      for (let i = 0; i < 6; i++) setTimeout(() => burst(rnd(150, 800), rnd(400, 1100), ['#99f6e4', '#fde047', '#fff'], 40, 7), i * 200);
      toast(`<span class="ar">🎶</span><span><b>${ev.users} người</b> cùng hát mừng Giáng sinh · +${ev.light} ánh sáng</span>`, 'star');
      break;

    case 'TREE_LIT': showLit(ev); break;
    case 'TREE_NEXT':
      $('lit').classList.remove('on');
      wires.clear(); constellations = [];
      litUntil = 0; shownLight = 0;
      break;
  }
}

let litTimer;
function showLit(ev) {
  litUntil = performance.now() + ev.seconds * 1000;
  st.state = 'LIT';
  music.chime(3);
  for (let i = 0; i < 8; i++) setTimeout(() => burst(rnd(150, 800), rnd(300, 900), ['#fde047', '#f87171', '#86efac', '#93c5fd', '#fff'], 80, 9), i * 250);
  const s = ev.summary;
  $('litSum').textContent = `Cây số ${s.index} · ${s.people} quả châu · ${s.wires} dây đèn · ${s.doubles} dây đôi · ${s.minutes} phút`;
  const tt = [['⭐', 'Ngôi Sao Đêm Nay', ev.titles.star], ['💞', 'Trái Tim Của Cây', ev.titles.heart], ['🔥', 'Người Sưởi Ấm', ev.titles.warmer], ['❄️', 'Người Thắp Đèn Cuối', ev.titles.lighter]];
  $('litTitles').innerHTML = tt.filter(([, , u]) => u).map(([ic, label, u], i) =>
    `<div class="lt" style="animation-delay:${0.4 + i * 0.35}s">${avatarHTML(u, 76)}<div><small>${ic} ${label}</small><b>${esc(u.name)}</b></div></div>`).join('');
  $('litWishes').innerHTML = (ev.wishes || []).slice(0, 4).map((w, i) =>
    `<div class="lw" style="animation-delay:${1.8 + i * 0.3}s"><b>#${w.num} ${esc(w.name)}:</b> “${esc(w.wish)}”</div>`).join('');
  let left = ev.seconds;
  const foot = () => ($('litFoot').innerHTML = `📸 Chụp màn hình lưu kỷ niệm · Cây số ${s.index + 1} sau <b>${left}s</b>`);
  foot(); clearInterval(litTimer);
  litTimer = setInterval(() => { left--; if (left <= 0) clearInterval(litTimer); else foot(); }, 1000);
  $('lit').classList.add('on');
}

function connect() {
  const ws = new WebSocket(`ws://${location.host}`);
  ws.onmessage = (m) => onMessage(JSON.parse(m.data));
  ws.onclose = () => setTimeout(connect, 2000);
}

buildBg();
buildTree();
renderTitles({});
requestAnimationFrame(frame);
music.start().then(() => { $('soundHint').style.display = music.ctx?.state === 'running' ? 'none' : 'block'; });
connect();
