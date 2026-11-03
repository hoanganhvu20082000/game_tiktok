// Sinh sprite sheet SVG cho 4 loại chim: 6 khung hình vỗ cánh xếp ngang, mỗi khung 128x128.
// Chạy: node scripts/make_sprites.js  -> ghi vào public/assets/birds/
// Muốn dùng hình của designer: thay file .svg/.png cùng tên và sửa "frames" trong public/assets/sprites.json
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('public', 'assets', 'birds');
const F = 128;           // kích thước 1 khung
const FRAMES = 6;

const BIRDS = {
  se: {
    body: '#b08354', belly: '#ecd9b8', wing: '#8a5a33', wingTip: '#4a2f1a', head: '#7a4b28', beak: '#f2b33d',
    tail: 'short', crown: null, neck: 0,
  },
  bocau: {
    body: '#f8fafc', belly: '#ffffff', wing: '#e2e8f0', wingTip: '#cbd5e1', head: '#f1f5f9', beak: '#fca5a5',
    tail: 'fan', crown: null, neck: 0,
  },
  hac: {
    body: '#ffffff', belly: '#ffffff', wing: '#f8fafc', wingTip: '#111827', head: '#ffffff', beak: '#94a3b8',
    tail: 'short', crown: '#dc2626', neck: 12,
  },
  phuonghoang: {
    body: '#f97316', belly: '#fde047', wing: 'url(#fire)', wingTip: '#b91c1c', head: '#fb923c', beak: '#fde68a',
    tail: 'phoenix', crown: '#fde047', neck: 6,
  },
};

// góc nâng cánh theo khung (độ), tạo chu kỳ vỗ mượt: lên - ngang - xuống - ngang
const FLAP = [-55, -25, 10, 35, 10, -25];

function wingPath(side, lift) {
  // cánh xuất phát từ vai (0,-6), đầu cánh xoay theo "lift"
  const rad = (lift * Math.PI) / 180;
  const len = 52;
  const tipX = side * Math.cos(rad) * len;
  const tipY = -6 + Math.sin(rad) * len;
  const midX = side * Math.cos(rad) * len * 0.55;
  const midY = -6 + Math.sin(rad) * len * 0.55;
  return {
    wing: `M ${side * 6} -10 Q ${midX} ${midY - 16} ${tipX} ${tipY} Q ${midX + side * 2} ${midY + 14} ${side * 6} 6 Z`,
    tip: `M ${midX + side * 10} ${midY - 6} Q ${tipX * 0.92} ${tipY - 4} ${tipX} ${tipY} Q ${tipX * 0.85} ${tipY + 8} ${midX + side * 12} ${midY + 8} Z`,
  };
}

function tail(kind, c) {
  if (kind === 'fan') return `<path d="M -12 22 L 0 46 L 12 22 Z" fill="${c.wing}"/>`;
  if (kind === 'phoenix') {
    return [
      `<path d="M -4 20 C -20 36, -12 48, -24 58" stroke="#f59e0b" stroke-width="6" fill="none" stroke-linecap="round"/>`,
      `<path d="M 0 22 C 0 40, 5 50, 0 62" stroke="#ef4444" stroke-width="7" fill="none" stroke-linecap="round"/>`,
      `<path d="M 4 20 C 20 36, 12 48, 24 58" stroke="#fde047" stroke-width="6" fill="none" stroke-linecap="round"/>`,
      `<circle cx="-24" cy="58" r="5" fill="#22d3ee"/><circle cx="0" cy="62" r="5" fill="#22d3ee"/><circle cx="24" cy="58" r="5" fill="#22d3ee"/>`,
    ].join('');
  }
  return `<path d="M -8 20 L 0 36 L 8 20 Z" fill="${c.wing}"/>`;
}

function frame(c, i) {
  const lift = FLAP[i];
  const L = wingPath(-1, lift);
  const R = wingPath(1, lift);
  const headY = -22 - c.neck;
  return `
  <g transform="translate(${i * F + F / 2} ${F / 2 - 6})">
    ${tail(c.tail, c)}
    <path d="${L.wing}" fill="${c.wing}" stroke="#0002" stroke-width="1"/>
    <path d="${R.wing}" fill="${c.wing}" stroke="#0002" stroke-width="1"/>
    <path d="${L.tip}" fill="${c.wingTip}"/>
    <path d="${R.tip}" fill="${c.wingTip}"/>
    <ellipse cx="0" cy="4" rx="11" ry="20" fill="${c.body}"/>
    <ellipse cx="0" cy="8" rx="6.5" ry="13" fill="${c.belly}"/>
    ${c.neck ? `<rect x="-3.5" y="${headY}" width="7" height="${c.neck + 8}" rx="3.5" fill="${c.body}"/>` : ''}
    <circle cx="0" cy="${headY}" r="8.5" fill="${c.head}"/>
    ${c.crown ? `<circle cx="0" cy="${headY - 5}" r="3.6" fill="${c.crown}"/>` : ''}
    <path d="M -3 ${headY - 8} L 0 ${headY - (c.neck ? 22 : 15)} L 3 ${headY - 8} Z" fill="${c.beak}"/>
    <circle cx="-3.4" cy="${headY - 2}" r="1.6" fill="#111"/>
    <circle cx="3.4" cy="${headY - 2}" r="1.6" fill="#111"/>
  </g>`;
}

fs.mkdirSync(OUT, { recursive: true });
for (const [id, c] of Object.entries(BIRDS)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${F * FRAMES}" height="${F}" viewBox="0 0 ${F * FRAMES} ${F}">
  <defs><linearGradient id="fire" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#fde047"/><stop offset="0.5" stop-color="#f97316"/><stop offset="1" stop-color="#dc2626"/>
  </linearGradient></defs>
  ${Array.from({ length: FRAMES }, (_, i) => frame(c, i)).join('')}
</svg>`;
  fs.writeFileSync(path.join(OUT, `${id}.svg`), svg);
  console.log('wrote', path.join(OUT, `${id}.svg`));
}
