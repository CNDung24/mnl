const config = require('../config');
const defaultQuestions = require('../data/questions');
const characters = require('../data/characters');

const DEFAULT_W = 1600;
const DEFAULT_H = 900;

/**
 * GameEngine: quản lý toàn bộ trạng thái một trận đấu.
 * Không phụ thuộc socket - chỉ trả về trạng thái và sự kiện.
 * Tầng trên (socket handlers) chịu trách nhiệm phát sự kiện và đặt timer.
 *
 * Các pha (phase):
 *  - lobby:    đang ở sảnh chờ, chưa bắt đầu
 *  - question: đang hiển thị câu hỏi, người chơi đang trả lời
 *  - reveal:   đã chốt đáp án, hiện kết quả + chọn đội thắng
 *  - attack:   đội thắng đang chọn đội để tấn công
 *  - finished: trận kết thúc
 */
class GameEngine {
  constructor() {
    this.characters = characters;
    this.playerCanvas = new Map();   // socketId -> {w, h}
    this.reset(true);
  }

  characterById(id) {
    return this.characters.find(c => c.id === id);
  }

  // Cập nhật kích thước canvas (viewport) của 1 người chơi + clamp vị trí hiện tại
  setPlayerCanvas(socketId, w, h) {
    this.playerCanvas.set(socketId, { w: Math.max(200, +w || DEFAULT_W), h: Math.max(200, +h || DEFAULT_H) });
    const p = this.players.get(socketId);
    if (p) {
      const r = this.playerRadius(p);
      const c = this.getPlayerCanvas(socketId);
      p.x = Math.max(r, Math.min(c.w - r, p.x));
      p.y = Math.max(r, Math.min(c.h - r, p.y));
    }
  }

  getPlayerCanvas(socketId) {
    return this.playerCanvas.get(socketId) || { w: DEFAULT_W, h: DEFAULT_H };
  }

  // Bán kính va chạm của nhân vật (sprite được vẽ 2x trên canvas).
  // Dùng fw/2 để hitbox nhỏ hơn body (chỉ tính vùng "thân" nhân vật).
  playerRadius(p) {
    const ch = this.characterById(p.characterId);
    if (!ch || !ch.fw) return 8;
    return Math.max(8, ch.fw / 2);
  }

  reset(keepQuestions = false) {
    this.phase = 'lobby';
    this.round = 0;
    this.players = new Map();   // socketId -> player
    this.teams = config.TEAMS.map(t => ({
      ...t,
      hp: config.START_HP,
      alive: true
    }));
    if (!keepQuestions) {
      // giữ nguyên
    } else {
      this.questions = defaultQuestions.map(q => ({ ...q }));
    }
    this.usedPlayerIds = new Set();   // những người đã từng được chọn thi đấu
    this.currentQuestion = null;
    this.currentChosen = [];          // [{teamId, socketId, name}]
    this.answers = new Map();         // socketId -> {choice, timeMs}
    this.questionStartAt = 0;
    this.history = [];                // lịch sử các vòng
    this.winnerTeamId = null;         // đội thắng vòng hiện tại
    this.pendingAttackerTeam = null;  // đội đang có quyền tấn công
    this.questionIndex = 0;
  }

  // ---------- NGƯỜI CHƠI ----------
  addPlayer(socketId, { name, teamId, characterId }) {
    // chặn nếu nhân vật đã có người chọn
    for (const p of this.players.values()) {
      if (p.characterId === characterId) {
        return { error: 'Nhân vật đã có người chọn' };
      }
    }
    const c = this.getPlayerCanvas(socketId);
    const margin = 50;
    const player = {
      id: socketId,
      name: String(name).slice(0, 16),
      teamId: Number(teamId),
      characterId,
      x: margin + Math.random() * Math.max(50, c.w - margin * 2),
      y: margin + Math.random() * Math.max(50, c.h - margin * 2),
      score: 0
    };
    this.players.set(socketId, player);
    return player;
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
    this.playerCanvas.delete(socketId);
  }

  movePlayer(socketId, x, y) {
    const p = this.players.get(socketId);
    if (!p) return;
    const r = this.playerRadius(p);
    const c = this.getPlayerCanvas(socketId);
    // giới hạn canvas theo viewport của người chơi (không có va chạm)
    p.x = Math.max(r, Math.min(c.w - r, x));
    p.y = Math.max(r, Math.min(c.h - r, y));
  }

