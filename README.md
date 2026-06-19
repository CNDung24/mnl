# ⚔️ Triết Học Arena

Game web multiplayer thời gian thực cho môn Triết học — đấu trường 5 đội, phong cách pixel-art.

## Tính năng

- **Người chơi**: nhập tên, chọn đội (1–5), chọn 1 trong ~50 nhân vật, vào sảnh chờ di chuyển bằng phím/joystick.
- **Admin**: tạo/sửa câu hỏi, bắt đầu trận, chọn đáp án đúng, theo dõi HP, xem lịch sử trả lời.
- **Máy chiếu**: hiển thị HP 5 đội, người đang thi đấu, câu hỏi, đồng hồ, hiệu ứng bị tấn công, BXH cá nhân.

## Luật chơi

- 5 đội, mỗi đội 10 HP.
- Mỗi vòng hệ thống chọn ngẫu nhiên 1 người/đội (chưa từng được chọn) để trả lời.
- Trả lời sai → -1 HP. Trong các đội đúng, đội **nhanh nhất** thắng vòng.
- Đội thắng chọn 1 đội còn sống để tấn công → đội đó -1 HP.
- HP = 0 → bị loại. Đội cuối còn sống → vô địch.

## Cài đặt & chạy

```bash
npm install
npm start
```

Mở các đường dẫn:

- Người chơi: <http://localhost:3000/play>
- Admin: <http://localhost:3000/admin> (mật khẩu mặc định: `triet123`)
- Máy chiếu: <http://localhost:3000/projector>

## Biến môi trường (tùy chọn)

| Biến | Mặc định | Ý nghĩa |
|------|----------|---------|
| `PORT` | 3000 | Cổng server |
| `ADMIN_PASSWORD` | triet123 | Mật khẩu admin |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/triet_arena` | Chuỗi kết nối MongoDB. Đặt `MONGO_URI=""` (rỗng) → ép chạy bằng RAM |

### Dữ liệu được lưu trong MongoDB

Mặc định game kết nối MongoDB local và lưu vĩnh viễn:

- **questions** — bộ câu hỏi (tự seed mặc định nếu DB trống; admin sửa → lưu lại DB).
- **players** — mỗi người chơi khi tham gia, cập nhật điểm theo trận.
- **matchhistories** — lịch sử từng vòng: câu hỏi, đáp án + thời gian của mỗi đội, đội thắng, đội bị tấn công.

Lúc khởi động server nạp câu hỏi từ DB. Nếu không kết nối được MongoDB, game tự động chuyển sang chế độ RAM (vẫn chơi được, chỉ không lưu vĩnh viễn).

Ví dụ (PowerShell):

```powershell
$env:ADMIN_PASSWORD="matkhaumoi"; $env:MONGO_URI="mongodb://localhost:27017/triet"; npm start
```

## Kiến trúc

```
server/
  index.js            # Express + Socket.IO khởi động
  config.js           # Cấu hình trận, đội, thời gian
  game-engine/        # GameEngine.js — toàn bộ logic trận đấu
  socket/             # index.js — điều phối sự kiện realtime
  controllers/        # REST API admin (câu hỏi, lịch sử)
  models/             # Mongoose schema + kết nối DB (tùy chọn)
  data/               # characters.js (~50 nhân vật), questions.js
client/
  index.html          # Trang chủ
  play.html / js      # Người chơi + sảnh chờ (canvas)
  admin.html / js     # Trang quản trị
  projector.html / js # Màn hình máy chiếu
  css/style.css       # Pixel-art theme
```

## Luồng điều khiển (Admin)

1. Bấm **Bắt đầu trận** → vòng 1 bắt đầu, hệ thống chọn người.
2. Người được chọn trả lời (hoặc hết giờ tự chốt).
3. Admin chọn đáp án đúng → **Chốt đáp án** (hoặc để hệ thống dùng đáp án mặc định khi hết giờ).
4. Đội thắng chọn đội để tấn công.
5. Bấm **Vòng tiếp theo** để tiếp tục đến khi còn 1 đội.
