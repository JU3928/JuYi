/**
 * 做题本 — 应用层（状态 + 事件 + 编排）
 * ======================================
 * 从 db.js 导入数据操作，从 render.js 导入界面渲染。
 */

import {
  DB_NAME, DB_VERSION, STORE_BOOKS, STORE_ANSWERS,
  openDB, loadBooks, loadAnswerCache, getAnswerRecord,
  saveBook, deleteBook, persistAnswers,
} from './db.js';

import {
  esc, escAttr, fmtDate,
  renderStats, buildBookCard, getBookProgress,
  renderQuestions, renderSummary, renderCheckSection,
  isAnswerChecked, isAllAnswered, getCheckStats,
  renderCheckModal, renderCompositeStats, getAnswerProgress,
} from './render.js';

const LS_THEME = 'jy_theme';

export class QuestionBookApp {
  constructor() {
    this.db = new JuYiDB(); // global from shared/db-core.js
    this.books = [];
    this.view = 'list';
    this.activeBook = null;
    this.currentAnswerRecord = null;
    this.editingBookId = null;
    this.pendingDeleteBookId = null;
    this._saveTimer = null;
    this._answerCache = {};
    this.compositeMode = false;
    this.selectedBooks = new Set();
    window._qb = this;
  }

  /* ---- lifecycle ---- */
  async init() {
    this._restoreTheme();
    this._cacheDom();
    this._bindEvents();
    await openDB(this.db);
    this.books = await loadBooks(this.db);
    this._answerCache = await loadAnswerCache(this.db);
    this._renderAll();
  }