  _canStand(self, x, y) {
    const r1 = this.playerRadius(self);
    for (const o of this.players.values()) {
      if (o.id === self.id) continue;
      const r = r1 + this.playerRadius(o);
      const dx = x - o.x, dy = y - o.y;
      if (dx * dx + dy * dy < r * r) return false;
    }
    return true;
  }

  getPlayersByTeam(teamId) {
    return [...this.players.values()].filter(p => p.teamId === teamId);
  }

  takenCharacterIds() {
    return [...this.players.values()].map(p => p.characterId);
  }

  team(teamId) {
    return this.teams.find(t => t.id === teamId);
  }

  aliveTeams() {
    return this.teams.filter(t => t.alive);
  }

  // ---------- QUESTIONS (admin chỉnh sửa) ----------
  setQuestions(list) {
    this.questions = list.map(q => ({
      text: String(q.text || ''),
      options: (q.options || []).slice(0, 4),
      correct: Number(q.correct) || 0
    }));
  }

  // ---------- LUỒNG TRẬN ĐẤU ----------
  startMatch() {
    if (this.players.size === 0) return { ok: false, error: 'Chưa có người chơi' };
    this.phase = 'lobby';
    this.round = 0;
    this.teams.forEach(t => { t.hp = config.START_HP; t.alive = true; });
    this.usedPlayerIds.clear();
    this.history = [];
    this.questionIndex = 0;
    return this.nextRound();
  }

  // Bắt đầu một vòng mới: chọn ngẫu nhiên 1 người/đội (chưa từng được chọn)
  nextRound() {
    // kiểm tra kết thúc
    const alive = this.aliveTeams();
    if (alive.length <= 1) {
      this.phase = 'finished';
      this.winnerTeamId = alive[0] ? alive[0].id : null;
      return { ok: true, finished: true, winnerTeamId: this.winnerTeamId };
    }

    if (!this.questions.length) return { ok: false, error: 'Không có câu hỏi' };

    this.round++;
    this.answers.clear();
    this.winnerTeamId = null;
    this.pendingAttackerTeam = null;

    // chọn người chơi mỗi đội còn sống
    this.currentChosen = [];
    for (const t of alive) {
      let pool = this.getPlayersByTeam(t.id).filter(p => !this.usedPlayerIds.has(p.id));
      if (pool.length === 0) {
        // hết lượt -> cho phép chọn lại từ đầu (reset riêng đội này)
        pool = this.getPlayersByTeam(t.id);
      }
      if (pool.length === 0) continue; // đội không có thành viên online
      const chosen = pool[Math.floor(Math.random() * pool.length)];
      this.usedPlayerIds.add(chosen.id);
      this.currentChosen.push({ teamId: t.id, socketId: chosen.id, name: chosen.name });
    }

    // lấy câu hỏi
    this.currentQuestion = this.questions[this.questionIndex % this.questions.length];
    this.questionIndex++;
    this.questionStartAt = Date.now();
    this.phase = 'question';

    return { ok: true, round: this.round };
  }

  isChosen(socketId) {
    return this.currentChosen.some(c => c.socketId === socketId);
  }

  submitAnswer(socketId, choice) {
    if (this.phase !== 'question') return { ok: false };
    if (!this.isChosen(socketId)) return { ok: false };
    if (this.answers.has(socketId)) return { ok: false }; // đã trả lời
    const timeMs = Date.now() - this.questionStartAt;
    this.answers.set(socketId, { choice: Number(choice), timeMs });
    // nếu tất cả đã trả lời -> có thể chốt sớm
    const allAnswered = this.currentChosen.every(c => this.answers.has(c.socketId));
    return { ok: true, allAnswered };
  }

