# 🐺 Wolvesville 304 — High-Performance Werewolf Engine

**Wolvesville 304** là một engine game Ma Sói (Werewolf) hiện đại, được xây dựng trên nền tảng Node.js/TypeScript với kiến trúc **Plugin-based** và cơ chế **Event-driven Chain Reaction** mạnh mẽ. Toàn bộ luồng trò chơi được tự động hóa hoàn toàn, mang lại trải nghiệm công bằng, liền mạch và giàu tính chiến thuật. Hệ thống còn được tích hợp **Voice Chat Real-time** siêu mượt, phân quyền âm thanh theo từng pha (phase) của trò chơi thông qua LiveKit.

---

## ✨ Điểm Nổi Bật Về Mặt Kỹ Thuật (Technical Highlights)

- **EventBus Chain Reaction System**: Engine xử lý rẽ nhánh đa luồng các hiệu ứng kỹ năng. Ví dụ: Sói cắn Cướp (biến hình) -> Thợ Săn chết (bắn trả thù) -> Tình nhân tự tử theo... Tất cả được vận hành qua Queue Event chống Infinity Loop chuẩn xác và an toàn.
- **Action Pipeline Engine**: Thu thập, sắp xếp thứ tự ưu tiên (Guard bảo vệ trước khi Wolf cắn, Witch cứu sau khi Wolf cắn) và xử lý các hành động trong đêm một cách đồng bộ.
- **Smart Voice-Chat Matrix (LiveKit)**: Micro và Loa của toàn bộ Client được Server bật/tắt trực tiếp tuỳ theo Phase. Có chống tiếng vọng (Echo Cancellation), phân luồng âm thanh chi tiết (Sói nghe Sói, Tình nhân nghe Tình nhân, Thượng đế nghe tất cả).
- **Persistent Session (Late-Join Handle)**: Người chơi rớt mạng (F5 web) tự động vào lại phòng, khôi phục trạng thái Phase và Voice. Người mới vào phòng giữa game tự động thành "Thượng Đế", không làm hỏng tiến trình game.
- **Robust Testing**: Bộ test suite toàn diện bao phủ toàn bộ vòng đời game, từ lúc tạo phòng, chạy skill, tính chuỗi hiệu ứng (chain reactions), đến lúc tìm ra phe chiến thắng.

---

## 📂 Kiến Trúc Dự Án (Project Structure)

```text
Wolvesville 304/
├── client/                     # Frontend (Vanilla JS + CSS)
│   ├── app.js                  # Logic DOM và UI
│   ├── livekit.js              # Xử lý kết nối Voice Chat
│   └── index.html              # Layout chính
├── server/                     # Backend (Node.js + TypeScript)
│   ├── engine/                 # Core game logic (GameEngine, EventBus, WinEvaluator)
│   ├── gateway/                # Socket.IO & Room state management
│   ├── roles/                  # Định nghĩa các vai trò (Plugin-based)
│   ├── skills/                 # Cơ chế kỹ năng (Kế thừa từ base Skill)
│   ├── tests/                  # Unit & Integration Tests (71 test cases)
│   └── types/                  # TypeScript Interfaces & Enums
└── server.ts                   # Entry point của Server
```

---

## 📜 Luật Chơi & Flow Trò Chơi (Game Logic)

Trò chơi xoay quanh cuộc chiến sinh tồn giữa phe **Dân Làng** và phe **Ma Sói**. Một vòng lặp chuẩn luôn bắt đầu từ **Ban Đêm**, sau đó sang **Ban Ngày**, và tiếp tục cho đến khi có một phe đạt điều kiện thắng.

### 🌑 Ban Đêm (Night Phase)
Ban đêm là lúc các vai trò có chức năng thức dậy để thực hiện kỹ năng bí mật.
**Luật Voice Chat:** Toàn bộ người chơi sẽ bị tắt mic và tắt loa (Night Silent), ngoại trừ **Sói** được nói chuyện/nghe nhau, và **Cặp Đôi** được voice riêng (nếu bộ lọc cho phép).
Thứ tự hành động (tự động hóa 100%):
1. **Cupid (Đêm 1):** Chọn ghép đôi 2 người.
2. **Bảo Vệ:** Chọn 1 người để bảo vệ khỏi Sói (có thể tự bảo vệ bản thân, nhưng không bảo vệ cùng 1 người 2 đêm liên tiếp).
3. **Tiên Tri:** Soi phe 1 người (`Sói` hoặc `Dân`).
4. **Ma Sói:** Cả đàn thức dậy, thảo luận Voice và Vote cắn 1 người.
5. **Phù Thủy:** Dùng **Bình Cứu** chặn đứng cái chết, hoặc dùng **Bình Độc** để giết người (mỗi bình 1 lần/game).
6. **Thợ Săn:** Chọn mục tiêu ghim đạn. Nếu chết trong đêm, mục tiêu sẽ chết theo (trừ khi Thợ Săn bị chết bởi 2 nguồn sát thương cùng lúc).

