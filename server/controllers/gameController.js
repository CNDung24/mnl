// REST controller cho admin: thao tác với câu hỏi và lịch sử.
// Làm việc trên game engine (bộ nhớ RAM) + đồng bộ MongoDB qua repository.
const repo = require('../models/repository');

module.exports = (engine) => ({
  getQuestions: (req, res) => res.json(engine.questions),

  setQuestions: async (req, res) => {
    const list = req.body.questions || [];
    engine.setQuestions(list);
    await repo.saveQuestions(engine.questions).catch(() => {});
    res.json({ ok: true, count: engine.questions.length });
  },

  // Ưu tiên lịch sử trong DB (đầy đủ), fallback về bộ nhớ RAM
  getHistory: async (req, res) => {
    const dbHistory = await repo.getHistory().catch(() => null);
    res.json(dbHistory || engine.history);
  },

  getState: (req, res) => res.json(engine.publicState())
});
