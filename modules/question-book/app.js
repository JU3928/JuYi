;(function () {
  'use strict';

  const DB_NAME = 'JuYiQuestionBook';
  const DB_VERSION = 1;
  const STORE_BOOKS = 'questionBooks';
  const STORE_ANSWERS = 'questionAnswers';
  const LS_THEME = 'jy_theme';

  const TYPE_LABELS = { 'choice': '选择题', 'fill-blank': '填空题', 'essay': '解答题' };

  /* ================================================================
   * IndexedDB wrapper
   * ================================================================ */
  class DB {
    constructor() { this.db = null; }
    open(name, version, stores) {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(name, version);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          for (const [sn, def] of Object.entries(stores)) {
            const store = db.objectStoreNames.contains(sn)
              ? e.target.transaction.objectStore(sn)
              : db.createObjectStore(sn, { keyPath: def.keyPath, autoIncrement: def.autoIncrement !== false });
            for (const idx of def.indexes || []) {
              if (!store.indexNames.contains(idx.name)) {
                store.createIndex(idx.name, idx.keyPath, { unique: idx.unique || false });
              }
            }
          }
        };
        req.onsuccess = (e) => { this.db = e.target.result; resolve(this.db); };
        req.onerror = (e) => reject(e.target.error);
      });
    }
    _tx(storeName, mode, cb) {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const result = cb(store);
        if (result && typeof result.then === 'function') { result.then(resolve).catch(reject); }
        else { tx.oncomplete = () => resolve(result); tx.onerror = () => reject(tx.error); }
      });
    }
    _p(req) { return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
    add(sn, item) { return this._tx(sn, 'readwrite', s => this._p(s.add(item))); }
    put(sn, item) { return this._tx(sn, 'readwrite', s => this._p(s.put(item))); }
    get(sn, id) { return this._tx(sn, 'readonly', s => this._p(s.get(id))); }
    getAll(sn) { return this._tx(sn, 'readonly', s => this._p(s.getAll())); }
    delete(sn, id) { return this._tx(sn, 'readwrite', s => this._p(s.delete(id))); }
    clear(sn) { return this._tx(sn, 'readwrite', s => this._p(s.clear())); }
    count(sn) { return this._tx(sn, 'readonly', s => this._p(s.count())); }
    getByIndex(sn, indexName, value) {
      return this._tx(sn, 'readonly', s => this._p(s.index(indexName).get(value)));
    }
  }

  /* ================================================================
   * Utility
   * ================================================================ */
  function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function escAttr(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function fmtDate(ts) {
    const d = new Date(ts);
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  /* ================================================================
   * App
   * ================================================================ */
  class QuestionBookApp {
    constructor() {
      this.db = new DB();
      this.books = [];
      this.view = 'list';          // 'list' | 'answer'
      this.activeBook = null;      // current book in answer view
      this.currentAnswerRecord = null; // answer record from DB
      this.editingBookId = null;
      this.pendingDeleteBookId = null;
      this._saveTimer = null;
    }

    /* ---- lifecycle ---- */
    async init() {
      this._restoreTheme();
      this._cacheDom();
      this._bindEvents();
      await this.db.open(DB_NAME, DB_VERSION, {
        [STORE_BOOKS]: { keyPath: 'id', autoIncrement: true, indexes: [] },
        [STORE_ANSWERS]: { keyPath: 'id', autoIncrement: true, indexes: [{ name: 'bookId', keyPath: 'bookId', unique: true }] },
      });
      await this.reload();
      await this._loadAnswerCache();
      this._renderAll();
    }

    _restoreTheme() {
      const saved = localStorage.getItem(LS_THEME);
      if (saved === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    }

    _cacheDom() {
      const q = (s) => document.querySelector(s);
      this.els = {
        sidebar: q('#sidebar'),
        btnToggleSidebar: q('#btnToggleSidebar'),
        btnOpenSidebar: q('#btnOpenSidebar'),
        btnToggleTheme: q('#btnToggleTheme'),
        statsPanel: q('#statsPanel'),
        listView: q('#listView'),
        bookList: q('#bookList'),
        emptyState: q('#emptyState'),
        btnAdd: q('#btnAdd'),
        answerView: q('#answerView'),
        answerBookTitle: q('#answerBookTitle'),
        btnBackToList: q('#btnBackToList'),
        btnEditBookFromAnswer: q('#btnEditBookFromAnswer'),
        questionList: q('#questionList'),
        summaryPanel: q('#summaryPanel'),
        summaryContent: q('#summaryContent'),
        btnCopyAnswers: q('#btnCopyAnswers'),
        copyFeedback: q('#copyFeedback'),
        editBookOverlay: q('#editBookOverlay'),
        editBookModalTitle: q('#editBookModalTitle'),
        editBookForm: q('#editBookForm'),
        editBookName: q('#editBookName'),
        editBookType: q('#editBookType'),
        editBookQCount: q('#editBookQCount'),
        editBookNotes: q('#editBookNotes'),
        editBookId: q('#editBookId'),
        qcountHint: q('#qcountHint'),
        btnSaveBook: q('#btnSaveBook'),
        confirmDeleteOverlay: q('#confirmDeleteOverlay'),
        confirmDeleteMsg: q('#confirmDeleteMsg'),
        btnConfirmDelete: q('#btnConfirmDelete'),
      };
    }

    _bindEvents() {
      const E = this.els;

      // Sidebar
      E.btnToggleSidebar.addEventListener('click', () => this._toggleSidebar());
      E.btnOpenSidebar.addEventListener('click', () => this._openSidebar());
      E.btnToggleTheme.addEventListener('click', () => this._toggleTheme());

      // List
      E.btnAdd.addEventListener('click', () => this._openEditBookModal(null));
      E.bookList.addEventListener('click', (e) => this._onBookListClick(e));
      E.bookList.addEventListener('contextmenu', (e) => this._onBookListContextMenu(e));

      // Modals
      E.btnSaveBook.addEventListener('click', () => this._onSaveBook());
      E.btnConfirmDelete.addEventListener('click', () => this._confirmDeleteBook());
      document.querySelectorAll('.modal-close-btn').forEach(btn => {
        btn.addEventListener('click', () => this._closeAllOverlays());
      });
      document.querySelectorAll('.jy-overlay').forEach(ov => {
        ov.addEventListener('click', (e) => { if (e.target === ov) this._closeAllOverlays(); });
      });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this._closeAllOverlays(); });

      // Answer view
      E.btnBackToList.addEventListener('click', () => this._backToList());
      E.btnEditBookFromAnswer.addEventListener('click', () => {
        if (this.activeBook) this._openEditBookModal(this.activeBook);
      });
      E.questionList.addEventListener('click', (e) => this._onQuestionOptionClick(e));
      E.questionList.addEventListener('input', (e) => this._onQuestionInput(e));
      E.btnCopyAnswers.addEventListener('click', () => this._copyAnswers());

      // Auto-save
      window.addEventListener('beforeunload', () => this._persistAnswers());
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this._persistAnswers();
      });
    }

    /* ---- sidebar ---- */
    _toggleSidebar() {
      this.els.sidebar.classList.toggle('is-collapsed');
    }
    _openSidebar() {
      this.els.sidebar.classList.remove('is-collapsed');
    }
    _toggleTheme() {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem(LS_THEME, next);
      this.els.btnToggleTheme.innerHTML = next === 'dark' ? '☀️ 亮色模式' : '🌙 暗色模式';
    }

    /* ---- data ---- */
    async reload() {
      this.books = await this.db.getAll(STORE_BOOKS);
    }

    /* ---- overlay helpers ---- */
    _openOverlay(ov) {
      ov.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    }
    _closeAllOverlays() {
      document.querySelectorAll('.jy-overlay').forEach(ov => ov.classList.remove('is-open'));
      document.body.style.overflow = '';
    }

    /* ================================================================
     * LIST VIEW
     * ================================================================ */
    _renderAll() {
      this._updateThemeButton();
      if (this.view === 'list') {
        this._renderBookList();
        this._renderStats();
      } else {
        this._renderAnswerPage();
      }
    }

    _updateThemeButton() {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      this.els.btnToggleTheme.innerHTML = isDark ? '☀️ 亮色模式' : '🌙 暗色模式';
    }

    _renderStats() {
      const totalQ = this.books.reduce((sum, b) => sum + b.questionCount, 0);
      this.els.statsPanel.innerHTML =
        `<div class="stats-panel__row"><span>做题本</span><strong>${this.books.length}</strong></div>` +
        `<div class="stats-panel__row"><span>总题数</span><strong>${totalQ}</strong></div>`;
    }

    _renderBookList() {
      if (this.books.length === 0) {
        this.els.bookList.style.display = 'none';
        this.els.emptyState.style.display = '';
        return;
      }
      this.els.bookList.style.display = '';
      this.els.emptyState.style.display = 'none';
      this.els.bookList.innerHTML = this.books.map(b => this._buildBookCard(b)).join('');
    }

    _buildBookCard(book) {
      const typeLabel = TYPE_LABELS[book.type] || book.type;
      const progress = this._getBookProgressFromAnswers(book);

      let progressHTML = '';
      if (progress) {
        progressHTML = `<div class="book-card__progress">📝 已答 ${progress.answered}/${book.questionCount}</div>`;
      }

      let notesHTML = '';
      if (book.notes) {
        const truncated = book.notes.length > 60 ? book.notes.slice(0, 60) + '...' : book.notes;
        notesHTML = `<div class="book-card__notes">${esc(truncated)}</div>`;
      }

      return `
        <div class="book-card" data-id="${book.id}">
          <div class="book-card__actions">
            <button class="jy-btn jy-btn--icon edit-book-btn" data-id="${book.id}" title="编辑">✎</button>
          </div>
          <div class="book-card__header">
            <span class="book-card__name" title="${esc(book.name)}">${esc(book.name)}</span>
            <span class="book-card__type book-card__type--${book.type}">${typeLabel}</span>
          </div>
          <div class="book-card__meta">
            <span>${book.questionCount} 题</span>
            <span class="book-card__meta-divider">·</span>
            <span>${fmtDate(book.createdAt)}</span>
          </div>
          ${progressHTML}
          ${notesHTML}
        </div>`;
    }

    _getBookProgressFromAnswers(book) {
      const stored = this._answerCache && this._answerCache[book.id];
      if (!stored) return null;
      const answers = stored.answers || {};
      const answered = Object.values(answers).filter(v => v && v.trim()).length;
      return { answered, total: book.questionCount };
    }

    async _loadAnswerCache() {
      this._answerCache = {};
      const allAnswers = await this.db.getAll(STORE_ANSWERS);
      for (const rec of allAnswers) {
        this._answerCache[rec.bookId] = rec;
      }
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

      // 编辑时禁用类型和数量，创建时不禁用
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

      if (id) {
        // 编辑：只允许改名称和备注
        const existing = await this.db.get(STORE_BOOKS, parseInt(id, 10));
        if (!existing) { alert('做题本不存在'); return; }
        existing.name = name;
        existing.notes = notes;
        await this.db.put(STORE_BOOKS, existing);
      } else {
        // 新建
        const book = {
          name, type, questionCount: qCount, notes,
          createdAt: Date.now(),
        };
        const newId = await this.db.add(STORE_BOOKS, book);
        // 同时创建空 answer 记录
        await this.db.add(STORE_ANSWERS, {
          bookId: newId,
          answers: {},
          updatedAt: Date.now(),
        });
      }

      this._closeAllOverlays();
      await this.reload();
      await this._loadAnswerCache();

      // 如果在答题页编辑，同步更新 activeBook 引用
      if (this.view === 'answer' && this.activeBook) {
        const updated = this.books.find(b => b.id === this.activeBook.id);
        if (updated) {
          this.activeBook = updated;
          this.els.answerBookTitle.textContent = updated.name;
        }
      }

      this._renderAll();
    }

    /* ---- delete ---- */
    _onBookListContextMenu(e) {
      const card = e.target.closest('.book-card');
      if (!card) return;
      e.preventDefault();
      const bookId = parseInt(card.dataset.id, 10);
      const book = this.books.find(b => b.id === bookId);
      if (!book) return;
      this.pendingDeleteBookId = bookId;
      this.els.confirmDeleteMsg.textContent = `确定删除「${book.name}」？题目答案也会一并删除。`;
      this._openOverlay(this.els.confirmDeleteOverlay);
    }

    async _confirmDeleteBook() {
      if (!this.pendingDeleteBookId) return;
      const bookId = this.pendingDeleteBookId;
      // 查找并删除 answer 记录
      const answerRec = await this.db.getByIndex(STORE_ANSWERS, 'bookId', bookId);
      if (answerRec) await this.db.delete(STORE_ANSWERS, answerRec.id);
      await this.db.delete(STORE_BOOKS, bookId);
      this.pendingDeleteBookId = null;
      this._closeAllOverlays();
      await this.reload();
      await this._loadAnswerCache();
      this._renderAll();
    }

    /* ---- list click (enter answer or edit) ---- */
    _onBookListClick(e) {
      // 编辑按钮
      const editBtn = e.target.closest('.edit-book-btn');
      if (editBtn) {
        e.stopPropagation();
        const bookId = parseInt(editBtn.dataset.id, 10);
        const book = this.books.find(b => b.id === bookId);
        if (book) this._openEditBookModal(book);
        return;
      }

      // 卡片点击 → 进入答题
      const card = e.target.closest('.book-card');
      if (!card) return;
      const bookId = parseInt(card.dataset.id, 10);
      const book = this.books.find(b => b.id === bookId);
      if (book) this._enterAnswerPage(book);
    }

    /* ================================================================
     * ANSWER VIEW
     * ================================================================ */
    async _enterAnswerPage(book) {
      this.activeBook = book;
      this.view = 'answer';

      // 加载该做题本的答案记录
      const answerRec = await this.db.getByIndex(STORE_ANSWERS, 'bookId', book.id);
      this.currentAnswerRecord = answerRec || {
        bookId: book.id,
        answers: {},
        updatedAt: Date.now(),
      };

      // 显示/隐藏
      this.els.listView.style.display = 'none';
      this.els.emptyState.style.display = 'none';
      this.els.answerView.style.display = '';
      this.els.answerBookTitle.textContent = book.name;

      this._renderAnswerPage();
    }

    _renderAnswerPage() {
      this._renderQuestions();
      this._renderSummary();
    }

    _renderQuestions() {
      const book = this.activeBook;
      if (!book) return;
      const answers = this.currentAnswerRecord.answers || {};
      let html = '';

      for (let i = 1; i <= book.questionCount; i++) {
        const val = (answers[i] || '').toString();
        const answeredClass = val ? ' is-answered' : '';

        if (book.type === 'choice') {
          html += this._buildChoiceQuestion(i, val, answeredClass);
        } else if (book.type === 'fill-blank') {
          html += this._buildFillBlankQuestion(i, val, answeredClass);
        } else if (book.type === 'essay') {
          html += this._buildEssayQuestion(i, val, answeredClass);
        }
      }

      this.els.questionList.innerHTML = html;
    }

    _buildChoiceQuestion(num, currentVal, answeredClass) {
      const options = ['A', 'B', 'C', 'D'].map(letter => {
        const sel = currentVal === letter ? ' is-selected' : '';
        return `<button class="question-option${sel}" data-q="${num}" data-val="${letter}">${letter}</button>`;
      }).join('');

      return `
        <div class="question-item${answeredClass}" data-q="${num}">
          <span class="question-item__num">${num}</span>
          <div class="question-options">${options}</div>
        </div>`;
    }

    _buildFillBlankQuestion(num, val, answeredClass) {
      return `
        <div class="question-item${answeredClass}" data-q="${num}">
          <span class="question-item__num">${num}</span>
          <input class="jy-input" data-q="${num}" value="${escAttr(val)}" placeholder="输入答案...">
        </div>`;
    }

    _buildEssayQuestion(num, val, answeredClass) {
      return `
        <div class="question-item${answeredClass}" data-q="${num}">
          <span class="question-item__num">${num}</span>
          <textarea class="jy-input" data-q="${num}" rows="3" placeholder="输入解答...">${esc(val)}</textarea>
        </div>`;
    }

    /* ---- answer interactions ---- */
    _onQuestionOptionClick(e) {
      const btn = e.target.closest('.question-option');
      if (!btn) return;
      const qNum = btn.dataset.q;
      const val = btn.dataset.val;

      // 更新内存
      this.currentAnswerRecord.answers[qNum] = val;

      // 更新按钮选中状态
      const item = btn.closest('.question-item');
      item.querySelectorAll('.question-option').forEach(b => b.classList.remove('is-selected'));
      btn.classList.add('is-selected');
      item.classList.add('is-answered');

      // 更新汇总 + 触发保存
      this._renderSummary();
      this._scheduleSave();
    }

    _onQuestionInput(e) {
      const input = e.target.closest('[data-q]');
      if (!input || input.tagName === 'BUTTON') return;
      const qNum = input.dataset.q;
      const val = input.value;

      this.currentAnswerRecord.answers[qNum] = val;

      // 更新 answered 状态
      const item = input.closest('.question-item');
      if (item) {
        if (val.trim()) item.classList.add('is-answered');
        else item.classList.remove('is-answered');
      }

      this._renderSummary();
      this._scheduleSave();
    }

    /* ---- persistence ---- */
    _scheduleSave() {
      clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(() => this._persistAnswers(), 500);
    }

    async _persistAnswers() {
      clearTimeout(this._saveTimer);
      if (!this.currentAnswerRecord) return;
      this.currentAnswerRecord.updatedAt = Date.now();
      try {
        if (this.currentAnswerRecord.id) {
          await this.db.put(STORE_ANSWERS, this.currentAnswerRecord);
        } else {
          const id = await this.db.add(STORE_ANSWERS, this.currentAnswerRecord);
          this.currentAnswerRecord.id = id;
        }
      } catch (err) {
        // Silently fail — IndexedDB may be closing
      }
    }

    /* ---- summary panel ---- */
    _renderSummary() {
      const book = this.activeBook;
      if (!book) return;
      const answers = this.currentAnswerRecord.answers || {};

      if (book.type === 'choice') {
        this._renderChoiceSummary(book, answers);
      } else {
        this._renderTextSummary(book, answers);
      }
    }

    _renderChoiceSummary(book, answers) {
      let html = '';
      for (let start = 1; start <= book.questionCount; start += 5) {
        const end = Math.min(start + 4, book.questionCount);
        let groupStr = '';
        for (let i = start; i <= end; i++) {
          const a = answers[i];
          groupStr += (a && a.trim()) ? `<strong>${esc(a)}</strong>` : '<span class="summary__filler">_</span>';
        }
        html += `<div class="summary__group">${start}-${end}: ${groupStr}</div>`;
      }
      this.els.summaryContent.innerHTML = html;
    }

    _renderTextSummary(book, answers) {
      const answered = Object.values(answers).filter(v => v && v.trim()).length;
      let html = `<div class="summary__stat">已答 <strong>${answered}</strong> / ${book.questionCount} 题</div>`;

      // Show answered questions as a list
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

      this.els.summaryContent.innerHTML = html;
    }

    /* ---- copy answers ---- */
    async _copyAnswers() {
      const book = this.activeBook;
      if (!book) return;
      const answers = this.currentAnswerRecord.answers || {};

      let text;
      if (book.type === 'choice') {
        // 完整连续字符串
        let full = '';
        for (let i = 1; i <= book.questionCount; i++) {
          full += answers[i] || '_';
        }
        text = full;
      } else {
        // 文本列表
        const lines = [];
        for (let i = 1; i <= book.questionCount; i++) {
          const val = answers[i];
          lines.push(`${i}. ${val || '(未答)'}`);
        }
        text = lines.join('\n');
      }

      try {
        await navigator.clipboard.writeText(text);
        this.els.copyFeedback.classList.add('is-visible');
        setTimeout(() => this.els.copyFeedback.classList.remove('is-visible'), 1800);
      } catch (err) {
        // Fallback for non-HTTPS
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        this.els.copyFeedback.classList.add('is-visible');
        setTimeout(() => this.els.copyFeedback.classList.remove('is-visible'), 1800);
      }
    }

    /* ---- back to list ---- */
    async _backToList() {
      await this._persistAnswers();
      this.view = 'list';
      this.activeBook = null;
      this.currentAnswerRecord = null;
      this.els.answerView.style.display = 'none';
      this.els.listView.style.display = '';
      await this.reload();
      await this._loadAnswerCache();
      this._renderBookList();
      this._renderStats();
    }
  }

  /* ================================================================
   * Bootstrap
   * ================================================================ */
  document.addEventListener('DOMContentLoaded', () => {
    const app = new QuestionBookApp();
    app.init().catch(err => {
      console.error('做题本初始化失败', err);
      alert('做题本初始化失败，请刷新重试');
    });
    // Expose for debugging
    window._questionBookApp = app;
  });

})();
