# 🕊️ Phóng Sanh Chim – TikTok LIVE Interactive Overlay

Concept rẽ nhánh từ tài liệu Đua Vịt (`tai_lieu_thiet_ke_duck_marathon_tiktok_live.md`). Giữ nguyên hạ tầng (TikTok connector → game server → WebSocket → OBS Browser Source 9:16), đổi lõi trò chơi từ **thi đua, phá hoại** sang **cầu nguyện, gieo phúc, cùng nhau góp chung**.

## 1. Concept

Người xem "thả chim về trời" bằng tương tác. Mỗi con chim mang tên và lời nguyện của người thả, bay từ Lồng Sen ở đáy màn hình lên bầu trời.

| Đua Vịt | Phóng Sanh Chim |
|---|---|
| 4 đội màu (`!vang`, `!do`...) | 4 nguyện ước: `!suckhoe`, `!tailoc`, `!tinhduyen`, `!hocvan` |
| `!dua` tạo vịt | `!tha <lời nguyện>` thả 1 chim sẻ, lời nguyện hiện trên màn hình |
| Vỏ chuối, đóng băng (sabotage) | Không có phá hoại. Mọi tương tác đều cộng, không làm ai thiệt |
| Vịt về đích | Hết giờ đợt (3 phút), nguyện ước nhiều "điểm phúc" nhất thắng |
| Nitro | Thanh **Bầu Trời Bình An**: cả phòng cùng lấp đầy → **Mưa Phúc Lành** |
| Zoom đại gia | Spotlight + TTS cảm ơn khi thả Hạc / Phượng Hoàng |
| Hall of Fame | Danh hiệu: Người Gieo Phúc (≥500 xu), Hộ Pháp Bầu Trời (≥2.000), Đại Thiện Nhân (≥10.000) |

**Quy đổi tương tác** (chỉnh trong `config.js`):

| Tương tác | Kết quả | Điểm phúc |
|---|---|---|
| 15 tim | 1 Chim Sẻ | 1 |
| Share | 3 Chim Sẻ | 3 |
| Follow | 1 Bồ Câu Trắng | 15 |
| Quà < 10 xu | N Chim Sẻ (N = số xu) | 1/chim |
| Quà 10–99 xu | 1 Bồ Câu Trắng | 15 |
| Quà 100–499 xu | 1 Hạc Tiên + spotlight 3s | 120 |
| Quà ≥ 500 xu | 1 Phượng Hoàng + spotlight 5s, TTS ngắt hàng đợi | 700 |

Lý do concept này khác biệt: Đua Vịt kích cầu bằng cạnh tranh. Phóng Sanh Chim kích cầu bằng cảm xúc (lời nguyện cho gia đình, thi cử) và mục tiêu chung (thanh Bầu Trời), hợp với khung giờ tối, ngày rằm, mùng 1, mùa thi, Tết.

## 2. Chạy thử

```bash
cd phong_sanh_chim_tiktok
npm install
node server.js                 # chế độ giả lập
node server.js <tiktok_user>   # nối phòng live thật (phải đang live)
```

- Mở `http://localhost:3000/admin.html` để bấm giả lập hoặc bật bot đông người.
- Mở `http://localhost:3000/overlay.html?bg=1` để xem overlay có nền trời.
- OBS: Canvas 1080x1920, thêm Browser Source `http://localhost:3000/overlay.html` (1080x1920, nền trong suốt), tích "Control audio via OBS" để nghe TTS.

Server chỉ lắng nghe `127.0.0.1`, nên admin API không lộ ra mạng ngoài. Hall of Fame lưu ở `data/hall_of_fame.json`.

## 3. Cấu trúc

