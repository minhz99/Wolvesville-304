# 🐺 Wolvesville 30/4 — High-Performance Werewolf Engine

**Wolvesville 30/4** là một engine game Ma Sói (Werewolf) hiện đại, được xây dựng với kiến trúc **Plugin-based** và cơ chế **Event-driven Chain Reaction**. Toàn bộ luồng trò chơi được tự động hóa (Auto-moderated), mang lại trải nghiệm mượt mà, công bằng và giàu tính chiến thuật.

---

## 🚀 Tính năng nổi bật

- **Plugin-based Architecture** — Các vai trò (Roles) và kỹ năng (Skills) hoàn toàn tách biệt khỏi core engine. Việc thêm vai trò mới chỉ mất vài phút.
- **Event-driven Chain Reaction** — Hệ thống EventBus xử lý các phản ứng dây chuyền (VD: Thợ săn chết bắn người, người đó chết kéo theo tình nhân chết).
- **Auto-Moderated** — Engine tự động điều phối toàn bộ các giai đoạn (Phases), không cần người quản trò.
- **Skill Composition** — Vai trò được xây dựng bằng cách lắp ghép các module kỹ năng (Attack, Protect, Investigate, Potion...).
- **Real-time Multi-room** — Hỗ trợ nhiều phòng chơi đồng thời với hệ thống Socket.IO hiệu năng cao.
- **Server-Authoritative** — Mọi logic quan trọng đều được xử lý và kiểm soát tại Server để đảm bảo tính minh bạch.

---

## 🛠️ Tech Stack

| Thành phần | Công nghệ |
|:---|:---|
| **Ngôn ngữ** | TypeScript (ES6+) |
| **Runtime** | Node.js |
| **Server Framework** | Express.js |
| **Real-time Communication** | Socket.IO |
| **Development Tool** | ts-node, Nodemon |
| **Client** | Vanilla HTML5, CSS3 (Modern Glassmorphism), JavaScript (ES6) |

---

## 📂 Cấu trúc dự án

```text
wolvesville-304/
├── server/
│   ├── index.ts                 # Entry point (Express + Socket.IO)
│   ├── engine/                  # 🧠 Bộ não trung tâm (Core Engine)
│   │   ├── GameEngine.ts        # Điều phối logic game & phase
│   │   ├── GameState.ts         # Quản lý trạng thái runtime (players, round...)
│   │   ├── ActionPipeline.ts    # Xử lý hành động ban đêm theo trình tự
│   │   ├── EventBus.ts          # Hệ thống sự kiện & phản ứng dây chuyền
│   │   └── WinEvaluator.ts      # Kiểm tra điều kiện thắng/thua
│   ├── roles/                   # 🎭 Danh sách vai trò (Plugin)
│   │   ├── Role.ts              # Abstract Class cơ bản cho mọi role
│   │   ├── Werewolf.ts, Seer.ts, Witch.ts, Guard.ts...
│   ├── skills/                  # ⚡ Các module kỹ năng tái sử dụng
│   │   ├── Skill.ts             # Abstract Class cho kỹ năng
│   │   ├── AttackSkill.ts, ProtectSkill.ts, PotionSkill.ts...
│   ├── gateway/                 # 🌐 Lớp giao tiếp mạng
│   │   ├── SocketGateway.ts     # Xử lý toàn bộ logic flow qua Socket.IO
│   │   └── RoomManager.ts       # Quản lý phòng chơi & gán Role
│   └── types/                   # 📝 Định nghĩa kiểu dữ liệu & Enums
├── client/
│   ├── index.html               # Giao diện người dùng hiện đại
│   ├── styles.css               # Hệ thống design system (Glassmorphism)
│   ├── app.js                   # Logic xử lý Socket & UI tại client
│   └── livekit.js               # (Mở rộng) Tích hợp Voice-chat
└── package.json
```

---

## 🔄 Luồng trò chơi (Automated Flow)

Hệ thống tự động chuyển đổi giữa các giai đoạn dựa trên bộ đếm thời gian (Timers) và hành động của người chơi:

### 🌑 Ban đêm (Night Flow)
Hành động được xử lý theo trình tự thời gian hoặc song song:
1. **Lover Talk** — Cặp đôi tình nhân thảo luận riêng.
2. **Independent Actions** — Bảo vệ, Tiên tri, Thần tình yêu thực hiện kỹ năng đồng thời.
3. **Werewolf Vote** — Đàn sói thảo luận và thống nhất mục tiêu cắn.
4. **Witch Action** — Phù thủy thấy nạn nhân, quyết định dùng thuốc cứu hoặc độc.
5. **Hunter Setup** — Thợ săn chọn mục tiêu trả thù dự phòng.
6. **Resolve Night** — Tổng hợp kết quả và công bố nạn nhân.

### ☀️ Ban ngày (Day Flow)
1. **Discussion & Voting** — Thảo luận công khai và bỏ phiếu tìm nghi phạm.
2. **Confirm Hang** — Toàn bộ làng quyết định treo cổ hoặc tha bổng cho người bị nghi ngờ.
3. **Check Win** — Kiểm tra xem phe nào đã giành chiến thắng.

---

## 🎭 Hệ thống Vai trò & Kỹ năng

Hiện tại engine đã tích hợp sẵn **10 vai trò** phổ biến:

| Vai trò | Phe | Kỹ năng chính | Trigger |
|:---|:---:|:---|:---|
| **Ma Sói** | Sói | `AttackSkill` | Ban đêm (Chủ động) |
| **Dân Làng** | Dân | Không | — |
| **Tiên Tri** | Dân | `InvestigateSkill` | Ban đêm (Chủ động) |
| **Bảo Vệ** | Dân | `ProtectSkill` | Ban đêm (Chủ động) |
| **Phù Thủy** | Dân | `PotionSkill` | Sau cắn (Phản ứng) |
| **Thợ Săn** | Dân | `ShootSkill` | Khi chết (Phản ứng) |
| **Thần Tình Yêu** | Dân | `CupidLinkSkill` | Đêm đầu (Chủ động) |
| **Già Làng** | Dân | `ElderShieldSkill` | Khi bị cắn (Bị động) |
| **Sói Nguyền** | Dân/Sói | `CursedTransformSkill`| Khi bị cắn (Biến đổi) |
| **Thằng Ngốc** | Solo | `onDeath` | Khi bị treo cổ (Thắng) |

---

## ⚙️ Cài đặt & Khởi chạy

### Yêu cầu hệ thống
- **Node.js**: phiên bản 18 trở lên.
- **npm**: phiên bản 6 trở lên.

### Các bước thực hiện
1. **Clone repository:**
   ```bash
   git clone https://github.com/minhz99/Wolvesville-304.git
   cd Wolvesville-304
   ```

2. **Cài đặt dependencies:**
   ```bash
   npm install
   ```

3. **Chạy server phát triển:**
   ```bash
   npm run dev
   ```

4. **Truy cập game:**
   Mở trình duyệt và vào địa chỉ: `http://localhost:3000`

---

## 🛡️ Nguyên tắc bảo mật & Hiệu năng
- **Validation**: Mọi input từ client (chọn mục tiêu, bỏ phiếu) đều được validate thông qua trạng thái hiện tại của `GameEngine` và `RoomManager`.
- **Visibility Control**: Server chỉ gửi thông tin vai trò cho những người chơi có quyền được biết (VD: Sói thấy đồng bọn, Tiên tri thấy kết quả soi).
- **Modularization**: Code được chia nhỏ thành các Class và Module chuyên biệt, dễ dàng unit test và bảo trì.