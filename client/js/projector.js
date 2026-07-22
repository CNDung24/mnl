// ===== Màn hình máy chiếu =====
const socket = io();
let TEAMS = [];
let CHARACTERS = [];
let charMap = {};
let state = null;
let timerData = null;
let lastQuestionRound = 0; // vòng câu hỏi đang hiển thị (để phát hiện khi sang câu mới)
let isPaused = false;
let frozenTimerRemain = null;

socket.on('init', (data) => {
  TEAMS = data.teams;
  CHARACTERS = data.characters;
  CHARACTERS.forEach(c => {
    charMap[c.id] = c;
    if (c.image) { const img = new Image(); img.src = c.image; c._img = img; }
  });
  state = data.state;
  isPaused = !!data.paused;
  renderPauseBanner();
  renderAll();
});

socket.on('state', (s) => { state = s; renderAll(); });
socket.on('timer', (d) => { timerData = d; });

socket.on('game-paused', (d) => {
  isPaused = !!(d && d.paused);
  frozenTimerRemain = (isPaused && timerData) ? Math.max(0, timerData.endsAt - Date.now()) : null;
  renderPauseBanner();
});

function renderPauseBanner() {
  let el = document.getElementById('pause-banner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pause-banner';
    el.className = 'pause-banner hidden';
    el.textContent = '⏸ BAN TỔ CHỨC ĐANG TẠM DỪNG TRẬN ĐẤU';
    document.body.prepend(el);
  }
  el.classList.toggle('hidden', !isPaused);
}

let pendingAttackerTeamId = null;

// Thời gian hiện bảng tóm tắt (5 nhân vật + đáp án + thời gian) trước khi công bố người thắng
const RESULTS_SUMMARY_MS = 3500;
let summaryShowing = false;   // đang hiện bảng tóm tắt -> tạm giữ sự kiện attack-phase lại
let pendingAttackPhase = null;

socket.on('reveal', (data) => {
  highlightCorrect(data.correct);
  // hiệu ứng rung khi bị trừ máu
  data.damaged.forEach(tid => {
    const card = document.getElementById('team-card-' + tid);
    if (card) { card.classList.add('shake'); setTimeout(() => card.classList.remove('shake'), 500); }
  });
  summaryShowing = true;
  showResultsSummary(data.results, () => {
    summaryShowing = false;
    if (data.winnerTeamId) showWinnerOverlay(data.winnerTeamId, data.winnerTimeMs);
    else showNoWinnerOverlay();
    if (pendingAttackPhase) {
      const ap = pendingAttackPhase;
      pendingAttackPhase = null;
      applyAttackPhase(ap);
    }
  });
});

// ---------- Bảng tóm tắt: nhân vật từng đội + đáp án đã chọn + thời gian ----------
function showResultsSummary(results, onDone) {
  const overlay = document.getElementById('winner-overlay');
  const card = document.getElementById('winner-card');
  card.style.setProperty('--wt-color', 'var(--gold)');

  document.getElementById('winner-badge').textContent = '';
  document.getElementById('winner-char').innerHTML = '';
  document.getElementById('winner-team').textContent = '';
  document.getElementById('winner-time').textContent = '';
  document.getElementById('winner-wait-msg').classList.add('hidden');
  document.getElementById('winner-battle').classList.add('hidden');

  document.getElementById('results-round').textContent = state ? state.round : '';
  const grid = document.getElementById('results-grid');
  grid.innerHTML = '';
  const latin = ['A', 'B', 'C', 'D'];
  (results || []).forEach(r => {
    const t = TEAMS.find(x => x.id === r.teamId);
    if (!t) return;
    const ch = charMap[t.characterId];
    const answered = r.choice >= 0 && r.choice <= 3;
    const hasTime = typeof r.timeMs === 'number' && isFinite(r.timeMs);
    const div = document.createElement('div');
    div.className = 'result-card';
    div.style.borderColor = t.color;
    div.innerHTML = `
      <div class="result-char">${idleCharHtml(ch, 1)}</div>
      <div class="result-team" style="color:${t.color}">${t.name}</div>
      <div class="result-answer ${r.correct ? 'correct' : 'wrong'}">${answered ? latin[r.choice] : '—'}</div>
      <div class="result-time">${hasTime ? (r.timeMs / 1000).toFixed(2) + 's' : 'Không trả lời'}</div>`;
    grid.appendChild(div);
  });

  document.getElementById('results-summary').classList.remove('hidden');
  clearTimeout(winnerOverlayTimeout);
  overlay.classList.remove('hidden');
  winnerOverlayTimeout = setTimeout(() => {
    document.getElementById('results-summary').classList.add('hidden');
    onDone();
  }, RESULTS_SUMMARY_MS);
}

