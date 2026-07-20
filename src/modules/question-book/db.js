/**
 * 做题本 — 数据库层
 * ==================
 * IndexedDB 相关的常量、缓存加载、持久化逻辑。
 * 依赖 shared/db-core.js（全局 JuYiDB）。
 */

export const DB_NAME = 'JuYiQuestionBook';
export const DB_VERSION = 1;
export const STORE_BOOKS = 'questionBooks';
export const STORE_ANSWERS = 'questionAnswers';

export const TYPE_LABELS = { choice: '选择题', open: '非选择题' };
export const OPTIONS = ['A', 'B', 'C', 'D'];

/**
 * 打开数据库（schema 定义 + 升级）
 * @param {JuYiDB} db
 * @returns {Promise<void>}
 */
export async function openDB(db) {
  await db.open(DB_NAME, DB_VERSION, {
    [STORE_BOOKS]: { keyPath: 'id', autoIncrement: true, indexes: [] },
    [STORE_ANSWERS]: {
      keyPath: 'id',
      autoIncrement: true,
      indexes: [{ name: 'bookId', keyPath: 'bookId', unique: true }],
    },
  });
}

/** 加载全部做题本 */
export async function loadBooks(db) {
  return db.getAll(STORE_BOOKS);
}

/** 加载全部答案记录到内存 cache */
export async function loadAnswerCache(db) {
  const cache = {};
  const all = await db.getAll(STORE_ANSWERS);
  for (const rec of all) cache[rec.bookId] = rec;
  return cache;
}

/** 按 bookId 查找答案记录 */
export async function getAnswerRecord(db, bookId) {
  return db.getByIndex(STORE_ANSWERS, 'bookId', bookId);
}

/** 创建/更新做题本 */
export async function saveBook(db, existing, data) {
  if (existing) {
    existing.name = data.name;
    existing.notes = data.notes;
    await db.put(STORE_BOOKS, existing);
    return existing;
  }
  const book = {
    name: data.name,
    type: data.type,
    questionCount: data.qCount,
    notes: data.notes,
    createdAt: Date.now(),
  };
  const newId = await db.add(STORE_BOOKS, book);
  await db.add(STORE_ANSWERS, { bookId: newId, answers: {}, updatedAt: Date.now() });
  return book;
}

/** 删除做题本及其答案 */
export async function deleteBook(db, bookId) {
  const answerRec = await db.getByIndex(STORE_ANSWERS, 'bookId', bookId);
  if (answerRec) await db.delete(STORE_ANSWERS, answerRec.id);
  await db.delete(STORE_BOOKS, bookId);
}

/** 持久化当前答案记录 */
export async function persistAnswers(db, record) {
  if (!record) return;
  record.updatedAt = Date.now();
  try {
    if (record.id) {
      await db.put(STORE_ANSWERS, record);
    } else {
      const id = await db.add(STORE_ANSWERS, record);
      record.id = id;
    }
  } catch (_) { /* silent */ }
}
