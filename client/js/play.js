// ===== Trang người chơi =====
const socket = io();

let CHARACTERS = [];
let TEAMS = [];
let me = null;                 // player của mình sau khi join
let selectedTeam = null;
let state = null;              // trạng thái game mới nhất
let charMap = {};              // id -> character
// Kích thước "thế giới" sảnh chờ chung — mọi người chơi (mọi thiết bị) đều
// di chuyển trong cùng không gian tọa độ này; mỗi client tự quy đổi sang
// pixel canvas riêng của mình khi vẽ, nên vị trí luôn nhất quán dù màn hình
// to nhỏ khác nhau. Giá trị mặc định sẽ được ghi đè bởi server ở sự kiện 'init'.
let WORLD_W = 1600;
let WORLD_H = 900;

// Preload sprite sheet cho mỗi nhân vật (nếu có image) — cả sprite đi bộ và tấn công.
function preloadSprites() {
  CHARACTERS.forEach(c => {
    if (c.image) {
      const img = new Image();
      img.src = c.image;
      c._img = img;
    }
    if (c.attackImage) {
      const img = new Image();
      img.src = c.attackImage;
      c._attackImg = img;
    }
  });
}

// Trả về frame hiện tại theo thời gian (đồng bộ tất cả nhân vật).
function currentFrame(frames) {
  if (!frames || frames <= 1) return 0;
  const cycle = 800; // ms / vòng (4 frame -> 200ms/frame)
  return Math.floor((performance.now() % cycle) / (cycle / frames));
}

// Kiểm tra người chơi có đang di chuyển không (trong khoảng gần đây).
// Với me: dựa vào phím/joystick đang nhấn. Với player khác: lastMoveTime gần đây.
function isMoving(p) {
  if (p.id === socket.id) {
    return !!(keys['arrowleft'] || keys['a'] || keys['arrowright'] || keys['d']
           || keys['arrowup']   || keys['w'] || keys['arrowdown']  || keys['s']
           || joy.active);
  }
  return p.lastMoveTime && (Date.now() - p.lastMoveTime < 150);
}

// Bán kính va chạm (hitbox nhỏ, chỉ tính vùng "thân" nhân vật)
function charRadius(p) {
  const ch = charMap[p.characterId];
  if (!ch || !ch.fw) return 8;
  return Math.max(8, ch.fw / 2);
}

// Kiểm tra (x, y) có đứng được không (không va chạm player khác)
function canStand(self, x, y) {
  if (!state) return true;
  const r1 = charRadius(self);
  for (const o of state.players) {
    if (o.id === self.id) continue;
    const r = r1 + charRadius(o);
    const dx = x - o.x, dy = y - o.y;
    if (dx * dx + dy * dy < r * r) return false;
  }
  return true;
}

// ---------- Khởi tạo ----------
socket.on('init', (data) => {
  CHARACTERS = data.characters;
  TEAMS = data.teams;
  state = data.state;
  if (data.world) { WORLD_W = data.world.w; WORLD_H = data.world.h; }
  CHARACTERS.forEach(c => charMap[c.id] = c);
  preloadSprites();
  renderTeamPick();
});

// Render thanh HP 5 đội (hiển thị cả khi đang chờ và khi đang chơi)
function renderTeamHP() {
  if (!state) return;
  const el = document.getElementById('team-hp');
  if (!el) return;
  // render nếu DOM chưa có hoặc số team thay đổi
  if (el.children.length !== state.teams.length) {
    el.innerHTML = '';
    state.teams.forEach(t => {
      const d = document.createElement('div');
      d.id = 'lobby-team-card-' + t.id;
      d.className = 'team-card';
      d.style.borderColor = t.color;
      d.style.margin = '0';
      d.innerHTML = `
        <div class="center" style="color:${t.color};font-size:11px">${t.name}</div>
        <div class="hp-bar" style="margin-top:4px">
          <div class="hp-fill" style="width:100%;background:${t.color}"></div>
          <span class="hp-text">5/5</span>
        </div>`;
      el.appendChild(d);
    });
  }
  state.teams.forEach(t => {
    const card = document.getElementById('lobby-team-card-' + t.id);
    if (!card) return;
    card.classList.toggle('dead', !t.alive);
    const pct = (t.hp / 5) * 100;
    const fill = card.querySelector('.hp-fill');
    const txt = card.querySelector('.hp-text');
    if (fill) fill.style.width = pct + '%';
    if (txt) txt.textContent = (t.alive ? t.hp : '💀') + '/5';
  });
}

