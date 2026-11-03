# 🎄 Cây Thông Kết Nối – Tài liệu thiết kế (GDD)

Chế độ Giáng sinh cho TikTok LIVE, chạy trên engine hiện có của Phóng Sanh Chim (connector TikTok, WebSocket, TTS, nhạc, admin, overlay 9:16).

---

## 1. Ý tưởng cốt lõi

Cả phòng live cùng trang trí **một cây thông**. Mỗi người xem là **một quả châu có avatar của chính họ**. Người xem nối các quả châu với nhau bằng **dây đèn**. Mỗi dây đèn làm cây sáng thêm. Đủ dây thì cả cây bừng sáng.

Ba động lực, mỗi động lực gắn với một nhóm người xem:

| Động lực | Ai bị kéo vào | Cơ chế |
|---|---|---|
| **Được nhìn thấy** | Mọi người | Avatar của mình treo trên cây, có số thứ tự, có tên |
| **Được kết nối** | Người xem thường, nhóm bạn | Dây đèn nối tới mình là bằng chứng công khai "có người nhớ tới mình" |
| **Đứng trên cao** | Người tặng quà | Quà càng lớn, quả châu càng cao. Ngôi sao trên đỉnh chỉ có 1 chỗ |

Mục tiêu chung "thắp sáng cả cây" giữ cho cả phòng cùng một hướng, không chia phe đối đầu.

---

## 2. Vòng chơi

### 2.1 Vòng lặp của một người xem

```
Vào phòng → thả tim / comment → quả châu của mình xuất hiện (có số #)
   → thấy người khác được nối dây → gõ !noi #số hoặc !noi @tên
   → dây đèn chạy giữa 2 quả châu, cây sáng thêm
   → người được nối thấy tên mình → nối lại (dây đôi, sáng gấp đôi)
   → rủ bạn vào live để có thêm dây → bạn vào, có quả châu mới
```

Bước "nối lại" là bước quan trọng nhất. Nó biến một hành động đơn lẻ thành một cuộc trò chuyện giữa 2 người lạ.

### 2.2 Cấu trúc một buổi live: "Đêm Thắp Sáng"

Mỗi buổi live gồm nhiều **Cây**. Mỗi cây là một vòng chơi, không giới hạn thời gian, kết thúc khi thắp sáng xong.

| Giai đoạn | Điều kiện | Hiện tượng trên màn hình |
|---|---|---|
| Cây tối | 0% | Cây xanh thẫm, quả châu mờ, tuyết rơi nhẹ |
| Tầng 1 sáng | 25% | Đèn tầng dưới cùng bật, chuông ngân |
| Tầng 2 sáng | 50% | Đèn tầng giữa bật, nhạc thêm lớp |
| Tầng 3 sáng | 75% | Đèn tầng trên bật, tuyết dày hơn |
| **Bừng sáng** | 100% | Ngôi sao nổ sáng, mọi dây đèn chạy sóng sáng, pháo hoa, giọng đọc xướng tên ngôi sao và người kết nối nhiều nhất, chụp "ảnh kỷ niệm" |

Sau khi bừng sáng, giữ khoảng 30 giây để mọi người chụp màn hình, rồi chuyển sang **Cây số 2**. Cây mới cao hơn, có nhiều chỗ treo hơn và cần nhiều ánh sáng hơn. Ảnh kỷ niệm của cây trước được lưu lại.

Lý do không dùng đồng hồ đếm ngược: mục tiêu là việc chung, không ai thua. Đếm ngược tạo áp lực sai chỗ. MC có thể kích hoạt "Giờ Vàng 5 phút" (ánh sáng x2) khi muốn tăng nhịp.

---

## 3. Quả châu (ornament)

### 3.1 Khi nào có quả châu

Bất kỳ tương tác nào cũng treo quả châu nếu người đó chưa có: comment, thả tim, follow, share, quà. Người vào phòng mà chưa tương tác thì chưa có, để cây không đầy người im lặng.