```
server.js             Express + WebSocket, kết nối TikTok (tiktok-live-connector v2), API admin/giả lập, phục vụ mp3 TTS
game.js               Luật chơi: đợt, phe, loại chim, nhân điểm theo sự kiện, Bức Tường Lời Nguyện, Hall of Fame
config.js             Toàn bộ thông số (kể cả mùa thi, giọng đọc)
events.js             Danh sách sự kiện theo ngày (Tết, Rằm, Vu Lan, Trung Thu, Thất Tịch, Valentine, Mùa Thi, Mùng 1)
lunar.js              Đổi dương lịch -> âm lịch (thuật toán Hồ Ngọc Đức, giờ VN)
tts.js                FPT.AI / Azure TTS, cache mp3 trong data/tts_cache
env.js, .env.example  Nạp khóa API từ file .env
public/overlay.*      Overlay 9:16: sprite chim, theme sự kiện, Lottie spotlight, giọng đọc, Bức Tường Lời Nguyện
public/music.js       Nhạc thiền sinh bằng Web Audio (drone + chuông xoay ngũ cung)
public/assets/        sprites.json + sprite sheet 4 loại chim
public/admin.html     Bảng điều khiển MC
scripts/make_sprites.js  Sinh lại sprite sheet SVG
scripts/smoke_test.js    Kiểm tra nhanh khi server đang chạy
```

## 3b. Giai đoạn 1: nội dung đã làm

**Sprite chim.** Mỗi loại chim là 1 sprite sheet 6 khung vỗ cánh (128x128/khung) trong `public/assets/birds/`, do `scripts/make_sprites.js` sinh ra. Muốn dùng hình của designer: bỏ file PNG cùng tên (hoặc đổi `src`), giữ đúng `frames`, `frameW`, `frameH` trong `public/assets/sprites.json`.

**Lottie.** Overlay đã nạp `lottie-web`. Điền đường dẫn file Lottie JSON vào `spotlightLottie.hac` / `spotlightLottie.phuonghoang` trong `sprites.json` (ví dụ tải từ LottieFiles, đặt ở `public/assets/lottie/`), hiệu ứng sẽ phát toàn màn hình khi có Hạc hoặc Phượng Hoàng. Để trống thì bỏ qua.

**Nhạc thiền.** Mặc định nhạc được sinh bằng Web Audio (âm trầm nền + chuông xoay ngũ cung + reverb), không cần file nên không lo bản quyền. Chủ âm đổi theo sự kiện. Có tiếng chuông khi thả Hạc/Phượng Hoàng, và nhạc tự hạ nhỏ khi giọng đọc nói. Muốn dùng nhạc riêng: đặt file vào `public/assets/` và điền `"music": "assets/ten_file.mp3"` trong `sprites.json`. Bật/tắt và chỉnh âm lượng trên trang admin.

**Giọng đọc FPT.AI / Azure.** Copy `.env.example` thành `.env`, đặt `TTS_PROVIDER=fpt` + `FPT_API_KEY`, hoặc `TTS_PROVIDER=azure` + `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION`. Server tạo mp3, lưu cache theo nội dung câu (câu lặp lại không tốn phí), overlay phát theo hàng đợi ưu tiên. Nếu API lỗi hoặc không có khóa, tự rơi về giọng trình duyệt. Trang admin có ô để MC gõ câu cho giọng đọc phát. Cần Node ≥ 20.12 để đọc `.env`.

**Bức Tường Lời Nguyện.** Hết đợt, màn hình hiện 10 lời nguyện của những người góp nhiều điểm phúc nhất trong đợt, kèm avatar, phe, điểm. Giọng đọc xướng lời nguyện đứng đầu. Thời gian chiếu chỉnh bằng `roundEndPauseSeconds` (mặc định 20s). Trang admin liệt kê lời nguyện đang có, có nút **Ẩn** để gỡ lời nguyện không phù hợp.

**Sự kiện theo ngày.** Tự nhận theo lịch âm/dương giờ Việt Nam, lấy sự kiện đầu tiên khớp trong `events.js`:

| Sự kiện | Ngày | Hiệu ứng |
|---|---|---|
| Tết Nguyên Đán | 1–7 tháng Giêng âm | Trời đỏ vàng, hoa rơi, chim mang lì xì, Tài Lộc x2 |
| Rằm Tháng Giêng | 15/1 âm | Trăng, chim phát sáng, mọi phe x2 |
| Vu Lan | 15/7 âm | Trời tím hồng, chim mang hoa sen, Sức Khỏe x3, phe khác x1.5 |
| Trung Thu | 15/8 âm | Trăng, chim mang đèn lồng, mọi phe x1.5 |
| Thất Tịch / Valentine | 7/7 âm, 14/2 | Trời hồng, tim rơi, Tình Duyên x2 |
| Mùa Thi | 01/06–10/07 (chỉnh `examSeason`) | Chim mang cuộn thư, Học Vấn x2 |
| Rằm / Mùng 1 hằng tháng | 15 và 1 âm | Trăng (Rằm), chim phát sáng, mọi phe x1.5 |

