import { Question, QuestionSet } from '../models/index.js';

/**
 * Normalize Sequelize instance or plain object -> plain object with consistent keys
 */
function normalizeRawQuestion(raw) {
  if (!raw) return null;
  const obj = typeof raw.get === 'function' ? raw.get({ plain: true }) : { ...raw };

  const content = obj.content ?? obj.text ?? obj.question ?? obj.question_text ?? '';
  const choiceA = obj.choice_a ?? obj.choiceA ?? null;
  const choiceB = obj.choice_b ?? obj.choiceB ?? null;
  const choiceC = obj.choice_c ?? obj.choiceC ?? null;
  const choiceD = obj.choice_d ?? obj.choiceD ?? null;

  // build options array from available fields or from stored arrays (choices/options)
  let options = null;
  if (Array.isArray(obj.options) && obj.options.length) options = obj.options.slice();
  else if (Array.isArray(obj.choices) && obj.choices.length) options = obj.choices.slice();
  else options = [choiceA, choiceB, choiceC, choiceD];

  // filter out undefined/null but keep empty-string if present intentionally
  options = options
    .map(opt => (opt === undefined ? null : opt))
    .filter(opt => opt !== null && opt !== undefined);

  return {
    id: obj.id,
    content,
    // keep original choice fields (in case other code relies on them)
    choice_a: choiceA,
    choice_b: choiceB,
    choice_c: choiceC,
    choice_d: choiceD,
    options,
    time_limit: Number(obj.time_limit ?? obj.timeLimit ?? 15),
    points: Number(obj.points ?? obj.point ?? 1000),
    correct_answer: obj.correct_answer ?? obj.correctAnswer ?? null,
    metadata: obj.metadata ?? null,
    raw: obj
  };
}

/**
 * Format question for internal use (includes correctAnswer)
 * Note: client-facing function will remove correctAnswer.
 */
function formatQuestion(qnorm) {
  if (!qnorm) return null;
  return {
    id: qnorm.id,
    content: qnorm.content,
    options: qnorm.options,
    timeLimit: qnorm.time_limit,
    points: qnorm.points,
    correctAnswer: qnorm.correct_answer, // internal; don't send to client via getQuestionsForClient
    raw: qnorm.raw
  };
}

/**
 * Lấy toàn bộ questions của 1 question set (normalized, includes correctAnswer)
 * Nếu setId == null -> lấy tất cả
 */
export async function getQuestionsBySetId(setId) {
  try {
    let rows;
    if (setId === null || setId === undefined) {
      rows = await Question.findAll({ order: [['id', 'ASC']] });
    } else {
      rows = await Question.findAll({
        where: { question_set_id: setId },
        order: [['id', 'ASC']]
      });
    }
    return (rows || []).map(r => formatQuestion(normalizeRawQuestion(r)));
  } catch (err) {
    console.error('getQuestionsBySetId error:', err);
    throw err;
  }
}

/**
 * Trả về dữ liệu an toàn cho client (KHÔNG chứa correctAnswer).
 * Mỗi phần tử: { id, content, options, timeLimit, points }
 */
export async function getQuestionsForClient(setId) {
  const qs = await getQuestionsBySetId(setId);
  return qs.map(q => ({
    id: q.id,
    content: q.content,
    options: Array.isArray(q.options) ? q.options : [],
    timeLimit: Number(q.timeLimit ?? 15),
    points: Number(q.points ?? 1000)
  }));
}

/**
 * Lấy 1 question theo id (normalized, includes correctAnswer)
 */
export async function getQuestionById(id) {
  try {
    if (!id && id !== 0) return null;
    const q = await Question.findByPk(id);
    if (!q) return null;
    const norm = normalizeRawQuestion(q);
    return formatQuestion(norm);
  } catch (err) {
    console.error('getQuestionById error:', err);
    throw err;
  }
}

/**
 * Lấy set mặc định (Default Set) cùng questions (includes correctAnswer)
 * Trả về { set, questions }
 */
export async function getDefaultSet() {
  try {
    const set = await QuestionSet.findOne({ where: { name: 'Default Set' } });
    if (!set) return null;
    const setPlain = typeof set.get === 'function' ? set.get({ plain: true }) : { ...set };
    const questions = await getQuestionsBySetId(setPlain.id);
    return { set: setPlain, questions };
  } catch (err) {
    console.error('getDefaultSet error:', err);
    throw err;
  }
}