### ☀️ Ban Ngày (Day Phase)
Hệ thống thông báo danh sách những người đã chết trong đêm.
**Luật Voice Chat:** Người đang sống được chat/voice công khai. Người chết trở thành "Thượng Đế", chỉ nghe và nói chuyện với nhau.
1. **Thảo luận & Buộc Tội**: Người chơi trò chuyện và Vote. Nhận đủ `>= 50%` số vé, nạn nhân lên giàn treo.
2. **Xác nhận Treo Cổ**: Toàn bộ sinh lang vote Yes/No. `>= 50%` Yes thì nạn nhân chết.

### 🏆 Điều kiện Thắng (Win Conditions)
Game tự động kiểm tra thắng/thua ưu tiên theo thứ tự:
1. **Thằng Hề (Jester)**: Thắng NGAY LẬP TỨC nếu bị LÀNG BỎ PHIẾU TREO CỔ thành công vào ban ngày.
2. **Phe Cặp Đôi (Lovers)**: Hai người yêu nhau còn sống VÀ trên sân chỉ còn tối đa 1 người khác.
3. **Phe Sói (Werewolves)**: Số lượng Sói `>=` số lượng người không phải Sói.
4. **Phe Dân (Villagers)**: Toàn bộ Sói đã chết, không có phe thứ 3 thắng.

---

## 🎭 Danh sách Vai trò (Roles)

| Vai trò | Phe | Kỹ năng chính | Chi tiết cơ chế |
|:---|:---:|:---|:---|
| **Ma Sói** | Sói | Cắn người | Đêm thức dậy voice cùng đồng bọn, vote cắn nạn nhân. |
| **Dân Làng** | Dân | Nghỉ ngơi | Suy luận ban ngày, không có kỹ năng đêm. |
| **Tiên Tri** | Dân | Soi phe | Soi 1 người để biết là `Sói` hay `Dân`. |
| **Bảo Vệ** | Dân | Tạo khiên | Khiên chặn 1 lượt cắn của Sói. Có thể tự buff. |
| **Phù Thủy** | Dân | Cứu / Độc | Có 1 bình Cứu và 1 bình Độc duy nhất cho cả game. |
| **Thợ Săn** | Dân | Bắn trả thù | Chết mang theo mục tiêu đã ghim. Mất đạn nếu bị xé xác bởi nhiều nguồn sát thương. |
| **Cupid** | Dân | Ghép đôi | Tạo cặp Tình Nhân. Lời thề nguyền: 1 người chết, người kia chết theo. |
| **Già Làng** | Dân | Chống cắn | Bị động: Cần Sói cắn 2 lần mới chết. |
| **Sói Nguyền** | Dân/Sói | Hắc hóa | Bắt đầu là Dân. Nếu bị Sói cắn, biến ngay thành Sói thuộc phe Sói. |
| **Thằng Hề** | Solo | Chọc tức | Thắng game NGAY lập tức nếu bị ép lên giàn treo cổ. |

---

## ⚙️ Cài đặt & Khởi chạy

### Theo dõi & Yêu cầu hệ thống
- **Node.js**: Phiên bản 18+
- **LiveKit Server**: Dùng Cloud hoặc Self-host. Cần `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` và `LIVEKIT_URL`.

### Setup môi trường Dev
1. **Clone repository:**
   ```bash
   git clone https://github.com/minhz99/Wolvesville-304.git
   cd Wolvesville-304
   ```

2. **Cài đặt thư viện:**
   ```bash
   npm install
   ```

3. **Cấu hình Môi trường:** Tạo file `.env` chứa thông tin kết nối LiveKit (xem mẫu trong code).

4. **Chạy server (Dev Mode):**
   ```bash
   npm run dev
   ```

5. **Chạy Tests:**
   ```bash
   npx jest
   ```

6. **Chơi thử:**
   Mở trình duyệt truy cập `http://localhost:3521`. Engine bắt đầu khi Host cấu hình Role xong và bấm Start.

---
*Developed with modern TypeScript architecture for ultimate game fairness and automated moderation.*