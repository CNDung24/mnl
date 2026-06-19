// Lớp truy cập dữ liệu (Data Access) tập trung mọi thao tác MongoDB.
// Tất cả hàm đều an toàn: nếu chưa kết nối DB thì trả về giá trị rỗng / không làm gì,
// để game vẫn chạy bình thường ở chế độ bộ nhớ RAM.
const { isConnected } = require('./db');
const Player = require('./Player');
const Question = require('./Question');
const MatchHistory = require('./MatchHistory');

module.exports = {
  // ----- QUESTIONS -----
  // Nạp câu hỏi từ DB. Nếu DB trống, seed bằng danh sách mặc định rồi trả về.
  async loadQuestions(defaults) {
    if (!isConnected()) return null;
    let docs = await Question.find().sort({ createdAt: 1 }).lean();
    if (docs.length === 0 && defaults && defaults.length) {
      await Question.insertMany(defaults);
      docs = await Question.find().sort({ createdAt: 1 }).lean();
    }
    return docs.map(d => ({ text: d.text, options: d.options, correct: d.correct }));
  },

  async saveQuestions(list) {
    if (!isConnected()) return;
    await Question.deleteMany({});
    if (list.length) await Question.insertMany(list);
  },

  // ----- PLAYERS -----
  async savePlayer(player) {
    if (!isConnected()) return null;
    const doc = await Player.create({
      name: player.name,
      teamId: player.teamId,
      characterId: player.characterId,
      score: player.score || 0
    });
    return doc._id;
  },

  async updatePlayerScore(dbId, score) {
    if (!isConnected() || !dbId) return;
    await Player.findByIdAndUpdate(dbId, { score });
  },

  // ----- MATCH HISTORY -----
  async saveHistory(record) {
    if (!isConnected()) return;
    await MatchHistory.create({
      round: record.round,
      questionText: record.questionText,
      answers: record.answers,
      winnerTeamId: record.winnerTeamId,
      attackedTeamId: record.attackedTeamId
    });
  },

  async updateHistoryAttack(round, attackedTeamId) {
    if (!isConnected()) return;
    // cập nhật bản ghi mới nhất của vòng này
    await MatchHistory.findOneAndUpdate(
      { round },
      { attackedTeamId },
      { sort: { createdAt: -1 } }
    );
  },

  async getHistory() {
    if (!isConnected()) return null;
    return await MatchHistory.find().sort({ createdAt: 1 }).lean();
  }
};
