import { solarToLunar } from './lunar.js';
import { CONFIG } from './config.js';

// Sự kiện theo ngày. Danh sách xếp theo độ ưu tiên: sự kiện đầu tiên khớp sẽ được dùng.
// s = ngày dương {d, m, y}; l = ngày âm {day, month, year, leap}
//   multipliers: nhân điểm phúc cho từng phe; all: nhân cho mọi phe
//   theme: đổi bầu trời + hạt trang trí trên overlay; accessory: vật chim mang theo
export const EVENTS = [
  {
    id: 'tet', name: 'Tết Nguyên Đán', theme: 'tet', accessory: 'lixi',
    match: (s, l) => l.month === 1 && l.day <= 7 && !l.leap,
    multipliers: { tailoc: 2 },
    banner: '🧧 Tết đến xuân về · Chim mang lì xì · Phe Tài Lộc x2 điểm phúc',
    tts: 'Chúc mừng năm mới! Hôm nay phe Tài Lộc được nhân đôi điểm phúc.',
  },
  {
    id: 'ram_gieng', name: 'Rằm Tháng Giêng', theme: 'ram', accessory: 'glow',
    match: (s, l) => l.month === 1 && l.day === 15 && !l.leap,
    all: 2,
    banner: '🌕 Rằm Tháng Giêng · Chim phát sáng · Mọi phe x2 điểm phúc',
    tts: 'Rằm tháng Giêng, mọi nguyện ước đều được nhân đôi điểm phúc.',
  },
  {
    id: 'vu_lan', name: 'Rằm Tháng Bảy · Vu Lan', theme: 'vulan', accessory: 'lotus',
    match: (s, l) => l.month === 7 && l.day === 15 && !l.leap,
    multipliers: { suckhoe: 2 }, all: 1.5,
    banner: '🪷 Mùa Vu Lan · Cầu an cho cha mẹ · Phe Sức Khỏe x3 điểm phúc',
    tts: 'Mùa Vu Lan báo hiếu. Hãy thả chim cầu an cho cha mẹ, phe Sức Khỏe được nhân ba điểm phúc.',
  },
  {
    id: 'trung_thu', name: 'Tết Trung Thu', theme: 'trungthu', accessory: 'lantern',
    match: (s, l) => l.month === 8 && l.day === 15 && !l.leap,
    all: 1.5,
    banner: '🏮 Trung Thu · Chim mang đèn lồng · Mọi phe x1.5 điểm phúc',
    tts: 'Chúc mừng Tết Trung Thu! Mọi nguyện ước được nhân một rưỡi điểm phúc.',
  },
  {
    id: 'that_tich', name: 'Thất Tịch', theme: 'love', accessory: 'heart',
    match: (s, l) => l.month === 7 && l.day === 7 && !l.leap,
    multipliers: { tinhduyen: 2 },
    banner: '💞 Thất Tịch · Ngưu Lang Chức Nữ gặp nhau · Phe Tình Duyên x2',
    tts: 'Hôm nay là lễ Thất Tịch, phe Tình Duyên được nhân đôi điểm phúc.',
  },
  {
    id: 'valentine', name: 'Valentine', theme: 'love', accessory: 'heart',
    match: (s) => s.m === 2 && s.d === 14,
    multipliers: { tinhduyen: 2 },
    banner: '💘 Valentine · Phe Tình Duyên x2 điểm phúc',
    tts: 'Chúc mừng ngày Valentine, phe Tình Duyên được nhân đôi điểm phúc.',
  },
  {
    id: 'mua_thi', name: 'Mùa Thi', theme: 'muathi', accessory: 'scroll',
    match: (s) => inRange(s, CONFIG.examSeason.from, CONFIG.examSeason.to),
    multipliers: { hocvan: 2 },
    banner: '📜 Mùa thi · Chim mang cuộn thư đỗ đạt · Phe Học Vấn x2',
    tts: 'Mùa thi đã đến. Phe Học Vấn được nhân đôi điểm phúc. Chúc các sĩ tử thi tốt!',
  },
  {
    id: 'ram', name: 'Ngày Rằm', theme: 'ram', accessory: 'glow',
    match: (s, l) => l.day === 15,
    all: 1.5,
    banner: '🌕 Ngày Rằm · Chim phát sáng · Mọi phe x1.5 điểm phúc',
    tts: 'Hôm nay là ngày Rằm, mọi nguyện ước được nhân một rưỡi điểm phúc.',
  },
  {
    id: 'mung_1', name: 'Mùng Một', theme: 'ram', accessory: 'glow',
    match: (s, l) => l.day === 1,
    all: 1.5,
    banner: '🌑 Mùng Một đầu tháng · Mọi phe x1.5 điểm phúc',
    tts: 'Mùng một đầu tháng, mọi nguyện ước được nhân một rưỡi điểm phúc.',
  },
];

function inRange(s, from, to) {
  const v = s.m * 100 + s.d;
  const [fm, fd] = from.split('-').map(Number);
  const [tm, td] = to.split('-').map(Number);
  return v >= fm * 100 + fd && v <= tm * 100 + td;
}

// Ngày hiện tại theo giờ Việt Nam, không phụ thuộc múi giờ của máy
function vnToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return { d: get('day'), m: get('month'), y: get('year') };
}

/**
 * @param {string} override 'auto' = theo lịch, 'none' = tắt sự kiện, hoặc id sự kiện để ép chạy
 */
export function resolveEvent(override = 'auto', now = new Date()) {
  const s = vnToday(now);
  const l = solarToLunar(s.d, s.m, s.y);
  const lunarLabel = `${l.day}/${l.month}${l.leap ? ' nhuận' : ''} âm lịch`;
  if (override === 'none') return { event: null, lunarLabel };
  if (override !== 'auto') return { event: EVENTS.find((e) => e.id === override) || null, lunarLabel };
  return { event: EVENTS.find((e) => e.match(s, l)) || null, lunarLabel };
}

export function pointMultiplier(event, team) {
  if (!event) return 1;
  return (event.all || 1) * ((team && event.multipliers?.[team]) || 1);
}

export function publicEvent(event) {
  if (!event) return null;
  const { id, name, theme, accessory, banner, multipliers, all } = event;
  return { id, name, theme, accessory, banner, multipliers: multipliers || {}, all: all || 1 };
}
