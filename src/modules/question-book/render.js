/**
 * 做题本 — 渲染层
 * ==================
 * 所有 DOM / HTML 生成函数，纯函数风格，不依赖 app 实例。
 */

import { TYPE_LABELS, OPTIONS } from './db.js';

/* ---- 工具 ---- */

export function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function escAttr(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function fmtDate(ts) {
  const d = new Date(ts);
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

/* ---- 统计 ---- */

export function renderStats(books, compositeMode, selectedBooks) {
  const totalQ = books.reduce((s, b) => s + b.questionCount, 0);
  let h = `<div class="stats-panel__row"><span>做题本</span><strong>${books.length}</strong></div>`;
  h += `<div class="stats-panel__row"><span>总题数</span><strong>${totalQ}</strong></div>`;
  if (compositeMode) {
    h += `<div class="stats-panel__row"><span>已选</span><strong style="color:var(--jy-primary)">${selectedBooks.size}</strong></div>`;
  }
  return h;
}

/* ---- 题本卡片 ---- */

export function buildBookCard(book, answerCache, compositeMode, selectedBooks) {
  const info = getBookProgress(book, answerCache);
  const answered = info ? info.answered : 0;
  const total = book.questionCount;
  const score = info ? info.score : null;
  const hasScore = score !== null;

  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
  let progressHTML = '';
  if (total > 0) {
    progressHTML = `<div class="book-card__progress-bar"><div class="book-card__progress-fill" style="width:${pct}%"></div></div>`;
  }

  let statsHTML = '';
  if (hasScore) {
    const cls = score.rate >= 0.8 ? 'is-high' : (score.rate >= 0.6 ? 'is-mid' : 'is-low');
    statsHTML = `<div class="book-card__stats"><span class="book-card__stat">📋 ${total} 题</span><span class="book-card__stat book-card__stat--score ${cls}">🎯 ${Math.round(score.rate * 100)}%</span></div>`;
  }

  let notesHTML = '';
  if (book.notes) {
    const t = book.notes.length > 60 ? book.notes.slice(0, 60) + '...' : book.notes;
    notesHTML = `<div class="book-card__notes">${esc(t)}</div>`;
  }

  const scoreClass = hasScore ? ' book-card--has-score' : '';
  const compClass = compositeMode ? ' book-card--composite' : '';
  const checkedAttr = selectedBooks && selectedBooks.has(book.id) ? ' checked' : '';

  return `<div class="book-card${scoreClass}${compClass}" data-id="${book.id}">
    ${compositeMode ? `<input type="checkbox" class="book-card__check" data-book-id="${book.id}"${checkedAttr}>` : ''}
    <div class="book-card__actions"><button class="jy-btn jy-btn--icon edit-book-btn" data-id="${book.id}" title="编辑">✎</button></div>
    <div class="book-card__body">
      <div class="book-card__header"><span class="book-card__name" title="${esc(book.name)}">${esc(book.name)}</span><span class="book-card__type book-card__type--${book.type}">${TYPE_LABELS[book.type]}</span></div>
      <div class="book-card__meta"><span>📝 已答 ${answered}/${total}</span><span class="book-card__meta-divider">·</span><span>${fmtDate(book.createdAt)}</span></div>
      ${progressHTML}${statsHTML}${notesHTML}
    </div></div>`;
}

export function getBookProgress(book, answerCache) {
  const stored = answerCache && answerCache[book.id];
  if (!stored) return null;
  const answers = stored.answers || {};
  const subCounts = stored.subCounts || {};
  let totalSlots = 0, answeredSlots = 0;
  for (let i = 1; i <= book.questionCount; i++) {
    const sc = subCounts[i] || 1;
    for (let j = 1; j <= sc; j++) {
      totalSlots++;
      const key = sc > 1 ? (i + '.' + j) : i.toString();
      if (answers[key] && answers[key].trim()) answeredSlots++;
    }
  }
  const result = { answered: answeredSlots, total: book.questionCount, score: null };

  if (stored.correctAnswers && Object.keys(stored.correctAnswers).length > 0) {
    let correct = 0, wrong = 0;
    for (let i = 1; i <= book.questionCount; i++) {
      const sc = subCounts[i] || 1;
      for (let j = 1; j <= sc; j++) {
        const key = sc > 1 ? (i + '.' + j) : i.toString();
        const u = (answers[key] || '').trim();
        const c = (stored.correctAnswers[key] || '').trim();
        if (u && c) { if (u === c) correct++; else wrong++; }
      }
    }
    const checked = correct + wrong;
    if (checked > 0) result.score = { correct, wrong, rate: correct / checked, total: checked };
  } else if (book.type === 'open') {
    let correct = 0, wrong = 0;
    for (let i = 1; i <= book.questionCount; i++) {
      const sc = subCounts[i] || 1;
      for (let j = 1; j <= sc; j++) {
        const key = sc > 1 ? (i + '.' + j) : i.toString();
        const a = (answers[key] || '').trim();
        if (a) { if (a === '正确') correct++; else wrong++; }
      }
    }
    const checked = correct + wrong;
    if (checked > 0) result.score = { correct, wrong, rate: correct / checked, total: checked };
  }
  return result;
}

/* ---- 答题区 ---- */

export function renderQuestions(book, answerRecord) {
  const answers = answerRecord.answers || {};
  const subCounts = answerRecord.subCounts || {};
  const isChecked = isAnswerChecked(book, answerRecord);
  const correctAnswers = answerRecord.correctAnswers || {};
  let html = '';
  for (let i = 1; i <= book.questionCount; i++) {
    const sc = subCounts[i] || 1;
    if (sc <= 1) {
      html += renderSingleQuestion(i, i.toString(), answers, book, isChecked, correctAnswers, answerRecord);
    } else {
      for (let j = 1; j <= sc; j++) {
        html += renderSingleQuestion(i, i + '.' + j, answers, book, isChecked, correctAnswers, answerRecord, sc);
      }
    }
  }
  return html;
}

export function isAnswerChecked(book, answerRecord) {
  if (!answerRecord) return false;
  if (book.type === 'open') return Object.keys(answerRecord.answers || {}).length > 0;
  const ca = answerRecord.correctAnswers;
  return ca && Object.keys(ca).length > 0;
}

export function isAllAnswered(book, answerRecord) {
  const answers = answerRecord.answers || {};
  const subCounts = answerRecord.subCounts || {};
  for (let i = 1; i <= book.questionCount; i++) {
    const sc = subCounts[i] || 1;
    for (let j = 1; j <= sc; j++) {
      const key = sc > 1 ? (i + '.' + j) : i.toString();
      if (!answers[key] || !answers[key].trim()) return false;
    }
  }
  return book.questionCount > 0;
}

function renderSingleQuestion(mainNum, key, answers, book, isChecked, correctAnswers, answerRecord, subCount) {
  const val = (answers[key] || '').toString();
  let classes = val ? ' is-answered' : '';
  let checkClass = '', resultIcon = '', correctAnswerDisplay = '';

  if (isChecked && book.type === 'choice') {
    checkClass = ' is-checked';
    const userAns = val.trim();
    const correctAns = (correctAnswers[key] || '').trim();
    if (userAns && correctAns) {
      if (userAns === correctAns) { checkClass += ' is-correct'; resultIcon = ' ✓'; }
      else { checkClass += ' is-wrong'; resultIcon = ' ✗'; correctAnswerDisplay = `<span class="question-item__correct-answer">→ ${esc(correctAns)}</span>`; }
    }
  }

  let subActions = '';
  if (!isChecked && key.indexOf('.') === -1) {
    subActions = `<button class="sub-add-btn jy-btn jy-btn--icon" data-q="${mainNum}" title="增加小空">＋</button>`;
  }
  if (!isChecked && subCount && subCount > 1 && key === mainNum + '.' + subCount) {
    subActions = `<button class="sub-add-btn jy-btn jy-btn--icon" data-q="${mainNum}" title="增加小空">＋</button><button class="sub-remove-btn jy-btn jy-btn--icon" data-q="${mainNum}" title="移除末空">－</button>`;
  }

  const label = key.indexOf('.') > -1 ? key : key.toString();

  if (book.type === 'choice') {
    const marks = answerRecord.marks || {};
    const isMarked = marks[mainNum];
    const markClass = isMarked ? ' is-marked' : '';
    const optsHTML = OPTIONS.map(l => {
      const sel = val === l ? ' is-selected' : '';
      return `<button class="question-option${sel}" data-q="${key}" data-val="${l}">${l}</button>`;
    }).join('');
    return `<div class="question-item${classes}${checkClass}${markClass}" data-q="${mainNum}" data-key="${key}">
      <span class="question-item__num-badge">${label}${resultIcon}</span>
      <div class="question-options">${optsHTML}</div>${correctAnswerDisplay}
      <button class="mark-btn jy-btn jy-btn--ghost jy-btn--icon" data-mark="${mainNum}" title="${isMarked ? '取消标记' : '标记此题'}">${isMarked ? '⭐' : '☆'}</button>
      ${subActions}</div>`;
  }

  const marks = answerRecord.marks || {};
  const isMarked = marks[mainNum];
  const markClass = isMarked ? ' is-marked' : '';
  const selCorrect = val === '正确' ? ' is-selected is-correct-btn' : '';
  const selWrong = val === '错误' ? ' is-selected is-wrong-btn' : '';
  return `<div class="question-item${classes}${markClass}" data-q="${mainNum}" data-key="${key}">
    <span class="question-item__num-badge">${label}</span>
    <div class="question-options">
      <button class="question-option${selCorrect}" data-q="${key}" data-val="正确">✓</button>
      <button class="question-option${selWrong}" data-q="${key}" data-val="错误">✗</button>
    </div>
    <button class="mark-btn jy-btn jy-btn--ghost jy-btn--icon" data-mark="${mainNum}" title="${isMarked ? '取消标记' : '标记此题'}">${isMarked ? '⭐' : '☆'}</button>
  </div>`;
}

/* ---- 汇总面板 ---- */

export function renderSummary(book, answerRecord, isCheckedResult) {
  const answers = answerRecord.answers || {};
  return book.type === 'choice'
    ? renderChoiceSummary(book, answerRecord, answers)
    : renderTextSummary(book, answerRecord, answers);
}

function renderChoiceSummary(book, answerRecord, answers) {
  const subCounts = answerRecord.subCounts || {};
  let html = '';
  for (let start = 1; start <= book.questionCount; start += 5) {
    const end = Math.min(start + 4, book.questionCount);
    let groupStr = '';
    for (let i = start; i <= end; i++) {
      const sc = subCounts[i] || 1;
      if (sc <= 1) {
        const a = answers[i];
        groupStr += (a && a.trim()) ? `<strong>${esc(a)}</strong>` : '<span class="summary__filler">_</span>';
      } else {
        const parts = [];
        for (let j = 1; j <= sc; j++) {
          const a = answers[i + '.' + j];
          parts.push((a && a.trim()) ? `<strong>${esc(a)}</strong>` : '<span class="summary__filler">_</span>');
        }
        groupStr += parts.join('<span style="color:var(--jy-text-muted)">/</span>');
      }
    }
    html += `<div class="summary__group">${start}-${end}: ${groupStr}</div>`;
  }
  return html;
}

function renderTextSummary(book, answerRecord, answers) {
  const answered = Object.values(answers).filter(v => v && v.trim()).length;
  let html = `<div class="summary__stat">已答 <strong>${answered}</strong> / ${book.questionCount} 题</div>`;
  if (answered > 0) {
    html += '<div class="summary__text-list" style="margin-top:var(--jy-space-3)">';
    for (let i = 1; i <= book.questionCount; i++) {
      const val = answers[i];
      if (val && val.trim()) {
        html += `<div class="summary__text-item"><strong>#${i}</strong> ${esc(val.length > 80 ? val.slice(0, 80) + '...' : val)}</div>`;
      }
    }
    html += '</div>';
  }
  return html;
}

/* ---- 核对结果 ---- */

export function renderCheckSection(book, answerRecord) {
  const stats = getCheckStats(book, answerRecord);
  if (!stats) return '';

  const ratePct = Math.round(stats.rate * 100);
  const cls = stats.rate >= 0.8 ? '--high' : (stats.rate >= 0.6 ? '--mid' : '--low');

  let html = `<div class="score-display">
    <div class="score-display__value score-display__value${cls}">${ratePct}%</div>
    <div class="score-display__label">正确率（${stats.correct}/${stats.total}）</div>
    <div class="progress-bar" style="margin-top:var(--jy-space-3)">
      <div class="progress-bar__fill progress-bar__fill${cls}" style="width:${ratePct}%"></div></div></div>`;

  if (book.type === 'choice') {
    html += `<div class="check-stat-row">
      <div class="check-stat-row__item"><div class="check-stat-row__value check-stat-row__value--correct">${stats.correct}</div><div class="check-stat-row__label">✓</div></div>
      <div class="check-stat-row__item"><div class="check-stat-row__value check-stat-row__value--wrong">${stats.wrong}</div><div class="check-stat-row__label">✗</div></div>
      <div class="check-stat-row__item"><div class="check-stat-row__value">${stats.total}</div><div class="check-stat-row__label">已核对</div></div></div>`;

    if (stats.wrong === 0 && stats.correct > 0) {
      html += `<div class="perfect-badge">🎉 全部正确！</div>`;
    } else if (stats.wrongNums && stats.wrongNums.length) {
      html += `<div style="margin-top:var(--jy-space-3)"><div style="font-size:var(--jy-font-size-sm);color:var(--jy-text-muted);margin-bottom:var(--jy-space-1)">❌ 错题序号</div><div class="wrong-list">${stats.wrongNums.map(n => `<span class="wrong-tag">#${n}</span>`).join('')}</div></div>`;
    }
  } else if (stats.wrongNums && stats.wrongNums.length) {
    html += `<div style="margin-top:var(--jy-space-3);font-size:var(--jy-font-size-sm);color:var(--jy-text-secondary)">❌ 错题：${stats.wrongNums.join('、')}</div>`;
  }

  return html;
}

export function getCheckStats(book, answerRecord) {
  if (!book || !answerRecord) return null;
  const answers = answerRecord.answers || {};
  if (book.type === 'open') {
    const subCounts = answerRecord.subCounts || {};
    let correct = 0, total = 0;
    const wrongNums = [];
    for (let i = 1; i <= book.questionCount; i++) {
      const sc = subCounts[i] || 1;
      for (let j = 1; j <= sc; j++) {
        const key = sc > 1 ? (i + '.' + j) : i.toString();
        const ans = (answers[key] || '').trim();
        if (ans) { total++; if (ans === '正确') correct++; else wrongNums.push(sc > 1 ? key : i); }
      }
    }
    return total > 0 ? { correct, wrong: total - correct, rate: correct / total, total, wrongNums } : null;
  }
  const correctAnswers = answerRecord.correctAnswers || {};
  const subCounts = answerRecord.subCounts || {};
  let correct = 0, wrong = 0;
  const wrongNums = [];
  for (let i = 1; i <= book.questionCount; i++) {
    const sc = subCounts[i] || 1;
    for (let j = 1; j <= sc; j++) {
      const key = sc > 1 ? (i + '.' + j) : i.toString();
      const u = (answers[key] || '').trim();
      const c = (correctAnswers[key] || '').trim();
      if (u && c) { if (u === c) correct++; else { wrong++; wrongNums.push(sc > 1 ? key : i); } }
    }
  }
  const total = correct + wrong;
  return total > 0 ? { correct, wrong, rate: correct / total, total, wrongNums } : null;
}

/* ---- 核对弹窗 ---- */

export function renderCheckModal(book, answerRecord) {
  const existingCorrect = answerRecord.correctAnswers || {};
  const subCounts = answerRecord.subCounts || {};
  let html = '';
  for (let i = 1; i <= book.questionCount; i++) {
    const sc = subCounts[i] || 1;
    if (sc <= 1) {
      const pre = existingCorrect[i] || '';
      html += buildCheckRow(i.toString(), pre);
    } else {
      for (let j = 1; j <= sc; j++) {
        const key = i + '.' + j;
        const pre = existingCorrect[key] || '';
        html += buildCheckRow(key, pre);
      }
    }
  }
  return html;
}

function buildCheckRow(key, preSelected) {
  const optsHTML = OPTIONS.map(l => {
    const sel = preSelected === l ? ' is-selected' : '';
    return `<button class="question-option${sel}" data-q="${key}" data-val="${l}">${l}</button>`;
  }).join('');
  return `<div class="correct-answer-row" data-q="${key}"><div class="correct-answer-row__num">${key}</div><div class="question-options">${optsHTML}</div></div>`;
}

/* ---- 复合统计 ---- */

export function renderCompositeStats(answerCache, selectedBooks, books) {
  let totalQ = 0, totalCorrect = 0, totalWrong = 0;
  const details = [];
  selectedBooks.forEach(id => {
    const book = books.find(b => b.id === id);
    if (!book) return;
    const stored = answerCache && answerCache[book.id];
    const answers = stored ? (stored.answers || {}) : {};
    const subCounts = stored ? (stored.subCounts || {}) : {};
    let correct = 0, wrong = 0, total = 0;
    for (let i = 1; i <= book.questionCount; i++) {
      const sc = subCounts[i] || 1;
      for (let j = 1; j <= sc; j++) {
        const key = sc > 1 ? (i + '.' + j) : i.toString();
        const ans = (answers[key] || '').trim();
        if (ans) {
          total++;
          if (book.type === 'choice') {
            const c = stored.correctAnswers ? (stored.correctAnswers[key] || '').trim() : '';
            if (c === ans) correct++; else wrong++;
          } else { if (ans === '正确') correct++; else wrong++; }
        }
      }
    }
    totalQ += total; totalCorrect += correct; totalWrong += wrong;
    if (total > 0) details.push({ name: book.name, total, correct, rate: correct / total });
  });

  if (totalQ === 0) return { empty: true };

  const overallRate = totalCorrect / totalQ;
  const cls = overallRate >= 0.8 ? '--high' : (overallRate >= 0.6 ? '--mid' : '--low');

  let html = `<div style="text-align:center;padding:var(--jy-space-4)">
    <div class="score-display">
      <div class="score-display__value score-display__value${cls}">${Math.round(overallRate * 100)}%</div>
      <div class="score-display__label">综合正确率（${totalCorrect}/${totalQ}）</div>
      <div class="progress-bar" style="margin-top:var(--jy-space-3)">
        <div class="progress-bar__fill progress-bar__fill${cls}" style="width:${Math.round(overallRate * 100)}%"></div></div></div>`;

  html += `<div style="margin-top:var(--jy-space-4)"><table style="width:100%;font-size:var(--jy-font-size-sm)"><thead><tr><th>做题本</th><th>已答</th><th>正确率</th></tr></thead><tbody>`;
  details.sort((a, b) => b.rate - a.rate);
  details.forEach(d => {
    const dc = d.rate >= 0.8 ? 'is-high' : (d.rate >= 0.6 ? 'is-mid' : 'is-low');
    html += `<tr><td>${esc(d.name)}</td><td>${d.correct}/${d.total}</td><td><span class="book-card__stat--score ${dc}" style="font-size:var(--jy-font-size-xs)">${Math.round(d.rate * 100)}%</span></td></tr>`;
  });
  html += '</tbody></table></div>';

  return { empty: false, html, rate: overallRate, correct: totalCorrect, total: totalQ };
}

/* ---- 进度工具条 ---- */

export function getAnswerProgress(book, answerRecord) {
  const answers = answerRecord.answers || {};
  const subCounts = answerRecord.subCounts || {};
  let totalSlots = 0, answeredSlots = 0;
  for (let i = 1; i <= book.questionCount; i++) {
    const sc = subCounts[i] || 1;
    for (let j = 1; j <= sc; j++) {
      totalSlots++;
      const key = sc > 1 ? (i + '.' + j) : i.toString();
      if (answers[key] && answers[key].trim()) answeredSlots++;
    }
  }
  return { answeredSlots, totalSlots };
}
