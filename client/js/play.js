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

// Preload sprite sheet cho mỗi nhân vật (nếu có image).
function preloadSprites() {
  CHARACTERS.forEach(c => {
    if (c.image) {
      const img = new Image();
      img.src = c.image;
      c._img = img;
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
          <span class="hp-text">10/10</span>
        </div>`;
      el.appendChild(d);
    });
  }
  state.teams.forEach(t => {
    const card = document.getElementById('lobby-team-card-' + t.id);
    if (!card) return;
    card.classList.toggle('dead', !t.alive);
    const pct = (t.hp / 10) * 100;
    const fill = card.querySelector('.hp-fill');
    const txt = card.querySelector('.hp-text');
    if (fill) fill.style.width = pct + '%';
    if (txt) txt.textContent = (t.alive ? t.hp : '💀') + '/10';
  });
}

function renderTeamPick() {
  const el = document.getElementById('team-pick');
  el.innerHTML = '';
  TEAMS.forEach(t => {
    const d = document.createElement('div');
    d.className = 'tp team-' + t.id;
    d.textContent = t.name;
    d.style.borderColor = t.color;
    d.onclick = () => {
      selectedTeam = t.id;
      [...el.children].forEach(c => c.classList.remove('sel'));
      d.classList.add('sel');
    };
    el.appendChild(d);
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
});

socket.on('your-turn', (data) => {
  // chỉ hiện câu hỏi mới khi round thực sự đổi
  if (state && state.round !== lastShownRound) {
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
  waitMsg.textContent = 'Tất cả các đội đều bị trừ 1 HP.';
  waitMsg.classList.remove('hidden');

  clearTimeout(winnerOverlayTimeout);
  overlay.classList.remove('hidden');
  winnerOverlayTimeout = setTimeout(() => overlay.classList.add('hidden'), 2500);
}

// Đội thắng thấy nút chọn mục tiêu ngay trong overlay; các đội khác chỉ thấy dòng chờ.
socket.on('attack-phase', (data) => {
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
  document.getElementById('winner-attack-section').classList.add('hidden');
  const waitMsg = document.getElementById('winner-wait-msg');
  waitMsg.classList.remove('hidden');
  const t = TEAMS.find(x => x.id === data.targetTeamId);
  waitMsg.textContent = `💥 ${t ? t.name : ''} bị tấn công! -1 HP` + (data.eliminated ? ' ☠️ BỊ LOẠI!' : '');
  clearTimeout(winnerOverlayTimeout);
  winnerOverlayTimeout = setTimeout(() => overlay.classList.add('hidden'), 2500);
});

socket.on('match-finished', (data) => {
  const t = TEAMS.find(x => x.id === data.winnerTeamId);
  document.getElementById('status-label').textContent =
    '🏆 KẾT THÚC! Vô địch: ' + (t ? t.name : '---');
  hideAll();
});

// ---------- Phase UI ----------
function hideAll() {
  document.getElementById('question-box').classList.add('hidden');
  document.getElementById('spectate-box').classList.add('hidden');
  document.getElementById('winner-overlay').classList.add('hidden');
  clearTimeout(winnerOverlayTimeout);
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

// ---------- Timer ----------
let timerData = null;
socket.on('timer', (d) => { timerData = d; });
setInterval(() => {
  if (!timerData) return;
  const remain = Math.max(0, timerData.endsAt - Date.now());
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
  const sec = Math.max(0, Math.ceil((nextRoundData.endsAt - Date.now()) / 1000));
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
  } else {
    ctx.font = '20px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if ((p.facing || 1) < 0) { ctx.save(); ctx.translate(px, 0); ctx.scale(-1, 1); }
    ctx.fillText(ch.emoji, 0, py + 1);
    if ((p.facing || 1) < 0) ctx.restore();
  }
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