// Đội thắng đang chọn mục tiêu — máy chiếu chỉ hiển thị trạng thái chờ (không có nút bấm).
// Nếu bảng tóm tắt đang hiện, giữ lại sự kiện và áp dụng sau khi tóm tắt xong.
socket.on('attack-phase', (data) => {
  pendingAttackerTeamId = data.attackerTeam;
  if (summaryShowing) { pendingAttackPhase = data; return; }
  applyAttackPhase(data);
});

function applyAttackPhase(data) {
  const overlay = document.getElementById('winner-overlay');
  if (overlay.classList.contains('hidden')) return; // an toàn (luôn có 'reveal' trước 'attack-phase')
  const waitMsg = document.getElementById('winner-wait-msg');
  const t = TEAMS.find(x => x.id === data.attackerTeam);
  waitMsg.classList.remove('hidden');
  waitMsg.textContent = `⏳ ${t ? t.name : ''} đang chọn mục tiêu để tấn công...`;
}

socket.on('attacked', (data) => {
  const card = document.getElementById('team-card-' + data.targetTeamId);
  if (card) { card.classList.add('shake'); setTimeout(() => card.classList.remove('shake'), 500); }
  const overlay = document.getElementById('winner-overlay');
  if (overlay.classList.contains('hidden')) return;
  const attackerTeamId = (typeof data.attackerTeamId === 'number') ? data.attackerTeamId : pendingAttackerTeamId;
  showAttackBattle(attackerTeamId, data.targetTeamId, data.eliminated);
});

socket.on('match-finished', (data) => {
  document.getElementById('winner-overlay').classList.add('hidden');
  clearTimeout(winnerOverlayTimeout);
  showChampionOverlay(data.podium && data.podium.length ? data.podium : [data.winnerTeamId]);
});

// ---------- Bục vinh danh + pháo hoa ----------
let fireworksInterval = null;
function showChampionOverlay(podium) {
  const overlay = document.getElementById('champion-overlay');
  const row = document.getElementById('podium-row');
  row.innerHTML = '';
  [1, 2, 3].forEach(rank => {
    const teamId = podium[rank - 1];
    if (!teamId) return;
    const t = TEAMS.find(x => x.id === teamId);
    if (!t) return;
    const ch = charMap[t.characterId];
    const slot = document.createElement('div');
    slot.className = 'podium-slot rank-' + rank;
    slot.innerHTML = `
      <div class="podium-char">${idleCharHtml(ch, rank === 1 ? 2.2 : 1.6)}</div>
      <div class="podium-name" style="color:${t.color}">${t.name}</div>
      <div class="podium-step">${rank}</div>`;
    row.appendChild(slot);
  });
  overlay.classList.remove('hidden');
  const layer = document.getElementById('fireworks-layer');
  clearInterval(fireworksInterval);
  fireworksInterval = setInterval(() => spawnFirework(layer), 300);
}

function hideChampionOverlay() {
  document.getElementById('champion-overlay').classList.add('hidden');
  clearInterval(fireworksInterval);
}

const FIREWORK_COLORS = ['#f0d175', '#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#ff6b6b'];
function spawnFirework(container) {
  const el = document.createElement('div');
  el.className = 'firework';
  el.style.left = (10 + Math.random() * 80) + '%';
  el.style.top = (15 + Math.random() * 45) + '%';
  el.style.color = FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('burst'));
  setTimeout(() => el.remove(), 1200);
}

// ---------- Overlay công bố đội thắng vòng + cảnh giao chiến ----------
let winnerOverlayTimeout = null;

function idleCharHtml(ch, scale) {
  if (ch && ch.image) {
    return `<div class="big-sprite idle" style="background-image:url('${ch.image}');width:${ch.fw * scale}px;height:${ch.fh * scale}px;--frames:${ch.frames};--fw:${ch.fw * scale}px"></div>`;
  }
  return `<div class="big-emoji">${ch ? ch.emoji : '👤'}</div>`;
}

function facingStyle(ch, desiredFacing) {
  const base = (ch && ch.baseFacing) || 1;
  return (desiredFacing !== base) ? 'transform:scaleX(-1);' : '';
}