Mỗi quả châu có:
- Avatar TikTok (hoặc vòng tròn chữ cái đầu nếu không tải được ảnh)
- **Số thứ tự `#12`** giữ nguyên suốt buổi live
- Tên rút gọn hiện khi có sự kiện, hoặc luôn hiện với tầng cao
- Độ sáng: mờ khi chưa có dây, sáng dần theo số dây

### 3.2 Vì sao cần số thứ tự

Nickname TikTok thường có emoji, ký tự đặc biệt, hoặc rất dài. Gõ `@tên` trên điện thoại khó và hay sai. Gõ `!noi 12` thì ai cũng làm được trong 2 giây. Đây là quyết định quan trọng nhất của thiết kế: **nếu nối dây khó, cả cơ chế chết**. Vẫn hỗ trợ `!noi @tên` cho người đã quen.

### 3.3 Vị trí trên cây (tầng)

Cây chia 5 tầng từ dưới lên. Tầng càng cao càng ít chỗ, nên càng khan hiếm:

| Tầng | Điều kiện (tổng xu trong buổi live) | Số chỗ (Cây 1) | Kích thước avatar | Kiểu quả châu |
|---|---|---|---|---|
| Gốc cây (hộp quà) | Tràn chỗ | không giới hạn, chỉ đếm số | không hiện | Hộp quà chất đống, hiện con số |
| Tầng 1 | Tương tác bất kỳ | 48 | 58 px | Châu đỏ / xanh |
| Tầng 2 | ≥ 1 xu hoặc ≥ 3 dây | 30 | 68 px | Châu bạc |
| Tầng 3 | ≥ 30 xu | 16 | 82 px | Châu vàng |
| Tầng 4 | ≥ 300 xu | 6 | 100 px | Châu pha lê, có viền sáng |
| **Ngôi sao** | Xu cao nhất buổi live (tối thiểu 500) | 1 | 140 px | Ngôi sao vàng |

Lưu ý: tầng 2 mở cho người **không tặng quà nhưng nối nhiều dây**. Người xem thường vẫn có đường lên cao bằng cách kết nối. Điều này giữ cho trò chơi không chỉ là chỗ khoe tiền.

### 3.4 Khi cây hết chỗ

Cây 1 có khoảng 100 chỗ hiện avatar. Phòng đông sẽ vượt con số này.

- Tầng 1 đầy: quả châu **ít hoạt động nhất trong 3 phút gần đây** rơi xuống gốc thành hộp quà. Người đó tương tác lại thì được treo lại, giữ nguyên số `#`.
- Người có dây đèn đang hoạt động không bị rơi. Dây đèn là thứ người khác đã đầu tư, không được mất.
- Tầng 2 trở lên: chỉ rơi khi bị người mới đủ điều kiện cao hơn đẩy xuống. Người bị đẩy xuống tầng dưới, kèm thông báo nhỏ ("@A đã vượt lên tầng 3"). Tạo cạnh tranh nhẹ, không ai biến mất khỏi cây.
- Ngôi sao bị soán: hiệu ứng "chuyền sao" bay từ người cũ sang người mới, giọng đọc xướng tên. Người cũ xuống tầng 4.

### 3.5 Thuật toán xếp chỗ

- Mỗi tầng là một dải hình thang trên thân cây. Các chỗ treo được tính trước theo lưới so le (giống cách treo thật), có nhiễu nhẹ để trông tự nhiên.
- Người mới vào một tầng được đặt vào chỗ trống **gần những người đã nối với họ nhất**, để dây đèn ngắn và không cắt chéo cả cây. Nếu chưa có dây thì đặt ngẫu nhiên.
- Khi một người lên tầng, quả châu bay theo đường cong lên chỗ mới. Dây đèn đi theo.

---

## 4. Dây đèn (cơ chế chính)

### 4.1 Lệnh

