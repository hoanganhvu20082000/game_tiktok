// Kiểm tra luật chế độ Concert khi server đang chạy:
//   PORT=3057 CONCERT_MAX_TRACK_SEC=40 node server.js --mode=concert
//   PORT=3057 node scripts/concert_test.js
import WebSocket from 'ws';

const PORT = process.env.PORT || 3000;
const BASE = `http://127.0.0.1:${PORT}`;
const post = (p, body) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
const sim = (type, name, extra = {}) => post('/api/sim', { type, name, ...extra });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const seen = {};
const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
ws.on('message', (m) => { const d = JSON.parse(m); (seen[d.event] ||= []).push(d); });
await new Promise((r) => ws.on('open', r));
let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };
const focusOf = (user) => (seen.FOCUS_EVENT || []).filter((f) => f.user.id === user);

await post('/api/admin/reset');
await sleep(300);
check('overlay nhận CONCERT_FULL khi kết nối', (seen.CONCERT_FULL || []).length >= 1);
check('có bài đang phát (synth, có giấy phép)', seen.CONCERT_FULL[0].nowPlaying?.track?.type === 'synth', seen.CONCERT_FULL[0].nowPlaying?.track?.title);

// --- Khán giả & khu ---
await sim('member', 'a');
await sim('chat', 'a', { comment: '!vao' });
await sleep(200);
check('!vao chuyển xuống khu GA', seen.FAN.filter((f) => f.user.id === 'a').at(-1)?.zone === 'ga');
await sleep(3100);
await sim('chat', 'a', { comment: '!light xanh' });
await sleep(200);
check('!light đổi màu lightstick', seen.FAN.filter((f) => f.user.id === 'a').at(-1)?.light === '#38bdf8');

// --- Tier 1: zoom ngay ---
await sim('gift', 't1', { value: 1, gift: 'Hoa Hồng' });
await sleep(150);
const f1 = focusOf('t1')[0];
check('Tier 1 = AVATAR_ZOOM, không có Anh Trai', f1?.tier === 1 && f1.effect === 'AVATAR_ZOOM' && !f1.anhTraiAppearance.enabled);

// --- Quà combo: zoom ngay ở gói đầu tiên, chốt streak không zoom lặp ---
await sleep(2600);
await sim('gift', 'st', { value: 5, gift: 'Hoa Hồng', streak: 800 });
await sleep(100);
check('streak: zoom Tier 1 ngay khi gói đầu đến', focusOf('st').length === 1 && focusOf('st')[0].tier === 1);
await sleep(1000);
check('streak chốt (5 xu, vẫn Tier 1): không zoom lặp', focusOf('st').length === 1);

// --- Tier 2 ---
await sleep(2600);
await sim('gift', 't2', { value: 10, gift: 'Kem' });
await sleep(150);
const f2 = focusOf('t2')[0];
check('Tier 2 = SPOTLIGHT, không có Anh Trai', f2?.effect === 'SPOTLIGHT' && !f2.anhTraiAppearance.enabled);

// --- Tier 1 khi camera bận -> PiP ---
await sim('gift', 'p1', { value: 1 });
await sleep(150);
check('Tier 1 lúc camera bận -> PiP', focusOf('p1')[0]?.pip === true);

// --- Cộng dồn 10s lên tier cao hơn ---
await sleep(3600);
await sim('gift', 'acc', { value: 60 });
await sim('gift', 'acc', { value: 50 });
await sleep(200);
check('60 xu -> Tier 2 trước', focusOf('acc')[0]?.tier === 2);
await sleep(3800); // Tier 3 chờ Tier 2 chạy xong (hàng đợi)
check('cộng dồn 60+50 xu trong 10s -> lên Tier 3', focusOf('acc').some((f) => f.tier === 3), focusOf('acc').map((f) => f.tier).join(','));

// --- Tier 3: Anh Trai 3s, 1 người ---
await sleep(6000);
await sim('gift', 't3', { value: 100, gift: 'Corgi' });
await sleep(150);
const f3 = focusOf('t3')[0];
check('Tier 3: Anh Trai xuất hiện 3s, 1 người', f3?.anhTraiAppearance.enabled && f3.anhTraiAppearance.durationSec === 3 && typeof f3.anhTraiAppearance.members === 'number');
await sleep(300);
check('Tier 3: chuyển lên khu VIP', seen.FAN.filter((f) => f.user.id === 't3').at(-1)?.zone !== 'stand');

