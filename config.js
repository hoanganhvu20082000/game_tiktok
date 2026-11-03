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
