// Overlay 9:16: chim sprite bay từ Lồng Sen lên trời, theme theo sự kiện ngày, nhạc thiền, giọng đọc, Bức Tường Lời Nguyện.
// ?bg=1 trên URL để có nền trời (test trên trình duyệt); OBS dùng nền trong suốt.
import { ZenMusic } from './music.js';

const params = new URLSearchParams(location.search);
if (params.get('bg') === '1') document.body.classList.add('bg');

const W = 1080, H = 1920;
const ctx = document.getElementById('c').getContext('2d');
const MAX_BIRDS = 700;
const TEAM_COLORS = {};
const TEAM_NAMES = {};
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Theme theo sự kiện ngày ----------
const THEMES = {
  default:  { sky: 'linear-gradient(#0b1d3a 0%, #3b2a63 45%, #f59e0b 100%)', accent: '#fbbf24', particle: null },
  tet:      { sky: 'linear-gradient(#7f1d1d 0%, #b91c1c 45%, #fbbf24 100%)', accent: '#fde047', particle: { kind: 'petal', colors: ['#fde047', '#facc15', '#fb7185'], rate: 2 } },
  ram:      { sky: 'linear-gradient(#020617 0%, #1e1b4b 55%, #312e81 100%)', accent: '#fef3c7', particle: { kind: 'star', colors: ['#fef9c3', '#e0f2fe'], rate: 1 }, moon: true },
  vulan:    { sky: 'linear-gradient(#0c0a1f 0%, #312e81 50%, #be185d 100%)', accent: '#f9a8d4', particle: { kind: 'petal', colors: ['#fbcfe8', '#f9a8d4'], rate: 1 }, moon: true },
  trungthu: { sky: 'linear-gradient(#0f172a 0%, #1e3a8a 50%, #ea580c 100%)', accent: '#fdba74', particle: { kind: 'star', colors: ['#fed7aa', '#fef3c7'], rate: 1 }, moon: true },
  love:     { sky: 'linear-gradient(#4a044e 0%, #9d174d 50%, #fb7185 100%)', accent: '#fda4af', particle: { kind: 'heart', colors: ['#fb7185', '#f472b6', '#fecdd3'], rate: 1.5 } },
  muathi:   { sky: 'linear-gradient(#082f49 0%, #0e7490 50%, #fef08a 100%)', accent: '#7dd3fc', particle: { kind: 'star', colors: ['#bae6fd', '#fef08a'], rate: 0.7 } },
};
let theme = THEMES.default;
let accessory = null;

function applyEvent(dayEvent, lunarLabel) {
  theme = THEMES[dayEvent?.theme] || THEMES.default;
  accessory = dayEvent?.accessory || null;
  document.body.style.setProperty('--sky', theme.sky);
  document.body.style.setProperty('--accent', theme.accent);
  const bar = $('eventBar');
  if (dayEvent) { bar.style.display = 'block'; bar.textContent = `${dayEvent.banner} · ${lunarLabel}`; }
  else { bar.style.display = lunarLabel ? 'block' : 'none'; bar.textContent = `📅 ${lunarLabel || ''}`; }
  music.setTheme(dayEvent?.theme);
}

// ---------- Sprite ----------
let manifest = { birds: {}, spotlightLottie: {}, music: '' };
const sheets = {};

async function loadSprites() {
  manifest = await fetch('assets/sprites.json').then((r) => r.json());
  await Promise.all(Object.entries(manifest.birds).map(([id, s]) => new Promise((resolve) => {
    // Vẽ sheet ra canvas offscreen 1 lần: SVG/PNG đều chạy nhanh như bitmap khi vẽ hàng trăm chim
    const img = new Image();
    img.onload = () => {
      const off = document.createElement('canvas');
      off.width = s.frameW * s.frames; off.height = s.frameH;
      off.getContext('2d').drawImage(img, 0, 0, off.width, off.height);
      sheets[id] = { ...s, img: off };
      resolve();
    };
    img.onerror = () => { console.warn('Không tải được sprite', s.src); resolve(); };
    img.src = s.src;
  })));
}

