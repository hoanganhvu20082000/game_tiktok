// Kiểm tra luật Cây Thông Kết Nối khi server đang chạy với --mode=tree:
//   set TREE_WIRE_COOLDOWN_MS=0 & set TREE_LIT_HOLD_SEC=2 & set PORT=3056 & node server.js --mode=tree
//   set PORT=3056 & node scripts/tree_test.js
import WebSocket from 'ws';

const PORT = process.env.PORT || 3000;
const BASE = `http://127.0.0.1:${PORT}`;
const post = (p, body) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
const sim = (name, type, extra = {}) => post('/api/sim', { name, type, ...extra });
const chat = (name, comment) => sim(name, 'chat', { comment });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const seen = {};
const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
ws.on('message', (m) => { const d = JSON.parse(m); (seen[d.event] ||= []).push(d); });
await new Promise((r) => ws.on('open', r));
let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };
const last = (e) => seen[e]?.at(-1);
const info = () => fetch(BASE + '/api/admin/info').then((r) => r.json());

await post('/api/admin/reset');
await sleep(200);
check('TREE_FULL khi kết nối', !!seen.TREE_FULL);

// Treo quả châu bằng tương tác
for (const n of ['an', 'binh', 'chi', 'dung', 'em']) await sim(n, 'like', { value: 15 });
await sleep(200);
let i = await info();
check('5 quả châu có số', i.ornaments === 5 && i.list.every((o) => o.num >= 1 && o.num <= 5), JSON.stringify(i.list.map((o) => o.num)));
const num = Object.fromEntries(i.list.map((o) => [o.name, o.num]));

// Nối dây theo số và theo @tên
await chat('an', `!noi ${num.binh} Giáng sinh vui nhé`);
await sleep(150);
let w = last('WIRE');
check('!noi số tạo dây có lời chúc', w?.from === num.an && w?.to === num.binh && w.msg === 'Giáng sinh vui nhé' && w.lonely === true);

await chat('binh', '!noi @an');
await sleep(150);
check('nối lại thành dây đôi', last('WIRE')?.double === true);

// Chòm sao: an-binh, an-chi, binh-chi đều dây đôi
await chat('an', `!noi ${num.chi}`); await chat('chi', `!noi ${num.an}`);
await chat('binh', `!noi ${num.chi}`); await chat('chi', `!noi ${num.binh}`);
await sleep(300);
check('chòm sao 3 người', (seen.CONSTELLATION || []).length === 1, JSON.stringify(last('CONSTELLATION')?.nums));

// Chống trùng / tự nối
const before = (seen.WIRE || []).length;
await chat('an', `!noi ${num.binh}`);
await chat('an', `!noi ${num.an}`);
await sleep(150);
check('không nối trùng, không tự nối', (seen.WIRE || []).length === before);

// Giới hạn 5 dây miễn phí
for (const t of ['dung', 'em', 'f1', 'f2', 'f3', 'f4']) await sim(t, 'like', { value: 15 });
i = await info();
const n2 = Object.fromEntries(i.list.map((o) => [o.name, o.num]));
for (const t of ['dung', 'em', 'f1', 'f2']) await chat('an', `!noi ${n2[t]}`); // an đã dùng 2 dây (binh, chi) -> thêm 3 là hết
await sleep(200);
const anWires = (seen.WIRE || []).filter((x) => x.from === num.an && !x.silent).length;
check('hết 5 dây miễn phí', anWires === 5 && !!(seen.TOAST || []).find((t) => t.kind === 'nowire'), `anWires=${anWires}`);

// Quà cho thêm dây + dây vàng tới quả châu cô đơn
await sim('an', 'gift', { value: 10 });
await sleep(200);
check('quà 10 xu: dây vàng tới người cô đơn', !!last('GOLD_WIRES'), JSON.stringify(last('GOLD_WIRES')?.nums));
await sim('h1', 'like', { value: 15 });
const h1 = (await info()).list.find((o) => o.name === 'h1').num;
await chat('an', `!noi ${h1}`);
await sleep(150);
check('quà cho thêm dây', last('WIRE')?.to === h1);
await chat('chi', `!noi ${n2.dung}`);
await sleep(150);

