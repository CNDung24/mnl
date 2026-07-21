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
  MAX_PLAYERS_PER_TEAM: 1,   // mỗi đội chỉ nhận tối đa 1 người chơi
  START_HP: 10,
  ANSWER_TIME: 10,      // số giây trả lời mỗi câu
  ATTACK_TIME: 15,      // số giây chọn đội để tấn công

  // Kích thước "thế giới" sảnh chờ chung — TẤT CẢ người chơi (mọi thiết bị,
  // mọi kích thước màn hình) di chuyển trong cùng 1 không gian tọa độ này.
  // Mỗi client tự quy đổi world -> pixel màn hình riêng của mình khi vẽ,
  // nên vị trí luôn nhất quán/tương đối đúng dù màn hình to nhỏ khác nhau.
  WORLD_W: 1600,
  WORLD_H: 900,

  // 5 đội cố định — mỗi đội gắn sẵn 1 nhân vật mặc định (xem server/data/characters.js)
  TEAMS: [
    { id: 1, name: 'Đội 1', color: '#e74c3c', characterId: 'char_51' },
    { id: 2, name: 'Đội 2', color: '#3498db', characterId: 'char_52' },
    { id: 3, name: 'Đội 3', color: '#2ecc71', characterId: 'char_53' },
    { id: 4, name: 'Đội 4', color: '#f1c40f', characterId: 'char_54' },
    { id: 5, name: 'Đội 5', color: '#9b59b6', characterId: 'char_55' }
  ]
};