function showWinnerOverlay(winnerTeamId, timeMs) {
  document.getElementById('results-summary').classList.add('hidden');
  const t = TEAMS.find(x => x.id === winnerTeamId);
  if (!t) return;
  const ch = charMap[t.characterId];
  const overlay = document.getElementById('winner-overlay');
  const card = document.getElementById('winner-card');
  const badge = document.getElementById('winner-badge');
  const charEl = document.getElementById('winner-char');
  const teamEl = document.getElementById('winner-team');
  const timeEl = document.getElementById('winner-time');

  card.style.setProperty('--wt-color', t.color);
  badge.textContent = '🏆 CHIẾN THẮNG 🏆';
  charEl.innerHTML = idleCharHtml(ch, 2);
  teamEl.textContent = t.name;
  timeEl.textContent = (typeof timeMs === 'number')
    ? 'Thời gian: ' + (timeMs / 1000).toFixed(2) + 's'
    : '';
  document.getElementById('winner-wait-msg').classList.add('hidden');
  document.getElementById('winner-battle').classList.add('hidden');

  clearTimeout(winnerOverlayTimeout);
  overlay.classList.remove('hidden');
}

function showNoWinnerOverlay() {
  document.getElementById('results-summary').classList.add('hidden');
  const overlay = document.getElementById('winner-overlay');
  const card = document.getElementById('winner-card');
  const badge = document.getElementById('winner-badge');
  const charEl = document.getElementById('winner-char');
  const teamEl = document.getElementById('winner-team');
  const timeEl = document.getElementById('winner-time');
  const waitMsg = document.getElementById('winner-wait-msg');

  card.style.setProperty('--wt-color', 'var(--krater-red)');
  badge.textContent = '💀 KHÔNG AI TRẢ LỜI ĐÚNG';
  charEl.innerHTML = '';
  teamEl.textContent = '';
  timeEl.textContent = '';
  document.getElementById('winner-battle').classList.add('hidden');
  waitMsg.textContent = 'Tất cả các đội đều bị trừ 1 HP.';
  waitMsg.classList.remove('hidden');

  clearTimeout(winnerOverlayTimeout);
  overlay.classList.remove('hidden');
  winnerOverlayTimeout = setTimeout(() => overlay.classList.add('hidden'), 2500);
}

function showAttackBattle(attackerTeamId, targetTeamId, eliminated) {
  const at = TEAMS.find(x => x.id === attackerTeamId);
  const tt = TEAMS.find(x => x.id === targetTeamId);
  if (!at || !tt) return;
  const attackerCh = charMap[at.characterId];
  const targetCh = charMap[tt.characterId];

  document.getElementById('results-summary').classList.add('hidden');
  document.getElementById('winner-badge').textContent = '⚔️ TẤN CÔNG!';
  document.getElementById('winner-char').innerHTML = '';
  document.getElementById('winner-team').textContent = '';
  document.getElementById('winner-time').textContent = '';
  document.getElementById('winner-wait-msg').classList.add('hidden');
  document.getElementById('winner-card').style.setProperty('--wt-color', at.color);

  const overlay = document.getElementById('winner-overlay');
  const battle = document.getElementById('winner-battle');
  const attackerEl = document.getElementById('battle-attacker');
  const targetEl = document.getElementById('battle-target');
  const impactEl = document.getElementById('battle-impact');
  const resultEl = document.getElementById('battle-result');

  document.getElementById('battle-attacker-name').textContent = at.name;
  document.getElementById('battle-attacker-name').style.color = at.color;
  document.getElementById('battle-target-name').textContent = tt.name;
  document.getElementById('battle-target-name').style.color = tt.color;
  resultEl.textContent = '';
  impactEl.classList.remove('pop');
  targetEl.classList.remove('hit-flash', 'eliminated');

  const FRAME_MS = 140;
  let attackDurationMs = 1000;
  if (attackerCh && attackerCh.attackImage) {
    attackDurationMs = attackerCh.attackFrames * FRAME_MS;
    attackerEl.innerHTML = `<div class="attack-sprite" style="${facingStyle(attackerCh, 1)}background-image:url('${attackerCh.attackImage}');width:${attackerCh.attackFw * 2}px;height:${attackerCh.attackFh * 2}px;--frames:${attackerCh.attackFrames};--fw:${attackerCh.attackFw * 2}px;animation-duration:${attackDurationMs}ms"></div>`;
    const spriteEl = attackerEl.querySelector('.attack-sprite');
    const lastFrameIndex = (typeof attackerCh.attackLastFrame === 'number') ? attackerCh.attackLastFrame : attackerCh.attackFrames - 1;
    const lastFramePos = -lastFrameIndex * (attackerCh.attackFw * 2);
    spriteEl.addEventListener('animationend', () => {
      spriteEl.style.animation = 'none';
      spriteEl.style.backgroundPosition = lastFramePos + 'px 0';
    }, { once: true });
  } else {
    attackerEl.innerHTML = idleCharHtml(attackerCh, 2);
  }
  targetEl.innerHTML = idleCharHtml(targetCh, 2);
  const targetSprite = targetEl.querySelector('.big-sprite');
  if (targetSprite) targetSprite.style.cssText += facingStyle(targetCh, -1);

  battle.classList.remove('hidden');

  const impactAt = Math.round(attackDurationMs * 0.7);
  setTimeout(() => {
    impactEl.classList.add('pop');
    targetEl.classList.add('hit-flash');
  }, impactAt);

  setTimeout(() => {
    resultEl.textContent = `−1 HP ${tt.name}` + (eliminated ? ' ☠️ BỊ LOẠI!' : '');
    if (eliminated) {
      targetEl.classList.remove('hit-flash');
      targetEl.classList.add('eliminated');
    }
  }, attackDurationMs + 500);

  clearTimeout(winnerOverlayTimeout);
  winnerOverlayTimeout = setTimeout(() => overlay.classList.add('hidden'), attackDurationMs + 2200);
}

