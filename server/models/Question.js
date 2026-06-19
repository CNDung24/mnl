const mongoose = require('mongoose');

const QuestionSchema = new mongoose.Schema({
  text: { type: String, required: true },
  options: { type: [String], required: true },
  correct: { type: Number, required: true }, // 0..3
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Question || mongoose.model('Question', QuestionSchema);
