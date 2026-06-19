const mongoose = require('mongoose');

// Luu lich su nguoi choi (chi dung khi co MongoDB)
const PlayerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  teamId: { type: Number, required: true },
  characterId: { type: String, required: true },
  score: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Player || mongoose.model('Player', PlayerSchema);