| Lệnh | Ý nghĩa |
|---|---|
| `!noi 12` | Nối dây từ mình tới quả châu số 12 |
| `!noi @tên` | Như trên, theo tên |
| `!noi 12 Giáng sinh vui nhé` | Nối kèm lời chúc ngắn, hiện chạy dọc dây vài giây |

Nếu người gõ chưa có quả châu thì treo cho họ trước, rồi nối.

### 4.2 Loại dây

| Loại | Điều kiện | Độ sáng | Hình ảnh |
|---|---|---|---|
| Dây đơn | A nối B | 1 | Dây đèn nhỏ, bóng nháy chậm |
| **Dây đôi** | A nối B và B nối lại A | 3 | Dây dày hơn, bóng sáng đều, hai quả châu bật sáng cùng lúc |
| **Chòm sao** | 3 người đều nối đôi với nhau (tam giác) | +5 thưởng một lần | Tam giác phát sáng, giọng đọc gọi tên 3 người |
| Dây vàng | Nối bằng quà (mục 5) | 5 | Dây vàng lấp lánh |

Dây đôi đáng gấp 3 dây đơn. Đây là con số có chủ đích: nó thưởng cho việc **đáp lại** chứ không phải spam đi nối nhiều người.

### 4.3 Thưởng nối với người cô đơn

Quả châu chưa có dây nào hiện mờ, có hiệu ứng "run rẩy vì lạnh". Ai là người **nối đầu tiên** tới một quả châu cô đơn được +2 độ sáng thưởng, và quả châu đó bật sáng ấm lên.

Mục đích: người mới vào, người lạ không quen ai, vẫn có người tìm tới. Giọng đọc thỉnh thoảng nhắc: "Quả châu số 37 vẫn chưa có ai nối dây. Ai sưởi ấm bạn ấy nào?". Đây là chỗ tạo ra khoảnh khắc ấm áp đúng tinh thần Giáng sinh.

### 4.4 Giới hạn chống spam

| Luật | Giá trị | Lý do |
|---|---|---|
| Mỗi cặp chỉ 1 dây mỗi chiều | — | Không nối đi nối lại cùng 1 người để cày điểm |
| Dây miễn phí mỗi người | 5 dây / cây | Buộc chọn người để nối, dây có giá trị |
| Thêm dây | Mỗi 1 xu = +1 dây, follow = +2, share = +1 | Lối ra cho người muốn nối nhiều |
| Cooldown lệnh | 3 giây | Chống flood chat |
| Không tự nối mình | — | |

Dây không mất khi hết lượt, chỉ không nối thêm được. Sang cây mới thì lượt dây được làm mới.

### 4.5 Hiển thị dây

- Dây là đường cong rủ xuống giữa 2 quả châu (như dây đèn thật), có 4–8 bóng đèn nhỏ chạy dọc.
- Màu bóng theo người tạo dây, ổn định theo tên (cùng một người luôn cùng màu), để người xem nhận ra dây của mình.
- Dây mới tạo có hiệu ứng "tia sáng chạy" từ người nối tới người được nối trong khoảng 1,2 giây.
- Giới hạn vẽ: hiện tối đa khoảng 250 dây. Dây cũ, dây đơn không hoạt động sẽ mờ đi trước. Dây đôi và chòm sao luôn hiện.

---

## 5. Quà tặng

Nguyên tắc: **quà không chỉ cho người tặng lên cao, mà còn làm điều tốt cho người khác trên cây**. Như vậy người tặng được cả phòng cảm ơn, không bị xem là khoe.