// ---------- Bird simulation ----------
let birds = [];
let particles = [];
let blessingUntil = 0;

function spawnBird(ev, i) {
  const big = ev.tier === 'hac' || ev.tier === 'phuonghoang';
  birds.push({
    tier: ev.tier,
    userId: ev.user.id,
    x: W / 2 + (Math.random() - 0.5) * 260,
    y: H - 260 - i * 6,
    vx: (Math.random() - 0.5) * 3,
    vy: -(2.5 + Math.random() * 2.5) / Math.sqrt(ev.size),
    size: 64 * ev.size,
    team: ev.team ? TEAM_COLORS[ev.team] : null,
    t0: Math.random() * 1000,
    label: i === 0 ? (ev.size >= 1.6 ? ev.user.name : ev.wish || '') : '',
    glow: big || accessory === 'glow',
    acc: i === 0 || big ? accessory : null,
    life: 0,
  });
  if (birds.length > MAX_BIRDS) birds.splice(0, birds.length - MAX_BIRDS);
}

function drawAccessory(kind, s, t) {
  if (!kind || kind === 'glow') return;
  ctx.save();
  ctx.translate(0, s * 0.42);
  if (kind === 'lantern') {
    ctx.strokeStyle = '#fde68a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, s * 0.15); ctx.stroke();
    ctx.shadowColor = '#fb923c'; ctx.shadowBlur = 20;
    ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.ellipse(0, s * 0.27, s * 0.1, s * 0.13, 0, 0, Math.PI * 2); ctx.fill();
  } else if (kind === 'lixi') {
    ctx.fillStyle = '#dc2626'; ctx.fillRect(-s * 0.08, s * 0.08, s * 0.16, s * 0.22);
    ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.arc(0, s * 0.19, s * 0.035, 0, Math.PI * 2); ctx.fill();
  } else if (kind === 'heart') {
    ctx.fillStyle = '#fb7185'; ctx.font = `${Math.round(s * 0.28)}px serif`; ctx.textAlign = 'center'; ctx.fillText('❤', 0, s * 0.3);
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
  const sheet = sheets[b.tier] || sheets.se;
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.vx * 0.06);
  if (b.glow) { ctx.shadowColor = b.tier === 'phuonghoang' ? '#fb923c' : theme.accent; ctx.shadowBlur = 28; }
  if (sheet) {
    const f = Math.floor(((t + b.t0) / 1000) * sheet.fps) % sheet.frames;
    ctx.drawImage(sheet.img, f * sheet.frameW, 0, sheet.frameW, sheet.frameH, -b.size / 2, -b.size / 2, b.size, b.size);
  }
  ctx.shadowBlur = 0;
  if (b.team) { ctx.fillStyle = b.team; ctx.beginPath(); ctx.arc(0, b.size * 0.08, b.size * 0.06, 0, Math.PI * 2); ctx.fill(); }
  drawAccessory(b.acc, b.size, t);
  ctx.restore();

  if (b.label && b.life < 260) {
    ctx.font = 'bold 26px Segoe UI';
    ctx.textAlign = 'center';
    const w = ctx.measureText(b.label).width + 24;
    ctx.fillStyle = '#000a';
    ctx.fillRect(b.x - w / 2, b.y + b.size * 0.45, w, 36);
    ctx.fillStyle = '#fff';
    ctx.fillText(b.label, b.x, b.y + b.size * 0.45 + 27);
  }
}

