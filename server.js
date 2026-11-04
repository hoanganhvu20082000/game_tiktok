import './env.js';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { WebSocketServer } from 'ws';
import { TikTokLiveConnection, WebcastEvent } from 'tiktok-live-connector';
import { CONFIG } from './config.js';
import { Game } from './game.js';
import { TreeGame } from './tree_game.js';
import { ConcertGame } from './concert_game.js';
import { EVENTS } from './events.js';
import { synthesize, ttsProvider } from './tts.js';

// Cách chạy:
//   node server.js                            -> Phóng Sanh Chim, chế độ giả lập (bấm nút trên /admin.html)
//   node server.js <tiktok_user>              -> Phóng Sanh Chim, nối phòng live thật
//   node server.js [tiktok_user] --mode=tree  -> Cây Thông Kết Nối (overlay /tree.html, admin /tree_admin.html)
//   node server.js [tiktok_user] --mode=concert -> Đi Concert Tinh Hà Say Hi (overlay /concert.html, admin /concert_admin.html)
const args = process.argv.slice(2);
const MODE = (args.find((a) => a.startsWith('--mode=')) || '--mode=bird').split('=')[1];
const tiktokUser = args.find((a) => !a.startsWith('--'));
const PAGES = {
  tree: { overlay: 'tree.html', admin: 'tree_admin.html', name: 'Cây Thông Kết Nối' },
  concert: { overlay: 'concert.html', admin: 'concert_admin.html', name: 'Đi Concert Tinh Hà Say Hi' },
}[MODE] || { overlay: 'overlay.html', admin: 'admin.html', name: 'Phóng Sanh Chim' };

const app = express();
app.use(express.static('public'));
app.use('/tts', express.static(path.resolve('data', 'tts_cache'), { maxAge: '7d' }));
app.use('/vendor/lottie', express.static(path.resolve('node_modules', 'lottie-web', 'build', 'player')));
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });
// Overlay mở lại giữa chừng (OBS khởi động lại) nhận ngay toàn bộ cây
wss.on('connection', (ws) => {
  if (game.fullState) ws.send(JSON.stringify(game.fullState()));
});

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const c of wss.clients) if (c.readyState === 1) c.send(data);
}

// Giọng đọc: tạo mp3 ở server (FPT/Azure), overlay phát theo hàng đợi ưu tiên.
// Lỗi API thì rơi về giọng trình duyệt để live không bị im lặng.
async function say(text, priority = 3) {
  try {
    const file = await synthesize(text);
    broadcast({ event: 'SAY', text, priority, audio: file ? `/tts/${path.basename(file)}` : null });
  } catch (err) {
    console.warn('[TTS]', err.message);
    broadcast({ event: 'SAY', text, priority, audio: null });
  }
}

const game = MODE === 'tree' ? new TreeGame(broadcast, say)
  : MODE === 'concert' ? new ConcertGame(broadcast, say)
  : new Game(broadcast, say);

// ---------- Admin API (chỉ lắng nghe localhost, xem listen bên dưới) ----------
app.post('/api/admin/:cmd', (req, res) => {
  game.admin(req.params.cmd, req.body?.arg);
  res.json({ ok: true });
});

app.get('/api/admin/info', (req, res) => {
  if (game.adminInfo) return res.json({ tts: ttsProvider(), ...game.adminInfo() });
  res.json({
    mode: 'bird',
    tts: ttsProvider(),
    events: EVENTS.map((e) => ({ id: e.id, name: e.name })),
    override: game.eventOverride,
    current: game.snapshot().dayEvent,
    lunar: game.lunarLabel,
    wishes: game.recentWishes(),
  });
});

app.post('/api/admin/say', (req, res) => {
  say(String(req.body?.text || '').slice(0, 300), 2);
  res.json({ ok: true });
});