| Quà (xu) | Tác dụng cho người tặng | Tác dụng cho cả phòng |
|---|---|---|
| Tim (mỗi 15 tim) | Treo châu, +1 độ sáng | — |
| 1–9 xu | +1 dây cho mỗi xu, đủ điều kiện tầng 2 | — |
| 10–99 xu | Tầng theo tổng xu | **Dây vàng**: tự nối tới 3 quả châu cô đơn ngẫu nhiên |
| 100–499 xu | Tầng 3–4, spotlight 3 giây | **Bông tuyết may mắn**: 10 quả châu cô đơn ngẫu nhiên được sáng lên, kèm tên người tặng |
| ≥ 500 xu | Tầng 4 hoặc Ngôi sao, spotlight 5 giây | **Ông Già Noel ghé thăm**: xe tuần lộc bay ngang cây, thả quà vào mọi quả châu đang nối với người tặng. Ánh sáng +50 |

Ghi chú:
- **Dây vàng** là cách để người tặng quà kết nối với người họ không quen, đúng thông điệp của cây.
- **Quà dành tặng**: nếu trong 60 giây trước đó người tặng vừa `!noi` tới ai, spotlight ghi "dành tặng @B". Cơ chế này đã có trong engine.
- Ngôi sao tính theo tổng xu cả buổi live, không phải theo từng cây, để người tặng lớn không phải tặng lại mỗi cây.

---

## 6. Ánh sáng và mục tiêu

### 6.1 Công thức

```
Ánh sáng = Σ độ sáng các dây + thưởng chòm sao + thưởng người cô đơn + thưởng quà
Mục tiêu cây = max(mục tiêu tối thiểu, hệ số × số người đang có quả châu)
```

### 6.2 Mục tiêu tự co giãn theo độ đông

Phòng 20 người mà đặt mục tiêu 500 thì không bao giờ xong và người xem bỏ đi. Phòng 2.000 người thì 500 xong trong 30 giây, không còn gì để chơi.

| Cây | Hệ số mỗi người | Mục tiêu tối thiểu | Ví dụ 50 người | Ví dụ 500 người |
|---|---|---|---|---|
| 1 | 2,0 | 60 | 100 | 1.000 |
| 2 | 3,0 | 120 | 150 | 1.500 |
| 3+ | 4,0 | 200 | 200 | 2.000 |

Số người được chốt khi cây bắt đầu, và chỉ được tăng chứ không giảm trong lúc chơi, để thanh tiến độ không bị tụt khi người ra khỏi phòng.

Ước tính: phòng 50 người, mỗi người trung bình 2 dây, khoảng 30% là dây đôi, thì cây 1 xong trong khoảng 8–12 phút. Đây là nhịp mong muốn, cần chỉnh sau buổi live thử đầu tiên.

### 6.3 Giờ Vàng

MC bấm nút trên admin: 5 phút ánh sáng x2, nhạc nhanh hơn, viền màn hình vàng. Dùng khi phòng chùng xuống hoặc khi sắp tới mốc 75%.

---

## 7. Danh hiệu trong buổi live

| Danh hiệu | Điều kiện | Hiển thị |
|---|---|---|
| ⭐ Ngôi Sao Đêm Nay | Tặng nhiều xu nhất | Đỉnh cây |
| 💞 Trái Tim Của Cây | Nhiều dây đôi nhất | Quả châu có trái tim, xướng tên khi cây bừng sáng |
| 🔥 Người Sưởi Ấm | Nối đầu tiên tới nhiều quả châu cô đơn nhất | Xướng tên khi cây bừng sáng |
| ❄️ Người Thắp Đèn Cuối | Tạo dây làm cây đạt 100% | Spotlight ngay lúc bừng sáng |

"Người Thắp Đèn Cuối" tạo cuộc đua phút chót ở mức 95–99%, mà không phải tranh giành bằng tiền.

---

## 8. Bố cục màn hình 9:16 (1080 × 1920)

