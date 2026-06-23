const config = require('../config');
const characters = require('../data/characters');
const repo = require('../models/repository');

/**
 * Đăng ký toàn bộ sự kiện socket.
 * Một instance GameEngine được dùng chung cho cả phòng.
 */
function registerSockets(io, engine) {
  let timer = null;          // timer đếm ngược câu hỏi / tấn công
  let timerEndsAt = 0;
  let nextRoundTimer = null; // đếm ngược tự chuyển vòng
  let nextRoundEndsAt = 0;
  const NEXT_ROUND_DELAY = 5; // số giây chờ giữa các vòng

  function clearNextRoundTimer() {
    if (nextRoundTimer) { clearInterval(nextRoundTimer); nextRoundTimer = null; }
    nextRoundEndsAt = 0;
    io.emit('next-round-countdown', { active: false });
  }

  // Sau khi một vòng kết thúc (reveal/attack xong), đếm ngược rồi tự sang vòng mới.
  function scheduleAutoAdvance() {
    if (nextRoundTimer) clearInterval(nextRoundTimer); // hủy timer cũ (nếu có) nhưng KHÔNG emit false để tránh flicker
    nextRoundEndsAt = Date.now() + NEXT_ROUND_DELAY * 1000;
    io.emit('next-round-countdown', { active: true, seconds: NEXT_ROUND_DELAY, endsAt: nextRoundEndsAt });
    nextRoundTimer = setInterval(() => {
      const remain = Math.max(0, nextRoundEndsAt - Date.now());
      if (remain <= 0) {
        clearNextRoundTimer();
        advanceToNextRound();
      }
    }, 250);
  }

  // Gọi sang vòng tiếp theo. Có thể được gọi tự động (auto-advance) hoặc do admin bấm.
  function advanceToNextRound() {
    if (engine.phase === 'finished' || engine.phase === 'lobby') return;
    const r = engine.nextRound();
    if (r.ok && !r.finished) beginQuestionPhase();
    else {
      clearTimer();
      clearNextRoundTimer();
      broadcastState();
      io.emit('match-finished', { winnerTeamId: r.winnerTeamId });
    }
  }

  function broadcastState() {
    io.emit('state', engine.publicState());
  }

  function clearTimer() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  // Lưu điểm cá nhân của tất cả người chơi vào DB
  function persistScores() {
    engine.players.forEach(p => {
      if (p.dbId) repo.updatePlayerScore(p.dbId, p.score).catch(() => {});
    });
  }

  // Đếm ngược và gọi onEnd khi hết giờ
  function startTimer(seconds, onEnd) {
    clearTimer();
    timerEndsAt = Date.now() + seconds * 1000;
    io.emit('timer', { endsAt: timerEndsAt, seconds });
    timer = setInterval(() => {
      const remain = Math.max(0, timerEndsAt - Date.now());
      if (remain <= 0) {
        clearTimer();
        onEnd();
      }
    }, 250);
  }

  // ----- Logic điều phối trận -----
  function beginQuestionPhase() {
    broadcastState();
    // Gửi câu hỏi cho TẤT CẢ người chơi để ai cũng có thể trả lời
    io.emit('your-turn', {
      question: { text: engine.currentQuestion.text, options: engine.currentQuestion.options }
    });
    startTimer(config.ANSWER_TIME, () => doReveal(null));
  }

  function doReveal(correctIndex) {
    if (engine.phase !== 'question') return;
    const result = engine.reveal(correctIndex);
    clearTimer();
    io.emit('reveal', {
      correct: engine.currentQuestion.correct,
      results: result.results,
      damaged: result.damaged,
      winnerTeamId: result.winnerTeamId
    });

    repo.saveHistory(result.record).catch(() => {});
    persistScores();

    if (engine.phase === 'attack') {
      // đội thắng chọn đội tấn công (có thời gian giới hạn)
      io.emit('attack-phase', {
        attackerTeam: engine.pendingAttackerTeam,
        attackable: engine.attackableTeams()
      });
      startTimer(config.ATTACK_TIME, () => {
        // hết giờ: tự động chọn ngẫu nhiên 1 đội
        const targets = engine.attackableTeams();
        if (targets.length) {
          const t = targets[Math.floor(Math.random() * targets.length)];
          engine.chooseAttack(engine.pendingAttackerTeam, t);
          io.emit('attacked', { targetTeamId: t, auto: true });
        }
        broadcastState();
        // Sau khi đội thắng đã tấn công xong (hoặc bị bỏ qua do hết giờ) → đếm ngược vòng mới
        scheduleAutoAdvance();
      });
    } else {
      // Không có đội thắng (tất cả sai) → reveal phase → đếm ngược vòng mới luôn
      scheduleAutoAdvance();
    }
    broadcastState();
  }

  io.on('connection', (socket) => {
    // gửi dữ liệu khởi tạo
    socket.emit('init', {
      characters,
      teams: config.TEAMS,
      state: engine.publicState(),
      takenCharacters: engine.takenCharacterIds()
    });

    // ===== NGƯỜI CHƠI =====
    socket.on('join', (data, cb) => {
      if (!data || !data.name || !data.teamId || !data.characterId) {
        return cb && cb({ ok: false, error: 'Thiếu thông tin' });
      }
      if (data.canvasW && data.canvasH) {
        engine.setPlayerCanvas(socket.id, data.canvasW, data.canvasH);
      }
      const result = engine.addPlayer(socket.id, data);
      if (result && result.error) {
        return cb && cb({ ok: false, error: result.error });
      }
      const player = result;
      socket.data.role = 'player';
      cb && cb({ ok: true, player });
      broadcastState();
      // lưu người chơi vào DB, gán dbId để cập nhật điểm sau này
      repo.savePlayer(player).then(id => { if (id) player.dbId = id; }).catch(() => {});
    });

    // Cập nhật kích thước canvas (khi người chơi resize cửa sổ)
    socket.on('canvas-size', (data) => {
      if (data && data.canvasW && data.canvasH) {
        engine.setPlayerCanvas(socket.id, data.canvasW, data.canvasH);
      }
    });

    socket.on('move', (pos) => {
      if (!pos) return;
      // chỉ cho phép di chuyển khi đang ở sảnh chờ (lobby)
      if (engine.phase !== 'lobby') return;
      engine.movePlayer(socket.id, pos.x, pos.y);
      // chỉ phát vị trí (nhẹ hơn cả state)
      socket.broadcast.emit('player-move', { id: socket.id, x: pos.x, y: pos.y });
    });

    // Reaction (emoji bay lên trên nhân vật)
    socket.on('reaction', (data) => {
      if (!data || !['heart', 'smile', 'like'].includes(data.type)) return;
      io.emit('reaction', { id: socket.id, type: data.type });
    });

    socket.on('answer', (data, cb) => {
      const r = engine.submitAnswer(socket.id, data.choice);
      cb && cb(r);
      if (r.ok) {
        io.emit('answer-received', { teamId: engine.players.get(socket.id)?.teamId });
        // KHÔNG tự chốt khi tất cả đã trả lời — phải chờ hết giờ câu hỏi
        // (doReveal sẽ được gọi bởi startTimer khi timer expires)
      }
    });

    socket.on('choose-attack', (data, cb) => {
      const p = engine.players.get(socket.id);
      if (!p) return cb && cb({ ok: false });
      const r = engine.chooseAttack(p.teamId, data.targetTeamId);
      cb && cb(r);
      if (r.ok) {
        io.emit('attacked', { targetTeamId: r.targetTeamId, eliminated: r.eliminated });
        clearTimer();
        broadcastState();
        repo.updateHistoryAttack(engine.round, r.targetTeamId).catch(() => {});
        persistScores();
        // Đã tấn công xong → đếm ngược vòng mới
        scheduleAutoAdvance();
      }
    });

    // ===== ADMIN =====
    socket.on('admin:auth', (data, cb) => {
      if (data.password === config.ADMIN_PASSWORD) {
        socket.data.role = 'admin';
        socket.join('admins');
        cb && cb({ ok: true });
      } else {
        cb && cb({ ok: false, error: 'Sai mật khẩu' });
      }
    });

    function requireAdmin() { return socket.data.role === 'admin'; }

    socket.on('admin:start', (data, cb) => {
      if (!requireAdmin()) return cb && cb({ ok: false });
      const r = engine.startMatch();
      if (r.ok && !r.finished) beginQuestionPhase();
      cb && cb(r);
      broadcastState();
    });

    socket.on('admin:reveal', (data, cb) => {
      if (!requireAdmin()) return cb && cb({ ok: false });
      doReveal(data && data.correct !== undefined ? data.correct : null);
      cb && cb({ ok: true });
    });

    socket.on('admin:next', (data, cb) => {
      if (!requireAdmin()) return cb && cb({ ok: false });
      // Bấm tay sẽ bỏ qua đếm ngược, chuyển vòng ngay
      clearNextRoundTimer();
      advanceToNextRound();
      cb && cb({ ok: true });
    });

    socket.on('admin:reset', (data, cb) => {
      if (!requireAdmin()) return cb && cb({ ok: false });
      clearTimer();
      clearNextRoundTimer();
      engine.reset();
      cb && cb({ ok: true });
      broadcastState();
    });

    socket.on('admin:set-questions', (data, cb) => {
      if (!requireAdmin()) return cb && cb({ ok: false });
      engine.setQuestions(data.questions || []);
      repo.saveQuestions(engine.questions).catch(() => {});
      cb && cb({ ok: true, count: engine.questions.length });
    });

    socket.on('admin:get-questions', (data, cb) => {
      cb && cb({ questions: engine.questions });
    });

    socket.on('disconnect', () => {
      engine.removePlayer(socket.id);
      io.emit('player-left', { id: socket.id });
      broadcastState();
    });
  });
}

module.exports = registerSockets;