  /**
   * Chốt đáp án (admin có thể override correctIndex).
   * Tính điểm, trừ HP đội sai, xác định đội thắng (đúng + nhanh nhất).
   */
  reveal(correctIndex = null) {
    if (this.phase !== 'question') return { ok: false };
    const correct = correctIndex !== null ? Number(correctIndex) : this.currentQuestion.correct;
    this.currentQuestion.correct = correct;

    const results = [];
    for (const c of this.currentChosen) {
      const a = this.answers.get(c.socketId);
      const choice = a ? a.choice : -1;
      const timeMs = a ? a.timeMs : Infinity;
      const isCorrect = choice === correct;
      results.push({ ...c, choice, timeMs, correct: isCorrect });
    }

    // trừ HP đội sai (hoặc không trả lời)
    const damaged = [];
    for (const r of results) {
      if (!r.correct) {
        const t = this.team(r.teamId);
        if (t && t.alive) {
          t.hp = Math.max(0, t.hp - 1);
          damaged.push(r.teamId);
          if (t.hp === 0) t.alive = false;
        }
      } else {
        // cộng điểm cá nhân cho người trả lời đúng
        const p = this.players.get(r.socketId);
        if (p) {
          const speedBonus = Math.max(0, config.ANSWER_TIME * 1000 - r.timeMs);
          p.score += 100 + Math.round(speedBonus / 100);
        }
      }
    }

    // xác định đội thắng vòng: trong các đội đúng, nhanh nhất
    const correctTeams = results.filter(r => r.correct).sort((a, b) => a.timeMs - b.timeMs);
    this.winnerTeamId = correctTeams.length ? correctTeams[0].teamId : null;
    this.pendingAttackerTeam = this.winnerTeamId;

    // lưu lịch sử
    const record = {
      round: this.round,
      questionText: this.currentQuestion.text,
      correct,
      answers: results.map(r => ({
        teamId: r.teamId, playerName: r.name, choice: r.choice,
        correct: r.correct, timeMs: r.timeMs === Infinity ? null : r.timeMs
      })),
      winnerTeamId: this.winnerTeamId,
      attackedTeamId: null,
      damaged
    };
    this.history.push(record);

    this.phase = this.winnerTeamId ? 'attack' : 'reveal';

    return { ok: true, results, damaged, winnerTeamId: this.winnerTeamId, record };
  }

  // Đội thắng chọn đội để tấn công
  chooseAttack(attackerTeamId, targetTeamId) {
    if (this.phase !== 'attack') return { ok: false, error: 'Không phải pha tấn công' };
    if (attackerTeamId !== this.pendingAttackerTeam) return { ok: false, error: 'Không có quyền tấn công' };
    const target = this.team(targetTeamId);
    if (!target || !target.alive) return { ok: false, error: 'Đội mục tiêu không hợp lệ' };
    if (targetTeamId === attackerTeamId) return { ok: false, error: 'Không thể tấn công chính mình' };

    target.hp = Math.max(0, target.hp - 1);
    if (target.hp === 0) target.alive = false;

    // cập nhật lịch sử vòng cuối
    if (this.history.length) this.history[this.history.length - 1].attackedTeamId = targetTeamId;

    this.phase = 'reveal';
    return { ok: true, targetTeamId, hp: target.hp, eliminated: !target.alive };
  }

  // Các đội có thể bị tấn công bởi đội thắng
  attackableTeams() {
    if (!this.pendingAttackerTeam) return [];
    return this.aliveTeams().filter(t => t.id !== this.pendingAttackerTeam).map(t => t.id);
  }

  leaderboard() {
    return [...this.players.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(p => ({ name: p.name, teamId: p.teamId, score: p.score, characterId: p.characterId }));
  }

  // Trạng thái gửi cho client/projector
  publicState() {
    return {
      phase: this.phase,
      round: this.round,
      teams: this.teams.map(t => ({ ...t, players: this.getPlayersByTeam(t.id).length })),
      players: [...this.players.values()],
      currentChosen: this.currentChosen,
      question: this.currentQuestion ? {
        text: this.currentQuestion.text,
        options: this.currentQuestion.options
      } : null,
      answerTime: config.ANSWER_TIME,
      questionStartAt: this.questionStartAt,
      winnerTeamId: this.winnerTeamId,
      attackerTeam: this.pendingAttackerTeam,
      attackableTeams: this.attackableTeams(),
      leaderboard: this.leaderboard(),
      takenCharacters: this.takenCharacterIds()
    };
  }
}

module.exports = GameEngine;