```
┌──────────────────────────────────────┐ 0
│  🎄 CÂY THÔNG KẾT NỐI   Cây số 2     │
│  [▓▓▓▓▓▓▓▓▓░░░░░] 68%  1.020/1.500 ✨ │ ~200
│  ⭐ Ngôi sao: @hoang  💞 Trái tim: @linh│
├──────────────────────────────────────┤ 260
│                 ⭐                     │
│               (avatar)                │
│              ◯  ◯  ◯                  │  tầng 4
│            ◯ ◯ ◯ ◯ ◯ ◯                │  tầng 3
│          ◯ ◯ ◯ ◯ ◯ ◯ ◯ ◯              │  tầng 2
│        ◯ ◯ ◯ ◯ ◯ ◯ ◯ ◯ ◯ ◯            │  tầng 1
│      ◯ ◯ ◯ ◯ ◯ ◯ ◯ ◯ ◯ ◯ ◯ ◯          │
│      (dây đèn cong nối các quả châu)  │
│               ┃▌┃                     │
│        🎁🎁🎁 x128 hộp quà            │ ~1500
├──────────────────────────────────────┤
│  thông báo: @A ⟶💡⟶ @B "Noel vui"     │ ~1560
├──────────────────────────────────────┤
│ !noi số · !noi @tên · ❤️ tim = treo    │ ~1700
│ quà = dây vàng · quả châu mờ = cần bạn│
└──────────────────────────────────────┘ 1920
```

- Cây chiếm khoảng 1.250 px chiều cao, đúng vùng mắt người xem nhìn trên điện thoại.
- Không đặt thông tin quan trọng ở 220 px dưới cùng và 150 px bên phải, vì giao diện TikTok (ô comment, nút quà, nút tim) che vùng đó.
- Nền: đêm xanh thẫm, tuyết rơi nhiều lớp (gần to nhanh, xa nhỏ chậm), mặt đất phủ tuyết. Có chế độ nền trong suốt để ghép camera MC.
- Số `#` luôn hiện trên mọi quả châu, chữ trắng viền đen, cỡ tối thiểu 22 px để đọc được trên điện thoại.

---

## 9. Âm thanh

- **Nhạc nền:** chuông ngân và hộp nhạc nhẹ, sinh bằng Web Audio như nhạc thiền hiện tại, đổi sang âm giai trưởng và nhịp 3/4. Mỗi tầng sáng lên thì thêm một lớp nhạc. Cây bừng sáng thì chơi đoạn cao trào.
- **Hiệu ứng:** "ting" khi có dây mới (cao độ ngẫu nhiên trong hợp âm, nên nhiều dây cùng lúc nghe như một giai điệu), chuông lớn khi có dây đôi, tiếng lục lạc tuần lộc khi Ông Già Noel bay qua.
- **Giọng đọc** (ưu tiên 1 ngắt, 2 quan trọng, 3 thường; câu thường cách nhau ít nhất 5 giây):

| Sự kiện | Câu mẫu | Ưu tiên |
|---|---|---|
| Ông Già Noel | "Ông Già Noel ghé thăm theo lời mời của @A!" | 1 |
| Cây bừng sáng | "Cây thông đã bừng sáng! Cảm ơn ngôi sao @A, trái tim @B và tất cả mọi người!" | 1 |
| Soán ngôi sao | "@A vừa trở thành ngôi sao mới của cây thông!" | 2 |
| Chòm sao | "@A, @B và @C vừa tạo thành một chòm sao!" | 2 |
| Mốc 25 / 50 / 75% | "Tầng hai đã sáng! Còn một nửa nữa thôi!" | 2 |
| Nhắc quả châu cô đơn | "Quả châu số 37 vẫn chưa có ai nối dây. Ai sưởi ấm bạn ấy nào?" | 3 |
| Dây đôi | "@A và @B đã nối dây đôi!" | 3 |

---

## 10. Kịch bản cho MC

MC là yếu tố quyết định trong những phút đầu, khi cây còn trống.

