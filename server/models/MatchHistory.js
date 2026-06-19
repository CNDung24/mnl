const mongoose = require('mongoose');

// Luu lich su tra loi tung vong
const MatchHistorySchema = new mongoose.Schema({
  round: Number,
  questionText: String,
  answers: [{
    teamId: Number,
    playerName: String,
    choice: Number,       // dap an chon (-1 neu khong tra loi)
    correct: Boolean,
    timeMs: Number        // thoi gian tra loi (ms)
  }],
  winnerTeamId: Number,
  attackedTeamId: Number,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.MatchHistory || mongoose.model('MatchHistory', MatchHistorySchema);
