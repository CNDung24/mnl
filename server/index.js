const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const config = require('./config');
const { connectDB } = require('./models/db');
const repo = require('./models/repository');
const defaultQuestions = require('./data/questions');
const GameEngine = require('./game-engine/GameEngine');
const registerSockets = require('./socket');
const gameController = require('./controllers/gameController');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Một game engine dùng chung cho cả server
const engine = new GameEngine();

app.use(express.json());

// ===== REST API (admin) =====
const ctrl = gameController(engine);
app.get('/api/questions', ctrl.getQuestions);
app.post('/api/questions', ctrl.setQuestions);
app.get('/api/history', ctrl.getHistory);
app.get('/api/state', ctrl.getState);
app.get('/api/characters', (req, res) => res.json(require('./data/characters')));

// ===== Static client =====
app.use(express.static(path.join(__dirname, '..', 'client')));

// Các route trang
const page = (f) => (req, res) => res.sendFile(path.join(__dirname, '..', 'client', f));
app.get('/', page('index.html'));
app.get('/play', page('play.html'));
app.get('/admin', page('admin.html'));
app.get('/projector', page('projector.html'));

// ===== Socket.IO =====
registerSockets(io, engine);

// ===== Khởi động =====
(async () => {
  await connectDB();

  // Nạp câu hỏi từ MongoDB (seed mặc định nếu DB trống)
  try {
    const dbQuestions = await repo.loadQuestions(defaultQuestions);
    if (dbQuestions && dbQuestions.length) {
      engine.setQuestions(dbQuestions);
      console.log('[DB] Đã nạp ' + dbQuestions.length + ' câu hỏi từ MongoDB.');
    }
  } catch (e) {
    console.error('[DB] Không nạp được câu hỏi:', e.message);
  }

  server.listen(config.PORT, () => {
    console.log('====================================================');
    console.log('  TRIẾT HỌC ARENA - đang chạy');
    console.log('  Người chơi : http://localhost:' + config.PORT + '/play');
    console.log('  Admin      : http://localhost:' + config.PORT + '/admin  (mk: ' + config.ADMIN_PASSWORD + ')');
    console.log('  Máy chiếu  : http://localhost:' + config.PORT + '/projector');
    console.log('====================================================');
  });
})();
