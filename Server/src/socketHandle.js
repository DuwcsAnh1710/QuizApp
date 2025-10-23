// socketHandle.js
import {
  createRoom,
  getRoom,
  getRoomIdByCode,
  getRoomCode
} from './managers/roomManager.js';

import {
  addPlayer,
  removePlayer,
  getPlayersInRoom,
  addPlayerScore,
  getRanking,
  getPlayerFromMemory
} from './managers/playerManager.js';

import {
  getQuestionSets,
  getQuestionSetByName,
  getQuestionsBySetId,
  getQuestionById,
  getDefaultSet,
  checkCorrectAnswer
} from './managers/questionManager.js';

import { calculateScore } from './utils/scoring.js';

// Public player view
const makePublicPlayer = (p) => ({
  id: p.socketId,
  name: p.name,
  score: p.score ?? 0
});

// State của mỗi phòng (trong RAM)
const ROOMS = Object.create(null);

export default function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log('⚡ Client connected:', socket.id);

    // ------------------ LOGIN (demo) ------------------
    socket.on('login', async ({ username, password }) => {
  try {
    // Tìm user trong database theo username
    const user = await User.findOne({ where: { username } });

    if (!user) {
      socket.emit('loginResult', { success: false, message: 'Tài khoản không tồn tại' });
      return;
    }

    // So sánh password nhập vào với password_hash trong DB
    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      socket.emit('loginResult', { success: false, message: 'Sai mật khẩu' });
      return;
    }

    // Đăng nhập thành công → trả về thông tin user
    socket.emit('loginResult', {
      success: true,
      username: user.username,
      displayName: user.display_name ?? user.username,
      userId: user.id,
    });

    // Lưu state userId vào socket (nếu cần cho sau này)
    socket.userId = user.id;

  } catch (err) {
    console.error('Lỗi khi xử lý login:', err);
    socket.emit('loginResult', { success: false, message: 'Lỗi server, vui lòng thử lại' });
  }
});

    // ------------------ GET QUESTION SETS ------------------
    socket.on('get_question_sets', async (cb) => {
      try {
        // Prefer dedicated function getQuestionSets()
        if (typeof getQuestionSets === 'function') {
          const sets = await getQuestionSets();
          socket.emit('question_sets', sets);
          cb && cb({ ok: true, sets });
          return;
        }
        // fallback: return default set only
        const def = await getDefaultSet();
        const sets = [];
        if (def && def.set) {
          sets.push({ id: def.set.id, name: def.set.name || 'Default Set', count: (def.questions || []).length });
        }
        socket.emit('question_sets', sets);
        cb && cb({ ok: true, sets });
      } catch (e) {
        console.error('get_question_sets error:', e);
        socket.emit('question_sets', []);
        cb && cb({ ok: false, error: e.message });
      }
    });

    // ------------------ GET QUESTIONS (supports payload) ------------------
    // payload can be: undefined | { setId } | { setName } | number | string
    socket.on('getQuestions', async (payload = {}, cb) => {
      try {
        // normalize payload
        let setId = null;
        if (payload === null || payload === undefined || (typeof payload === 'function')) {
          // called as getQuestions(cb) -- handle below
        } else if (typeof payload === 'number' || (typeof payload === 'string' && /^\d+$/.test(payload))) {
          setId = Number(payload);
        } else if (typeof payload === 'string') {
          // treat as setName
          const s = await (typeof getQuestionSetByName === 'function' ? getQuestionSetByName(payload) : null);
          setId = s?.id ?? null;
        } else if (typeof payload === 'object') {
          if (payload.setId) setId = payload.setId;
          else if (payload.setName) {
            const s = await (typeof getQuestionSetByName === 'function' ? getQuestionSetByName(payload.setName) : null);
            setId = s?.id ?? null;
          }
        }

        let questions;
        if (setId) {
          questions = await getQuestionsBySetId(setId);
        } else {
          // fallback to default
          const d = await getDefaultSet();
          questions = d ? d.questions : await getQuestionsBySetId(null);
        }

        // map to a lightweight client format (id, question/text, options array, timeLimit)
        const mapped = (questions || []).map(q => ({
          id: q.id,
          question: q.content ?? q.text ?? q.question ?? q.question_text ?? '',
          options: q.options ?? q.choices ?? (q.choice_a ? [q.choice_a, q.choice_b, q.choice_c, q.choice_d] : []),
          timeLimit: Number(q.time_limit ?? q.timeLimit ?? 15),
          // keep correctAnswer in server-side objects but do NOT send it unless you really want to
          // correctAnswer: q.correct_answer ?? q.correctAnswer ?? null
        }));

        socket.emit('questionsData', mapped);
        cb && cb({ ok: true, count: mapped.length });
      } catch (e) {
        console.error('getQuestions error:', e);
        socket.emit('questionsData', []);
        cb && cb({ ok: false, error: e.message });
      }
    });

    // ------------------ CREATE ROOM ------------------
    socket.on('create_room', async ({ displayName = 'Host', questionSetId = null, userId = null } = {}, cb) => {
      try {
        const roomId = await createRoom({ hostUserId: userId, questionSetId });
        await addPlayer(socket.id, { name: displayName, roomId, userId });
        socket.join(roomId);

        io.to(roomId).emit('players_updated',
          getPlayersInRoom(roomId).map(makePublicPlayer)
        );

        console.log(`[SERVER] room created ${roomId} by ${socket.id}`);
        cb && cb({ ok: true, roomId, code: getRoomCode(roomId) });
      } catch (e) {
        console.error('create_room error:', e);
        cb && cb({ ok: false, error: e.message });
      }
    });

    // ------------------ JOIN ROOM ------------------
    socket.on('join_room', async ({ roomId, roomCode, displayName, userId = null } = {}, cb) => {
      try {
        let targetRoomId = roomId;
        if (!targetRoomId && roomCode) {
          targetRoomId = getRoomIdByCode(roomCode);
        }

        const room = await getRoom(targetRoomId);
        if (!room) {
          cb && cb({ ok: false, error: 'Phòng không tồn tại' });
          return;
        }

        await addPlayer(socket.id, { name: displayName, roomId: targetRoomId, userId });
        socket.join(targetRoomId);

        io.to(targetRoomId).emit('players_updated',
          getPlayersInRoom(targetRoomId).map(makePublicPlayer)
        );
        cb && cb({ ok: true, roomId: targetRoomId });
      } catch (e) {
        console.error('join_room error:', e);
        cb && cb({ ok: false, error: e.message });
      }
    });

    // ------------------ LEAVE ROOM ------------------
    socket.on('leave_room', async ({ roomId } = {}, cb) => {
      try {
        await removePlayer(socket.id);
        socket.leave(roomId);

        io.to(roomId).emit('players_updated',
          getPlayersInRoom(roomId).map(makePublicPlayer)
        );
        cb && cb({ ok: true });
      } catch (e) {
        console.error('leave_room error:', e);
        cb && cb({ ok: false, error: e.message });
      }
    });

    // ------------------ CHOOSE SET (HOST chọn bộ câu hỏi cho phòng) ------------------
    // payload: { roomId, setId } OR { roomId, setName }
    socket.on('choose_set', async ({ roomId, setId, setName } = {}, cb) => {
      try {
        if (!roomId) {
          cb && cb({ ok: false, error: 'roomId required' });
          return;
        }

        let useSetId = setId ?? null;
        if (!useSetId && setName && typeof getQuestionSetByName === 'function') {
          const s = await getQuestionSetByName(setName);
          useSetId = s?.id ?? null;
        }

        const questions = useSetId ? await getQuestionsBySetId(useSetId) : (await getDefaultSet())?.questions || [];

        ROOMS[roomId] = ROOMS[roomId] || { questions: [], currentIndex: 0, started: false, timer: null };
        ROOMS[roomId].questions = questions;
        ROOMS[roomId].currentIndex = 0;
        ROOMS[roomId].started = true;

        console.log(`[SERVER] room ${roomId} choose set ${useSetId}, loaded ${questions.length} q`);

        // Gửi câu hỏi đầu tiên
        sendCurrentQuestion(io, roomId);

        cb && cb({ ok: true, total: questions.length });
      } catch (e) {
        console.error('choose_set error:', e);
        cb && cb({ ok: false, error: e.message });
      }
    });

    // ------------------ START GAME (fallback if using DB room configs) ------------------
    socket.on('start_game', async ({ roomId } = {}, cb) => {
      try {
        if (!roomId) {
          cb && cb({ ok: false, error: 'roomId required' });
          return;
        }
        const roomDb = await getRoom(roomId);
        let questions = [];
        if (roomDb?.question_set_id || roomDb?.questionSetId) {
          const setId = roomDb.question_set_id ?? roomDb.questionSetId;
          questions = await getQuestionsBySetId(setId);
        } else {
          const defaultData = await getDefaultSet();
          questions = defaultData?.questions || [];
        }

        ROOMS[roomId] = ROOMS[roomId] || { questions: [], currentIndex: 0, started: false, timer: null };
        ROOMS[roomId].questions = questions;
        ROOMS[roomId].currentIndex = 0;
        ROOMS[roomId].started = true;

        sendCurrentQuestion(io, roomId);
        cb && cb({ ok: true, total: questions.length });
      } catch (e) {
        console.error('start_game error:', e);
        cb && cb({ ok: false, error: e.message });
      }
    });

    // ------------------ CHECK ANSWER (simple client -> server, non-room) ------------------
    // payload: { questionId, answerIndex, points (optional), roomId (optional) }
    socket.on('checkAnswer', async ({ questionId, answerIndex, points = 0, roomId = null } = {}, cb) => {
      try {
        const correct = await checkCorrectAnswer(questionId, answerIndex);
        if (correct && Number(points) > 0) {
          await addPlayerScore(socket.id, Number(points));
          // emit ranking globally or to a room if provided
          if (roomId) io.to(roomId).emit('rankingData', getRanking(roomId));
          else io.emit('rankingData', getRanking());
        }
        socket.emit('answerResult', correct);
        cb && cb({ ok: true, correct });
      } catch (e) {
        console.error('checkAnswer error:', e);
        socket.emit('answerResult', false);
        cb && cb({ ok: false, error: e.message });
      }
    });

    // ------------------ SUBMIT ANSWER (room flow, server-side scoring & advancing) ------------------
    // payload: { roomId, questionId, answerIndex, timeUsed }
    socket.on('submit_answer', async ({ roomId, questionId, answerIndex, timeUsed = 0 } = {}, cb) => {
      try {
        const room = ROOMS[roomId];
        // find question either in room or DB
        let q = null;
        if (room && Array.isArray(room.questions)) {
          q = room.questions.find(x => String(x.id) === String(questionId)) ?? room.questions[room.currentIndex];
        }
        if (!q) q = await getQuestionById(questionId);

        let correct = false;
        let gained = 0;

        if (q) {
          // compute correct index
          let correctIndex = null;
          const stored = q.correct_answer ?? q.correctAnswer ?? null;
          if (stored !== null && stored !== undefined) {
            const s = String(stored).trim();
            if (/^[0-9]+$/.test(s)) correctIndex = Number(s);
            else {
              const map = { A:0,B:1,C:2,D:3,a:0,b:1,c:2,d:3 };
              correctIndex = map[s] ?? null;
            }
          }
          correct = correctIndex !== null && Number(answerIndex) === Number(correctIndex);

          if (correct) {
            const basePoints = Number(q.points || 1000);
            const timeLimit = Number(q.time_limit ?? q.timeLimit ?? 15);
            gained = calculateScore(basePoints, timeLimit, Number(timeUsed || 0));
            await addPlayerScore(socket.id, gained);

            // reveal correct to room and advance
            io.to(roomId).emit('reveal_answer', { correctIndex });
            if (room && room.timer) {
              clearTimeout(room.timer);
              room.timer = null;
            }
            if (room) {
              room.currentIndex++;
              setTimeout(() => sendCurrentQuestion(io, roomId), 500);
            }
          } else {
            // wrong: optionally emit something to that socket
            socket.emit('wrong_answer', { questionId, answerIndex });
          }
        }

        cb && cb({ ok: true, correct, gained });
        socket.emit('answerResult', { correct, gained });
        try { io.to(roomId).emit('rankingData', getRanking(roomId)); } catch(e){}
      } catch (e) {
        console.error('submit_answer error:', e);
        cb && cb({ ok: false, error: e.message });
        socket.emit('answerResult', { correct: false, error: e.message });
      }
    });

    // ------------------ DISCONNECT ------------------
    socket.on('disconnect', async () => {
      try {
        const p = getPlayerFromMemory(socket.id);
        await removePlayer(socket.id);
        if (p?.roomId) {
          io.to(p.roomId).emit('players_updated',
            getPlayersInRoom(p.roomId).map(makePublicPlayer)
          );
        }
        console.log('❌ Socket disconnected:', socket.id);
      } catch (e) {
        console.error('disconnect cleanup error:', e);
      }
    });

  }); // end connection
} // end export

