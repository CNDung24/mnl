// ===== Trang Admin =====
const socket = io();
let TEAMS = [];
let state = null;
let questions = [];
let selectedCorrect = null;

socket.on('init', (data) => {
  TEAMS = data.teams;
  state = data.state;
  renderHP();
});

// ---------- Đăng nhập ----------
document.getElementById('login-btn').onclick = login;
document.getElementById('pw').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
function login() {
  const password = document.getElementById('pw').value;
  socket.emit('admin:auth', { password }, (res) => {
    if (res.ok) {
      document.getElementById('login').classList.add('hidden');
      document.getElementById('dash').classList.remove('hidden');
      loadQuestions();
      loadHistory();
    } else {
      alert(res.error || 'Sai mật khẩu');
    }
  });
}

// ---------- Điều khiển ----------
document.getElementById('btn-start').onclick = () => {
  socket.emit('admin:start', {}, (res) => {
    if (!res.ok) alert(res.error || 'Lỗi');
  });
};
document.getElementById('btn-next').onclick = () => socket.emit('admin:next', {}, () => {});
document.getElementById('btn-reset').onclick = () => {
  if (confirm('Reset toàn bộ trận?')) socket.emit('admin:reset', {}, () => {});
};
document.getElementById('btn-reveal').onclick = () => {
  socket.emit('admin:reveal', { correct: selectedCorrect }, () => {});
};

// ---------- State ----------
socket.on('state', (s) => {
  state = s;
  renderHP();
  renderCurrentQuestion();
  document.getElementById('phase-info').textContent = 'Pha: ' + s.phase + ' | Vòng: ' + s.round;
  loadHistory();
});

socket.on('answer-received', () => {
  // cập nhật trạng thái ai đã trả lời
  if (!state) return;
});

socket.on('reveal', (data) => {
  let html = 'Đáp án đúng: ' + ['A','B','C','D'][data.correct] + '. ';
  html += 'Đội thua: ' + (data.damaged.map(id => 'Đội ' + id).join(', ') || 'không');
  document.getElementById('answer-status').textContent = html;
  loadHistory();
});

function renderCurrentQuestion() {
  const box = document.getElementById('current-q');
  if (state && state.phase === 'question' && state.question) {
    box.classList.remove('hidden');
    document.getElementById('cur-round').textContent = state.round;
    document.getElementById('cur-q-text').textContent = state.question.text;
    const wrap = document.getElementById('cur-options');
    wrap.innerHTML = '';
    const letters = ['A','B','C','D'];
    state.question.options.forEach((opt, i) => {
      const b = document.createElement('button');
      b.textContent = letters[i] + '. ' + opt;
      b.onclick = () => {
        selectedCorrect = i;
        [...wrap.children].forEach(c => c.classList.remove('picked'));
        b.classList.add('picked');
        b.style.outline = '4px solid #2ecc71';
      };
      wrap.appendChild(b);
    });
    // hiện ai đã trả lời
    const chosen = state.currentChosen.map(c => 'Đội ' + c.teamId + ': ' + c.name).join(' | ');
    document.getElementById('answer-status').textContent = 'Đang thi: ' + chosen;
  } else {
    box.classList.add('hidden');
  }
}

function renderHP() {
  if (!state) return;
  const el = document.getElementById('hp-list');
  el.innerHTML = '';
  state.teams.forEach(t => {
    const pct = (t.hp / 10) * 100;
    const d = document.createElement('div');
    d.className = 'team-card' + (t.alive ? '' : ' dead');
    d.innerHTML = `
      <div style="font-size:10px;margin-bottom:4px">
        <span class="team-${t.id}">${t.name}</span>
        ${t.alive ? '' : '💀 LOẠI'} (${t.players} người)
      </div>
      <div class="hp-bar">
        <div class="hp-fill" style="width:${pct}%;background:${t.color}"></div>
        <span class="hp-text">${t.hp}/10</span>
      </div>`;
    el.appendChild(d);
  });
}

// ---------- Quản lý câu hỏi ----------
function loadQuestions() {
  socket.emit('admin:get-questions', {}, (res) => {
    questions = res.questions || [];
    renderEditor();
  });
}

function renderEditor() {
  const el = document.getElementById('q-editor');
  el.innerHTML = '';
  questions.forEach((q, idx) => {
    const d = document.createElement('div');
    d.className = 'panel';
    d.style.background = '#1a1640';
    const letters = ['A','B','C','D'];
    d.innerHTML = `
      <label>Câu ${idx + 1}</label>
      <input data-i="${idx}" data-f="text" value="${escapeHtml(q.text)}">
      ${[0,1,2,3].map(i => `
        <div class="row" style="align-items:center;margin-top:6px">
          <span style="width:20px">${letters[i]}</span>
          <input style="flex:1" data-i="${idx}" data-f="opt" data-oi="${i}" value="${escapeHtml(q.options[i] || '')}">
          <label style="margin:0;display:flex;gap:4px;align-items:center;width:auto">
            <input type="radio" style="width:auto" name="correct-${idx}" data-i="${idx}" data-f="correct" data-oi="${i}" ${q.correct === i ? 'checked' : ''}> đúng
          </label>
        </div>`).join('')}
      <button class="danger" data-del="${idx}" style="margin-top:8px">🗑️ Xóa</button>
    `;
    el.appendChild(d);
  });

  el.querySelectorAll('input').forEach(inp => {
    inp.onchange = () => {
      const i = +inp.dataset.i, f = inp.dataset.f;
      if (f === 'text') questions[i].text = inp.value;
      else if (f === 'opt') questions[i].options[+inp.dataset.oi] = inp.value;
      else if (f === 'correct') questions[i].correct = +inp.dataset.oi;
    };
  });
  el.querySelectorAll('[data-del]').forEach(b => {
    b.onclick = () => { questions.splice(+b.dataset.del, 1); renderEditor(); };
  });
}

