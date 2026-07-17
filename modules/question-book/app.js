;(function () {
  'use strict';

  const DB_NAME = 'JuYiQuestionBook';
  const DB_VERSION = 1;
  const STORE_BOOKS = 'questionBooks';
  const STORE_ANSWERS = 'questionAnswers';
  const LS_THEME = 'jy_theme';

  const TYPE_LABELS = { 'choice': '选择题', 'fill-blank': '填空题', 'essay': '解答题' };
  const OPTIONS = ['A', 'B', 'C', 'D'];

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
      this.view = 'list';
      this.activeBook = null;
      this.currentAnswerRecord = null;
      this.editingBookId = null;
      this.pendingDeleteBookId = null;
      this._saveTimer = null;
      this.compositeMode = false;
      this.selectedBooks = new Set();
      window._qb = this; // for chip inline onclick
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
        answerProgress: q('#answerProgress'),
        answerScoreBadge: q('#answerScoreBadge'),
        btnBackToList: q('#btnBackToList'),
        btnEditBookFromAnswer: q('#btnEditBookFromAnswer'),
        questionList: q('#questionList'),
        summaryPanel: q('#summaryPanel'),
        summaryContent: q('#summaryContent'),
        checkSection: q('#checkSection'),
        checkResults: q('#checkResults'),
        checkHint: q('#checkHint'),
        checkHintText: q('#checkHintText'),
        btnOpenCheck: q('#btnOpenCheck'),
        btnRecheck: q('#btnRecheck'),
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
        checkAnswersOverlay: q('#checkAnswersOverlay'),
        correctAnswersList: q('#correctAnswersList'),
        btnRunCheck: q('#btnRunCheck'),
        btnComposite: q('#btnComposite'),
        compositeBar: q('#compositeBar'),
        btnCompositeRun: q('#btnCompositeRun'),
        btnCompositeCancel: q('#btnCompositeCancel'),
        groupChips: q('#groupChips'),
        mainChips: q('#mainChips'),
        compositeOverlay: q('#compositeOverlay'),
        compositeBody: q('#compositeBody'),
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

      // Modals (general)
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

      // Check flow
      E.btnOpenCheck.addEventListener('click', () => this._openCheckModal());
      E.btnRecheck.addEventListener('click', () => this._openCheckModal());
      E.btnRunCheck.addEventListener('click', () => this._onRunCheck());

      // Composite stats
      E.btnComposite.addEventListener('click', () => this._enterCompositeMode());
      E.btnCompositeRun.addEventListener('click', () => this._showCompositeStats());
      E.btnCompositeCancel.addEventListener('click', () => this._exitCompositeMode());

      // Auto-save
      window.addEventListener('beforeunload', () => this._persistAnswers());
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this._persistAnswers();
      });
    }

    /* ---- sidebar ---- */
    _toggleSidebar() { this.els.sidebar.classList.toggle('is-collapsed'); }
    _openSidebar() { this.els.sidebar.classList.remove('is-collapsed'); }
    _toggleTheme() {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem(LS_THEME, next);
      this.els.btnToggleTheme.innerHTML = next === 'dark' ? '☀️ 亮色模式' : '🌙 暗色模式';
    }

    /* ---- data ---- */
    async reload() { this.books = await this.db.getAll(STORE_BOOKS); }

    /* ---- overlay helpers ---- */
    _openOverlay(ov) { ov.classList.add('is-open'); document.body.style.overflow = 'hidden'; }
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
      let html = `<div class="stats-panel__row"><span>做题本</span><strong>${this.books.length}</strong></div>` +
        `<div class="stats-panel__row"><span>总题数</span><strong>${totalQ}</strong></div>`;
      if (this.compositeMode) {
        html += `<div class="stats-panel__row"><span>已选</span><strong style="color:var(--jy-primary)">${this.selectedBooks.size}</strong></div>`;
      }
      this.els.statsPanel.innerHTML = html;
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
      const answerInfo = this._getBookProgressFromAnswers(book);
      const answered = answerInfo ? answerInfo.answered : 0;
      const total = book.questionCount;
      const score = answerInfo ? answerInfo.score : null; // { correct, wrong, rate }
      const hasScore = score !== null;

      // 进度条
      const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
      let progressHTML = '';
      if (total > 0) {
        progressHTML = `
          <div class="book-card__progress-bar">
            <div class="book-card__progress-fill" style="width:${pct}%"></div>
          </div>`;
      }

      // 统计行（题目总数 + 正确率）
      let statsHTML = '';
      if (hasScore) {
        statsHTML = '<div class="book-card__stats">';
        statsHTML += `<span class="book-card__stat">📋 ${total} 题</span>`;
        const cls = score.rate >= 0.8 ? 'is-high' : (score.rate >= 0.6 ? 'is-mid' : 'is-low');
        statsHTML += `<span class="book-card__stat book-card__stat--score ${cls}">🎯 ${Math.round(score.rate * 100)}%</span>`;
        statsHTML += '</div>';
      }

      let notesHTML = '';
      if (book.notes) {
        const truncated = book.notes.length > 60 ? book.notes.slice(0, 60) + '...' : book.notes;
        notesHTML = `<div class="book-card__notes">${esc(truncated)}</div>`;
      }

      const scoreClass = hasScore ? ' book-card--has-score' : '';
      const compositeClass = this.compositeMode ? ' book-card--composite' : '';
      const checkedAttr = this.selectedBooks.has(book.id) ? ' checked' : '';

      return `
        <div class="book-card${scoreClass}${compositeClass}" data-id="${book.id}">
          ${this.compositeMode ? `<input type="checkbox" class="book-card__check" data-book-id="${book.id}"${checkedAttr}>` : ''}
          <div class="book-card__actions">
            <button class="jy-btn jy-btn--icon edit-book-btn" data-id="${book.id}" title="编辑">✎</button>
          </div>
          <div class="book-card__body">
            <div class="book-card__header">
              <span class="book-card__name" title="${esc(book.name)}">${esc(book.name)}</span>
              <span class="book-card__type book-card__type--${book.type}">${typeLabel}</span>
            </div>
            <div class="book-card__meta">
              <span>📝 已答 ${answered}/${total}</span>
              <span class="book-card__meta-divider">·</span>
              <span>${fmtDate(book.createdAt)}</span>
            </div>
            ${progressHTML}
            ${statsHTML}
            ${notesHTML}
          </div>
        </div>`;
    }

    _getBookProgressFromAnswers(book) {
      const stored = this._answerCache && this._answerCache[book.id];
      if (!stored) return null;
      const answers = stored.answers || {};
      const subCounts = stored.subCounts || {};
      // 统计总答题格数（含子题）
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

      // 如果有核对结果，计算正确率
      if (stored.correctAnswers && Object.keys(stored.correctAnswers).length > 0) {
        const correctAnswers = stored.correctAnswers;
        let correct = 0, wrong = 0;
        for (let i = 1; i <= book.questionCount; i++) {
          const sc = subCounts[i] || 1;
          for (let j = 1; j <= sc; j++) {
            const key = sc > 1 ? (i + '.' + j) : i.toString();
            const userAns = (answers[key] || '').trim();
            const correctAns = (correctAnswers[key] || '').trim();
            if (userAns && correctAns) {
              if (userAns === correctAns) correct++; else wrong++;
            }
          }
        }
        const checked = correct + wrong;
        if (checked > 0) {
          result.score = { correct, wrong, rate: correct / checked, total: checked };
        }
      }
      return result;
    }

    async _loadAnswerCache() {
      this._answerCache = {};
      const allAnswers = await this.db.getAll(STORE_ANSWERS);
      for (const rec of allAnswers) {
        this._answerCache[rec.bookId] = rec;
      }
    }

    /* ---- composite stats ---- */
    _enterCompositeMode() {
      this.compositeMode = true;
      this.selectedBooks.clear();
      this.els.btnComposite.style.display = 'none';
      this.els.compositeBar.style.display = '';
      this._renderDetectedGroups();
      this._renderBookList();
      this._renderStats();
    }

    _exitCompositeMode() {
      this.compositeMode = false;
      this.selectedBooks.clear();
      this.els.btnComposite.style.display = '';
      this.els.compositeBar.style.display = 'none';
      this.els.groupChips.style.display = 'none';
      this.els.mainChips.style.display = 'none';
      this._renderBookList();
      this._renderStats();
    }

    _renderDetectedGroups() {
      const groups = this._detectGroups();
      if (!groups.length) {
        this.els.groupChips.style.display = 'none';
        this.els.mainChips.style.display = 'none';
        return;
      }
      this.els.groupChips.style.display = 'flex';
      this.els.mainChips.style.display = 'flex';
      // Render as BUTTON elements (guaranteed clickable)
      var self = this;
      // Render group chips as BUTTON elements (same as test button)
      var chipHTML = '<div style="margin-bottom:var(--jy-space-1)"><span style="font-size:var(--jy-font-size-xs);color:var(--jy-text-muted)">快速选择：</span></div>';
      for (var gi = 0; gi < groups.length; gi++) {
        var g = groups[gi];
        var btnId = 'chip_' + gi;
        chipHTML += '<button id="' + btnId + '" class="filter-chip group-chip" style="cursor:pointer;border:none;font-family:inherit">' + esc(g.label) + ' (' + g.count + ')</button>';
      }
      chipHTML += '<div style="margin-top:6px"><button class="jy-btn jy-btn--outline" style="font-size:10px;padding:2px 8px;width:100%" id="btnTestRandom">🧪 测试：随机选中1个题本</button></div>';
      this.els.groupChips.innerHTML = chipHTML;
      this.els.groupChips.style.display = 'block';
      this.els.mainChips.style.display = 'none';

      // Bind group chip clicks — pass book IDs directly via closure, no key matching needed
      var self = this;
      for (var gi2 = 0; gi2 < groups.length; gi2++) {
        var btn = document.getElementById('chip_' + gi2);
        if (btn) {
          (function (ids) {
            btn.addEventListener('click', function () {
              self.selectedBooks.clear();
              for (var i = 0; i < ids.length; i++) { self.selectedBooks.add(ids[i]); }
              // Sync checkboxes
              var checks = self.els.bookList.querySelectorAll('.book-card__check');
              for (var ck = 0; ck < checks.length; ck++) {
                checks[ck].checked = self.selectedBooks.has(parseInt(checks[ck].dataset.bookId, 10));
              }
              // Highlight active chip
              var allChips = self.els.groupChips.querySelectorAll('.group-chip');
              for (var ac = 0; ac < allChips.length; ac++) { allChips[ac].classList.remove('active'); }
              btn.classList.add('active');
              self._renderStats();
            });
          })(groups[gi2].ids.slice());
        }
      }

      // Test button: random select 1 book
      var testBtn = document.getElementById('btnTestRandom');
      if (testBtn) {
        testBtn.addEventListener('click', function () {
          if (self.books.length === 0) return;
          var ri = Math.floor(Math.random() * self.books.length);
          var randBook = self.books[ri];
          self.selectedBooks.clear();
          self.selectedBooks.add(randBook.id);
          self._selectBooksByGroup(null); // refresh checkboxes
          self._renderStats();
        });
      }
    }

    _detectGroups() {
      const books = this.books;
      if (books.length < 2) return [];
      // Extract "root" names by stripping chapter suffixes like 3.1, 4.2, etc.
      const roots = books.map(function (b) {
        const name = b.name;
        // Strip trailing chapter numbers (X.Y format): "数据结构王道3.1" -> "数据结构王道"
        // Keep standalone numbers: "极限660" stays as "极限660"
        const stripped = name.replace(/\d+\.\d+$/g, '').replace(/[（(]\d+[)）]$/g, '').trim();
        return { id: b.id, name: name, root: stripped, key: stripped };
      });
      // Group by root
      const map = {};
      roots.forEach(function (r) {
        if (!map[r.key]) map[r.key] = { label: r.root, count: 0, ids: [] };
        map[r.key].count++;
        map[r.key].ids.push(r.id);
      });
      // Return groups with >=1 book (single books still helpful for quick-select)
      return Object.values(map).filter(function (g) { return g.count >= 1; }).sort(function (a, b) { return b.count - a.count; });
    }

    _selectBooksByGroup(groupKey) {
      // If groupKey provided, select that group's books
      if (groupKey) {
        var groups2 = this._detectGroups();
        for (var gi2 = 0; gi2 < groups2.length; gi2++) {
          if (groups2[gi2].key === groupKey) {
            this.selectedBooks.clear();
            var ids = groups2[gi2].ids;
            for (var idi = 0; idi < ids.length; idi++) { this.selectedBooks.add(ids[idi]); }
            break;
          }
        }
      }
      // Sync DOM checkboxes with selectedBooks
      var checks = this.els.bookList.querySelectorAll('.book-card__check');
      for (var ck = 0; ck < checks.length; ck++) {
        checks[ck].checked = this.selectedBooks.has(parseInt(checks[ck].dataset.bookId, 10));
      }
      // Highlight active chip
      var chips = this.els.groupChips.querySelectorAll('.group-chip');
      for (var ci = 0; ci < chips.length; ci++) {
        chips[ci].classList.toggle('active', groupKey && chips[ci].getAttribute('data-group') === groupKey);
      }
      this._renderStats();
    }

    _showCompositeStats() {
      if (this.selectedBooks.size < 1) { alert('请至少选择 1 个做题本'); return; }
      const self = this;
      // Gather stats for each selected book
      let totalQ = 0, totalCorrect = 0, totalWrong = 0;
      const bookDetails = [];
      this.selectedBooks.forEach(function (id) {
        const book = self.books.find(function (b) { return b.id === id; });
        if (!book) return;
        const stored = self._answerCache && self._answerCache[book.id];
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
                const correctAns = stored.correctAnswers ? (stored.correctAnswers[key] || '').trim() : '';
                if (correctAns === ans) correct++;
                else wrong++;
              } else {
                if (ans === '正确') correct++;
                else wrong++;
              }
            }
          }
        }
        totalQ += total;
        totalCorrect += correct;
        totalWrong += wrong;
        if (total > 0) bookDetails.push({ name: book.name, total: total, correct: correct, rate: correct / total });
      });

      if (totalQ === 0) { alert('选中做题本暂无可统计的答题记录'); return; }
      const overallRate = totalCorrect / totalQ;
      const cls = overallRate >= 0.8 ? '--high' : (overallRate >= 0.6 ? '--mid' : '--low');

      let html = '<div style="text-align:center;padding:var(--jy-space-4)">' +
        '<div class="score-display">' +
        '<div class="score-display__value score-display__value' + cls + '">' + Math.round(overallRate * 100) + '%</div>' +
        '<div class="score-display__label">综合正确率（' + totalCorrect + '/' + totalQ + '）</div>' +
        '<div class="progress-bar" style="margin-top:var(--jy-space-3)">' +
        '<div class="progress-bar__fill progress-bar__fill' + cls + '" style="width:' + Math.round(overallRate * 100) + '%"></div></div></div>';

      // Per-book breakdown
      html += '<div style="margin-top:var(--jy-space-4)"><table style="width:100%;font-size:var(--jy-font-size-sm)"><thead><tr><th>做题本</th><th>已答</th><th>正确率</th></tr></thead><tbody>';
      bookDetails.sort(function (a, b) { return b.rate - a.rate; });
      bookDetails.forEach(function (d) {
        const dCls = d.rate >= 0.8 ? 'is-high' : (d.rate >= 0.6 ? 'is-mid' : 'is-low');
        html += '<tr><td>' + esc(d.name) + '</td><td>' + d.correct + '/' + d.total + '</td><td><span class="book-card__stat--score ' + dCls + '" style="font-size:var(--jy-font-size-xs)">' + Math.round(d.rate * 100) + '%</span></td></tr>';
      });
      html += '</tbody></table></div>';

      this.els.compositeBody.innerHTML = html;
      this.els.compositeOverlay.classList.add('is-open');
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

      if (id) {
        const existing = await this.db.get(STORE_BOOKS, parseInt(id, 10));
        if (!existing) { alert('做题本不存在'); return; }
        existing.name = name;
        existing.notes = notes;
        await this.db.put(STORE_BOOKS, existing);
      } else {
        const book = { name, type, questionCount: qCount, notes, createdAt: Date.now() };
        const newId = await this.db.add(STORE_BOOKS, book);
        await this.db.add(STORE_ANSWERS, { bookId: newId, answers: {}, updatedAt: Date.now() });
      }

      this._closeAllOverlays();
      await this.reload();
      await this._loadAnswerCache();

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
      const answerRec = await this.db.getByIndex(STORE_ANSWERS, 'bookId', bookId);
      if (answerRec) await this.db.delete(STORE_ANSWERS, answerRec.id);
      await this.db.delete(STORE_BOOKS, bookId);
      this.pendingDeleteBookId = null;
      this._closeAllOverlays();
      await this.reload();
      await this._loadAnswerCache();
      this._renderAll();
    }

    _onBookListClick(e) {
      // Composite mode: checkbox toggle
      if (this.compositeMode && e.target.classList.contains('book-card__check')) {
        const bookId = parseInt(e.target.dataset.bookId, 10);
        if (e.target.checked) this.selectedBooks.add(bookId);
        else this.selectedBooks.delete(bookId);
        this._renderStats();
        return;
      }
      if (this.compositeMode) return; // No navigation in composite mode

      const editBtn = e.target.closest('.edit-book-btn');
      if (editBtn) {
        e.stopPropagation();
        const bookId = parseInt(editBtn.dataset.id, 10);
        const book = this.books.find(b => b.id === bookId);
        if (book) this._openEditBookModal(book);
        return;
      }
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

      const answerRec = await this.db.getByIndex(STORE_ANSWERS, 'bookId', book.id);
      this.currentAnswerRecord = answerRec || {
        bookId: book.id, answers: {}, updatedAt: Date.now(),
      };
      // 初始化子题计数
      if (!this.currentAnswerRecord.subCounts) this.currentAnswerRecord.subCounts = {};
      // 初始化标记
      if (!this.currentAnswerRecord.marks) this.currentAnswerRecord.marks = {};

      this.els.listView.style.display = 'none';
      this.els.emptyState.style.display = 'none';
      this.els.answerView.style.display = '';
      this.els.answerBookTitle.textContent = book.name;

      this._renderAnswerPage();
    }

    _renderAnswerPage() {
      this._renderQuestions();
      this._renderSummary();
      this._updateAnswerToolbar();
    }

    _updateAnswerToolbar() {
      const book = this.activeBook;
      if (!book) return;
      const answers = this.currentAnswerRecord.answers || {};
      const subCounts = this.currentAnswerRecord.subCounts || {};
      // 计算总答题格数（含子题）
      let totalSlots = 0, answeredSlots = 0;
      for (let i = 1; i <= book.questionCount; i++) {
        const sc = subCounts[i] || 1;
        for (let j = 1; j <= sc; j++) {
          totalSlots++;
          const key = sc > 1 ? (i + '.' + j) : i.toString();
          if (answers[key] && answers[key].trim()) answeredSlots++;
        }
      }
      this.els.answerProgress.textContent = answeredSlots + '/' + totalSlots + ' 已答';

      // 正确率徽章
      if (this._isChecked() && book.type === 'choice') {
        const stats = this._getCheckStats();
        if (stats) {
          const cls = stats.rate >= 0.8 ? 'is-high' : (stats.rate >= 0.6 ? 'is-mid' : 'is-low');
          this.els.answerScoreBadge.style.display = '';
          this.els.answerScoreBadge.textContent = '🎯 ' + Math.round(stats.rate * 100) + '%';
          this.els.answerScoreBadge.className = 'answer-toolbar__score book-card__stat--score ' + cls;
        }
      } else {
        this.els.answerScoreBadge.style.display = 'none';
      }
    }

    _renderQuestions() {
      const book = this.activeBook;
      if (!book) return;
      const answers = this.currentAnswerRecord.answers || {};
      const subCounts = this.currentAnswerRecord.subCounts || {};
      const isChecked = this._isChecked();
      const correctAnswers = this.currentAnswerRecord.correctAnswers || {};
      let html = '';

      // 展平：每道主题目按 subCounts 产生多个子题行
      for (let i = 1; i <= book.questionCount; i++) {
        const sc = subCounts[i] || 1;
        if (sc <= 1) {
          html += this._renderSingleQuestion(i, i.toString(), answers, isChecked, correctAnswers, book);
        } else {
          for (let j = 1; j <= sc; j++) {
            const key = i + '.' + j;
            html += this._renderSingleQuestion(i, key, answers, isChecked, correctAnswers, book, sc);
          }
        }
      }

      this.els.questionList.innerHTML = html;
    }

    _renderSingleQuestion(mainNum, key, answers, isChecked, correctAnswers, book, subCount) {
      const val = (answers[key] || '').toString();
      let classes = val ? ' is-answered' : '';
      let checkClass = '';
      let resultIcon = '';
      let correctAnswerDisplay = '';

      if (isChecked && book.type === 'choice') {
        checkClass = ' is-checked';
        const userAns = val.trim();
        const correctAns = (correctAnswers[key] || '').trim();
        if (userAns && correctAns) {
          if (userAns === correctAns) {
            checkClass += ' is-correct';
            resultIcon = ' ✓';
          } else {
            checkClass += ' is-wrong';
            resultIcon = ' ✗';
            correctAnswerDisplay = `<span class="question-item__correct-answer">→ ${esc(correctAns)}</span>`;
          }
        }
      }

      // 子题管理按钮（只在第一个子题行上显示，且是非核对状态）
      let subActions = '';
      if (!isChecked && key.indexOf('.') === -1) {
        subActions = `<button class="sub-add-btn jy-btn jy-btn--icon" data-q="${mainNum}" title="增加小空">＋</button>`;
      }
      if (!isChecked && subCount && subCount > 1 && key === mainNum + '.' + subCount) {
        subActions = `<button class="sub-remove-btn jy-btn jy-btn--icon" data-q="${mainNum}" title="移除末空">－</button>`;
        if (subCount === 1) subActions = '';
      }

      const label = key.indexOf('.') > -1 ? key : key.toString();
      const displayLabel = label;

      if (book.type === 'choice') {
        return this._buildChoiceQuestion(mainNum, key, val, classes + checkClass, resultIcon, correctAnswerDisplay, displayLabel, subActions);
      } else if (book.type === 'fill-blank') {
        return this._buildFillBlankQuestion(mainNum, key, val, classes);
      } else {
        return this._buildEssayQuestion(mainNum, key, val, classes);
      }
    }

    _buildChoiceQuestion(mainNum, key, currentVal, extraClasses, resultIcon, correctAnswerDisplay, displayLabel, subActions) {
      const marks = this.currentAnswerRecord.marks || {};
      const isMarked = marks[mainNum];
      const markIcon = isMarked ? '⭐' : '☆';
      const markClass = isMarked ? ' is-marked' : '';
      const optionsHTML = OPTIONS.map(letter => {
        const sel = currentVal === letter ? ' is-selected' : '';
        return `<button class="question-option${sel}" data-q="${key}" data-val="${letter}">${letter}</button>`;
      }).join('');

      return `
        <div class="question-item${extraClasses}${markClass}" data-q="${mainNum}" data-key="${key}">
          <span class="question-item__num-badge">${displayLabel || key}${resultIcon}</span>
          <div class="question-options">${optionsHTML}</div>
          ${correctAnswerDisplay}
          <button class="mark-btn jy-btn jy-btn--ghost jy-btn--icon" data-mark="${mainNum}" title="${isMarked ? '取消标记' : '标记此题'}">${markIcon}</button>
          ${subActions}
        </div>`;
    }

    _buildFillBlankQuestion(mainNum, key, val, answeredClass) {
      const label = key.indexOf('.') > -1 ? key : key.toString();
      const marks = this.currentAnswerRecord.marks || {};
      const isMarked = marks[mainNum];
      const markIcon = isMarked ? '⭐' : '☆';
      const markClass = isMarked ? ' is-marked' : '';
      const selCorrect = val === '正确' ? ' is-selected is-correct-btn' : '';
      const selWrong = val === '错误' ? ' is-selected is-wrong-btn' : '';
      return `
        <div class="question-item${answeredClass}${markClass}" data-q="${mainNum}" data-key="${key}">
          <span class="question-item__num-badge">${label}</span>
          <div class="question-options">
            <button class="question-option${selCorrect}" data-q="${key}" data-val="正确">✓ 正确</button>
            <button class="question-option${selWrong}" data-q="${key}" data-val="错误">✗ 错误</button>
          </div>
          <button class="mark-btn jy-btn jy-btn--ghost jy-btn--icon" data-mark="${mainNum}" title="${isMarked ? '取消标记' : '标记此题'}">${markIcon}</button>
        </div>`;
    }

    _buildEssayQuestion(mainNum, key, val, answeredClass) {
      const label = key.indexOf('.') > -1 ? key : key.toString();
      const marks = this.currentAnswerRecord.marks || {};
      const isMarked = marks[mainNum];
      const markIcon = isMarked ? '⭐' : '☆';
      const markClass = isMarked ? ' is-marked' : '';
      const selCorrect = val === '正确' ? ' is-selected is-correct-btn' : '';
      const selWrong = val === '错误' ? ' is-selected is-wrong-btn' : '';
      return `
        <div class="question-item${answeredClass}${markClass}" data-q="${mainNum}" data-key="${key}">
          <span class="question-item__num-badge">${label}</span>
          <div class="question-options">
            <button class="question-option${selCorrect}" data-q="${key}" data-val="正确">✓ 正确</button>
            <button class="question-option${selWrong}" data-q="${key}" data-val="错误">✗ 错误</button>
          </div>
          <button class="mark-btn jy-btn jy-btn--ghost jy-btn--icon" data-mark="${mainNum}" title="${isMarked ? '取消标记' : '标记此题'}">${markIcon}</button>
        </div>`;
    }

    /* ---- answer interactions ---- */
    _onQuestionOptionClick(e) {
      // 标记按钮
      const markBtn = e.target.closest('.mark-btn');
      if (markBtn) { e.stopPropagation(); this._toggleMark(parseInt(markBtn.dataset.mark)); return; }

      // 子题添加/移除按钮
      const subAdd = e.target.closest('.sub-add-btn');
      const subRemove = e.target.closest('.sub-remove-btn');
      if (subAdd) { e.stopPropagation(); this._addSubQuestion(parseInt(subAdd.dataset.q)); return; }
      if (subRemove) { e.stopPropagation(); this._removeSubQuestion(parseInt(subRemove.dataset.q)); return; }

      const btn = e.target.closest('.question-option');
      if (!btn) return;

      // 核对后锁定（仅选择题需要录入正确答案后锁定）
      if (this._isChecked() && this.activeBook.type === 'choice') {
        alert('已核对完成。如需修改答案，请先点击「重新核对」并重新录入正确答案。');
        return;
      }

      const qNum = btn.dataset.q;
      const val = btn.dataset.val;

      this.currentAnswerRecord.answers[qNum] = val;

      // 清除旧核对结果（答案改了，需要重新核对）
      if (this.currentAnswerRecord.correctAnswers) {
        delete this.currentAnswerRecord.correctAnswers;
        delete this.currentAnswerRecord.checkedAt;
      }

      const item = btn.closest('.question-item');
      item.querySelectorAll('.question-option').forEach(b => b.classList.remove('is-selected'));
      btn.classList.add('is-selected');
      item.classList.add('is-answered');

      this._renderSummary();
      this._renderQuestions(); // 完全重新渲染以清除核对状态
      this._updateAnswerToolbar();
      this._scheduleSave();
    }

    /* ---- 子题管理 ---- */
    _toggleMark(qNum) {
      if (!this.currentAnswerRecord.marks) this.currentAnswerRecord.marks = {};
      if (this.currentAnswerRecord.marks[qNum]) {
        delete this.currentAnswerRecord.marks[qNum];
      } else {
        this.currentAnswerRecord.marks[qNum] = true;
      }
      this._scheduleSave();
      this._renderQuestions();
    }

    _addSubQuestion(qNum) {
      const sc = this.currentAnswerRecord.subCounts || {};
      sc[qNum] = (sc[qNum] || 1) + 1;
      this.currentAnswerRecord.subCounts = sc;
      // 清除相关核对结果
      if (this.currentAnswerRecord.correctAnswers) {
        delete this.currentAnswerRecord.correctAnswers;
        delete this.currentAnswerRecord.checkedAt;
      }
      this._renderQuestions();
      this._renderSummary();
      this._updateAnswerToolbar();
      this._scheduleSave();
    }

    _removeSubQuestion(qNum) {
      const sc = this.currentAnswerRecord.subCounts || {};
      const cur = sc[qNum] || 1;
      if (cur <= 1) return; // 不能少于1
      if (cur === 2) { delete sc[qNum]; } // 恢复默认
      else { sc[qNum] = cur - 1; }
      this.currentAnswerRecord.subCounts = sc;
      // 删除多余的子题答案
      const answers = this.currentAnswerRecord.answers || {};
      delete answers[qNum + '.' + cur];
      // 清除核对结果
      if (this.currentAnswerRecord.correctAnswers) {
        delete this.currentAnswerRecord.correctAnswers;
        delete this.currentAnswerRecord.checkedAt;
      }
      this._renderQuestions();
      this._renderSummary();
      this._updateAnswerToolbar();
      this._scheduleSave();
    }

    _onQuestionInput(e) {
      const input = e.target.closest('[data-q]');
      if (!input || input.tagName === 'BUTTON') return;
      const qNum = input.dataset.q;
      const val = input.value;

      this.currentAnswerRecord.answers[qNum] = val;

      // 清除旧核对结果
      if (this.currentAnswerRecord.correctAnswers) {
        delete this.currentAnswerRecord.correctAnswers;
        delete this.currentAnswerRecord.checkedAt;
      }

      const item = input.closest('.question-item');
      if (item) {
        if (val.trim()) item.classList.add('is-answered');
        else item.classList.remove('is-answered');
      }

      this._renderSummary();
      this._updateAnswerToolbar();
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
      } catch (err) { /* silent */ }
    }

    /* ================================================================
     * CHECK (核对)
     * ================================================================ */
    _isAllAnswered() {
      const book = this.activeBook;
      if (!book) return false;
      const answers = this.currentAnswerRecord.answers || {};
      const subCounts = this.currentAnswerRecord.subCounts || {};
      for (let i = 1; i <= book.questionCount; i++) {
        const sc = subCounts[i] || 1;
        for (let j = 1; j <= sc; j++) {
          const key = sc > 1 ? (i + '.' + j) : i.toString();
          if (!answers[key] || !answers[key].trim()) return false;
        }
      }
      return book.questionCount > 0;
    }

    _isChecked() {
      if (!this.currentAnswerRecord) return false;
      const book = this.activeBook;
      // For fill-blank/essay: self-assessed, stats available once any question answered
      if (book && (book.type === 'fill-blank' || book.type === 'essay')) {
        const answers = this.currentAnswerRecord.answers || {};
        return Object.keys(answers).length > 0;
      }
      const ca = this.currentAnswerRecord.correctAnswers;
      return ca && Object.keys(ca).length > 0;
    }

    _getCheckStats() {
      const book = this.activeBook;
      if (!book || !this._isChecked()) return null;
      const answers = this.currentAnswerRecord.answers || {};
      // For fill-blank/essay: self-assessed — count "正确" entries directly
      if (book.type === 'fill-blank' || book.type === 'essay') {
        const subCounts = this.currentAnswerRecord.subCounts || {};
        let correct = 0, total = 0;
        const wrongNums = [];
        for (let i = 1; i <= book.questionCount; i++) {
          const sc = subCounts[i] || 1;
          for (let j = 1; j <= sc; j++) {
            const key = sc > 1 ? (i + '.' + j) : i.toString();
            const ans = (answers[key] || '').trim();
            if (ans) { total++; if (ans === '正确') correct++; else { wrongNums.push(sc > 1 ? key : i); } }
          }
        }
        return total > 0 ? { correct, wrong: total - correct, rate: correct / total, total, wrongNums } : null;
      }
      const correctAnswers = this.currentAnswerRecord.correctAnswers || {};
      const subCounts = this.currentAnswerRecord.subCounts || {};
      let correct = 0, wrong = 0;
      const wrongNums = [];
      for (let i = 1; i <= book.questionCount; i++) {
        const sc = subCounts[i] || 1;
        for (let j = 1; j <= sc; j++) {
          const key = sc > 1 ? (i + '.' + j) : i.toString();
          const userAns = (answers[key] || '').trim();
          const correctAns = (correctAnswers[key] || '').trim();
          if (userAns && correctAns) {
            if (userAns === correctAns) correct++;
            else { wrong++; wrongNums.push(sc > 1 ? key : i); }
          }
        }
      }
      const total = correct + wrong;
      return total > 0 ? { correct, wrong, rate: correct / total, total, wrongNums } : null;
    }

    _openCheckModal() {
      const book = this.activeBook;
      if (!book) return;
      const existingCorrect = this.currentAnswerRecord.correctAnswers || {};
      const subCounts = this.currentAnswerRecord.subCounts || {};

      let html = '';
      for (let i = 1; i <= book.questionCount; i++) {
        const sc = subCounts[i] || 1;
        if (sc <= 1) {
          const preSelected = existingCorrect[i] || '';
          const optsHTML = OPTIONS.map(letter => {
            const sel = preSelected === letter ? ' is-selected' : '';
            return `<button class="question-option${sel}" data-q="${i}" data-val="${letter}">${letter}</button>`;
          }).join('');
          html += `
            <div class="correct-answer-row" data-q="${i}">
              <div class="correct-answer-row__num">${i}</div>
              <div class="question-options">${optsHTML}</div>
            </div>`;
        } else {
          for (let j = 1; j <= sc; j++) {
            const key = i + '.' + j;
            const preSelected = existingCorrect[key] || '';
            const optsHTML = OPTIONS.map(letter => {
              const sel = preSelected === letter ? ' is-selected' : '';
              return `<button class="question-option${sel}" data-q="${key}" data-val="${letter}">${letter}</button>`;
            }).join('');
            html += `
              <div class="correct-answer-row" data-q="${key}">
                <div class="correct-answer-row__num">${key}</div>
                <div class="question-options">${optsHTML}</div>
              </div>`;
          }
        }
      }

      this.els.correctAnswersList.innerHTML = html;
      // 绑定弹窗内的选项点击
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
        const qNum = row.dataset.q;
        const selected = row.querySelector('.question-option.is-selected');
        if (selected) correctAnswers[qNum] = selected.dataset.val;
      });

      if (Object.keys(correctAnswers).length === 0) {
        alert('请至少选择一题的正确答案');
        return;
      }

      this.currentAnswerRecord.correctAnswers = correctAnswers;
      this.currentAnswerRecord.checkedAt = Date.now();
      await this._persistAnswers();

      this._closeAllOverlays();
      this._renderQuestions();
      this._renderSummary();
      this._updateAnswerToolbar();
    }

    /* ================================================================
     * SUMMARY PANEL
     * ================================================================ */
    _renderSummary() {
      const book = this.activeBook;
      if (!book) return;
      const answers = this.currentAnswerRecord.answers || {};

      // 渲染答案汇总
      if (book.type === 'choice') {
        this._renderChoiceSummary(book, answers);
      } else {
        this._renderTextSummary(book, answers);
      }

      // 渲染核对区域
      this._renderCheckSection();

      // 按钮可见性
      const allAnswered = this._isAllAnswered();
      const isChecked = this._isChecked();

      if (book.type === 'choice') {
        if (isChecked) {
          this.els.btnOpenCheck.style.display = 'none';
          this.els.btnRecheck.style.display = '';
          this.els.checkHint.style.display = 'none';
        } else if (allAnswered) {
          this.els.btnOpenCheck.style.display = '';
          this.els.btnRecheck.style.display = 'none';
          this.els.checkHint.style.display = 'none';
        } else {
          this.els.btnOpenCheck.style.display = 'none';
          this.els.btnRecheck.style.display = 'none';
          this.els.checkHint.style.display = '';
          // 统计总答题格数（含子题）
          let totalSlots = 0, filledSlots = 0;
          for (let i = 1; i <= book.questionCount; i++) {
            const sc = subCounts[i] || 1;
            for (let j = 1; j <= sc; j++) {
              totalSlots++;
              const key = sc > 1 ? (i + '.' + j) : i.toString();
              if (answers[key] && answers[key].trim()) filledSlots++;
            }
          }
          const remaining = totalSlots - filledSlots;
          this.els.checkHintText.textContent = `还有 ${remaining} 个空未答，完成所有题目后可录入正确答案`;
        }
      } else {
        // fill-blank / essay: self-assessed, no separate check flow
        this.els.btnOpenCheck.style.display = 'none';
        this.els.btnRecheck.style.display = 'none';
        this.els.checkHint.style.display = 'none';
      }
    }

    _renderChoiceSummary(book, answers) {
      const subCounts = this.currentAnswerRecord.subCounts || {};
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
            // 子题用 / 拼起来
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
      this.els.summaryContent.innerHTML = html;
    }

    _renderTextSummary(book, answers) {
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
      this.els.summaryContent.innerHTML = html;
    }

    _renderCheckSection() {
      const book = this.activeBook;
      if (!book) { this.els.checkSection.style.display = 'none'; return; }

      // fill-blank/essay: auto-calculated from self-assessment
      if (book.type === 'fill-blank' || book.type === 'essay') {
        const stats = this._getCheckStats();
        if (stats) {
          this.els.checkSection.style.display = '';
          const ratePct = Math.round(stats.rate * 100);
          const cls = stats.rate >= 0.8 ? '--high' : (stats.rate >= 0.6 ? '--mid' : '--low');
          let html = '<div class="score-display">' +
            '<div class="score-display__value score-display__value' + cls + '">' + ratePct + '%</div>' +
            '<div class="score-display__label">正确率（' + stats.correct + '/' + stats.total + '）</div>' +
            '<div class="progress-bar" style="margin-top:var(--jy-space-3)">' +
            '<div class="progress-bar__fill progress-bar__fill' + cls + '" style="width:' + ratePct + '%"></div></div></div>';
          if (stats.wrongNums && stats.wrongNums.length) {
            html += '<div style="margin-top:var(--jy-space-3);font-size:var(--jy-font-size-sm);color:var(--jy-text-secondary)">❌ 错题：' + stats.wrongNums.join('、') + '</div>';
          }
          this.els.checkResults.innerHTML = html;
        } else {
          this.els.checkSection.style.display = 'none';
        }
        return;
      }

      if (book.type !== 'choice') { this.els.checkSection.style.display = 'none'; return; }
      const stats = this._getCheckStats();
      if (!stats) {
        this.els.checkSection.style.display = 'none';
        return;
      }

      this.els.checkSection.style.display = '';

      const rate = stats.rate;
      const ratePct = Math.round(rate * 100);
      const cls = rate >= 0.8 ? '--high' : (rate >= 0.6 ? '--mid' : '--low');

      let html = '';

      // 正确率大数字 + 进度条
      html += `<div class="score-display">
        <div class="score-display__value score-display__value${cls}">${ratePct}%</div>
        <div class="score-display__label">正确率</div>
        <div class="progress-bar" style="margin-top:var(--jy-space-3)">
          <div class="progress-bar__fill progress-bar__fill${cls}" style="width:${ratePct}%"></div>
        </div>
      </div>`;

      // 统计行
      html += `<div class="check-stat-row">
        <div class="check-stat-row__item">
          <div class="check-stat-row__value check-stat-row__value--correct">${stats.correct}</div>
          <div class="check-stat-row__label">✓ 正确</div>
        </div>
        <div class="check-stat-row__item">
          <div class="check-stat-row__value check-stat-row__value--wrong">${stats.wrong}</div>
          <div class="check-stat-row__label">✗ 错误</div>
        </div>
        <div class="check-stat-row__item">
          <div class="check-stat-row__value">${stats.total}</div>
          <div class="check-stat-row__label">已核对</div>
        </div>
      </div>`;

      // 错题列表或全对
      if (stats.wrong === 0 && stats.correct > 0) {
        html += `<div class="perfect-badge">🎉 全部正确！</div>`;
      } else if (stats.wrongNums.length > 0) {
        html += `<div style="margin-top:var(--jy-space-3)">
          <div style="font-size:var(--jy-font-size-sm);color:var(--jy-text-muted);margin-bottom:var(--jy-space-1)">❌ 错题序号</div>
          <div class="wrong-list">${stats.wrongNums.map(n => `<span class="wrong-tag">#${n}</span>`).join('')}</div>
        </div>`;
      }

      this.els.checkResults.innerHTML = html;
    }

    /* ---- copy answers ---- */
    async _copyAnswers() {
      const book = this.activeBook;
      if (!book) return;
      const answers = this.currentAnswerRecord.answers || {};

      const subCounts = this.currentAnswerRecord.subCounts || {};
      let text;
      if (book.type === 'choice') {
        let full = '';
        for (let i = 1; i <= book.questionCount; i++) {
          const sc = subCounts[i] || 1;
          if (sc <= 1) {
            full += answers[i] || '_';
          } else {
            for (let j = 1; j <= sc; j++) {
              full += answers[i + '.' + j] || '_';
            }
          }
        }
        text = full;
      } else {
        const lines = [];
        for (let i = 1; i <= book.questionCount; i++) {
          const sc = subCounts[i] || 1;
          if (sc <= 1) {
            lines.push(`${i}. ${answers[i] || '(未答)'}`);
          } else {
            for (let j = 1; j <= sc; j++) {
              lines.push(`${i}.${j}. ${answers[i + '.' + j] || '(未答)'}`);
            }
          }
        }
        text = lines.join('\n');
      }

      try {
        await navigator.clipboard.writeText(text);
      } catch (err) {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
      }
      this.els.copyFeedback.classList.add('is-visible');
      setTimeout(() => this.els.copyFeedback.classList.remove('is-visible'), 1800);
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
    window._questionBookApp = app;
  });

})();
