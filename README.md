opencode -s ses_1225cd696ffeD43fJMSRKi6O30

# ⚔️ Triết Học Arena

Game web multiplayer thời gian thực cho môn Triết học — đấu trường 5 đội, phong cách pixel-art.

## Tính năng

- **Người chơi**: nhập tên, chọn đội (1–5), chọn 1 trong ~50 nhân vật, vào sảnh chờ di chuyển bằng phím/joystick. Khi admin bắt đầu trận → khóa di chuyển, hiện câu hỏi + 4 đáp án Α/Β/Γ/Δ để chọn.
- **Admin**: tạo/sửa câu hỏi, bắt đầu trận, chọn đáp án đúng, theo dõi HP, xem lịch sử trả lời.
- **Máy chiếu**: hiển thị HP 5 đội, người đang thi đấu, câu hỏi, đồng hồ, cảnh giao chiến khi đội thắng tấn công.

## Luật chơi

- 5 đội, mỗi đội 10 HP.
- **Sảnh chờ**: người chơi di chuyển tự do bằng phím/joystick (nhân vật pixel-art).
- **Khi admin bấm "Khai mạc trận"**: khóa di chuyển, ẩn canvas, hiện câu hỏi + 4 đáp án Α/Β/Γ/Δ cho **tất cả** người chơi.
- Mỗi người chơi chọn đáp án (mỗi người chỉ trả lời 1 lần). Đội được tính **đúng** nếu có ít nhất 1 thành viên trả lời đúng; time đội = thành viên đúng nhanh nhất.
- Đội không có ai đúng → -1 HP.
- Trong các đội đúng, đội **nhanh nhất** thắng vòng.
- Đội thắng chọn 1 đội còn sống để tấn công → đội đó -1 HP.
- HP = 0 → bị loại. Đội cuối còn sống → vô địch.
- Sau khi trận kết thúc, admin bấm "Tái khởi động" để quay về sảnh chờ (canvas hiện lại, di chuyển mở lại).

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

1. Bấm **Khai mạc trận** → khóa di chuyển toàn bộ người chơi, vòng 1 bắt đầu, mọi người thấy câu hỏi.
2. Người chơi chọn đáp án (chỉ trả lời được 1 lần). Hết giờ → tự chốt.
3. Admin chọn đáp án đúng → **Chốt đáp án** (hoặc để hệ thống dùng đáp án mặc định khi hết giờ).
4. Đội thắng chọn đội để tấn công. Vòng tiếp theo tự động bắt đầu sau vài giây.
5. Bấm **Tạm dừng** bất cứ lúc nào để đóng băng đồng hồ đếm ngược hiện tại (câu hỏi/tấn công/chờ vòng mới); bấm lại (**Tiếp tục**) để đếm tiếp đúng thời gian còn lại.
6. Bấm **Reset lại trận đấu** để đưa HP/điểm/vòng đấu về ban đầu và quay lại sảnh chờ — người chơi đang trong phòng vẫn được giữ nguyên, không cần vào lại.
