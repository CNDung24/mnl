const config = require('../config');
const defaultQuestions = require('../data/questions');
const characters = require('../data/characters');

const WORLD_W = config.WORLD_W;
const WORLD_H = config.WORLD_H;

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
    this.players = new Map();
    this.reset(true, false);
  }

  characterById(id) {
    return this.characters.find(c => c.id === id);
  }

  // Bán kính va chạm của nhân vật (sprite được vẽ 2x trên canvas).
  // Dùng fw/2 để hitbox nhỏ hơn body (chỉ tính vùng "thân" nhân vật).
  playerRadius(p) {
    const ch = this.characterById(p.characterId);
    if (!ch || !ch.fw) return 8;
    return Math.max(8, ch.fw / 2);
  }

  // keepPlayers = true: giữ nguyên người chơi đang online (chỉ reset điểm),
  // không bắt họ rời sảnh chờ / vào lại từ đầu.
  reset(keepQuestions = false, keepPlayers = true) {
    this.phase = 'lobby';
    this.round = 0;
    if (keepPlayers) {
      this.players.forEach(p => { p.score = 0; });
    } else {
      this.players = new Map();   // socketId -> player
    }
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
    this.eliminationOrder = [];       // teamId theo thứ tự bị loại (để xếp hạng 2, 3 khi kết thúc trận)
  }

  // ---------- NGƯỜI CHƠI ----------
  addPlayer(socketId, { name, teamId }) {
    const team = this.team(Number(teamId));
    if (!team) return { error: 'Đội không hợp lệ' };
    if (this.getPlayersByTeam(team.id).length >= config.MAX_PLAYERS_PER_TEAM) {
      return { error: 'Đội đã đủ người, hãy chọn đội khác' };
    }
    const margin = 50;
    const player = {
      id: socketId,
      name: String(name).slice(0, 16),
      teamId: Number(teamId),
      characterId: team.characterId,
      // Tọa độ theo không gian "thế giới" chung (WORLD_W x WORLD_H) — giống nhau
      // với mọi người chơi bất kể kích thước màn hình thiết bị của họ.
      x: margin + Math.random() * (WORLD_W - margin * 2),
      y: margin + Math.random() * (WORLD_H - margin * 2),
      score: 0
    };
    this.players.set(socketId, player);
    return player;
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
  }

  movePlayer(socketId, x, y) {
    const p = this.players.get(socketId);
    if (!p) return;
    const r = this.playerRadius(p);
    // giới hạn trong biên "thế giới" chung (không có va chạm)
    p.x = Math.max(r, Math.min(WORLD_W - r, x));
    p.y = Math.max(r, Math.min(WORLD_H - r, y));
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
    this.eliminationOrder = [];
    return this.nextRound();
  }

  // Bảng xếp hạng khi trận kết thúc: hạng 1 = đội thắng, hạng 2/3 = 2 đội bị loại
  // gần đây nhất (trụ vững lâu nhất trong số các đội thua).
  podium(winnerTeamId) {
    const runnersUp = [...this.eliminationOrder].reverse();
    return [winnerTeamId, ...runnersUp].filter(id => id != null).slice(0, 3);
  }

  // Bắt đầu một vòng mới: tất cả người chơi đang online đều được mời trả lời
  nextRound() {
    // kiểm tra kết thúc
    const alive = this.aliveTeams();
    if (alive.length <= 1) {
      this.phase = 'finished';
      this.winnerTeamId = alive[0] ? alive[0].id : null;
      return { ok: true, finished: true, winnerTeamId: this.winnerTeamId, podium: this.podium(this.winnerTeamId) };
    }

    if (!this.questions.length) return { ok: false, error: 'Không có câu hỏi' };

    this.round++;
    this.answers.clear();
    this.winnerTeamId = null;
    this.pendingAttackerTeam = null;

    // Tất cả người chơi thuộc đội còn sống đều có thể trả lời
    this.currentChosen = [];
    for (const t of alive) {
      const teamPlayers = this.getPlayersByTeam(t.id);
      teamPlayers.forEach(p => {
        this.currentChosen.push({ teamId: t.id, socketId: p.id, name: p.name });
      });
    }

    // lấy câu hỏi
    this.currentQuestion = this.questions[this.questionIndex % this.questions.length];
    this.questionIndex++;
    this.questionStartAt = Date.now();
    this.phase = 'question';

    return { ok: true, round: this.round };
  }

  submitAnswer(socketId, choice) {
    if (this.phase !== 'question') return { ok: false };
    const p = this.players.get(socketId);
    if (!p) return { ok: false };
    // chỉ người thuộc đội còn sống mới được trả lời
    const team = this.team(p.teamId);
    if (!team || !team.alive) return { ok: false };
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
   * Mỗi đội: đúng nếu có ít nhất 1 thành viên đúng; time = thành viên đúng nhanh nhất.
   */
  reveal(correctIndex = null) {
    if (this.phase !== 'question') return { ok: false };
    const correct = correctIndex !== null ? Number(correctIndex) : this.currentQuestion.correct;
    this.currentQuestion.correct = correct;

    // Kết quả từng người chơi
    const results = [];
    for (const c of this.currentChosen) {
      const a = this.answers.get(c.socketId);
      const choice = a ? a.choice : -1;
      const timeMs = a ? a.timeMs : Infinity;
      const isCorrect = choice === correct;
      results.push({ ...c, choice, timeMs, correct: isCorrect });
    }

    // Gộp kết quả theo đội: đúng nếu có 1 thành viên đúng, time = nhanh nhất
    const teamResults = new Map(); // teamId -> { correct, timeMs }
    for (const r of results) {
      if (!teamResults.has(r.teamId)) {
        teamResults.set(r.teamId, { correct: false, timeMs: Infinity });
      }
      const tr = teamResults.get(r.teamId);
      if (r.correct && r.timeMs < tr.timeMs) {
        tr.correct = true;
        tr.timeMs = r.timeMs;
      }
    }

    // Trừ HP đội sai (mỗi đội chỉ trừ 1 lần)
    const damaged = [];
    for (const [teamId, tr] of teamResults) {
      if (!tr.correct) {
        const t = this.team(teamId);
        if (t && t.alive) {
          t.hp = Math.max(0, t.hp - 1);
          damaged.push(teamId);
          if (t.hp === 0) { t.alive = false; this.eliminationOrder.push(teamId); }
        }
      }
    }

    // Cộng điểm cá nhân cho người trả lời đúng
    for (const r of results) {
      if (r.correct) {
        const p = this.players.get(r.socketId);
        if (p) {
          const speedBonus = Math.max(0, config.ANSWER_TIME * 1000 - r.timeMs);
          p.score += 100 + Math.round(speedBonus / 100);
        }
      }
    }

    // Đội thắng: trong các đội đúng, time nhanh nhất
    const correctTeams = [...teamResults.entries()]
      .filter(([_, tr]) => tr.correct)
      .sort((a, b) => a[1].timeMs - b[1].timeMs);
    this.winnerTeamId = correctTeams.length ? correctTeams[0][0] : null;
    const winnerTimeMs = correctTeams.length ? correctTeams[0][1].timeMs : null;
    this.pendingAttackerTeam = this.winnerTeamId;
    // Nếu các đội khác đã bị loại ngay trong bước trừ HP ở trên (VD: chỉ còn
    // đúng đội thắng sống sót), không còn ai để tấn công -> bỏ qua pha attack
    // (tránh đứng chờ hết ATTACK_TIME vô ích trước khi hiện màn vô địch).
    const canAttack = this.winnerTeamId && this.attackableTeams().length > 0;

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

    this.phase = canAttack ? 'attack' : 'reveal';

    return { ok: true, results, damaged, winnerTeamId: this.winnerTeamId, winnerTimeMs, record };
  }

  // Đội thắng chọn đội để tấn công
  chooseAttack(attackerTeamId, targetTeamId) {
    if (this.phase !== 'attack') return { ok: false, error: 'Không phải pha tấn công' };
    if (attackerTeamId !== this.pendingAttackerTeam) return { ok: false, error: 'Không có quyền tấn công' };
    const target = this.team(targetTeamId);
    if (!target || !target.alive) return { ok: false, error: 'Đội mục tiêu không hợp lệ' };
    if (targetTeamId === attackerTeamId) return { ok: false, error: 'Không thể tấn công chính mình' };

    target.hp = Math.max(0, target.hp - 1);
    if (target.hp === 0) { target.alive = false; this.eliminationOrder.push(targetTeamId); }

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
      leaderboard: this.leaderboard()
    };
  }
}

module.exports = GameEngine;
