# 🐺 Wolvesville 30/4 — High-Performance Werewolf Engine

**Wolvesville 30/4** là một engine game Ma Sói (Werewolf) hiện đại, được xây dựng với kiến trúc **Plugin-based** và cơ chế **Event-driven Chain Reaction**. Toàn bộ luồng trò chơi được tự động hóa (Auto-moderated), mang lại trải nghiệm mượt mà, công bằng và giàu tính chiến thuật. Hệ thống còn được tích hợp **Voice Chat Real-time** siêu mượt theo từng phase (giai đoạn) của trò chơi.

---

## 📜 Luật Chơi & Flow Trò Chơi (Game Logic)

Trò chơi xoay quanh cuộc chiến sinh tồn giữa phe **Dân Làng** và phe **Ma Sói**. Một vòng lặp chuẩn của game luôn bắt đầu từ **Ban Đêm**, sau đó sang **Ban Ngày**, và tiếp tục cho đến khi có một phe đạt điều kiện thắng.

### 🌑 Ban Đêm (Night Phase)
Ban đêm là lúc các vai trò có chức năng thức dậy để thực hiện kỹ năng bí mật.
**Luật Voice Chat:** Toàn bộ người chơi sẽ bị tắt mic và tắt loa (Night Silent), ngoại trừ **Sói** được nói chuyện và nghe thấy nhau, và **Cặp Đôi (Tình Nhân)** được nói chuyện riêng với nhau nếu còn sống.
Thứ tự hành động (được hệ thống tự động gọi và xử lý song song hoặc nối tiếp tùy logic):
1. **Cupid (Đêm 1):** Chọn ghép đôi bản thân với 1 người khác.
2. **Tiên Tri:** Chọn 1 người để soi xem là Sói hay Dân. Tiên tri sẽ thấy team tại thời điểm bị soi (Sói Nguyền chưa biến hình vẫn soi ra là Dân).
3. **Bảo Vệ:** Chọn 1 người để bảo vệ khỏi sự tấn công của Ma Sói trong đêm đó. Không block được thuốc độc của Phù thủy.
4. **Ma Sói:** Cả đàn thức dậy, thảo luận (qua Voice) và Vote cắn 1 người (Mỗi sói sẽ vote một người, chọn người có số phiếu cao nhất hoặc random nếu tỉ lệ bằng nhau).
5. **Phù Thủy:** Được hệ thống báo cho biết ai vừa bị Sói cắn. Phù thủy có quyền dùng **Bình Cứu** để cứu nạn nhân, và/hoặc dùng **Bình Độc** để giết 1 người tùy ý. (Mỗi bình chỉ dùng 1 lần trong cả game).
6. **Thợ Săn:** Chọn 1 người làm "Mục Tiêu Trả Thù". Bất cứ khi nào Thợ săn chết (do Sói, Phù thủy, hoặc Treo cổ), người bị ghim cũng sẽ chết theo. Nếu Thợ săn bị 2 nguồn gây sát thương cùng lúc (VD: Vừa bị Sói cắn + Phù thủy ném độc), Thợ săn sẽ gục ngay lập tức và mất khả năng bắn.

### ☀️ Ban Ngày (Day Phase)
Hệ thống thông báo danh sách những người đã chết trong đêm.
**Luật Voice Chat:** Tất cả những người **còn sống** được bật Mic và Loa để tranh luận công khai. Người chết trở thành "Thượng Đế", chỉ có thể nói chuyện với nhau và nghe người sống nói, không can thiệp được vào game.
1. **Giai đoạn Thảo luận & Buộc Tội (Discussion & Accusation)**: Mọi người tự do chat/Voice. 
   - Đi kèm là hệ thống Vote. Người chơi có thể vote bất kỳ ai (kể cả bản thân).
   - Nếu một người nhận được **Đúng 50% số vé trở lên** tổng số người ĐANG SỐNG, người đó ngay lập tức bị đẩy lên giàn treo cổ. (Ví dụ 10 người thì cần đúng 5 vé, 11 người thì cần 6 vé).
2. **Giai đoạn Xác nhận Treo Cổ (Confirm Hang)**: 
   - Những người sống (kể cả nạn nhân) sẽ bỏ phiếu "Đồng ý" (Yes) hoặc "Phản đối" (No).
   - Nếu số phiếu Đồng Ý đạt ngưỡng **Đúng 50% tổng số người đang sống trở lên**, nạn nhân sẽ chính thức bị treo cổ và chết. Nếu không đủ 50%, nạn nhân được tha.