// --- Tier 4 cắt ngang Tier 3, Anh Trai cả nhóm, lên sân khấu ---
const seekBefore = (seen.MUSIC_SEEK || []).length;
await sim('gift', 't4', { value: 500, gift: 'Sư Tử' });
await sleep(1200);
const f4 = focusOf('t4')[0];
check('Tier 4 = STAGE_INVITE, cắt ngang', f4?.effect === 'STAGE_INVITE' && f4.interrupt === true);
check('Tier 4: Anh Trai cả nhóm 3s', f4?.anhTraiAppearance.members === 'ALL' && f4.anhTraiAppearance.durationSec === 3);
check('Tier 4: có vị trí trên sân khấu', f4?.stageSlot === 0, `slot=${f4?.stageSlot}`);
check('Tier 4: nhạc nhảy tới điệp khúc', (seen.MUSIC_SEEK || []).length > seekBefore);
check('Tier 4: TTS ưu tiên 1', (seen.SAY || []).some((s) => s.priority === 1 && s.text.includes('t4')));
const st = seen.CONCERT_STATE.at(-1);
check('Tier 4: khách mời trong state', st.stageGuests.some((g) => g.user.id === 't4'));
check('Top Fan có t4', st.topFans[0]?.id === 't4');
await sleep(10500);
const resumed = focusOf('t3').filter((f) => f.resumed);
check('Tier 3 bị cắt được phát lại sau Tier 4', resumed.length === 1, `resumed=${resumed.length}`);

// --- Bot không vào bảng xếp hạng ---
const info = await fetch(BASE + '/api/admin/info').then((r) => r.json());
check('Bot không có trong Top Fan / Bảng vàng', !info.topFans.some((f) => /^bot/i.test(f.id)) && !info.hallOfFame.some((f) => /^bot/i.test(f.id)));
check('Bot Fan lấp chỗ trống', info.audience.bots > 0, `bots=${info.audience.bots}`);
check('Anh Trai chỉ xuất hiện ở Tier 3/4', seen.FOCUS_EVENT.every((f) => f.anhTraiAppearance.enabled === (f.tier >= 3)));

// --- Đổi mức Tier ---
await post('/api/admin/tiers', { arg: [20, 200, 1000] });
await sleep(6000);
await sim('gift', 'nt', { value: 15 });
await sleep(150);
check('Đổi ngưỡng: 15 xu thành Tier 1', focusOf('nt').at(-1)?.tier === 1);
await post('/api/admin/tiers', { arg: [10, 100, 500] });

// --- Vote + chuyển bài ---
const npBefore = (seen.NOW_PLAYING || []).length;
await post('/api/admin/next');
await sleep(300);
check('chuyển bài ngay', (seen.NOW_PLAYING || []).length === npBefore + 1);
check('chuyển bài -> khách mời xuống sân khấu', (seen.STAGE_CLEAR || []).length >= 1);
const cur = seen.NOW_PLAYING.at(-1);
const waitVote = Math.max(0, cur.endAt - Date.now() - 29000);
if (waitVote < 20000) {
  await sleep(waitVote + 1500);
  const vs = seen.VOTE_START?.at(-1);
  check('mở vote trước khi hết bài', !!vs && vs.options.length >= 2);
  if (vs) {
    for (const n of ['v1', 'v2', 'v3']) await sim('chat', n, { comment: '!bai 2' });
    await sleep(Math.max(0, vs.endsAt - Date.now()) + 1500);
    const next = seen.NOW_PLAYING.at(-1);
    check('bài được vote nhiều nhất phát tiếp', next.track.title === vs.options[1].title, `${next.track.title} vs ${vs.options[1].title}`);
  }
} else console.log('SKIP  vote (chạy server với CONCERT_MAX_TRACK_SEC=40 để kiểm tra)');

// --- Độ cháy -> Encore ---
await post('/api/admin/hype');
await sleep(300);
check('Bùng nổ -> playlist Encore', seen.HYPE_BURST?.length >= 1 && seen.NOW_PLAYING.at(-1).playlist.id === 'encore');

for (const p of ['/concert.html', '/concert.js', '/concert_music.js', '/concert.css', '/concert_admin.html', '/assets/concert/manifest.json', '/assets/concert/playlists.json']) {
  const r = await fetch(BASE + p);
  check('GET ' + p, r.ok);
}
if (process.env.DEBUG) for (const f of seen.FOCUS_EVENT) console.log(f.focusId, f.user.id, 'tier', f.tier, f.pip ? 'pip' : '', f.resumed ? 'resumed' : '');
ws.close();
console.log(fails ? `\n${fails} kiểm tra lỗi` : '\nTất cả kiểm tra đều qua');
process.exit(fails ? 1 : 0);
