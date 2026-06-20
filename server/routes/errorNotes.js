const express = require('express');
const pool = require('../db');
const router = express.Router();

/** Convert any date-ish value to MySQL DATETIME format */
function toMySQLDateTime(val) {
  if (!val) return null;
  const d = new Date(val);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

// GET /api/errors — 列表（支持筛选/搜索/排序）
router.get('/', async (req, res, next) => {
  try {
    const { subject, difficulty, tag, search, sortBy = 'created_at', sortOrder = 'desc' } = req.query;

    let sql = 'SELECT * FROM error_notes WHERE 1=1';
    const params = [];

    if (subject) {
      const subjects = subject.split(',');
      sql += ` AND subject IN (${subjects.map(() => '?').join(',')})`;
      params.push(...subjects);
    }
    if (difficulty) {
      const diffs = difficulty.split(',').map(Number);
      sql += ` AND difficulty IN (${diffs.map(() => '?').join(',')})`;
      params.push(...diffs);
    }
    if (tag) {
      const tags = tag.split(',');
      // JSON_CONTAINS 检查 tags 数组是否包含任一标签
      const tagConditions = tags.map(() => "JSON_CONTAINS(tags, ?)").join(' OR ');
      sql += ` AND (${tagConditions})`;
      tags.forEach((t) => params.push(JSON.stringify(t)));
    }
    if (search) {
      sql += ' AND (question LIKE ? OR answer LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    // 排序（白名单防注入）
    const allowedSort = ['created_at', 'updated_at', 'difficulty', 'review_count'];
    const col = allowedSort.includes(sortBy) ? sortBy : 'created_at';
    const dir = sortOrder === 'asc' ? 'ASC' : 'DESC';
    sql += ` ORDER BY ${col} ${dir}`;

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/errors/export
router.get('/export', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM error_notes');
    res.json({
      _format: 'JuYiDB/1',
      exportedAt: new Date().toISOString(),
      stores: { errorNotebook: rows },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/errors/import
router.post('/import', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { stores } = req.body;
    const items = stores?.errorNotebook || [];
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: '没有可导入的数据' });
    }

    await conn.beginTransaction();
    await conn.query('DELETE FROM error_notes');

    const sql = `INSERT INTO error_notes
      (id, subject, difficulty, question, answer, tags, source, created_at, updated_at, review_count, last_reviewed_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`;

    for (const item of items) {
      await conn.query(sql, [
        item.id, item.subject, item.difficulty,
        item.question || '', item.answer || '',
        JSON.stringify(item.tags || []),
        item.source || '',
        toMySQLDateTime(item.created_at || item.createdAt) || new Date(),
        toMySQLDateTime(item.updated_at || item.updatedAt) || new Date(),
        item.review_count || item.reviewCount || 0,
        toMySQLDateTime(item.last_reviewed_at || item.lastReviewedAt),
      ]);
    }

    await conn.commit();
    res.json({ ok: true, count: items.length });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

// GET /api/errors/:id
router.get('/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM error_notes WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: '未找到' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/errors
router.post('/', async (req, res, next) => {
  try {
    const { subject, difficulty, question, answer, tags, source } = req.body;
    const [result] = await pool.query(
      `INSERT INTO error_notes (subject, difficulty, question, answer, tags, source)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [subject, difficulty, question || '', answer || '', JSON.stringify(tags || []), source || '']
    );
    const [rows] = await pool.query('SELECT * FROM error_notes WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /api/errors/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { subject, difficulty, question, answer, tags, source, review_count, last_reviewed_at } = req.body;
    await pool.query(
      `UPDATE error_notes
       SET subject=?, difficulty=?, question=?, answer=?, tags=?, source=?,
           review_count=?, last_reviewed_at=?
       WHERE id=?`,
      [
        subject, difficulty, question || '', answer || '',
        JSON.stringify(tags || []), source || '',
        review_count || 0, last_reviewed_at || null,
        req.params.id,
      ]
    );
    const [rows] = await pool.query('SELECT * FROM error_notes WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: '未找到' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/errors/:id
router.delete('/:id', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM error_notes WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/errors/:id/review
router.post('/:id/review', async (req, res, next) => {
  try {
    await pool.query(
      'UPDATE error_notes SET review_count = review_count + 1, last_reviewed_at = NOW() WHERE id = ?',
      [req.params.id]
    );
    const [rows] = await pool.query('SELECT * FROM error_notes WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: '未找到' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;