### 🏆 Điều kiện Thắng (Win Conditions)
Game tự động kiểm tra thắng/thua sau mỗi sự kiện chết hoặc sau khi treo cổ:
1. **Phe Sói thắng**: Khi số lượng Sói CÒN SỐNG lớn hơn hoặc bằng (>=) số lượng người còn sống của tất cả các phe khác gộp lại.
2. **Phe Dân thắng**: Khi toàn bộ Sói đã chết (Số lượng Sói = 0) và không có Phe thứ 3 nào đạt điều kiện thắng.
3. **Phe Cặp Đôi thắng (Tình nhân)**: Nếu 2 người yêu nhau vẫn còn sống, VÀ trên sân chỉ còn tối đa 1 người khác (Tổng số người sống = 3 hoặc 2, trong đó có cặp đôi). Tình yêu vượt lên tất cả!
4. **Thằng Hề thắng (Jester)**: Nếu Thằng Hề (Jester) bị LÀNG BỎ PHIẾU TREO CỔ thành công vào ban ngày. Thằng Hề sẽ thắng một mình và game kết thúc ngay lập tức. (Lưu ý: Nếu Thằng Hề chết trong đêm do Sói hoặc Phù Thủy, hắn sẽ thua ngậm ngùi).

---

## 🎭 Danh sách Vai trò (Roles & Skills)

| Vai trò | Phe | Kỹ năng chính | Chi tiết cơ chế |
|:---|:---:|:---|:---|
| **Ma Sói** | Sói | Cắn người | Đêm thức dậy voice cùng đồng bọn, vote cắn 1 nạn nhân. |
| **Dân Làng** | Dân | Nghỉ ngơi | Không có kỹ năng ban đêm. Dùng tài suy luận ban ngày. |
| **Tiên Tri** | Dân | Soi phe | Soi 1 người để biết là `Sói` hay `Dân` (Cursed Wolf chưa biến hình soi ra Dân). |
| **Bảo Vệ** | Dân | Tạo khiên | Khiên chặn 1 lượt cắn của Sói. Không chặn được Độc. |
| **Phù Thủy** | Dân | Cứu / Độc | Thấy người bị Sói cắn. Có 1 bình Cứu và 1 bình Độc cho cả game. |
| **Thợ Săn** | Dân | Bắn trả thù | Sẽ tự động ghim bắn mục tiêu đã chọn nếu bị giết. Mất skill nếu dính 2 skill giết cùng lúc. |
| **Thần Tình Yêu**| Dân | Ghép đôi | Chỉ tác dụng đêm đầu. Cặp đôi có kênh Voice riêng, nếu 1 người chết người kia chết theo. |
| **Già Làng** | Dân | Chống cắn | Bị động: Có 2 mạng khi Sói cắn. Không chống được Độc hoặc Treo cổ. |
| **Sói Nguyền** | Dân/Sói | Hắc hóa | Bắt đầu là phe Dân. Nếu bị Sói cắn, sẽ KHÔNG CHẾT mà biến ngay thành Sói thuộc phe Sói. |
| **Thằng Hề** | Solo | Chọc tức | Thắng game NGAY LẬP TỨC nếu lừa được Dân làng treo cổ mình vào ban ngày. |

---

## 🚀 Tính năng Nghệ Thuật (Technical Highlight)

- **EventBus Chain Reaction System**: Xử lý rẽ nhánh đa luồng các hiệu ứng kỹ năng. Mũi tên rơi xuống, người chết, tình nhân tự tử theo, Thợ săn trăn trối ghim đạn vào người khác... tất cả được vận hành qua Queue Event chống Infinity Loop chuẩn xác.
- **Smart Voice-Chat Matrix**: Sử dụng **LiveKit**, Micro và Loa của toàn bộ Client được Server bật / tắt trực tiếp tuỳ theo Phase. Có chống tiếng vọng (Echo Cancellation) và bảo mật Token JWT riêng biệt.
- **Late-Join Handle**: Người chơi vô tình rớt mạng có thể F5 tự động vào lại phòng, khôi phục Phase với Voice đúng chuẩn. Người mới vào phòng giữa game sẽ tự động hóa thân thành "Thượng Đế", chỉ được quan sát mà không làm hỏng tiến trình game.

---

## ⚙️ Cài đặt & Khởi chạy

### Yêu cầu hệ thống
- **Node.js**: Phiên bản 18+
- **LiveKit Server**: Dùng cho Voice Chat (có thể dùng Cloud hoặc Self-host). Cần API_KEY, API_SECRET và URL.

### Khởi chạy môi trường Dev
1. **Clone repository:**
   ```bash
   git clone https://github.com/minhz99/Wolvesville-304.git
   cd Wolvesville-304
   ```

2. **Cài đặt thư viện:**
   ```bash
   npm install
   ```

3. **Cấu hình Môi trường:** Tạo file `.env` theo form `.env.example` chứa thông tin LiveKit.

4. **Chạy server:**
   ```bash
   npm run dev
   ```

5. **Chơi game:**
   Truy cập `http://localhost:3521` (Mở port trên điện thoại / nhiều tab để test). Engine sẽ tự auto-start game khi chủ phòng thiết lập xong Role và tất cả người chơi đã sẵn sàng.