import express from 'express';
import http from 'http';
import { Server as IOServer } from 'socket.io';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import bodyParser from 'body-parser';
import connectDB from './config/connectDB.js';
import sequelize from './config/sequelize.js'; // Kết nối Sequelize
import Question from './models/Question.js';    // Model Question
import { getQuestionsBySetId, getDefaultSet, checkCorrectAnswer, getAllSets } from './managers/questionManager.js';
import { addPlayerScore, getRanking } from './managers/playerManager.js';
import { createRoom, getRoomFromMemory, addPlayerToRoomDB, getRoomFromDB, getRoomIdByCode, getRoomCode } from './managers/roomManager.js';
import Room from './models/Room.js';

import bcrypt from 'bcryptjs';
import User from './models/User.js';

dotenv.config();
connectDB();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

const app = express();
app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


// 🚩 Serve client (index.html, game.html)
app.use(express.static(path.join(__dirname, '..', '..', 'client', 'src',)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'client', 'src', 'index.html',));
});
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'client', 'src', 'login.html'));
});

const server = http.createServer(app);
const io = new IOServer(server, { cors: { origin: '*' } });

// 🚩 SOCKET.IO
const ROOMS = Object.create(null);

// helper to make a short room code
function makeRoomCode() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

// send question for room (server controls timeline)
function sendCurrentQuestion(io, roomId) {
  const room = ROOMS[roomId];
  if (!room) return;

  // bounds check
  if (!Array.isArray(room.questions) || room.currentIndex >= room.questions.length) {
    io.to(roomId).emit('game_over', getRanking(roomId));
    delete ROOMS[roomId];
    return;
  }

  const q = room.questions[room.currentIndex];
  if (!q) {
    io.to(roomId).emit('game_over', getRanking(roomId));
    delete ROOMS[roomId];
    return;
  }

  const payload = {
    index: room.currentIndex + 1,
    total: room.questions.length,
    question: {
      id: q.id ?? q._id ?? room.currentIndex,
      text: q.content ?? q.text ?? q.question ?? q.question_text ?? '',
      options: q.options ?? q.choices ?? (q.choice_a ? [q.choice_a, q.choice_b, q.choice_c, q.choice_d] : []),
      timeLimit: Number(q.time_limit ?? q.timeLimit ?? 15)
    }
  };

  io.to(roomId).emit('new_question', payload);

  // clear previous timer
  if (room.timer) {
    clearTimeout(room.timer);
    room.timer = null;
  }

  // setup timeout for question
  room.timer = setTimeout(() => {
    // reveal correct index to room
    let correctIndex = null;
    const stored = q.correct_answer ?? q.correctAnswer ?? null;
    if (stored !== null && stored !== undefined) {
      const s = String(stored).trim();
      if (/^[0-9]+$/.test(s)) correctIndex = Number(s);
      else {
        const map = { A: 0, B: 1, C: 2, D: 3, a: 0, b: 1, c: 2, d: 3 };
        correctIndex = map[s] ?? null;
      }
    }

    // emit timeUp + reveal
    io.to(roomId).emit('timeUp', { correctIndex });
    io.to(roomId).emit('reveal_answer', { correctIndex });

    // advance index
    room.currentIndex++;
    setTimeout(() => {
      sendCurrentQuestion(io, roomId);
    }, 700); // small pause so clients see reveal
  }, (payload.question.timeLimit || 15) * 1000);
}