  _restoreTheme() {
    if (localStorage.getItem(LS_THEME) === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  }

  _cacheDom() {
    const q = (s) => document.querySelector(s);
    this.els = {
      sidebar: q('#sidebar'), btnToggleSidebar: q('#btnToggleSidebar'),
      btnOpenSidebar: q('#btnOpenSidebar'), btnToggleTheme: q('#btnToggleTheme'),
      statsPanel: q('#statsPanel'), listView: q('#listView'),
      bookList: q('#bookList'), emptyState: q('#emptyState'), btnAdd: q('#btnAdd'),
      answerView: q('#answerView'), answerBookTitle: q('#answerBookTitle'),
      answerProgress: q('#answerProgress'), answerScoreBadge: q('#answerScoreBadge'),
      btnBackToList: q('#btnBackToList'), btnEditBookFromAnswer: q('#btnEditBookFromAnswer'),
      questionList: q('#questionList'), summaryPanel: q('#summaryPanel'),
      summaryContent: q('#summaryContent'), checkSection: q('#checkSection'),
      checkResults: q('#checkResults'), checkHint: q('#checkHint'),
      checkHintText: q('#checkHintText'), btnOpenCheck: q('#btnOpenCheck'),
      btnRecheck: q('#btnRecheck'), btnCopyAnswers: q('#btnCopyAnswers'),
      copyFeedback: q('#copyFeedback'), editBookOverlay: q('#editBookOverlay'),
      editBookModalTitle: q('#editBookModalTitle'), editBookForm: q('#editBookForm'),
      editBookName: q('#editBookName'), editBookType: q('#editBookType'),
      editBookQCount: q('#editBookQCount'), editBookNotes: q('#editBookNotes'),
      editBookId: q('#editBookId'), qcountHint: q('#qcountHint'),
      btnSaveBook: q('#btnSaveBook'), confirmDeleteOverlay: q('#confirmDeleteOverlay'),
      confirmDeleteMsg: q('#confirmDeleteMsg'), btnConfirmDelete: q('#btnConfirmDelete'),
      checkAnswersOverlay: q('#checkAnswersOverlay'), correctAnswersList: q('#correctAnswersList'),
      btnRunCheck: q('#btnRunCheck'), btnComposite: q('#btnComposite'),
      compositeBar: q('#compositeBar'), btnCompositeRun: q('#btnCompositeRun'),
      btnCompositeCancel: q('#btnCompositeCancel'), groupChips: q('#groupChips'),
      mainChips: q('#mainChips'), compositeOverlay: q('#compositeOverlay'),
      compositeBody: q('#compositeBody'),
    };
  }

  _bindEvents() {
    const E = this.els;
    E.btnToggleSidebar.addEventListener('click', () => this._toggleSidebar());
    E.btnOpenSidebar.addEventListener('click', () => this._openSidebar());
    E.btnToggleTheme.addEventListener('click', () => this._toggleTheme());
    E.btnAdd.addEventListener('click', () => this._openEditBookModal(null));
    E.bookList.addEventListener('click', (e) => this._onBookListClick(e));
    E.bookList.addEventListener('contextmenu', (e) => this._onBookListContextMenu(e));
    E.btnSaveBook.addEventListener('click', () => this._onSaveBook());
    E.btnConfirmDelete.addEventListener('click', () => this._confirmDeleteBook());
    document.querySelectorAll('.modal-close-btn').forEach(b =>
      b.addEventListener('click', () => this._closeAllOverlays()));
    document.querySelectorAll('.jy-overlay').forEach(ov =>
      ov.addEventListener('click', (e) => { if (e.target === ov) this._closeAllOverlays(); }));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this._closeAllOverlays(); });
    E.btnBackToList.addEventListener('click', () => this._backToList());
    E.btnEditBookFromAnswer.addEventListener('click', () => {
      if (this.activeBook) this._openEditBookModal(this.activeBook); });
    E.questionList.addEventListener('click', (e) => this._onQuestionClick(e));
    E.btnCopyAnswers.addEventListener('click', () => this._copyAnswers());
    E.btnOpenCheck.addEventListener('click', () => this._openCheckModal());
    E.btnRecheck.addEventListener('click', () => this._openCheckModal());
    E.btnRunCheck.addEventListener('click', () => this._onRunCheck());
    E.btnComposite.addEventListener('click', () => this._enterCompositeMode());
    E.btnCompositeRun.addEventListener('click', () => this._showCompositeStats());
    E.btnCompositeCancel.addEventListener('click', () => this._exitCompositeMode());
    window.addEventListener('beforeunload', () => persistAnswers(this.db, this.currentAnswerRecord));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) persistAnswers(this.db, this.currentAnswerRecord); });
  }

  /* ---- sidebar ---- */
  _toggleSidebar() { this.els.sidebar.classList.toggle('is-collapsed'); }
  _openSidebar() { this.els.sidebar.classList.remove('is-collapsed'); }
  _toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(LS_THEME, next);
    this.els.btnToggleTheme.innerHTML = next === 'dark' ? '☀️ 亮色模式' : '🌙 暗色模式';
  }

  _openOverlay(ov) { ov.classList.add('is-open'); document.body.style.overflow = 'hidden'; }
  _closeAllOverlays() {
    document.querySelectorAll('.jy-overlay').forEach(ov => ov.classList.remove('is-open'));
    document.body.style.overflow = '';
  }

  /* ---- render orchestration ---- */
  _renderAll() {
    this._updateThemeButton();
    if (this.view === 'list') { this._renderBookList(); this._renderStats(); }
    else this._renderAnswerPage();
  }
  _updateThemeButton() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    this.els.btnToggleTheme.innerHTML = isDark ? '☀️ 亮色模式' : '🌙 暗色模式';
  }

  _renderStats() {
    this.els.statsPanel.innerHTML = renderStats(this.books, this.compositeMode, this.selectedBooks);
  }

  _renderBookList() {
    if (this.books.length === 0) {
      this.els.bookList.style.display = 'none'; this.els.emptyState.style.display = ''; return;
    }
    this.els.bookList.style.display = ''; this.els.emptyState.style.display = 'none';
    this.els.bookList.innerHTML = this.books.map(b =>
      buildBookCard(b, this._answerCache, this.compositeMode, this.selectedBooks)).join('');
  }

  /* ---- composite stats ---- */
  _enterCompositeMode() {
    this.compositeMode = true; this.selectedBooks.clear();
    this.els.btnComposite.style.display = 'none'; this.els.compositeBar.style.display = '';
    this._renderDetectedGroups(); this._renderBookList(); this._renderStats();
  }
  _exitCompositeMode() {
    this.compositeMode = false; this.selectedBooks.clear();
    this.els.btnComposite.style.display = ''; this.els.compositeBar.style.display = 'none';
    this.els.groupChips.style.display = 'none'; this.els.mainChips.style.display = 'none';
    this._renderBookList(); this._renderStats();
  }

  _renderDetectedGroups() {
    const groups = this._detectGroups();
    if (!groups.length) { this.els.groupChips.style.display = 'none'; return; }
    this.els.groupChips.style.display = 'block';
    const subjects = groups.filter(g => g.level === 'subject');
    const bookLevel = groups.filter(g => g.level === 'book');
    let html = '';
    if (subjects.length) {
      html += '<div style="margin-bottom:4px"><span style="font-size:10px;color:var(--jy-text-muted)">学科：</span>';
      subjects.forEach((g, i) => {
        html += `<label class="filter-chip group-chip" style="cursor:pointer"><input type="checkbox" id="chip_${i}" class="group-check" style="margin-right:3px;accent-color:var(--jy-primary);vertical-align:middle">${g.label} (${g.ids.length})</label>`;
      });
      html += '</div>';
    }
    if (bookLevel.length) {
      const byParent = {};
      bookLevel.forEach(b => { const p = b.parent || '_'; if (!byParent[p]) byParent[p] = []; byParent[p].push(b); });
      let offset = subjects.length;
      Object.keys(byParent).forEach(parent => {
        const items = byParent[parent];
        html += `<div style="margin-bottom:4px"><span style="font-size:10px;color:var(--jy-text-muted)">${parent === '_' ? '' : parent}：</span>`;
        items.forEach((b, bi) => {
          const idx = offset + bi;
          html += `<label class="filter-chip group-chip" style="cursor:pointer"><input type="checkbox" id="chip_${idx}" class="group-check" style="margin-right:3px;accent-color:var(--jy-primary);vertical-align:middle">${b.label} (${b.ids.length})</label>`;
        });
        html += '</div>';
        offset += items.length;
      });
    }
    this.els.groupChips.innerHTML = html;
    const self = this;
    const applyGroup = (gi) => {
      const cb = document.getElementById('chip_' + gi);
      if (!cb) return;
      const ids = groups[gi].ids;
      if (cb.checked) ids.forEach(id => self.selectedBooks.add(id));
      else ids.forEach(id => self.selectedBooks.delete(id));
      self.els.bookList.querySelectorAll('.book-card__check').forEach(ck => {
        ck.checked = self.selectedBooks.has(parseInt(ck.dataset.bookId, 10)); });
      self._renderStats();
    };
    window._qbApplyGroup = applyGroup;
    groups.forEach((_, gi) => {
      const cb = document.getElementById('chip_' + gi);
      if (!cb) return;
      cb.onclick = () => setTimeout(() => applyGroup(gi), 0);
      cb.onchange = () => applyGroup(gi);
    });
  }

  _detectGroups() {
    const books = this.books;
    if (books.length < 2) return [];
    const roots = books.map(b => {
      const stripped = b.name.replace(/\d+\.\d+$/g, '').replace(/[（(]\d+[)）]$/g, '').trim();
      return { id: b.id, root: stripped };
    });
    const prefixMap = {};
    roots.forEach(r => {
      const m = r.root.match(/^([^\d]+)/);
      if (m && m[1].length >= 1) { if (!prefixMap[m[1]]) prefixMap[m[1]] = []; prefixMap[m[1]].push(r.id); }
    });
    const groups = [];
    Object.keys(prefixMap).forEach(pref => {
      if (prefixMap[pref].length >= 2) groups.push({ key: 's_' + pref, label: pref, ids: prefixMap[pref].slice(), level: 'subject' });
    });
    Object.keys(prefixMap).forEach(pref => {
      const rootsWithPref = roots.filter(r => r.root.indexOf(pref) === 0 && r.root.length > pref.length);
      const suffixes = [];
      rootsWithPref.forEach(r => { const suf = r.root.slice(pref.length); if (suf && suffixes.indexOf(suf) === -1) suffixes.push(suf); });
      suffixes.forEach(suf => {
        const ids = roots.filter(r => r.root === pref + suf).map(r => r.id);
        if (ids.length >= 1) groups.push({ key: 'b_' + pref + suf, label: suf, ids: ids.slice(), level: 'book', parent: pref });
      });
    });
    return groups;
  }

  _showCompositeStats() {
    if (this.selectedBooks.size < 1) { alert('请至少选择 1 个做题本'); return; }
    const result = renderCompositeStats(this._answerCache, this.selectedBooks, this.books);
    if (result.empty) { alert('选中做题本暂无可统计的答题记录'); return; }
    this.els.compositeBody.innerHTML = result.html;
    this._openOverlay(this.els.compositeOverlay);
  }

  /* ---- book CRUD ---- */
  _openEditBookModal(book) {
    this.editingBookId = book ? book.id : null;
    this.els.editBookModalTitle.textContent = book ? '编辑做题本' : '新建做题本';
    this.els.editBookName.value = book ? book.name : '';
    this.els.editBookType.value = book ? book.type : 'choice';
    this.els.editBookQCount.value = book ? book.questionCount : '';
    this.els.editBookNotes.value = book ? (book.notes || '') : '';
    this.els.editBookId.value = book ? book.id : '';
    this.els.editBookType.disabled = !!book;
    this.els.editBookQCount.disabled = !!book;
    this.els.qcountHint.style.display = book ? 'none' : '';
    this._openOverlay(this.els.editBookOverlay);
    if (!book) setTimeout(() => this.els.editBookName.focus(), 150);
  }

  async _onSaveBook() {
    const name = this.els.editBookName.value.trim();
    const type = this.els.editBookType.value;
    const qCount = parseInt(this.els.editBookQCount.value, 10);
    const notes = this.els.editBookNotes.value.trim();
    const id = this.els.editBookId.value;
    if (!name) { alert('请输入做题本名称'); return; }
    if (!qCount || qCount < 1 || qCount > 500) { alert('请输入有效的题目数量（1-500）'); return; }
    const existing = id ? await this.db.get(STORE_BOOKS, parseInt(id, 10)) : null;
    if (id && !existing) { alert('做题本不存在'); return; }
    await saveBook(this.db, existing, { name, type, qCount, notes });
    this._closeAllOverlays();
    this.books = await loadBooks(this.db);
    this._answerCache = await loadAnswerCache(this.db);
    if (this.view === 'answer' && this.activeBook) {
      const updated = this.books.find(b => b.id === this.activeBook.id);
      if (updated) { this.activeBook = updated; this.els.answerBookTitle.textContent = updated.name; }
    }
    this._renderAll();
  }

  /* ---- delete ---- */
  _onBookListContextMenu(e) {
    const card = e.target.closest('.book-card');
    if (!card) return; e.preventDefault();
    const bookId = parseInt(card.dataset.id, 10);
    const book = this.books.find(b => b.id === bookId);
    if (!book) return;
    this.pendingDeleteBookId = bookId;
    this.els.confirmDeleteMsg.textContent = `确定删除「${book.name}」？题目答案也会一并删除。`;
    this._openOverlay(this.els.confirmDeleteOverlay);
  }
  async _confirmDeleteBook() {
    if (!this.pendingDeleteBookId) return;
    await deleteBook(this.db, this.pendingDeleteBookId);
    this.pendingDeleteBookId = null;
    this._closeAllOverlays();
    this.books = await loadBooks(this.db);
    this._answerCache = await loadAnswerCache(this.db);
    this._renderAll();
  }

  _onBookListClick(e) {
    if (this.compositeMode && e.target.classList.contains('book-card__check')) {
      const bookId = parseInt(e.target.dataset.bookId, 10);
      if (e.target.checked) this.selectedBooks.add(bookId);
      else this.selectedBooks.delete(bookId);
      this._renderStats(); return;
    }
    if (this.compositeMode) return;
    const editBtn = e.target.closest('.edit-book-btn');
    if (editBtn) {
      e.stopPropagation();
      const book = this.books.find(b => b.id === parseInt(editBtn.dataset.id, 10));
      if (book) this._openEditBookModal(book); return;
    }
    const card = e.target.closest('.book-card');
    if (!card) return;
    const book = this.books.find(b => b.id === parseInt(card.dataset.id, 10));
    if (book) this._enterAnswerPage(book);
  }

  /* ---- answer view ---- */
  async _enterAnswerPage(book) {
    this.activeBook = book; this.view = 'answer';
    const rec = await getAnswerRecord(this.db, book.id);
    this.currentAnswerRecord = rec || { bookId: book.id, answers: {}, updatedAt: Date.now() };
    if (!this.currentAnswerRecord.subCounts) this.currentAnswerRecord.subCounts = {};
    if (!this.currentAnswerRecord.marks) this.currentAnswerRecord.marks = {};
    this.els.listView.style.display = 'none'; this.els.emptyState.style.display = 'none';
    this.els.answerView.style.display = ''; this.els.answerBookTitle.textContent = book.name;
    this._renderAnswerPage();
  }
  _renderAnswerPage() {
    this._renderQuestions();
    this.els.summaryContent.innerHTML = renderSummary(this.activeBook, this.currentAnswerRecord);
    this._renderCheckSection();
    this._updateAnswerToolbar();
    this._updateCheckButtons();
  }

  _renderQuestions() {
    this.els.questionList.innerHTML = renderQuestions(this.activeBook, this.currentAnswerRecord);
  }

  _updateAnswerToolbar() {
    const { answeredSlots, totalSlots } = getAnswerProgress(this.activeBook, this.currentAnswerRecord);
    this.els.answerProgress.textContent = answeredSlots + '/' + totalSlots + ' 已答';
    if (isAnswerChecked(this.activeBook, this.currentAnswerRecord)) {
      const stats = getCheckStats(this.activeBook, this.currentAnswerRecord);
      if (stats) {
        const cls = stats.rate >= 0.8 ? 'is-high' : (stats.rate >= 0.6 ? 'is-mid' : 'is-low');
        this.els.answerScoreBadge.style.display = '';
        this.els.answerScoreBadge.textContent = '🎯 ' + Math.round(stats.rate * 100) + '%';
        this.els.answerScoreBadge.className = 'answer-toolbar__score book-card__stat--score ' + cls;
        return;
      }
    }
    this.els.answerScoreBadge.style.display = 'none';
  }

  _renderCheckSection() {
    const html = renderCheckSection(this.activeBook, this.currentAnswerRecord);
    if (html) { this.els.checkSection.style.display = ''; this.els.checkResults.innerHTML = html; }
    else this.els.checkSection.style.display = 'none';
  }

  _updateCheckButtons() {
    const isChecked = isAnswerChecked(this.activeBook, this.currentAnswerRecord);
    if (this.activeBook.type !== 'choice') {
      this.els.btnOpenCheck.style.display = 'none';
      this.els.btnRecheck.style.display = 'none';
      this.els.checkHint.style.display = 'none';
      return;
    }
    if (isChecked) {
      this.els.btnOpenCheck.style.display = 'none';
      this.els.btnRecheck.style.display = '';
      this.els.checkHint.style.display = 'none';
    } else if (isAllAnswered(this.activeBook, this.currentAnswerRecord)) {
      this.els.btnOpenCheck.style.display = '';
      this.els.btnRecheck.style.display = 'none';
      this.els.checkHint.style.display = 'none';
    } else {
      this.els.btnOpenCheck.style.display = 'none';
      this.els.btnRecheck.style.display = 'none';
      this.els.checkHint.style.display = '';
      const { answeredSlots, totalSlots } = getAnswerProgress(this.activeBook, this.currentAnswerRecord);
      this.els.checkHintText.textContent = `还有 ${totalSlots - answeredSlots} 个空未答，完成所有题目后可录入正确答案`;
    }
  }

  /* ---- question interactions ---- */
  _onQuestionClick(e) {
    const markBtn = e.target.closest('.mark-btn');
    if (markBtn) { e.stopPropagation(); this._toggleMark(parseInt(markBtn.dataset.mark)); return; }
    const subAdd = e.target.closest('.sub-add-btn');
    if (subAdd) { e.stopPropagation(); this._addSubQuestion(parseInt(subAdd.dataset.q)); return; }
    const subRemove = e.target.closest('.sub-remove-btn');
    if (subRemove) { e.stopPropagation(); this._removeSubQuestion(parseInt(subRemove.dataset.q)); return; }
    const btn = e.target.closest('.question-option');
    if (!btn) return;
    if (isAnswerChecked(this.activeBook, this.currentAnswerRecord) && this.activeBook.type === 'choice') {
      alert('已核对完成。如需修改答案，请先点击「重新核对」并重新录入正确答案。'); return;
    }
    const qNum = btn.dataset.q;
    this.currentAnswerRecord.answers[qNum] = btn.dataset.val;
    if (this.currentAnswerRecord.correctAnswers) {
      delete this.currentAnswerRecord.correctAnswers; delete this.currentAnswerRecord.checkedAt;
    }
    const item = btn.closest('.question-item');
    item.querySelectorAll('.question-option').forEach(b => b.classList.remove('is-selected'));
    btn.classList.add('is-selected'); item.classList.add('is-answered');
    this._renderAnswerPage(); this._scheduleSave();
  }

  _toggleMark(qNum) {
    if (!this.currentAnswerRecord.marks) this.currentAnswerRecord.marks = {};
    if (this.currentAnswerRecord.marks[qNum]) delete this.currentAnswerRecord.marks[qNum];
    else this.currentAnswerRecord.marks[qNum] = true;
    this._scheduleSave(); this._renderQuestions();
  }

  _addSubQuestion(qNum) {
    const sc = this.currentAnswerRecord.subCounts || {};
    sc[qNum] = (sc[qNum] || 1) + 1;
    this.currentAnswerRecord.subCounts = sc;
    if (this.currentAnswerRecord.correctAnswers) {
      delete this.currentAnswerRecord.correctAnswers; delete this.currentAnswerRecord.checkedAt;
    }
    this._renderAnswerPage(); this._scheduleSave();
  }

  _removeSubQuestion(qNum) {
    const sc = this.currentAnswerRecord.subCounts || {};
    const cur = sc[qNum] || 1;
    if (cur <= 1) return;
    if (cur === 2) delete sc[qNum]; else sc[qNum] = cur - 1;
    const answers = this.currentAnswerRecord.answers || {};
    delete answers[qNum + '.' + cur];
    if (this.currentAnswerRecord.correctAnswers) {
      delete this.currentAnswerRecord.correctAnswers; delete this.currentAnswerRecord.checkedAt;
    }
    this._renderAnswerPage(); this._scheduleSave();
  }

  _scheduleSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => persistAnswers(this.db, this.currentAnswerRecord), 500);
  }

  /* ---- check flow ---- */
  _openCheckModal() {
    this.els.correctAnswersList.innerHTML = renderCheckModal(this.activeBook, this.currentAnswerRecord);
    this.els.correctAnswersList.querySelectorAll('.question-option').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = btn.closest('.correct-answer-row');
        row.querySelectorAll('.question-option').forEach(b => b.classList.remove('is-selected'));
        btn.classList.add('is-selected');
      });
    });
    this._openOverlay(this.els.checkAnswersOverlay);
  }

  async _onRunCheck() {
    const correctAnswers = {};
    this.els.correctAnswersList.querySelectorAll('.correct-answer-row').forEach(row => {
      const sel = row.querySelector('.question-option.is-selected');
      if (sel) correctAnswers[row.dataset.q] = sel.dataset.val;
    });
    if (Object.keys(correctAnswers).length === 0) { alert('请至少选择一题的正确答案'); return; }
    this.currentAnswerRecord.correctAnswers = correctAnswers;
    this.currentAnswerRecord.checkedAt = Date.now();
    await persistAnswers(this.db, this.currentAnswerRecord);
    this._closeAllOverlays(); this._renderAnswerPage();
  }

  /* ---- copy answers ---- */
  async _copyAnswers() {
    const book = this.activeBook;
    const answers = this.currentAnswerRecord.answers || {};
    const subCounts = this.currentAnswerRecord.subCounts || {};
    let text;
    if (book.type === 'choice') {
      let full = '';
      for (let i = 1; i <= book.questionCount; i++) {
        const sc = subCounts[i] || 1;
        if (sc <= 1) full += answers[i] || '_';
        else for (let j = 1; j <= sc; j++) full += answers[i + '.' + j] || '_';
      }
      text = full;
    } else {
      const lines = [];
      for (let i = 1; i <= book.questionCount; i++) {
        const sc = subCounts[i] || 1;
        if (sc <= 1) lines.push(`${i}. ${answers[i] || '(未答)'}`);
        else for (let j = 1; j <= sc; j++) lines.push(`${i}.${j}. ${answers[i + '.' + j] || '(未答)'}`);
      }
      text = lines.join('\n');
    }
    try { await navigator.clipboard.writeText(text); } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
    }
    this.els.copyFeedback.classList.add('is-visible');
    setTimeout(() => this.els.copyFeedback.classList.remove('is-visible'), 1800);
  }

  /* ---- back ---- */
  async _backToList() {
    await persistAnswers(this.db, this.currentAnswerRecord);
    this.view = 'list'; this.activeBook = null; this.currentAnswerRecord = null;
    this.els.answerView.style.display = 'none'; this.els.listView.style.display = '';
    this.books = await loadBooks(this.db);
    this._answerCache = await loadAnswerCache(this.db);
    this._renderBookList(); this._renderStats();
  }
}
