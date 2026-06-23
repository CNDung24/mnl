// ===== Màn hình máy chiếu =====
const socket = io();
let TEAMS = [];
let CHARACTERS = [];
let charMap = {};
let state = null;
let timerData = null;

socket.on('init', (data) => {
  TEAMS = data.teams;
  CHARACTERS = data.characters;
  CHARACTERS.forEach(c => {
    charMap[c.id] = c;
    if (c.image) { const img = new Image(); img.src = c.image; c._img = img; }
  });
  state = data.state;
  renderAll();
});

socket.on('state', (s) => { state = s; renderAll(); });
socket.on('timer', (d) => { timerData = d; });

socket.on('reveal', (data) => {
  highlightCorrect(data.correct);
  // hiệu ứng rung khi bị trừ máu
  data.damaged.forEach(tid => {
    const card = document.getElementById('team-card-' + tid);
    if (card) { card.classList.add('shake'); setTimeout(() => card.classList.remove('shake'), 500); }
  });
});

socket.on('attack-phase', (data) => {
  const p = document.getElementById('attack-panel');
  p.classList.remove('hidden');
  const t = TEAMS.find(x => x.id === data.attackerTeam);
  document.getElementById('attack-text').innerHTML =
    `🔥 <span style="color:${t.color}">${t.name}</span> đang chọn đội để TẤN CÔNG...`;
});

socket.on('attacked', (data) => {
  const card = document.getElementById('team-card-' + data.targetTeamId);
  if (card) { card.classList.add('shake'); setTimeout(() => card.classList.remove('shake'), 500); }
  const t = TEAMS.find(x => x.id === data.targetTeamId);
  document.getElementById('attack-text').innerHTML =
    `💥 ${t.name} bị TẤN CÔNG! -1 HP ${data.eliminated ? '☠️ BỊ LOẠI!' : ''}`;
  setTimeout(() => document.getElementById('attack-panel').classList.add('hidden'), 2500);
});

socket.on('match-finished', (data) => {
  const t = TEAMS.find(x => x.id === data.winnerTeamId);
  document.getElementById('round-title').innerHTML =
    `🏆 VÔ ĐỊCH: <span style="color:${t ? t.color : '#fff'}">${t ? t.name : '---'}</span> 🏆`;
});

function renderAll() {
  if (!state) return;
  renderTeams();
  renderChosen();
  renderQuestion();
  renderLeaderboard();
}

function renderTeams() {
  const el = document.getElementById('teams-row');
  el.innerHTML = '';
  state.teams.forEach(t => {
    const pct = (t.hp / 10) * 100;
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
        <span class="hp-text">${t.hp}/10</span>
      </div>`;
    el.appendChild(d);
  });
}

function renderChosen() {
  const el = document.getElementById('chosen');
  document.getElementById('round-title').textContent =
    state.phase === 'lobby' ? 'Sảnh chờ - chờ admin bắt đầu'
    : state.phase === 'finished' ? 'Trận kết thúc'
    : 'VÒNG ' + state.round + ' - Đang thi đấu';
  el.innerHTML = '';
  state.currentChosen.forEach(c => {
    const t = TEAMS.find(x => x.id === c.teamId);
    const player = state.players.find(p => p.id === c.socketId);
    const ch = player ? charMap[player.characterId] : null;
    const d = document.createElement('div');
    d.className = 'chosen-card';
    d.style.borderColor = t.color;
    const charHtml = ch && ch.image
      ? `<div class="big-sprite idle" style="background-image:url('${ch.image}');width:${ch.fw * 3}px;height:${ch.fh * 3}px;--frames:${ch.frames};--fw:${ch.fw * 3}px"></div>`
      : `<div class="big-emoji">${ch ? ch.emoji : '👤'}</div>`;
    d.innerHTML = `
      ${charHtml}
      <div style="color:${t.color};font-size:9px">${t.name}</div>
      <div style="font-size:10px">${c.name}</div>`;
    el.appendChild(d);
  });
}

function renderQuestion() {
  const panel = document.getElementById('q-panel');
  if (state.phase === 'question' && state.question) {
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

function renderLeaderboard() {
  const el = document.getElementById('leaderboard');
  if (!state.leaderboard || !state.leaderboard.length) {
    el.innerHTML = '<p style="font-size:9px">Chưa có</p>'; return;
  }
  el.innerHTML = state.leaderboard.map((p, i) => {
    const t = TEAMS.find(x => x.id === p.teamId);
    const ch = charMap[p.characterId];
    return `<div class="lb-row">
      <span>${i + 1}. ${ch ? ch.emoji : ''} ${p.name} <span style="color:${t ? t.color : '#fff'};font-size:8px">[${t ? t.name : ''}]</span></span>
      <b style="color:var(--accent)">${p.score}</b>
    </div>`;
  }).join('');
}

// Timer đếm ngược
setInterval(() => {
  if (!timerData) return;
  const remain = Math.max(0, timerData.endsAt - Date.now());
  document.getElementById('timer').textContent = Math.ceil(remain / 1000);
  document.getElementById('timer-fill').style.width =
    (remain / (timerData.seconds * 1000) * 100) + '%';
}, 200);