Trang admin có ô chọn sự kiện để ép chạy (test hoặc chạy sớm) hoặc tắt. Thêm sự kiện mới: thêm 1 phần tử vào `EVENTS` và (nếu cần) 1 theme vào `THEMES` trong `public/overlay.js`.

Xử lý quà streak theo hướng dẫn thư viện: với `giftType === 1` chỉ tính khi `repeatEnd` là `true`, xu = `diamondCount × repeatCount`.

## 4. Kế hoạch triển khai

**Giai đoạn 0 – MVP (đã có trong repo, 1–2 ngày test)**
- Overlay 2D, 4 nguyện ước, lời nguyện, thanh Bầu Trời, spotlight, TTS trình duyệt, Hall of Fame file JSON.
- Việc cần làm: live thử 3–5 phiên nhỏ, đo FPS trên OBS khi có ~500 chim, chỉnh tỉ lệ quy đổi.

**Giai đoạn 1 – Hoàn thiện nội dung (đã code, xem mục 3b)**
- Còn lại cần người làm: hình chim do designer vẽ, file Lottie cho spotlight, nhạc thu sẵn nếu muốn thay nhạc sinh, đăng ký khóa FPT.AI/Azure.

**Giai đoạn 2 – Giữ chân (2–4 tuần)**
- Chuyển Hall of Fame sang SQLite/PostgreSQL, bảng xếp hạng tuần.
- "Vườn Chim" cá nhân: chim đã thả tích lũy thành bộ sưu tập, hiện khi người đó vào phòng.
- Mục tiêu chung nhiều tầng (2.000 → 5.000 → 10.000 điểm) mở khóa cảnh trời mới (bình minh, cực quang, trăng rằm).

**Giai đoạn 3 – Mở rộng**
- Three.js `InstancedMesh` khi cần > 2.000 chim cùng lúc.
- Đóng gói nhiều theme dùng chung engine: Thả Đèn Hoa Đăng, Thả Cá Chép (ông Táo), Thả Bóng Bay Ước Nguyện.

## 5. Rủi ro và lưu ý

- **Chính sách TikTok:** không hứa hẹn kết quả tâm linh đổi lấy quà ("tặng quà sẽ khỏi bệnh/trúng số"). Dùng ngôn từ chúc phúc, không cam kết. Không gắn với tôn giáo cụ thể để tránh bị báo cáo.
- **Phóng sanh chim thật:** nhiều tổ chức bảo tồn đã cảnh báo hoạt động bắt chim để bán phóng sanh gây hại cho chim hoang dã. Có thể dùng điều này làm thông điệp: "phóng sanh online, không bắt chim thật". Nếu muốn, trích một phần doanh thu ủng hộ quỹ bảo tồn và công bố minh bạch.
- **Chi phí TTS:** mỗi câu có tên người dùng là 1 câu mới, nên tốn ký tự API. Câu cảm ơn chỉ phát với quà từ Hạc trở lên, có cooldown 5s cho câu thường.
- **Thư viện không chính thức:** `tiktok-live-connector` đọc webcast nội bộ của TikTok, có thể hỏng khi TikTok đổi giao thức hoặc bị rate-limit. Cân nhắc dùng `signApiKey` (Euler Stream) khi live thường xuyên; luôn giữ chế độ giả lập để demo.
- **Lời nguyện người dùng:** đã có lọc thô tục cơ bản và giới hạn 40 ký tự. Khi đông người nên bổ sung danh sách từ cấm đầy đủ hơn và nút ẩn lời nguyện trên admin.
- **Nội dung lặp:** TikTok hạ phân phối live chỉ có màn hình tĩnh/lặp. Nên có MC cam thật ghép trên overlay như tài liệu Đua Vịt mục 7.