io.on('connection', (socket) => {
  console.log('Người chơi kết nối:', socket.id);

  // CREATE ROOM (simple)
  socket.on('create_room', (opts = {}, cb) => {
    // create simple roomId + code; you can replace with your roomManager
    const roomId = 'room_' + Math.random().toString(36).slice(2, 9);
    const code = makeRoomCode();
    // init room structure if needed
    ROOMS[roomId] = ROOMS[roomId] || { questions: [], currentIndex: 0, timer: null, code, players: new Set() };
    ROOMS[roomId].players.add(socket.id);
    socket.join(roomId);
    console.log(`[ROOM] created ${roomId} by ${socket.id}`);
    cb && cb({ ok: true, roomId, code });
  });

  // JOIN ROOM (optional - simple)
  socket.on('join_room', ({ roomId } = {}, cb) => {
    if (!roomId || !ROOMS[roomId]) {
      cb && cb({ ok: false, error: 'Room not found' });
      return;
    }
    ROOMS[roomId].players.add(socket.id);
    socket.join(roomId);
    cb && cb({ ok: true, roomId });
  });

  // GET QUESTION SETS -> emit 'question_sets'
  socket.on('get_question_sets', async (cb) => {
    try {
      // if your questionManager has getAllSets, use it; else fallback to Default Set names
      let sets = [];
      if (typeof getAllSets === 'function') {
        sets = await getAllSets();
      } else {
        const def = await getDefaultSet();
        if (def && def.set) sets.push({ id: def.set.id, name: def.set.name || 'Default Set', count: (def.questions || []).length });
        // Add five subject placeholders if you want fixed names (Toán,Lý,Hóa,Địa,Anh) mapping to null
        sets = sets.concat([
          { id: null, name: 'Toán', count: 0 },
          { id: null, name: 'Lý', count: 0 },
          { id: null, name: 'Hóa', count: 0 },
          { id: null, name: 'Địa', count: 0 },
          { id: null, name: 'Anh', count: 0 }
        ]);
      }
      socket.emit('question_sets', sets);
      cb && cb({ ok: true, sets });
    } catch (err) {
      console.error('get_question_sets error', err);
      socket.emit('question_sets', []);
      cb && cb({ ok: false, error: err.message });
    }
  });

  // CHOOSE SET for a room => load questions into ROOMS[roomId] and send first question
  socket.on('choose_set', async ({ roomId, setId } = {}, cb) => {
    try {
      if (!roomId) {
        cb && cb({ ok: false, error: 'roomId required' });
        return;
      }
      let questions = [];
      if (setId) {
        questions = await getQuestionsBySetId(setId);
      } else {
        const def = await getDefaultSet();
        questions = def?.questions || [];
      }
      // normalize to simple objects (time_limit etc)
      ROOMS[roomId] = ROOMS[roomId] || { questions: [], currentIndex: 0, timer: null, players: new Set() };
      ROOMS[roomId].questions = questions.map(q => ({
        id: q.id,
        content: q.content ?? q.text ?? q.question ?? '',
        options: q.options ?? q.choices ?? [q.choice_a, q.choice_b, q.choice_c, q.choice_d].filter(Boolean),
        time_limit: q.time_limit ?? q.timeLimit ?? 15,
        points: q.points ?? 1000,
        correct_answer: q.correct_answer ?? q.correctAnswer ?? null
      }));
      ROOMS[roomId].currentIndex = 0;
      ROOMS[roomId].started = true;

      // send first question
      sendCurrentQuestion(io, roomId);

      cb && cb({ ok: true, total: ROOMS[roomId].questions.length });
    } catch (err) {
      console.error('choose_set error', err);
      cb && cb({ ok: false, error: err.message });
    }
  });

  // SUBMIT ANSWER (the name used in client)
  // payload: { roomId, questionId, answerIndex, timeUsed }
  socket.on('submit_answer', async ({ roomId, questionId, answerIndex, timeUsed = 0 } = {}, cb) => {
    try {
      if (!roomId) {
        cb && cb({ ok: false, error: 'roomId required' });
        return;
      }
      const room = ROOMS[roomId];
      // find question object in room
      let q = null;
      let questionIndexInRoom = null;
      if (room && Array.isArray(room.questions)) {
        questionIndexInRoom = room.questions.findIndex(x => String(x.id) === String(questionId));
        if (questionIndexInRoom === -1) questionIndexInRoom = room.currentIndex;
        q = room.questions[questionIndexInRoom];
      }
      // fallback to DB?
      if (!q) {
        const correct = await checkCorrectAnswer(questionId, answerIndex);
        cb && cb({ ok: true, correct, gained: 0 });
        socket.emit('answerResult', { correct, gained: 0 });
        return;
      }

      // grade
      const correct = await checkCorrectAnswer(questionId, answerIndex);
      let gained = 0;
      if (correct) {
        const timeLimit = Number(q.time_limit ?? q.timeLimit ?? 15);
        const used = Number(timeUsed || 0);
        const remain = Math.max(0, timeLimit - used);
        gained = Math.max(0, Math.round(remain * 100));
        await addPlayerScore(socket.id, gained);
      }

      // acknowledge to submitter
      cb && cb({ ok: true, correct, gained });
      socket.emit('answerResult', { correct, gained });

      // compute correctIndex for reveal
      let correctIndex = null;
      const stored = q.correct_answer ?? q.correctAnswer ?? null;
      if (stored !== null && stored !== undefined) {
        const s = String(stored).trim();
        if (/^[0-9]+$/.test(s)) correctIndex = Number(s);
        else {
          const map = { A: 0, B: 1, C: 2, D: 3, a: 0, b: 1, c: 2, d: 3 };
          correctIndex = map[s] ?? null;
        }
      }

      // reveal correct to room
      io.to(roomId).emit('reveal_answer', { correctIndex, answeredBy: socket.id });

      // update ranking to room
      try { io.to(roomId).emit('rankingData', getRanking(roomId)); } catch (e) { }

      // Advance question for the room (immediately in all cases)
      if (room) {
        // ensure we advance only if the room is still on the same question we graded
        // (prevents double-advance if timer already moved)
        if (typeof questionIndexInRoom === 'number' && questionIndexInRoom === room.currentIndex) {
          if (room.timer) {
            clearTimeout(room.timer);
            room.timer = null;
          }
          room.currentIndex++;
          // short pause so clients can show reveal
          setTimeout(() => {
            sendCurrentQuestion(io, roomId);
          }, 700);
        } else {
          // already advanced by timer - do nothing
        }
      }
    } catch (err) {
      console.error('submit_answer error:', err);
      cb && cb({ ok: false, error: err.message });
      socket.emit('answerResult', { correct: false, error: err.message });
    }
  });

  // Legacy: support older client calling getQuestions
  socket.on('getQuestions', async (cb) => {
    try {
      const def = await getDefaultSet();
      const questions = def
        ? (def.questions || []).map(q => ({
          id: q.id,
          question: q.content ?? q.text ?? q.question ?? '',
          options: q.options ?? q.choices ?? (q.choice_a ? [q.choice_a, q.choice_b, q.choice_c, q.choice_d] : []),
          correctAnswer: q.correct_answer ?? q.correctAnswer,
          timeLimit: q.time_limit ?? q.timeLimit ?? 15
        }))
        : [];
      socket.emit('questionCount', questions.length);
      socket.emit('questionsData', questions);
      // optional: emit first item as legacy newQuestion (camelCase) for older client
      if (questions.length > 0) socket.emit('newQuestion', questions[0]);
      cb && cb({ ok: true, count: questions.length });
    } catch (err) {
      console.error('getQuestions error', err);
      socket.emit('questionsData', []);
      cb && cb({ ok: false, error: err.message });
    }
  });

  socket.on('login', async ({ username, password } = {}, cb) => {
    try {
      if (!username || !password) {
        const res = { success: false, message: 'Username và password là bắt buộc' };
        cb?.(res);
        socket.emit('loginResult', res);
        return;
      }

      const user = await User.findOne({ where: { username } });
      if (!user) {
        const res = { success: false, message: 'Tài khoản không tồn tại' };
        cb?.(res);
        socket.emit('loginResult', res);
        return;
      }

      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) {
        const res = { success: false, message: 'Sai mật khẩu' };
        cb?.(res);
        socket.emit('loginResult', res);
        return;
      }

      const res = {
        success: true,
        userId: user.id,
        username: user.username,
        displayName: user.display_name ?? user.displayName ?? user.username
      };
      cb?.(res);
      socket.emit('loginResult', res);
      socket.userId = user.id;

    } catch (err) {
      console.error('login error:', err);
      const res = { success: false, message: 'Lỗi server' };
      cb?.(res);
      socket.emit('loginResult', res);
    }
  });

  // Handle room creation
  socket.on('createRoom', async ({ hostUserId, displayName }) => {
    const room = await createRoom({ hostUserId });
    console.log('📦 Phòng tạo:', room);
    const roomId = room.id;
    const roomCode = getRoomCode(roomId);

    // Thêm host vào DB
    await addPlayerToRoomDB({
      roomId,
      userId: hostUserId,
      displayName,
      socketId: socket.id,
      isHost: true
    });

    const updatedRoom = await getRoomFromDB(roomId);
    socket.join(roomId);

    // Gửi mã phòng cho host
    socket.emit('roomCreated', { roomId, roomCode });

    // Gửi danh sách người chơi cho tất cả client
    io.to(roomId).emit('roomUpdated', {
      id: updatedRoom.id,
      code: roomCode,
      players: updatedRoom.players.map(p => ({
        displayName: p.displayName,
        isHost: p.isHost,
        socketId: p.socketId
      })),
      playerCount: updatedRoom.players.length
    });
  });

  // Handle room join
  socket.on('joinRoom', async ({ code, userId, displayName }, callback) => {
    const roomId = getRoomIdByCode(code);
    if (!roomId) return callback({ success: false, message: "Phòng không tồn tại" });

    // Thêm người chơi vào DB
    const player = await addPlayerToRoomDB({
      roomId,
      userId,
      displayName,
      socketId: socket.id,
      isHost: false
    });

    socket.join(roomId);
    const room = await getRoomFromDB(roomId);

    // Gửi danh sách người chơi cho tất cả client
    io.to(roomId).emit('roomUpdated', {
      id: room.id,
      code,
      players: room.players.map(p => ({
        displayName: p.displayName,
        isHost: p.isHost,
        socketId: p.socketId
      })),
      playerCount: room.players.length
    });

    // Gửi phản hồi cho người vừa tham gia
    callback({ success: true, room, player });
  });

  // Handle question set selection
  socket.on('selectQuestionSet', async ({ roomId, questionSetId }) => {
    try {
      const room = getRoomFromMemory(roomId);
      if (!room) {
        socket.emit('questionSetSelected', { success: false, message: 'Phòng không tồn tại' });
        return;
      }

      room.questionSetId = questionSetId;
      await Room.update({ question_set_id: questionSetId }, { where: { id: roomId } });

      socket.emit('questionSetSelected', { success: true });
      console.log(`📦 Bộ câu hỏi ${questionSetId} đã gán cho phòng ${roomId}`);
    } catch (error) {
      console.error('❌ Lỗi chọn bộ câu hỏi:', error);
      socket.emit('questionSetSelected', { success: false, message: 'Lỗi khi chọn bộ câu hỏi' });
    }
  });

  socket.on('startGame', async ({ roomId }) => {
    try {
      const room = await getRoomFromDB(roomId);
      if (!room) {
        socket.emit('gameStarted', { success: false, message: 'Phòng không tồn tại' });
        return;
      }

      // Gửi sự kiện bắt đầu game cho tất cả người chơi trong phòng
      io.to(roomId).emit('gameStarted', { roomId });

      // Gửi câu hỏi đầu tiên (nếu muốn)
      const def = await getDefaultSet();
      const questions = def
        ? def.questions.map(q => ({
          id: q.id,
          question: q.text,
          options: q.options,
          correctAnswer: q.correctAnswer,
          timeLimit: q.timeLimit || 15
        }))
        : await getQuestionsBySetId(null);

      console.log('📌 Bắt đầu game, số câu hỏi:', questions.length);

      io.to(roomId).emit('questionCount', questions.length);
      io.to(roomId).emit('questionsData', questions);

      if (questions.length > 0) {
        io.to(roomId).emit('newQuestion', questions[0]);
      }
    } catch (error) {
      console.error('❌ Lỗi khi bắt đầu game:', error);
      socket.emit('gameStarted', { success: false, message: 'Lỗi khi bắt đầu trò chơi' });
    }
  });

  // Handle disconnection
  socket.on('disconnect', async () => {
    console.log('❌ Người chơi rời:', socket.id);
    try {
      // Find and remove player from room in DB
      const rooms = await getRoomFromDB(); // Assume this returns all rooms or modify to get specific room
      const roomList = Array.isArray(rooms) ? rooms : Object.values(rooms || {});
    } catch (error) {
      console.error('❌ Lỗi khi xử lý ngắt kết nối:', error);
    }
  });

});

server.listen(PORT, () => {
  console.log(`✅ Server chạy tại http://${HOST}:${PORT}`);
});