// ------------------ SEND CURRENT QUESTION (room) ------------------
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

  // Build payload for client (do NOT include correctIndex here)
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
  console.log(`[SERVER] new_question -> room=${roomId} idx=${room.currentIndex} id=${payload.question.id}`);

  // Clear previous timer
  if (room.timer) {
    clearTimeout(room.timer);
    room.timer = null;
  }

  // Setup server-side timeout for this question
  room.timer = setTimeout(() => {
    // Determine correct index from q and emit timeUp / reveal
    let correctIndex = null;
    const stored = q.correct_answer ?? q.correctAnswer ?? null;
    if (stored !== null && stored !== undefined) {
      const s = String(stored).trim();
      if (/^[0-9]+$/.test(s)) correctIndex = Number(s);
      else {
        const map = { A:0,B:1,C:2,D:3,a:0,b:1,c:2,d:3 };
        correctIndex = map[s] ?? null;
      }
    }
    // Emit timeUp and reveal correct
    io.to(roomId).emit('timeUp', { correctIndex });
    io.to(roomId).emit('reveal_answer', { correctIndex });

    // advance question
    room.currentIndex++;
    // small delay so reveal is visible then next
    setTimeout(() => {
      sendCurrentQuestion(io, roomId);
    }, 700);
  }, (payload.question.timeLimit || 15) * 1000);
}
