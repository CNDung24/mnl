// Cấu hình chung cho toàn bộ game
module.exports = {
  PORT: process.env.PORT || 3000,

  // Kết nối MongoDB. Mặc định dùng MongoDB local.
  // Đặt MONGO_URI='' (chuỗi rỗng) để ép chạy bằng bộ nhớ RAM.
  MONGO_URI: process.env.MONGO_URI !== undefined
    ? process.env.MONGO_URI
    : 'mongodb://127.0.0.1:27017/triet_arena',

  // Mật khẩu đăng nhập trang admin
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'triet123',

  // Cấu hình trận đấu
  TEAM_COUNT: 5,
  START_HP: 10,
  ANSWER_TIME: 20,      // số giây trả lời mỗi câu
  ATTACK_TIME: 15,      // số giây chọn đội để tấn công

  // 5 đội cố định
  TEAMS: [
    { id: 1, name: 'Đội 1', color: '#e74c3c' },
    { id: 2, name: 'Đội 2', color: '#3498db' },
    { id: 3, name: 'Đội 3', color: '#2ecc71' },
    { id: 4, name: 'Đội 4', color: '#f1c40f' },
    { id: 5, name: 'Đội 5', color: '#9b59b6' }
  ]
};