function drawCage(t) {
  const cx = W / 2, cy = H - 220;
  ctx.save();
  ctx.shadowColor = theme.accent; ctx.shadowBlur = 40 + Math.sin(t / 300) * 15;
  ctx.fillStyle = '#f9a8d4';
  for (let i = 0; i < 8; i++) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate((i / 8) * Math.PI - Math.PI);
    ctx.beginPath(); ctx.ellipse(0, -60, 34, 80, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  ctx.fillStyle = '#fde68a';
  ctx.beginPath(); ctx.arc(cx, cy, 40, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawMoon(t) {
  ctx.save();
  ctx.shadowColor = '#fef3c7'; ctx.shadowBlur = 80;
  ctx.fillStyle = '#fefce8';
  ctx.globalAlpha = 0.85 + Math.sin(t / 2000) * 0.05;
  ctx.beginPath(); ctx.arc(860, 470, 110, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function spawnParticles() {
  const p = theme.particle;
  if (p && Math.random() < p.rate * 0.25) {
    particles.push({ kind: p.kind, x: Math.random() * W, y: -20, vy: 1 + Math.random() * 1.5, vx: (Math.random() - 0.5), rot: Math.random() * 6, c: p.colors[Math.floor(Math.random() * p.colors.length)], s: 8 + Math.random() * 10 });
  }
  if (performance.now() < blessingUntil) {
    for (let i = 0; i < 6; i++) particles.push({ kind: 'rain', x: Math.random() * W, y: -10, vy: 4 + Math.random() * 6, vx: 0, rot: 0, c: ['#fde68a', '#f9a8d4', '#a5f3fc'][i % 3], s: 8 });
  }
}

function drawParticle(p) {
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c;
  if (p.kind === 'petal') { ctx.beginPath(); ctx.ellipse(0, 0, p.s * 0.5, p.s, 0, 0, Math.PI * 2); ctx.fill(); }
  else if (p.kind === 'heart') { ctx.font = `${p.s * 2}px serif`; ctx.fillText('❤', 0, 0); }
  else if (p.kind === 'star') { ctx.globalAlpha = 0.6 + Math.random() * 0.4; ctx.fillRect(-p.s / 4, -p.s / 4, p.s / 2, p.s / 2); }
  else ctx.fillRect(0, 0, 6, 14);
  ctx.restore();
}

function frame(t) {
  ctx.clearRect(0, 0, W, H);
  if (theme.moon) drawMoon(t);

  spawnParticles();
  particles = particles.filter((p) => { p.y += p.vy; p.x += p.vx; p.rot += 0.02; return p.y < H + 20; });
  for (const p of particles) drawParticle(p);

  drawCage(t);
  for (const b of birds) {
    b.life++;
    b.vx += Math.sin((t + b.t0) / 700) * 0.05;
    b.vx *= 0.99;
    b.x += b.vx;
    b.y += b.vy;
    if (b.x < 30 || b.x > W - 30) b.vx *= -1;
    drawBird(b, t);
  }
  birds = birds.filter((b) => b.y > -120);
  requestAnimationFrame(frame);
}

// ---------- Lottie spotlight (tùy chọn) ----------
function playLottie(tier) {
  const url = manifest.spotlightLottie?.[tier];
  if (!url || !window.lottie) return;
  const box = $('lottie');
  box.innerHTML = '';
  const anim = window.lottie.loadAnimation({ container: box, renderer: 'svg', loop: false, autoplay: true, path: url });
  anim.addEventListener('complete', () => { anim.destroy(); box.innerHTML = ''; });
}

// ---------- Âm thanh: nhạc thiền + giọng đọc (mp3 từ server hoặc giọng trình duyệt) ----------
const music = new ZenMusic();
const voice = { queue: [], playing: null, last: 0 };

function say({ text, priority = 3, audio }) {
  if (priority >= 3 && Date.now() - voice.last < 5000) return;  // cooldown câu thường
  if (priority === 1) {                                         // ngắt mọi thứ đang đọc
    voice.queue = [];
    voice.playing?.stop();
    voice.playing = null;
  }
  voice.queue.push({ text, priority, audio });
  voice.queue.sort((a, b) => a.priority - b.priority);
  voice.queue = voice.queue.slice(0, 4);
  playNext();
}

function playNext() {
  if (voice.playing || !voice.queue.length) return;
  const item = voice.queue.shift();
  voice.last = Date.now();
  const done = () => { voice.playing = null; music.setVolume(music.volume); playNext(); };
  duck(true);

  if (item.audio) {
    const a = new Audio(item.audio);
    a.onended = a.onerror = done;
    a.play().catch(done);
    voice.playing = { stop: () => { a.pause(); duck(false); } };
  } else if ('speechSynthesis' in window) {
    const u = new SpeechSynthesisUtterance(item.text);
    u.lang = 'vi-VN';
    const vi = speechSynthesis.getVoices().find((v) => v.lang.startsWith('vi'));
    if (vi) u.voice = vi;
    u.onend = u.onerror = done;
    speechSynthesis.speak(u);
    voice.playing = { stop: () => { speechSynthesis.cancel(); duck(false); } };
  } else done();
}

// Hạ nhạc nền khi đang đọc để giọng rõ hơn
function duck(on) {
  if (!music.master) return;
  music.master.gain.setTargetAtTime(music.enabled ? (on ? music.volume * 0.35 : music.volume) : 0, music.ctx.currentTime, 0.3);
}

async function startAudio() {
  await music.start(manifest.music || null);
  $('soundHint').style.display = music.ctx?.state === 'running' ? 'none' : 'block';
}
// OBS Browser Source tự cho phát âm thanh. Trình duyệt thường thì cần 1 lần bấm.
document.addEventListener('click', () => { if (music.ctx?.state !== 'running') music.ctx?.resume(); $('soundHint').style.display = 'none'; });

// ---------- UI ----------
function feed(html) {
  const d = document.createElement('div'); d.innerHTML = html; $('feed').prepend(d);
  while ($('feed').children.length > 6) $('feed').lastChild.remove();
}

let bannerTimer;
function banner(html, sec) {
  const b = $('banner'); b.innerHTML = html; b.style.display = 'block';
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => (b.style.display = 'none'), sec * 1000);
}

function renderState(s) {
  const m = Math.floor(s.remaining / 60), sec = String(s.remaining % 60).padStart(2, '0');
  $('timer').textContent = s.state === 'RUNNING' ? `⏳ ${m}:${sec} · ${s.totalBirds} chim đã bay` : '✨ Tổng kết đợt phóng sanh ✨';
  $('teams').innerHTML = s.teams.map((t) => {
    TEAM_COLORS[t.id] = t.color; TEAM_NAMES[t.id] = t.name;
    const x = t.multiplier > 1 ? `<div class="x">x${t.multiplier}</div>` : '';
    return `<div class="team" style="border-color:${t.color}">${x}<b style="color:${t.color}">${esc(t.name)}</b><span>${t.score}</span><small>điểm phúc</small></div>`;
  }).join('');
  $('meter').style.width = Math.min(100, (s.meter / s.meterGoal) * 100) + '%';
  $('meterLbl').textContent = `Bầu Trời Bình An ${s.meter}/${s.meterGoal}`;
  $('donorList').innerHTML = s.topDonors.map((d, i) => `${['🥇', '🥈', '🥉'][i]} ${esc(d.name)} · ${d.diamonds}💎`).join('<br>') || '<i>Chưa có</i>';
  if (s.dayEvent?.id !== currentEventId) { currentEventId = s.dayEvent?.id; applyEvent(s.dayEvent, s.lunarLabel); }
}
let currentEventId = undefined;

function showWall(ev) {
  const list = ev.wishWall || [];
  $('wallWinner').innerHTML = `🏆 Nguyện ước <b style="color:${ev.winner.color}">${esc(ev.winner.name)}</b> dẫn đầu với ${ev.winner.score} điểm phúc · ${ev.totalBirds} chim đã bay`;
  $('wallList').innerHTML = list.length
    ? list.map((w, i) => {
        const ava = w.avatar ? `<img src="${esc(w.avatar)}">` : `<div class="noava">🕊️</div>`;
        const color = TEAM_COLORS[w.team] || '#fde68a';
        return `<div class="wish" style="border-color:${color};animation-delay:${0.3 + i * 0.35}s">
          <div class="rank">${['🥇', '🥈', '🥉'][i] || i + 1}</div>${ava}
          <div class="txt"><div class="w">“${esc(w.wish)}”</div><div class="n">${esc(w.name)}${w.team ? ' · ' + esc(TEAM_NAMES[w.team]) : ''}</div></div>
          <div class="p">${w.points}✨</div></div>`;
      }).join('')
    : '<div style="text-align:center;font-size:36px;opacity:.8">Đợt này chưa có lời nguyện. Gõ <b>!tha &lt;lời nguyện&gt;</b> ở đợt sau nhé!</div>';
  let left = ev.pauseSec || 20;
  const foot = () => ($('wallFoot').textContent = `Đợt mới bắt đầu sau ${left}s · Gõ !tha <lời nguyện> để lời nguyện của bạn lên tường`);
  foot();
  clearInterval(wallTimer);
  wallTimer = setInterval(() => { left--; if (left <= 0) clearInterval(wallTimer); else foot(); }, 1000);
  $('wall').style.display = 'block';
}
let wallTimer;

function onMessage(ev) {
  switch (ev.event) {
    case 'STATE': renderState(ev); break;
    case 'SAY': say(ev); break;
    case 'MUSIC': music.setEnabled(ev.on); music.setVolume(ev.volume); break;
    case 'BIRD_RELEASE':
      for (let i = 0; i < ev.count; i++) spawnBird(ev, i);
      if (ev.wish) feed(`🕊️ <b>${esc(ev.user.name)}</b>: “${esc(ev.wish)}”`);
      if (ev.spotlight > 0) {
        const img = ev.user.avatar ? `<img src="${esc(ev.user.avatar)}">` : '';
        banner(`${img}🌟 ${esc(ev.user.name)} vừa phóng sanh ${esc(ev.tierName)}! 🌟`, ev.spotlight);
        music.chime(ev.tier === 'phuonghoang' ? 2 : 1);
        playLottie(ev.tier);
      } else if (ev.giftName) {
        feed(`🎁 <b>${esc(ev.user.name)}</b> thả ${ev.count} ${esc(ev.tierName)}`);
      }
      break;
    case 'JOIN_TEAM': feed(`🙏 <b>${esc(ev.user.name)}</b> nguyện cầu <b style="color:${TEAM_COLORS[ev.team] || '#fff'}">${esc(TEAM_NAMES[ev.team] || ev.team)}</b>`); break;
    case 'BLESSING_RAIN':
      blessingUntil = performance.now() + ev.durationSec * 1000;
      banner('🌈 MƯA PHÚC LÀNH 🌈<br><small>Bầu trời đã đầy chim, cả phòng live cùng nhận may mắn!</small>', 5);
      music.chime(2);
      break;
    case 'VIP_ENTER':
      banner(`👑 Chào mừng ${esc(ev.title || 'Người Gieo Phúc')} ${esc(ev.user.name)} trở lại! 👑`, 4);
      break;
    case 'WISH_HIDDEN':
      birds.forEach((b) => { if (b.userId === ev.userId) b.label = ''; });
      break;
    case 'ROUND_START':
      birds = [];
      $('wall').style.display = 'none';
      currentEventId = ev.dayEvent?.id;
      applyEvent(ev.dayEvent, ev.lunarLabel);
      feed('🌅 Đợt phóng sanh mới bắt đầu!');
      break;
    case 'ROUND_END':
      showWall(ev);
      music.chime(2);
      break;
  }
}

function connect() {
  const ws = new WebSocket(`ws://${location.host}`);
  ws.onmessage = (m) => onMessage(JSON.parse(m.data));
  ws.onclose = () => setTimeout(connect, 2000);
}

await loadSprites();
requestAnimationFrame(frame);
startAudio();
connect();
