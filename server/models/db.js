const mongoose = require('mongoose');
const { MONGO_URI } = require('../config');

// Kết nối MongoDB nếu có cấu hình. Nếu không, game vẫn chạy bình thường (bộ nhớ RAM).
async function connectDB() {
  if (!MONGO_URI) {
    console.log('[DB] Không có MONGO_URI -> chạy chế độ bộ nhớ RAM (không lưu vĩnh viễn).');
    return false;
  }
  try {
    await mongoose.connect(MONGO_URI);
    console.log('[DB] Đã kết nối MongoDB.');
    return true;
  } catch (err) {
    console.error('[DB] Lỗi kết nối MongoDB, chuyển sang bộ nhớ RAM:', err.message);
    return false;
  }
}

module.exports = { connectDB, isConnected: () => mongoose.connection.readyState === 1 };