// Giả lập sự kiện để test overlay khi chưa live
app.post('/api/sim', (req, res) => {
  const { type, name = 'tester', value = 1, comment = '', gift = 'Quà test', streak = 0 } = req.body || {};
  const user = { uniqueId: name, nickname: name, avatar: '' };
  if (type === 'chat') game.onChat(user, comment);
  if (type === 'like') game.onLike(user, Number(value));
  if (type === 'follow') game.onFollow(user);
  if (type === 'share') game.onShare(user);
  if (type === 'gift') {
    // streak > 0: giả lập quà combo, gói đầu tiên đến trước (chưa chốt), streak chốt sau `streak` ms
    if (Number(streak) > 0 && game.onGiftStreak) {
      game.onGiftStreak(user, String(gift));
      setTimeout(() => game.onGift(user, String(gift), Number(value)), Number(streak));
    } else game.onGift(user, String(gift), Number(value));
  }
  if (type === 'member') game.onMember(user);
  res.json({ ok: true });
});

// ---------- TikTok LIVE ----------
function toUser(u) {
  return {
    uniqueId: u?.uniqueId || 'unknown',
    nickname: u?.nickname || u?.uniqueId || 'Khách',
    avatar: u?.profilePicture?.url?.[0] || u?.profilePicture?.urls?.[0] || '',
  };
}

function startTikTok(username) {
  const conn = new TikTokLiveConnection(username, { enableExtendedGiftInfo: true });
  let retryTimer = null;

  conn.on(WebcastEvent.CHAT, (d) => game.onChat(toUser(d.user), d.comment || ''));
  conn.on(WebcastEvent.LIKE, (d) => game.onLike(toUser(d.user), d.likeCount || 1));
  conn.on(WebcastEvent.FOLLOW, (d) => game.onFollow(toUser(d.user)));
  conn.on(WebcastEvent.SHARE, (d) => game.onShare(toUser(d.user)));
  conn.on(WebcastEvent.MEMBER, (d) => game.onMember(toUser(d.user)));
  conn.on(WebcastEvent.GIFT, (d) => {
    const giftType = d.giftDetails?.giftType;
    // Quà streak (giftType 1): chỉ xử lý khi streak kết thúc để không đếm trùng
    // Riêng Concert: gói đầu tiên của streak được báo trước để zoom Tier 1 ngay lập tức
    if (giftType === 1 && !d.repeatEnd) {
      if (game.onGiftStreak) game.onGiftStreak(toUser(d.user), d.giftDetails?.giftName || 'Quà');
      return;
    }
    const perGift = d.giftDetails?.diamondCount ?? d.extendedGiftInfo?.diamond_count ?? 1;
    const diamonds = perGift * (d.repeatCount || 1);
    game.onGift(toUser(d.user), d.giftDetails?.giftName || 'Quà', diamonds);
  });
  conn.on(WebcastEvent.STREAM_END, () => console.log('Live đã kết thúc.'));

  // Dùng lại 1 đối tượng kết nối và chỉ hẹn 1 lần thử lại, tránh mở nhiều kết nối trùng
  const scheduleRetry = (ms) => {
    if (retryTimer) return;
    retryTimer = setTimeout(() => { retryTimer = null; connect(); }, ms);
  };
  async function connect() {
    try {
      const state = await conn.connect();
      console.log(`Đã kết nối phòng live @${username} (roomId ${state.roomId})`);
    } catch (err) {
      console.error('Không kết nối được TikTok LIVE:', err?.message || err);
      scheduleRetry(15000);
    }
  }
  conn.on('disconnected', () => {
    console.warn('Mất kết nối TikTok, thử lại sau 10s...');
    scheduleRetry(10000);
  });
  connect();
}

server.listen(CONFIG.port, '127.0.0.1', () => {
  console.log(`Chế độ : ${PAGES.name}`);
  console.log(`Overlay: http://localhost:${CONFIG.port}/${PAGES.overlay} (Browser Source 1080x1920)`);
  console.log(`Admin  : http://localhost:${CONFIG.port}/${PAGES.admin}`);
  console.log(`Giọng đọc: ${ttsProvider()}`);
  if (tiktokUser) startTikTok(tiktokUser);
  else console.log('Chế độ giả lập. Chạy "node server.js <tiktok_username>" để nối live thật.');
});