1. **Phút 0–3:** Tự giải thích bằng ví dụ: "Bạn nào vừa thả tim thì đã có quả châu rồi đó, số của bạn ở trên avatar. Giờ gõ `!noi` cộng số của một người bất kỳ."
2. **Phút 3–10:** Gọi tên các quả châu cô đơn, đọc to các dây đôi vừa có. Mục tiêu là để mọi người thấy nối lại thì được xướng tên.
3. **Mốc 75%:** Bật Giờ Vàng, kêu gọi "ai sẽ là người thắp đèn cuối cùng?".
4. **Bừng sáng:** Dừng 30 giây, đọc tên các danh hiệu, mời mọi người chụp màn hình và đăng lại.
5. **Chuyển cây:** "Cây số 2 cao hơn, có thêm tầng cho mọi người."

---

## 11. Kiểm duyệt và rủi ro

| Rủi ro | Biện pháp |
|---|---|
| Tên, lời chúc bậy hiện trên dây | Dùng lại bộ lọc từ cấm hiện có. Lời chúc trên dây tối đa 30 ký tự. MC có nút ẩn lời chúc hoặc gỡ dây |
| Một nhóm tự nối với nhau để cày | Mỗi cặp 1 dây mỗi chiều, 5 dây miễn phí. Thưởng lớn nhất nằm ở người cô đơn, không nằm ở nhóm kín |
| Nối dây tới người không muốn bị nối | Người bị nối có thể gõ `!cat 12` để cắt dây của số 12 tới mình. Không thông báo công khai khi cắt |
| Phòng vắng, cây trống, trông buồn | Mục tiêu tự co giãn. Lúc đầu cây có sẵn đèn trang trí mặc định (không phải người giả). **Không** dùng bot giả làm người xem trên live thật |
| Người tặng quà chiếm hết | Tầng 2 mở cho người nối nhiều dây. Danh hiệu Trái Tim và Người Sưởi Ấm không mua được bằng tiền |
| Chính sách TikTok | Không có cơ chế may rủi đổi lấy quà, không hứa giải thưởng thật. "Bông tuyết may mắn" chỉ chọn ngẫu nhiên người nhận ánh sáng, không liên quan tới tiền |
| TikTok không gửi đủ sự kiện tim khi phòng rất đông | Tim chỉ dùng để treo châu. Dây đèn đến từ comment, mà comment thì được gửi đầy đủ |
| Hiệu năng khi 250 dây + 100 avatar + tuyết | Vẽ dây và cây tĩnh lên canvas riêng, chỉ vẽ lại khi có thay đổi. Bóng đèn nháy vẽ ở lớp riêng mỗi khung hình |

---

## 12. Dữ liệu và kỹ thuật

### 12.1 Dùng lại từ Phóng Sanh Chim

`server.js` (TikTok connector, xử lý quà streak, API admin, giả lập), `tts.js`, `music.js` (đổi âm giai), `env.js`, `config.js` (thêm nhóm cấu hình `tree`), bộ lọc từ cấm, tra cứu `@tên`, avatar, hàng đợi giọng đọc, hall of fame.

### 12.2 Module mới

```
tree_game.js            Luật chơi: quả châu, tầng, dây, ánh sáng, danh hiệu, cây số N
tree_layout.js          Tính chỗ treo theo tầng, chọn chỗ gần người đã nối
public/tree.html/js/css Overlay cây thông
public/assets/tree/     Hình cây, quả châu, ngôi sao, xe tuần lộc
```

Chọn chế độ khi chạy: `node server.js ten_kenh --mode=tree`.

### 12.3 Trạng thái phía server

```js
ornaments: Map<uid, { num, uid, name, avatar, tier, slot, diamonds, wiresLeft, lastActive, lit }>
wires:     Map<"a>b", { from, to, kind: 'single'|'double'|'gold', msg, createdAt }>
tree:      { index, goal, light, peopleAtStart, stage, goldenHourUntil }
titles:    { star, heart, warmer, lastLighter }
```

### 12.4 Gói tin WebSocket

