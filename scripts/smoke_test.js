// Kiểm tra nhanh luồng chính khi server đang chạy: node scripts/smoke_test.js
import WebSocket from 'ws';

const PORT = process.env.PORT || 3000;
const BASE = `http://127.0.0.1:${PORT}`;
const post = (p, body) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const seen = {};
const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
ws.on('message', (m) => { const d = JSON.parse(m); (seen[d.event] ||= []).push(d); });
await new Promise((r) => ws.on('open', r));

const check = (name, ok, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`);

await post('/api/admin/event', { arg: 'mua_thi' });
await sleep(300);
const start = seen.ROUND_START?.at(-1);
check('ép sự kiện Mùa Thi', start?.dayEvent?.id === 'mua_thi', start?.lunarLabel);

await post('/api/sim', { type: 'chat', name: 'a', comment: '!hocvan' });
await sleep(4100);
await post('/api/sim', { type: 'chat', name: 'a', comment: '!tha Thi đỗ đại học' });
await post('/api/sim', { type: 'chat', name: 'b', comment: '!tha Gia đình bình an' });
await post('/api/sim', { type: 'gift', name: 'b', value: 100 });
await post('/api/sim', { type: 'chat', name: 'c', comment: '!tha đm bậy bạ' });
await sleep(1200);

const st = seen.STATE.at(-1);
const hv = st.teams.find((t) => t.id === 'hocvan');
check('Học Vấn x2 điểm', hv.multiplier === 2 && hv.score === 2, `score=${hv.score}`);
check('đếm người mỗi phe', hv.members === 1 && hv.top?.name === 'a');
check('SAY có phát ra', (seen.SAY || []).length > 0, (seen.SAY || []).map((s) => s.text).slice(-1)[0]);

const info = await fetch(BASE + '/api/admin/info').then((r) => r.json());
check('lời nguyện bậy bị lọc', !info.wishes.some((w) => w.name === 'c'));
await post('/api/admin/hide-wish', { arg: 'b' });
const info2 = await fetch(BASE + '/api/admin/info').then((r) => r.json());
check('MC ẩn lời nguyện', !info2.wishes.some((w) => w.id === 'b'));

// ---- tương tác giữa người xem ----
await post('/api/sim', { type: 'chat', name: 'd', comment: '!suckhoe' });
await sleep(4100);
await post('/api/sim', { type: 'chat', name: 'd', comment: '!tang @a Chúc bạn đỗ cao' });
await post('/api/sim', { type: 'chat', name: 'b', comment: '!chuc @a' });
await post('/api/sim', { type: 'chat', name: 'b', comment: '!chuc @a' }); // trùng cặp, không tính
await sleep(300);
const letter = seen.LETTER?.at(-1);
check('thư chim !tang @a', letter?.from.id === 'd' && letter?.to.id === 'a' && letter.message === 'Chúc bạn đỗ cao');
check('chúc phúc chỉ 1 lần/cặp', (seen.BLESS || []).length === 1, `count=${seen.BLESS?.at(-1)?.count}`);
await post('/api/sim', { type: 'gift', name: 'd', value: 500 });
await sleep(300);
const ded = seen.BIRD_RELEASE.filter((e) => e.user.id === 'd').at(-1);
check('quà sau !tang ghi "dành tặng"', ded?.to?.id === 'a');

await post('/api/admin/golden');
await sleep(200);
await post('/api/sim', { type: 'chat', name: 'e', comment: '!bat' });
await post('/api/sim', { type: 'chat', name: 'f', comment: '!bat' });
await sleep(300);
check('Chim Vàng: người đầu tiên bắt được', (seen.GOLDEN_CAUGHT || []).length === 1 && seen.GOLDEN_CAUGHT[0].user.id === 'e');

for (let i = 0; i < 12; i++) await post('/api/sim', { type: 'like', name: 'combo' + i, value: 15 });
await sleep(1200);
check('combo cả phòng tăng', seen.STATE.at(-1).combo.mult > 1, JSON.stringify(seen.STATE.at(-1).combo));

await post('/api/admin/end');
await sleep(1500);
const end = seen.ROUND_END?.at(-1);
check('Bức Tường Lời Nguyện', end && end.wishWall[0]?.wish === 'Thi đỗ đại học' && end.wishWall[0].blessings >= 2, JSON.stringify(end?.wishWall));

for (const p of ['/overlay.html', '/overlay.js', '/music.js', '/assets/sprites.json', '/assets/birds/phuonghoang.svg', '/vendor/lottie/lottie.min.js']) {
  const r = await fetch(BASE + p);
  check('GET ' + p, r.ok);
}
await post('/api/admin/event', { arg: 'auto' });
ws.close();
process.exit(0);