// Tầng & ngôi sao
await sim('rich', 'gift', { value: 600 });
await sleep(200);
i = await info();
const rich = i.list.find((o) => o.name === 'rich');
check('quà ≥500 xu: Ngôi sao + Ông Già Noel', rich?.tier === 5 && !!last('SANTA') && !!last('STAR_CHANGE'));
await sim('richer', 'gift', { value: 900 });
await sleep(200);
i = await info();
check('soán ngôi sao, người cũ xuống tầng 4', i.list.find((o) => o.name === 'richer')?.tier === 5 && i.list.find((o) => o.name === 'rich')?.tier === 4);
await sim('mid', 'gift', { value: 40 });
await sleep(150);
i = await info();
check('30 xu lên tầng 3', i.list.find((o) => o.name === 'mid')?.tier === 3);
check('3 dây lên tầng 2 không cần quà', i.list.find((o) => o.name === 'chi')?.tier >= 2, `chi tier=${i.list.find((o) => o.name === 'chi')?.tier}`);

// !cat
const cutBefore = (await info()).wires;
// an đã nối tới dung; chi cũng nối tới dung. dung cắt an.
await chat('dung', `!cat ${num.an}`);
await sleep(150);
check('!cat gỡ dây', !!last('WIRE_CUT') && (await info()).wires === cutBefore - 1);
await sim('an', 'gift', { value: 5 });
const wBefore = (seen.WIRE || []).length;
await chat('an', `!noi ${n2.dung}`);
await sleep(150);
check('bị cắt rồi không nối lại được', (seen.WIRE || []).length === wBefore);

// Hộp quà bí ẩn
await post('/api/admin/mystery');
await sleep(100);
await chat('dung', '!mo'); await chat('em', '!mo');
await sleep(200);
check('hộp quà: người đầu tiên mở', (seen.MYSTERY_OPEN || []).length === 1 && last('MYSTERY_OPEN').user.id === 'dung', last('MYSTERY_OPEN')?.text);

// Sưởi ấm
for (const t of ['g1', 'g2', 'g3']) await sim(t, 'like', { value: 15 });
await post('/api/admin/warm');
await sleep(150);
const warm = last('WARM_START');
check('thử thách sưởi ấm chọn quả châu cô đơn', !!warm);
if (warm) {
  await sim('g9', 'like', { value: 15 });
  await chat('g9', `!noi ${warm.num}`);
  await sleep(150);
  check('nối trong thử thách được tính', last('WIRE')?.warm === true);
}

// Hợp xướng: 8 người khác nhau
for (let k = 0; k < 8; k++) await chat('c' + k, 'Merry Christmas mọi người');
await sleep(200);
check('hợp xướng 8 người', !!last('CHORUS'));

// @ người chưa có quả châu nhưng đã vào phòng
await sim('newbie', 'member');
await chat('em', '!noi @newbie');
await sleep(150);
check('@ người mới vào phòng: tự treo quả châu', last('WIRE')?.toUser?.id === 'newbie');

// Bừng sáng và sang cây mới
await post('/api/admin/lit');
await sleep(300);
const lit = last('TREE_LIT');
check('cây bừng sáng có danh hiệu', !!lit && !!lit.titles.star && !!lit.titles.heart, JSON.stringify(lit?.titles && Object.fromEntries(Object.entries(lit.titles).map(([k, v]) => [k, v?.name]))));
await sleep(3500);
check('tự sang cây số 2', last('TREE_NEXT')?.index === 2, `goal=${last('TREE_NEXT')?.goal}`);
i = await info();
check('cây mới: số quả châu giữ nguyên, dây làm mới', i.wires === 0 && i.ornaments > 10);

// Ban
await post('/api/admin/ban', { arg: 'f1' });
await sleep(100);
check('MC gỡ người khỏi cây', !!last('ORN_REMOVE') && !(await info()).list.find((o) => o.name === 'f1'));

// Tầng 1 đầy -> người im lặng rơi xuống gốc
for (let k = 0; k < 80; k++) await sim('crowd' + k, 'like', { value: 15 });
await sleep(1300); // TREE_STATE gửi mỗi 1 giây
const st = last('TREE_STATE');
check('đông người: có hộp quà dưới gốc', st.pile > 0, `pile=${st.pile} people=${st.people}`);

for (const p of ['/tree.html', '/tree.js', '/tree.css', '/tree_layout.js', '/tree_admin.html']) {
  const r = await fetch(BASE + p);
  check('GET ' + p, r.ok);
}
ws.close();
console.log(fails ? `${fails} FAIL` : 'ALL PASS');
process.exit(fails ? 1 : 0);