document.getElementById('btn-add-q').onclick = () => {
  questions.push({ text: 'Câu hỏi mới?', options: ['', '', '', ''], correct: 0 });
  renderEditor();
};
document.getElementById('btn-save-q').onclick = () => {
  socket.emit('admin:set-questions', { questions }, (res) => {
    alert('Đã lưu ' + res.count + ' câu hỏi');
  });
};

// ---------- Import / Export JSON ----------
function parseQuestionsJson(raw) {
  // chấp nhận: mảng, hoặc object {questions:[...]}, hoặc {data:[...]}
  let data;
  try { data = JSON.parse(raw); }
  catch (e) { return { error: 'JSON không hợp lệ: ' + e.message }; }
  if (data && !Array.isArray(data) && Array.isArray(data.questions)) data = data.questions;
  if (data && !Array.isArray(data) && Array.isArray(data.data)) data = data.data;
  if (!Array.isArray(data)) return { error: 'Phải là mảng JSON các câu hỏi' };
  const out = [];
  for (let i = 0; i < data.length; i++) {
    const q = data[i] || {};
    const text = String(q.text || q.question || '').trim();
    if (!text) return { error: 'Câu ' + (i + 1) + ': thiếu text' };
    let opts = q.options || q.choices || q.answers;
    if (!Array.isArray(opts)) opts = [];
    opts = [0, 1, 2, 3].map(j => String(opts[j] || ''));
    let correct = parseInt(q.correct, 10);
    if (isNaN(correct) || correct < 0 || correct > 3) correct = 0;
    out.push({ text, options: opts, correct });
  }
  return { questions: out };
}

function setImportStatus(msg, isError) {
  const el = document.getElementById('import-status');
  el.textContent = msg;
  el.style.color = isError ? '#e74c3c' : 'var(--accent2)';
}

function saveQuestionsAfterImport() {
  socket.emit('admin:set-questions', { questions }, (res) => {
    if (res && res.ok !== false) {
      setImportStatus('Đã lưu ' + (res.count || questions.length) + ' câu hỏi vào server.');
      renderEditor();
    } else {
      setImportStatus('Lỗi lưu: ' + (res && res.error || 'unknown'), true);
    }
  });
}

document.getElementById('btn-import-replace').onclick = () => {
  const raw = document.getElementById('json-area').value.trim();
  if (!raw) return setImportStatus('Chưa có JSON để import.', true);
  const r = parseQuestionsJson(raw);
  if (r.error) return setImportStatus(r.error, true);
  if (!confirm('Thay thế toàn bộ ' + questions.length + ' câu hỏi bằng ' + r.questions.length + ' câu mới?')) return;
  questions = r.questions;
  saveQuestionsAfterImport();
};

document.getElementById('btn-import-merge').onclick = () => {
  const raw = document.getElementById('json-area').value.trim();
  if (!raw) return setImportStatus('Chưa có JSON để import.', true);
  const r = parseQuestionsJson(raw);
  if (r.error) return setImportStatus(r.error, true);
  questions = questions.concat(r.questions);
  setImportStatus('Đã gộp ' + r.questions.length + ' câu. Tổng: ' + questions.length);
  saveQuestionsAfterImport();
};

document.getElementById('btn-export-json').onclick = () => {
  const json = JSON.stringify(questions, null, 2);
  document.getElementById('json-area').value = json;
  // copy to clipboard
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(json).then(
      () => setImportStatus('Đã xuất ' + questions.length + ' câu (copy clipboard).'),
      () => setImportStatus('Đã xuất ' + questions.length + ' câu vào textarea (không copy được clipboard).')
    );
  } else {
    setImportStatus('Đã xuất ' + questions.length + ' câu vào textarea.');
  }
};

document.getElementById('btn-load-file').onclick = () => {
  document.getElementById('file-input').click();
};
document.getElementById('file-input').onchange = (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    document.getElementById('json-area').value = reader.result;
    setImportStatus('Đã đọc file: ' + f.name + '. Bấm Import để áp dụng.');
  };
  reader.onerror = () => setImportStatus('Lỗi đọc file.', true);
  reader.readAsText(f);
  e.target.value = '';   // reset để chọn cùng file vẫn trigger
};

// ---------- Lịch sử ----------
function loadHistory() {
  fetch('/api/history').then(r => r.json()).then(renderHistory).catch(() => {});
}
function renderHistory(hist) {
  const el = document.getElementById('history');
  if (!hist || !hist.length) { el.innerHTML = '<p style="font-size:9px">Chưa có</p>'; return; }
  let html = '<table><tr><th>Vòng</th><th>Câu hỏi</th><th>Trả lời</th><th>Thắng</th><th>Tấn công</th></tr>';
  hist.slice().reverse().forEach(h => {
    const ans = h.answers.map(a =>
      `Đ${a.teamId}:${a.playerName}=${['A','B','C','D'][a.choice] || '-'}${a.correct ? '✓' : '✗'}(${a.timeMs ? (a.timeMs/1000).toFixed(1) + 's' : '-'})`
    ).join('<br>');
    html += `<tr>
      <td>${h.round}</td>
      <td>${escapeHtml(h.questionText)}</td>
      <td>${ans}</td>
      <td>${h.winnerTeamId ? 'Đội ' + h.winnerTeamId : '-'}</td>
      <td>${h.attackedTeamId ? 'Đội ' + h.attackedTeamId : '-'}</td>
    </tr>`;
  });
  html += '</table>';
  el.innerHTML = html;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