function renderTeamPick() {
  const el = document.getElementById('team-pick');
  el.innerHTML = '';
  TEAMS.forEach(t => {
    const d = document.createElement('div');
    d.className = 'tp team-' + t.id;
    d.dataset.team = t.id;
    d.textContent = t.name;
    d.style.borderColor = t.color;
    d.onclick = () => {
      if (d.classList.contains('full')) return toast('Đội đã đủ người, hãy chọn đội khác!');
      selectedTeam = t.id;
      [...el.children].forEach(c => c.classList.remove('sel'));
      d.classList.add('sel');
    };
    el.appendChild(d);
  });
  updateTeamPickAvailability();
}

// Đánh dấu đội đã đủ người (dựa trên state realtime) để người chơi không chọn nhầm
function updateTeamPickAvailability() {
  if (!state) return;
  const el = document.getElementById('team-pick');
  if (!el) return;
  [...el.children].forEach(d => {
    const teamId = Number(d.dataset.team);
    const t = state.teams.find(x => x.id === teamId);
    const full = !!(t && t.players >= 1);
    d.classList.toggle('full', full);
    if (full && selectedTeam === teamId) {
      selectedTeam = null;
      d.classList.remove('sel');
    }
  });
}

// ---------- Tham gia ----------
document.getElementById('join-btn').onclick = () => {
  const name = document.getElementById('name').value.trim();
  if (!name) return toast('Hãy nhập tên!');
  if (!selectedTeam) return toast('Hãy chọn đội!');

  socket.emit('join', {
    name,
    teamId: selectedTeam
  }, (res) => {
    if (!res.ok) return toast(res.error || 'Lỗi tham gia');
    me = res.player;
    me.lastMoveTime = 0;
    me.facing = 1;  // 1 = phải, -1 = trái
    document.getElementById('join-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    document.body.classList.add('in-lobby');
    const t = TEAMS.find(x => x.id === me.teamId);
    document.getElementById('me-info').innerHTML =
      `${charMap[me.characterId].emoji} ${me.name} <span class="team-${me.teamId}">[${t.name}]</span>`;
    document.getElementById('reaction-bar').classList.remove('hidden');
    startLobby();
  });
};

// ---------- Reactions ----------
const REACT_EMOJI = { heart: '❤️', smile: '😊', like: '👍' };
document.querySelectorAll('.reaction-btn').forEach(btn => {
  btn.onclick = () => {
    if (!me) return;
    const type = btn.dataset.react;
    socket.emit('reaction', { type });
    // hiện ngay trên nhân vật mình (đỡ chờ server)
    spawnReaction(socket.id, type);
  };
});

socket.on('reaction', (data) => {
  if (!data || !data.id || !data.type) return;
  spawnReaction(data.id, data.type);
});

function spawnReaction(playerId, type) {
  const emoji = REACT_EMOJI[type] || '✨';
  if (!state) return;
  const p = (playerId === socket.id && me) ? me : state.players.find(x => x.id === playerId);
  if (!p) return;

  // Quy đổi tọa độ world -> tọa độ màn hình thật (qua canvas CSS)
  const rect = canvas.getBoundingClientRect();
  const sx = rect.left + p.x * (rect.width / WORLD_W);
  const sy = rect.top + (p.y * (rect.height / WORLD_H) - 50);  // bay lên trên đầu nhân vật

  const el = document.createElement('div');
  el.className = 'fx-emoji';
  el.textContent = emoji;
  el.style.left = sx + 'px';
  el.style.top  = sy + 'px';
  document.getElementById('fx-layer').appendChild(el);
  setTimeout(() => el.remove(), 1700);
}

// ---------- State updates ----------
socket.on('state', (s) => {
  state = s;
  // đảm bảo mỗi player có facing (1=phải, -1=trái)
  state.players.forEach(p => { if (typeof p.facing !== 'number') p.facing = 1; });
  renderTeamHP();
  updatePhaseUI();
  if (!me) updateTeamPickAvailability();
});

socket.on('your-turn', (data) => {
  // chỉ hiện câu hỏi mới khi round thực sự đổi VÀ đội mình còn sống
  if (!state || !me) return;
  const myTeam = state.teams.find(t => t.id === me.teamId);
  if (!myTeam || !myTeam.alive) return;
  if (state.round !== lastShownRound) {
    showQuestion(data.question);
  }
});

socket.on('answer-received', () => {});

socket.on('reveal', (data) => {
  // hiện kết quả trên câu hỏi nếu đang mở
  highlightCorrect(data.correct);
  if (data.winnerTeamId) showWinnerOverlay(data.winnerTeamId, data.winnerTimeMs);
  else showNoWinnerOverlay();
});

// ---------- Overlay công bố đội thắng vòng + chọn tấn công ----------
// Overlay này ở lại trên màn hình xuyên suốt reveal -> attack cho tới khi
// có kết quả tấn công, để mọi người luôn thấy nhân vật đội thắng + trạng thái hiện tại.
let winnerOverlayTimeout = null;
function showWinnerOverlay(winnerTeamId, timeMs) {
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
  charEl.innerHTML = (ch && ch.image)
    ? `<div class="big-sprite idle" style="background-image:url('${ch.image}');width:${ch.fw * 2}px;height:${ch.fh * 2}px;--frames:${ch.frames};--fw:${ch.fw * 2}px"></div>`
    : `<div class="big-emoji">${ch ? ch.emoji : '👤'}</div>`;
  teamEl.textContent = t.name;
  timeEl.textContent = (typeof timeMs === 'number')
    ? 'Thời gian: ' + (timeMs / 1000).toFixed(2) + 's'
    : '';
  document.getElementById('winner-attack-section').classList.add('hidden');
  document.getElementById('winner-wait-msg').classList.add('hidden');
  document.getElementById('winner-battle').classList.add('hidden');

  clearTimeout(winnerOverlayTimeout);
  overlay.classList.remove('hidden');
}

// Không đội nào trả lời đúng — báo ngắn gọn rồi tự ẩn, không có pha tấn công theo sau.
function showNoWinnerOverlay() {
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
  document.getElementById('winner-attack-section').classList.add('hidden');
  document.getElementById('winner-battle').classList.add('hidden');
  waitMsg.textContent = 'Tất cả các đội đều bị trừ 1 HP.';
  waitMsg.classList.remove('hidden');

  clearTimeout(winnerOverlayTimeout);
  overlay.classList.remove('hidden');
  winnerOverlayTimeout = setTimeout(() => overlay.classList.add('hidden'), 2500);
}

// Đội thắng thấy nút chọn mục tiêu ngay trong overlay; các đội khác chỉ thấy dòng chờ.
let pendingAttackerTeamId = null;
socket.on('attack-phase', (data) => {
  pendingAttackerTeamId = data.attackerTeam;
  const overlay = document.getElementById('winner-overlay');
  if (overlay.classList.contains('hidden')) return; // an toàn (luôn có 'reveal' trước 'attack-phase')
  const attackSection = document.getElementById('winner-attack-section');
  const waitMsg = document.getElementById('winner-wait-msg');

  if (me && me.teamId === data.attackerTeam) {
    attackSection.classList.remove('hidden');
    waitMsg.classList.add('hidden');
    const wrap = document.getElementById('winner-attack-targets');
    wrap.innerHTML = '';
    data.attackable.forEach(tid => {
      const target = TEAMS.find(x => x.id === tid);
      const b = document.createElement('button');
      b.className = 'danger';
      b.textContent = '⚔️ ' + target.name;
      b.onclick = () => {
        [...wrap.children].forEach(x => x.disabled = true);
        socket.emit('choose-attack', { targetTeamId: tid }, (res) => {
          if (!res.ok) { toast(res.error || 'Lỗi'); [...wrap.children].forEach(x => x.disabled = false); }
        });
      };
      wrap.appendChild(b);
    });
  } else {
    attackSection.classList.add('hidden');
    waitMsg.classList.remove('hidden');
    const t = TEAMS.find(x => x.id === data.attackerTeam);
    waitMsg.textContent = `⏳ ${t ? t.name : ''} đang chọn mục tiêu để tấn công...`;
  }
});

socket.on('attacked', (data) => {
  const overlay = document.getElementById('winner-overlay');
  if (overlay.classList.contains('hidden')) return;
  const attackerTeamId = (typeof data.attackerTeamId === 'number') ? data.attackerTeamId : pendingAttackerTeamId;
  showAttackBattle(attackerTeamId, data.targetTeamId, data.eliminated);
});

// Dựng lại 1 sprite nhân vật (idle, lặp) thành chuỗi HTML để nhét vào ô hiển thị.
function idleCharHtml(ch, scale) {
  if (ch && ch.image) {
    return `<div class="big-sprite idle" style="background-image:url('${ch.image}');width:${ch.fw * scale}px;height:${ch.fh * scale}px;--frames:${ch.frames};--fw:${ch.fw * scale}px"></div>`;
  }
  return `<div class="big-emoji">${ch ? ch.emoji : '👤'}</div>`;
}

// Lật ngang sprite nếu hướng mong muốn khác hướng gốc của ảnh (baseFacing).
function facingStyle(ch, desiredFacing) {
  const base = (ch && ch.baseFacing) || 1;
  return (desiredFacing !== base) ? 'transform:scaleX(-1);' : '';
}

// Cảnh giao chiến: nhân vật đội thắng tung chiêu (sprite tấn công, chạy 1 lần)
// vào nhân vật đội bị chọn (đứng yên, rung + chớp đỏ đúng lúc "trúng đòn").
function showAttackBattle(attackerTeamId, targetTeamId, eliminated) {
  const at = TEAMS.find(x => x.id === attackerTeamId);
  const tt = TEAMS.find(x => x.id === targetTeamId);
  if (!at || !tt) return;
  const attackerCh = charMap[at.characterId];
  const targetCh = charMap[tt.characterId];

  document.getElementById('winner-badge').textContent = '⚔️ TẤN CÔNG!';
  document.getElementById('winner-char').innerHTML = '';
  document.getElementById('winner-team').textContent = '';
  document.getElementById('winner-time').textContent = '';
  document.getElementById('winner-attack-section').classList.add('hidden');
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

  // Người tấn công đứng bên trái, quay mặt sang phải (về phía mục tiêu).
  const FRAME_MS = 140; // chậm lại một ít cho dễ xem (trước là 100ms/frame)
  let attackDurationMs = 1000;
  if (attackerCh && attackerCh.attackImage) {
    attackDurationMs = attackerCh.attackFrames * FRAME_MS;
    attackerEl.innerHTML = `<div class="attack-sprite" style="${facingStyle(attackerCh, 1)}background-image:url('${attackerCh.attackImage}');width:${attackerCh.attackFw * 2}px;height:${attackerCh.attackFh * 2}px;--frames:${attackerCh.attackFrames};--fw:${attackerCh.attackFw * 2}px;animation-duration:${attackDurationMs}ms"></div>`;
    // Keyframe "to" lùi đúng hết chiều rộng sprite sheet (quá 1 frame so với frame
    // cuối hợp lệ) — với animation loop thì không sao, nhưng animation chạy 1 lần +
    // fill-mode:forwards này sẽ đứng yên ở vị trí "lố" đó -> nhân vật mất hình.
    // Sửa lại đúng vị trí frame cuối ngay khi animation dừng.
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
  // Mục tiêu đứng bên phải, quay mặt sang trái (về phía người tấn công).
  targetEl.innerHTML = idleCharHtml(targetCh, 2);
  const targetSprite = targetEl.querySelector('.big-sprite');
  if (targetSprite) targetSprite.style.cssText += facingStyle(targetCh, -1);

  battle.classList.remove('hidden');

  // Đúng lúc đòn đánh "chạm" mục tiêu (~70% animation): nổ + rung + chớp đỏ
  const impactAt = Math.round(attackDurationMs * 0.7);
  setTimeout(() => {
    impactEl.classList.add('pop');
    targetEl.classList.add('hit-flash');
  }, impactAt);

  // Sau khi đòn đánh xong: hiện kết quả -1 HP (+ mờ dần/đổ xám nếu bị loại)
  setTimeout(() => {
    resultEl.textContent = `−1 HP ${tt.name}` + (eliminated ? ' ☠️ BỊ LOẠI!' : '');
    if (eliminated) {
      targetEl.classList.remove('hit-flash');
      targetEl.classList.add('eliminated');
    }
  }, attackDurationMs + 500);

  // Toàn bộ overlay tự ẩn sau khi xem xong kết quả
  clearTimeout(winnerOverlayTimeout);
  winnerOverlayTimeout = setTimeout(() => overlay.classList.add('hidden'), attackDurationMs + 2200);
}

socket.on('match-finished', (data) => {
  const t = TEAMS.find(x => x.id === data.winnerTeamId);
  document.getElementById('status-label').textContent =
    '🏆 KẾT THÚC! Vô địch: ' + (t ? t.name : '---');
  hideAll();
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

// ---------- Phase UI ----------
// Lưu ý: KHÔNG ẩn champion-overlay ở đây — hideAll() có thể được gọi nhiều lần
// trong lúc phase vẫn là 'finished' (VD: có người vào/rời phòng), nếu ẩn ở đây
// bục vinh danh sẽ bị tắt giữa chừng. Nó chỉ nên ẩn khi trận thực sự bắt đầu lại.
function hideAll() {
  document.getElementById('question-box').classList.add('hidden');
  document.getElementById('spectate-box').classList.add('hidden');
  document.getElementById('winner-overlay').classList.add('hidden');
  clearTimeout(winnerOverlayTimeout);
}

function hideChampionOverlay() {
  document.getElementById('champion-overlay').classList.add('hidden');
  clearInterval(fireworksInterval);
}

function updatePhaseUI() {
  if (!state || !me) return;
  const label = document.getElementById('status-label');
  const canvas = document.getElementById('lobby-canvas');
  const banner = document.getElementById('next-round-banner');
  const joystick = document.getElementById('joystick');

  if (state.phase === 'lobby') {
    label.textContent = '🏛️ SẢNH CHỜ - chờ admin bắt đầu';
    hideAll();
    hideChampionOverlay();
    if (banner) banner.classList.add('hidden');
    if (canvas) {
      canvas.classList.remove('hidden');
      fitCanvas();
    }
    // Ở sảnh chờ → hiện joystick để di chuyển (chỉ thiết bị cảm ứng)
    if (joystick) {
      if (isTouchDevice) joystick.classList.remove('hidden');
      else joystick.classList.add('hidden');
    }
  } else if (state.phase === 'question') {
    label.textContent = '⚔ VÒNG ' + state.round + ' — TRẢ LỜI CÂU HỎI';
    if (canvas) canvas.classList.add('hidden');
    if (banner) banner.classList.add('hidden');
    // Đã vào trận → ẩN joystick (di chuyển bị khóa)
    if (joystick) joystick.classList.add('hidden');
    // Hiện câu hỏi cho tất cả người chơi thuộc đội còn sống
    const myTeam = state.teams.find(t => t.id === me.teamId);
    if (myTeam && myTeam.alive && state.question) {
      if (state.round !== lastShownRound) showQuestion(state.question);
    } else {
      hideAll();
      const sb = document.getElementById('spectate-box');
      sb.classList.remove('hidden');
      document.getElementById('spectate-msg').innerHTML =
        `👀 Đội bạn đã bị loại — cổ vũ các đội khác nhé!`;
    }
  } else if (state.phase === 'attack') {
    label.textContent = '⚔ VÒNG ' + state.round + ' — TẤN CÔNG';
    if (canvas) canvas.classList.add('hidden');
    if (joystick) joystick.classList.add('hidden');
    document.getElementById('question-box').classList.add('hidden');
  } else if (state.phase === 'reveal') {
    label.textContent = '⚔ VÒNG ' + state.round + ' — Kết quả';
    if (canvas) canvas.classList.add('hidden');
    if (joystick) joystick.classList.add('hidden');
  } else if (state.phase === 'finished') {
    label.textContent = '🏆 TRẬN ĐẤU KẾT THÚC';
    hideAll();
    if (banner) banner.classList.add('hidden');
    if (canvas) canvas.classList.add('hidden');
    if (joystick) joystick.classList.add('hidden');
  }
}

// ---------- Câu hỏi ----------
let answered = false;
let lastShownRound = 0;  // vòng câu hỏi đang hiển thị trên màn hình
function showQuestion(q) {
  answered = false;
  lastShownRound = state ? state.round : 0;
  hideAll();
  const box = document.getElementById('question-box');
  box.classList.remove('hidden');
  document.getElementById('q-round').textContent = 'VÒNG ' + (state ? state.round : '');
  document.getElementById('q-text').textContent = q.text;
  document.getElementById('q-wait').classList.add('hidden');
  const wrap = document.getElementById('q-answers');
  wrap.innerHTML = '';
  const letters = ['Α', 'Β', 'Γ', 'Δ'];
  const latin  = ['A', 'B', 'C', 'D'];
  q.options.forEach((opt, i) => {
    const b = document.createElement('button');
    b.className = 'ans-btn ans-' + latin[i];
    b.setAttribute('data-gr', letters[i]);
    b.innerHTML = `<span class="ans-text">${escapeHtml(opt)}</span>`;
    b.onclick = () => sendAnswer(i, b);
    wrap.appendChild(b);
  });
}

function sendAnswer(choice, btn) {
  if (answered) return;
  answered = true;
  [...document.querySelectorAll('.ans-btn')].forEach(b => b.disabled = true);
  btn.classList.add('picked');
  socket.emit('answer', { choice }, () => {});
  document.getElementById('q-wait').classList.remove('hidden');
}

function highlightCorrect(correct) {
  const btns = document.querySelectorAll('#q-answers .ans-btn');
  btns.forEach((b, i) => {
    if (i === correct) {
      b.classList.add('correct');
    } else {
      b.classList.add('wrong');
    }
  });
}

// ---------- Tạm dừng ----------
// Khi admin tạm dừng, đồng hồ (câu hỏi/tấn công/đếm ngược vòng mới) đứng yên
// tại đúng thời điểm tạm dừng cho tới khi admin bấm tiếp tục.
let isPaused = false;
let frozenTimerRemain = null;
let frozenNextRoundRemain = null;
socket.on('game-paused', (d) => {
  isPaused = !!(d && d.paused);
  if (isPaused) {
    frozenTimerRemain = timerData ? Math.max(0, timerData.endsAt - Date.now()) : null;
    frozenNextRoundRemain = nextRoundData ? Math.max(0, nextRoundData.endsAt - Date.now()) : null;
  } else {
    frozenTimerRemain = null;
    frozenNextRoundRemain = null;
  }
  renderPauseBanner();
});
function renderPauseBanner() {
  let el = document.getElementById('pause-banner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pause-banner';
    el.className = 'pause-banner hidden';
    el.textContent = '⏸ BAN TỔ CHỨC ĐANG TẠM DỪNG TRẬN ĐẤU';
    document.body.appendChild(el);
  }
  el.classList.toggle('hidden', !isPaused);
}

// ---------- Timer ----------
let timerData = null;
socket.on('timer', (d) => { timerData = d; });
setInterval(() => {
  if (!timerData) return;
  const remain = (isPaused && frozenTimerRemain !== null)
    ? frozenTimerRemain
    : Math.max(0, timerData.endsAt - Date.now());
  const sec = Math.ceil(remain / 1000);
  const tEl = document.getElementById('q-timer');
  if (tEl) tEl.textContent = sec;
  const fill = document.getElementById('q-timer-fill');
  if (fill) fill.style.width = (remain / (timerData.seconds * 1000) * 100) + '%';
}, 200);

// ---------- Countdown tới vòng tiếp theo ----------
let nextRoundData = null;
socket.on('next-round-countdown', (d) => {
  nextRoundData = d && d.active ? d : null;
  renderNextRoundBanner();
});
function renderNextRoundBanner() {
  const el = document.getElementById('next-round-banner');
  if (!el) return;
  if (!nextRoundData) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const remainMs = (isPaused && frozenNextRoundRemain !== null)
    ? frozenNextRoundRemain
    : Math.max(0, nextRoundData.endsAt - Date.now());
  const sec = Math.max(0, Math.ceil(remainMs / 1000));
  document.getElementById('next-round-text').innerHTML =
    `⏳ Vòng tiếp theo bắt đầu sau <b>${sec}s</b>…`;
}
setInterval(renderNextRoundBanner, 250);

// ============ LOBBY CANVAS ============
const canvas = document.getElementById('lobby-canvas');
const ctx = canvas.getContext('2d');
let keys = {};
let joy = { active: false, dx: 0, dy: 0 };

document.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
document.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

// Resize canvas theo kích thước CSS thật (container max-width 1000px)
// khi canvas chưa hiển thị (display:none) clientWidth = 0, fallback innerWidth.
// Vị trí người chơi (me.x/me.y) luôn ở hệ tọa độ world (WORLD_W x WORLD_H)
// dùng chung cho mọi thiết bị — resize canvas chỉ đổi cách quy đổi world -> pixel
// khi vẽ, không cần clamp lại tọa độ.
function fitCanvas() {
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || (window.innerHeight - 70);
  if (w > 0 && h > 0) {
    canvas.width = w;
    canvas.height = h;
  }
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

function startLobby() {
  // canvas đã hiển thị (game-screen bỏ hidden) -> clientWidth là giá trị thật
  fitCanvas();
  setupJoystick();
  requestAnimationFrame(loop);
}

let lastSent = 0;
function loop(ts) {
  if (!me) return;
  // Chỉ cho phép di chuyển khi đang ở sảnh chờ
  const canMove = state && state.phase === 'lobby';
  if (canMove) {
    let speed = 4;
    let dx = 0, dy = 0;
    if (keys['arrowleft'] || keys['a']) dx -= 1;
    if (keys['arrowright'] || keys['d']) dx += 1;
    if (keys['arrowup'] || keys['w']) dy -= 1;
    if (keys['arrowdown'] || keys['s']) dy += 1;
    if (joy.active) { dx += joy.dx; dy += joy.dy; }

    if (dx || dy) {
      // quy đổi bước di chuyển (tính theo pixel canvas) sang đơn vị world,
      // để tốc độ CẢM NHẬN trên màn hình giống nhau dù canvas to hay nhỏ
      const scaleX = WORLD_W / canvas.width;
      const scaleY = WORLD_H / canvas.height;
      const r = charRadius(me);
      const rx = r * scaleX, ry = r * scaleY;
      let nx = Math.max(rx, Math.min(WORLD_W - rx, me.x + dx * speed * scaleX));
      let ny = Math.max(ry, Math.min(WORLD_H - ry, me.y + dy * speed * scaleY));
      me.x = nx; me.y = ny;

      me.lastMoveTime = Date.now();
      if (dx > 0) me.facing = 1;
      else if (dx < 0) me.facing = -1;

      if (ts - lastSent > 110) {
        socket.emit('move', { x: me.x, y: me.y });
        lastSent = ts;
      }
    }
  }

  // Chỉ render canvas khi đang ở lobby
  if (state && state.phase === 'lobby') {
    render();
  }
  requestAnimationFrame(loop);
}

socket.on('player-move', (d) => {
  if (!state) return;
  const p = state.players.find(x => x.id === d.id);
  if (p) {
    if (typeof p.facing !== 'number') p.facing = 1;
    if (typeof d.x === 'number' && typeof p.x === 'number') {
      if (d.x > p.x) p.facing = 1;
      else if (d.x < p.x) p.facing = -1;
    }
    p.x = d.x; p.y = d.y; p.lastMoveTime = Date.now();
  }
});

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // lưới nền
  ctx.strokeStyle = 'rgba(74,63,140,.3)';
  for (let x = 0; x < canvas.width; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }

  if (!state) return;
  const list = state.players.slice();
  // đảm bảo có me
  if (me && !list.find(p => p.id === socket.id)) list.push(me);

  list.forEach(p => {
    if (p.id === socket.id && me) { p.x = me.x; p.y = me.y; p.facing = me.facing; }
  });
  // Vẽ theo thứ tự Y (painter's algorithm): ai đứng thấp hơn trên màn hình (gần
  // "camera" hơn) được vẽ sau nên đè lên người phía trên — không phụ thuộc thứ
  // tự vào phòng như trước (khiến người vào sau luôn đè lên người vào trước).
  list.sort((a, b) => a.y - b.y);
  list.forEach(p => drawPlayer(p));
}

// Quy đổi tọa độ world (chung cho mọi thiết bị) -> pixel canvas của riêng client này.
function worldToCanvasX(wx) { return wx * (canvas.width / WORLD_W); }
function worldToCanvasY(wy) { return wy * (canvas.height / WORLD_H); }

function drawPlayer(p) {
  const ch = charMap[p.characterId] || { emoji: '❓', color: '#fff' };
  const px = worldToCanvasX(p.x), py = worldToCanvasY(p.y);
  let topY;
  // nhân vật: sprite (nếu có _img đã load) hoặc fallback emoji
  if (ch._img && ch._img.complete && ch.fw) {
    const frame = isMoving(p) ? currentFrame(ch.frames) : 0;
    const SCALE = 1.5;  // scale nhỏ hơn 2x một tí
    const dw = ch.fw * SCALE, dh = ch.fh * SCALE;
    ctx.imageSmoothingEnabled = false;
    const facing = (typeof p.facing === 'number') ? p.facing : 1;
    const base = ch.baseFacing || 1;
    if (facing !== base) {
      ctx.save();
      ctx.translate(px, py - dh / 2 + 3);
      ctx.scale(-1, 1);
      ctx.drawImage(ch._img, frame * ch.fw, 0, ch.fw, ch.fh, -dw / 2, 0, dw, dh);
      ctx.restore();
    } else {
      ctx.drawImage(ch._img, frame * ch.fw, 0, ch.fw, ch.fh, px - dw / 2, py - dh / 2 + 3, dw, dh);
    }
    topY = py - dh / 2 + 3;
  } else {
    ctx.font = '20px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if ((p.facing || 1) < 0) { ctx.save(); ctx.translate(px, 0); ctx.scale(-1, 1); }
    ctx.fillText(ch.emoji, 0, py + 1);
    if ((p.facing || 1) < 0) ctx.restore();
    topY = py - 12;
  }
  drawNameTag(p, px, topY);
}

// Tên người chơi hiện phía trên đầu nhân vật (viền tối để dễ đọc trên mọi nền)
function drawNameTag(p, px, topY) {
  if (!p.name) return;
  const t = TEAMS.find(x => x.id === p.teamId);
  const y = topY - 4;
  ctx.font = "bold 12px 'Cinzel', Georgia, serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(10,7,22,0.9)';
  ctx.fillStyle = (t && t.color) || '#f0e3c1';
  ctx.strokeText(p.name, px, y);
  ctx.fillText(p.name, px, y);
}

// ---------- Joystick ----------
const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
function setupJoystick() {
  if (!isTouchDevice) return;
  const js = document.getElementById('joystick');
  js.classList.remove('hidden');
  const stick = js.querySelector('.stick');
  const R = 60;
  function onMove(e) {
    const t = e.touches[0];
    const rect = js.getBoundingClientRect();
    let dx = t.clientX - (rect.left + R);
    let dy = t.clientY - (rect.top + R);
    const dist = Math.hypot(dx, dy);
    const max = R - 10;
    if (dist > max) { dx = dx / dist * max; dy = dy / dist * max; }
    stick.style.left = (35 + dx) + 'px';
    stick.style.top = (35 + dy) + 'px';
    joy.active = true;
    joy.dx = dx / max; joy.dy = dy / max;
  }
  js.addEventListener('touchstart', onMove);
  js.addEventListener('touchmove', e => { e.preventDefault(); onMove(e); }, { passive: false });
  js.addEventListener('touchend', () => {
    joy.active = false; joy.dx = 0; joy.dy = 0;
    stick.style.left = '35px'; stick.style.top = '35px';
  });
}

// ---------- Toast ----------
function toast(msg) {
  const d = document.createElement('div');
  d.className = 'toast';
  d.textContent = msg;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 2500);
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
