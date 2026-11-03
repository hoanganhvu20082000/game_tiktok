// Cấu hình luật chơi. Chỉnh ở đây, không cần sửa logic.
// Khóa API đọc từ biến môi trường (file .env), không ghi thẳng vào code.
const env = process.env;

export const CONFIG = {
  port: Number(env.PORT || 3000),

  // Thời lượng một "Đợt Phóng Sanh" (giây) và thời gian chiếu Bức Tường Lời Nguyện sau mỗi đợt
  roundSeconds: 180,
  roundEndPauseSeconds: 20,
  wishWallSize: 10,

  // 4 phe nguyện ước (thay cho 4 đội màu của Đua Vịt)
  teams: {
    suckhoe:   { name: 'Sức Khỏe',   icon: '🌿', color: '#4ade80', cmd: ['!suckhoe', '!sk'] },
    tailoc:    { name: 'Tài Lộc',    icon: '🪙', color: '#facc15', cmd: ['!tailoc', '!tl'] },
    tinhduyen: { name: 'Tình Duyên', icon: '💞', color: '#f472b6', cmd: ['!tinhduyen', '!td'] },
    hocvan:    { name: 'Học Vấn',    icon: '📚', color: '#60a5fa', cmd: ['!hocvan', '!hv'] },
  },

  // Loại chim theo mức quà (diamond = xu TikTok, tính theo tổng streak)
  birdTiers: [
    { id: 'se',          name: 'Chim Sẻ',      minDiamonds: 0,   points: 1,   size: 1.0, spotlight: 0 },
    { id: 'bocau',       name: 'Bồ Câu Trắng', minDiamonds: 10,  points: 15,  size: 1.6, spotlight: 0 },
    { id: 'hac',         name: 'Hạc Tiên',     minDiamonds: 100, points: 120, size: 2.6, spotlight: 3 },
    { id: 'phuonghoang', name: 'Phượng Hoàng', minDiamonds: 500, points: 700, size: 4.0, spotlight: 5 },
  ],

  likesPerBird: 15,          // mỗi 15 tim = 1 chim sẻ
  maxBirdsPerEvent: 30,      // chặn 1 streak quà làm ngập màn hình
  chatCooldownMs: 4000,      // chống spam lệnh của cùng 1 người
  wishMaxLength: 40,

  // Thanh "Bầu Trời Bình An": đầy thì kích hoạt "Mưa Phúc Lành"
  skyMeterGoal: 2000,

  // Người đã góp >= mức này (tổng xu các phiên) được chào đón VIP khi vào phòng
  vipEntranceDiamonds: 500,

  // ---------- Tương tác giữa người xem ----------
  // !tang @ten <lời chúc>: gửi thư chim cho người khác. Quà tặng trong 60s sau đó được ghi "dành tặng" người đó.
  letterPoints: 2,
  dedicateSeconds: 60,
  // !chuc @ten: chúc phúc lời nguyện của người khác. Điểm cộng cho PHE NGƯỜI ĐƯỢC CHÚC (mỗi cặp 1 lần/đợt).
  blessPoints: 3,
  // Trên Bức Tường Lời Nguyện: mỗi lời chúc nhận được = bao nhiêu điểm xếp hạng
  blessWallWeight: 10,
  // Chim Vàng: thỉnh thoảng bay ngang màn hình, ai gõ !bat đầu tiên thì bắt được
  golden: { firstDelaySec: 30, minGapSec: 45, maxGapSec: 75, seconds: 10, points: 80 },
  // Combo cả phòng: càng nhiều NGƯỜI KHÁC NHAU thả chim trong 10s, điểm càng được nhân
  combo: { windowSec: 10, usersPerStep: 5, stepBonus: 0.1, maxMult: 2 },

  // ---------- Chế độ Cây Thông Kết Nối (--mode=tree) ----------
  tree: {
    freeWires: 5,                                                // dây miễn phí mỗi người mỗi cây
    wireCooldownMs: Number(env.TREE_WIRE_COOLDOWN_MS || 3000),   // chống flood lệnh
    wireMsgMax: 30,                                              // lời chúc trên dây
    wishMax: 40,                                                 // !uoc
    // Độ sáng: dây đơn 1, cặp dây đôi tổng 3, dây vàng 5, chòm sao +5, nối người cô đơn +2
    light: { single: 1, double: 3, gold: 5, constellation: 5, lonelyBonus: 2, perLikeBatch: 1 },
    // Tầng: 1 = ai cũng có, 2 = >=1 xu hoặc >=3 dây, 3 = >=30 xu, 4 = >=300 xu, Ngôi sao = xu cao nhất (>=500)
    tiers: { t2Diamonds: 1, t2Degree: 3, t3Diamonds: 30, t4Diamonds: 300, starMin: 500 },
    // Mục tiêu ánh sáng = max(min, perPerson x số người). Cây sau khó hơn cây trước.
    goal: [{ perPerson: 2, min: 60 }, { perPerson: 3, min: 120 }, { perPerson: 4, min: 200 }],
    goalMinOverride: Number(env.TREE_GOAL_MIN || 0),             // chỉ dùng khi test
    activeWindowSec: 600,                                        // người tương tác trong 10 phút gần nhất mới tính là "đang ở đây"
    litHoldSec: Number(env.TREE_LIT_HOLD_SEC || 30),             // giữ cây bừng sáng để mọi người chụp màn hình
    goldenHour: { seconds: 300, mult: 2 },
    combo: { windowSec: 10, usersPerStep: 5, stepBonus: 0.1, maxMult: 2 },
    gifts: { maxBonusWires: 30, goldWireMin: 10, goldWireCount: 3, snowMin: 100, snowCount: 10, santaMin: 500, santaLight: 50, dedicateSec: 60 },
    // Hộp Quà Bí Ẩn dưới gốc: ai gõ !mo đầu tiên được mở
    mystery: { firstDelaySec: 60, minGapSec: 90, maxGapSec: 150, seconds: 15, light: 15, wires: 3, snow: 5 },
    // Thử thách Sưởi Ấm: chọn 1 quả châu cô đơn, mỗi dây nối tới nó trong thời gian thử thách được +bonus
    warm: { everySec: 150, seconds: 20, bonus: 2 },
    // Hợp xướng: đủ người khác nhau gõ lời chúc Giáng sinh trong 20s thì cả phòng được thưởng
    chorus: { windowSec: 20, users: 8, light: 20, cooldownSec: 120, phrases: ['merry christmas', 'giang sinh vui ve', 'noel vui ve', 'giang sinh an lanh', 'merry xmas'] },
  },

  // Mùa thi (dương lịch, tháng-ngày). Mặc định bao kỳ thi tốt nghiệp THPT.
  examSeason: { from: '06-01', to: '07-10' },

  // Giọng đọc: 'browser' (miễn phí, giọng máy), 'fpt' (FPT.AI), 'azure' (Azure Speech)
  tts: {
    provider: (env.TTS_PROVIDER || 'browser').toLowerCase(),
    fpt: { apiKey: env.FPT_API_KEY || '', voice: env.FPT_VOICE || 'banmai', speed: env.FPT_SPEED || '0' },
    azure: {
      key: env.AZURE_SPEECH_KEY || '',
      region: env.AZURE_SPEECH_REGION || 'southeastasia',
      voice: env.AZURE_VOICE || 'vi-VN-HoaiMyNeural',
      rate: env.AZURE_RATE || '0%',
    },
  },
};