| Sự kiện | Nội dung chính |
|---|---|
| `TREE_STATE` (1 lần/giây) | Ánh sáng, mục tiêu, giai đoạn, danh hiệu, số hộp quà dưới gốc |
| `ORNAMENT_ADD` / `ORNAMENT_MOVE` / `ORNAMENT_DROP` | Số, tầng, chỗ treo, avatar |
| `WIRE_ADD` | from, to, loại, lời chúc |
| `WIRE_UPGRADE` | Dây đơn thành dây đôi |
| `CONSTELLATION` | 3 người |
| `STAR_CHANGE` | Ngôi sao cũ, mới |
| `SANTA` / `SNOWFLAKE_LUCK` / `GOLD_WIRES` | Hiệu ứng quà |
| `STAGE_UP` / `TREE_LIT` / `TREE_NEXT` | Mốc sáng, bừng sáng, sang cây mới |

Overlay mở lại giữa chừng (OBS khởi động lại) phải nhận được ảnh chụp đầy đủ của cây: thêm gói `TREE_FULL` gửi khi kết nối.

---

## 13. Đo lường sau mỗi buổi live

| Chỉ số | Ý nghĩa | Mục tiêu buổi đầu |
|---|---|---|
| % người có quả châu đã có ít nhất 1 dây | Cơ chế nối có được hiểu không | ≥ 40% |
| % dây được nối lại thành dây đôi | Người xem có đáp lại nhau không | ≥ 25% |
| Comment / phút so với buổi live thường | Mức tăng tương tác | ≥ 2 lần |
| Thời gian thắp sáng cây 1 | Mục tiêu có hợp lý không | 8–15 phút |
| Thời gian xem trung bình | Giữ chân | tăng so với buổi thường |
| Số người tặng quà, xu / người xem | Doanh thu | so với buổi thường |

Ghi các chỉ số này vào `data/sessions/<ngày>.json` sau mỗi buổi để chỉnh hệ số trong `config.js`.

---

## 14. Phạm vi và lịch

**MVP (bắt buộc cho Noel):** quả châu có số, 5 tầng, `!noi số/@tên`, dây đơn và dây đôi, thưởng người cô đơn, ánh sáng có mục tiêu tự co giãn, 4 mốc sáng và bừng sáng, ngôi sao, dây vàng và Ông Già Noel từ quà, giọng đọc, admin (giả lập, Giờ Vàng, gỡ dây), nền đêm tuyết.

**Thêm nếu kịp:** chòm sao, `!cat`, ảnh kỷ niệm tự lưu, nhiều cây trong một buổi với cây cao dần, thống kê sau buổi.

**Để sau Noel:** cây lưu qua nhiều buổi live, cây cho ngày Tết (đổi thành cây mai, cây đào).

| Mốc | Ngày | Việc |
|---|---|---|
| 1 | 3/11 – 14/11 | Code MVP: luật chơi, xếp chỗ, overlay, giả lập |
| 2 | 15/11 – 21/11 | Hình ảnh cây, quả châu, tuyết, âm thanh. Kiểm tra hiệu năng với 100 quả châu + 250 dây |
| 3 | 22/11 – 30/11 | Live thử 2–3 buổi, đo chỉ số mục 13, chỉnh hệ số |
| 4 | 1/12 – 20/12 | Live thật, sửa theo phản hồi |
| 5 | 24/12 – 25/12 | Đêm chính |

---

## 15. Câu hỏi cần chốt trước khi code

1. Làm thành chế độ trong game Phóng Sanh Chim hiện tại (`--mode=tree`) hay tách thành game riêng? Tài liệu này giả định là chế độ trong game hiện tại để dùng lại code.
2. Hình cây và quả châu: vẽ bằng code như sprite chim hiện tại, hay có designer làm?
3. Kênh live dự kiến đông khoảng bao nhiêu người cùng lúc? Con số này quyết định số chỗ trên cây và hệ số mục tiêu.
4. Có muốn giữ cây qua nhiều buổi live (từ 1/12 đến 24/12 cùng thắp một cây khổng lồ) không? Ý này mạnh về giữ chân nhưng tốn thêm công lưu dữ liệu.