/**
 * Lấy tất cả question sets (id, name, count)
 */
export async function getAllSets() {
  try {
    const sets = await QuestionSet.findAll({ order: [['id', 'ASC']] });
    const out = [];
    for (const s of sets) {
      const sp = typeof s.get === 'function' ? s.get({ plain: true }) : s;
      const count = await Question.count({ where: { question_set_id: sp.id } });
      out.push({ id: sp.id, name: sp.name ?? `Set ${sp.id}`, count });
    }
    return out;
  } catch (err) {
    console.error('getAllSets error:', err);
    throw err;
  }
}

/**
 * Alias / convenience: trả về danh sách set (same as getAllSets).
 * Một số code/sockethandle mình thấy gọi getQuestionSets() hoặc getAllSets()
 */
export const getQuestionSets = getAllSets;

/**
 * Lấy một question set theo name (trả về plain object hoặc null)
 */
export async function getQuestionSetByName(name) {
  try {
    if (!name) return null;
    const s = await QuestionSet.findOne({ where: { name } });
    return s ? (typeof s.get === 'function' ? s.get({ plain: true }) : s) : null;
  } catch (err) {
    console.error('getQuestionSetByName error:', err);
    throw err;
  }
}

/**
 * Tạo question set mới
 */
export async function createQuestionSet({ name, userId, isPublic = 1 }) {
  try {
    const created = await QuestionSet.create({
      name,
      user_id: userId,
      is_public: isPublic
    });
    return typeof created.get === 'function' ? created.get({ plain: true }) : created;
  } catch (err) {
    console.error('createQuestionSet error:', err);
    throw err;
  }
}

/**
 * Thêm 1 câu hỏi vào set (trả về question được normalized - bao gồm correctAnswer)
 * data: { content, choice_a, choice_b, choice_c, choice_d, correct_answer, points, time_limit, metadata }
 */
export async function addQuestion(setId, data) {
  try {
    const created = await Question.create({
      question_set_id: setId,
      content: data.content,
      choice_a: data.choice_a,
      choice_b: data.choice_b,
      choice_c: data.choice_c,
      choice_d: data.choice_d,
      correct_answer: data.correct_answer,
      points: data.points ?? 1000,
      time_limit: data.time_limit ?? 30,
      metadata: data.metadata ?? null
    });
    const norm = normalizeRawQuestion(created);
    return formatQuestion(norm);
  } catch (err) {
    console.error('addQuestion error:', err);
    throw err;
  }
}

/**
 * Kiểm tra đáp án đúng:
 * - questionId: id câu hỏi
 * - answerIndex: có thể là number (0..3) hoặc 'A'/'B'/...
 * Trả về boolean
 */
export async function checkCorrectAnswer(questionId, answerIndex) {
  try {
    if (!questionId && questionId !== 0) return false;
    const q = await getQuestionById(questionId); // normalized (includes correctAnswer)
    if (!q) return false;

    const stored = q.correctAnswer;
    if (stored === undefined || stored === null) return false;

    // Normalize stored to index
    let correctIndex = null;
    const storedStr = String(stored).trim();
    if (/^\d+$/.test(storedStr)) {
      correctIndex = Number(storedStr);
    } else {
      const map = { A: 0, B: 1, C: 2, D: 3, a: 0, b: 1, c: 2, d: 3 };
      correctIndex = map[storedStr] ?? null;
    }

    // Normalize provided answerIndex
    let providedIndex = null;
    if (answerIndex === null || answerIndex === undefined) return false;
    if (typeof answerIndex === 'number') providedIndex = Number(answerIndex);
    else {
      const ai = String(answerIndex).trim();
      if (/^\d+$/.test(ai)) providedIndex = Number(ai);
      else {
        const map = { A: 0, B: 1, C: 2, D: 3, a: 0, b: 1, c: 2, d: 3 };
        providedIndex = map[ai] ?? null;
      }
    }

    if (correctIndex === null || providedIndex === null) return false;
    return Number(correctIndex) === Number(providedIndex);
  } catch (err) {
    console.error('checkCorrectAnswer error:', err);
    return false;
  }
}

/**
 * Xóa 1 câu hỏi
 */
export async function removeQuestion(id) {
  try {
    return await Question.destroy({ where: { id } });
  } catch (err) {
    console.error('removeQuestion error:', err);
    throw err;
  }
}