function renderAll() {
  if (!state) return;
  renderTeams();
  renderQuestion();
  // Trận đã reset về sảnh chờ -> tắt bục vinh danh của trận trước (nếu còn)
  if (state.phase === 'lobby') hideChampionOverlay();
}

function renderTeams() {
  const el = document.getElementById('teams-row');
  el.innerHTML = '';
  state.teams.forEach(t => {
    const pct = (t.hp / 5) * 100;
    const d = document.createElement('div');
    d.id = 'team-card-' + t.id;
    d.className = 'panel' + (t.alive ? '' : ' dead');
    d.style.borderColor = t.color;
    d.style.margin = '0';
    d.innerHTML = `
      <div class="center" style="color:${t.color};font-size:13px">${t.name}</div>
      <div class="center" style="font-size:9px;margin:4px 0">${t.players} người ${t.alive ? '' : '💀'}</div>
      <div class="hp-bar">
        <div class="hp-fill" style="width:${pct}%;background:${t.color}"></div>
        <span class="hp-text">${t.hp}/5</span>
      </div>`;
    el.appendChild(d);
  });
}

function renderQuestion() {
  const panel = document.getElementById('q-panel');
  if (state.phase === 'question' && state.question) {
    if (state.round !== lastQuestionRound) {
      // Sang câu mới: hủy bảng tóm tắt/công bố thắng của vòng trước (nếu admin
      // chuyển câu quá nhanh trong lúc bảng tóm tắt vòng trước còn đang hiện)
      lastQuestionRound = state.round;
      clearTimeout(winnerOverlayTimeout);
      summaryShowing = false;
      pendingAttackPhase = null;
    }
    panel.classList.remove('hidden');
    document.getElementById('q-text').textContent = state.question.text;
    const el = document.getElementById('q-options');
    el.innerHTML = '';
    const letters = ['Α','Β','Γ','Δ'];
    const latin  = ['A','B','C','D'];
    state.question.options.forEach((opt, i) => {
      const d = document.createElement('div');
      d.className = 'ans-btn ans-' + latin[i];
      d.id = 'proj-opt-' + i;
      d.setAttribute('data-gr', letters[i]);
      d.innerHTML = `<span class="ans-text">${escapeHtml(opt)}</span>`;
      el.appendChild(d);
    });
  } else if (state.phase === 'lobby') {
    panel.classList.add('hidden');
  }
}

function highlightCorrect(correct) {
  const latin = ['A','B','C','D'];
  latin.forEach((l, i) => {
    const d = document.getElementById('proj-opt-' + i);
    if (!d) return;
    if (i === correct) d.classList.add('correct');
    else d.classList.add('wrong');
  });
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// Timer đếm ngược
setInterval(() => {
  if (!timerData) return;
  const remain = (isPaused && frozenTimerRemain !== null)
    ? frozenTimerRemain
    : Math.max(0, timerData.endsAt - Date.now());
  document.getElementById('timer').textContent = Math.ceil(remain / 1000);
  document.getElementById('timer-fill').style.width =
    (remain / (timerData.seconds * 1000) * 100) + '%';
}, 200);
