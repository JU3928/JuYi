;(function () {
  'use strict';

  const DB_NAME = 'JuYiDB';
  const DB_VERSION = 2;
  const STORE = 'errorNotebook';
  const PROGRESS_STORE = 'reviewProgress';
  const LS_SUBJECTS = 'jy_error_notebook_subjects';
  const LS_THEME = 'jy_theme';

  const DEFAULT_SUBJECTS = [
    { name: '政治', color: '#dc2626' },
    { name: '英语', color: '#2563eb' },
    { name: '数学', color: '#059669' },
    { name: '数据结构', color: '#7c3aed' },
    { name: '计组', color: '#0891b2' },
    { name: '操作系统', color: '#ea580c' },
    { name: '计网', color: '#10b981' },
  ];
  const COLORS_PRESET = [
    '#4f46e5', '#0891b2', '#059669', '#d97706',
    '#dc2626', '#7c3aed', '#db2777', '#2563eb',
    '#65a30d', '#ea580c', '#14b8a6', '#8b5cf6',
  ];

  /* ================================================================
   * IndexedDB
   * ================================================================ */
  class JuYiDB {
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
              if (!store.indexNames.contains(idx.name)) store.createIndex(idx.name, idx.keyPath, { unique: idx.unique || false });
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
    async exportAll(storeNames) {
      const data = {};
      for (const n of storeNames) data[n] = await this.getAll(n);
      return { _format: 'JuYiDB/2', exportedAt: new Date().toISOString(), stores: data };
    }
    async importAll(jsonData, stores) {
      if (!jsonData._format) throw new Error('格式不正确');
      const { stores: data } = jsonData;
      for (const [sn, items] of Object.entries(data)) {
        if (!stores[sn]) continue;
        await this.clear(sn);
        for (const item of items) { await this.add(sn, item); }
      }
    }
  }

  /* ================================================================
   * 主应用
   * ================================================================ */
  class ErrorNotebookApp {
    constructor() {
      this.db = new JuYiDB();
      this.subjects = [];
      this.items = [];
      /** @type {Map<string, {lastReviewedIndex:number, lastReviewDate:string}>} */
      this.progressMap = new Map();
      this.filters = { subjects: new Set(), tags: new Set() };
      this.searchQuery = '';
      this.sortBy = 'createdAt';
      this.sortOrder = 'desc';
      this.pendingDeleteId = null;
      this.editingId = null;

      // 复习状态
      this.review = {
        active: false,
        subject: '',
        items: [],
        currentIndex: -1,
      };
    }

    /* ==================== 初始化 ==================== */
    async init() {
      this._initTheme();
      this._loadSubjects();
      await this._openDB();
      await this._migrateData();
      await this._loadProgress();
      await this.reload();
      this._cacheDom();
      this._bindEvents();
      this._renderAll();
    }

    async _openDB() {
      await this.db.open(DB_NAME, DB_VERSION, {
        [STORE]: {
          keyPath: 'id', autoIncrement: true,
          indexes: [
            { name: 'subject', keyPath: 'subject' },
            { name: 'createdAt', keyPath: 'createdAt' },
            { name: 'isHard', keyPath: 'isHard' },
          ],
        },
        [PROGRESS_STORE]: {
          keyPath: 'subject', autoIncrement: false,
          indexes: [],
        },
      });
    }

    async _migrateData() {
      const all = await this.db.getAll(STORE);
      let changed = false;
      for (const item of all) {
        let dirty = false;
        if (item.isHard === undefined) { item.isHard = false; dirty = true; }
        if (!item.createdAt) { item.createdAt = item.created_at ? new Date(item.created_at).getTime() : Date.now(); dirty = true; }
        if (dirty) { await this.db.put(STORE, item); changed = true; }
      }
      if (changed) console.log('数据迁移完成: 已补充 isHard/createdAt 字段');
    }

    async _loadProgress() {
      const all = await this.db.getAll(PROGRESS_STORE);
      this.progressMap.clear();
      for (const p of all) this.progressMap.set(p.subject, p);
      // 为缺失的科目初始化
      for (const s of this.subjects) {
        if (!this.progressMap.has(s.name)) {
          const rec = { subject: s.name, lastReviewedIndex: -1, lastReviewDate: '' };
          await this.db.put(PROGRESS_STORE, rec);
          this.progressMap.set(s.name, rec);
        }
      }
    }

    async reload() {
      this.items = await this.db.getAll(STORE);
    }

    _loadSubjects() {
      try {
        const raw = localStorage.getItem(LS_SUBJECTS);
        if (raw) { this.subjects = JSON.parse(raw); if (!Array.isArray(this.subjects) || this.subjects.length === 0) throw new Error(); }
        else throw new Error();
      } catch (_) { this.subjects = DEFAULT_SUBJECTS.map(s => ({ ...s })); }
    }
    _saveSubjects() { localStorage.setItem(LS_SUBJECTS, JSON.stringify(this.subjects)); }
    _getSubjectColor(name) { const s = this.subjects.find(x => x.name === name); return s ? s.color : '#6b7280'; }

    _initTheme() { if (localStorage.getItem(LS_THEME) === 'dark') document.documentElement.setAttribute('data-theme', 'dark'); }
    _toggleTheme() {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem(LS_THEME, next);
    }

    /* ==================== DOM ==================== */
    _cacheDom() {
      const $ = s => document.querySelector(s);
      this.els = {
        sidebar: $('#sidebar'), btnToggleSidebar: $('#btnToggleSidebar'), btnOpenSidebar: $('#btnOpenSidebar'),
        subjectFilterList: $('#subjectFilterList'), tagFilterList: $('#tagFilterList'), statsPanel: $('#statsPanel'),
        searchInput: $('#searchInput'), btnClearSearch: $('#btnClearSearch'), sortSelect: $('#sortSelect'),
        btnAdd: $('#btnAdd'), btnStartReview: $('#btnStartReview'),
        cardList: $('#cardList'), emptyState: $('#emptyState'),
        editOverlay: $('#editOverlay'), editModalTitle: $('#editModalTitle'), editForm: $('#editForm'),
        editId: $('#editId'), editSubject: $('#editSubject'), editIsHard: $('#editIsHard'),
        editTags: $('#editTags'), editSource: $('#editSource'), btnSave: $('#btnSave'),
        detailOverlay: $('#detailOverlay'), detailBody: $('#detailBody'),
        btnMarkReview: $('#btnMarkReview'), btnEditFromDetail: $('#btnEditFromDetail'), btnDeleteFromDetail: $('#btnDeleteFromDetail'),
        subjectsOverlay: $('#subjectsOverlay'), subjectsBody: $('#subjectsBody'),
        confirmOverlay: $('#confirmOverlay'), btnConfirmDelete: $('#btnConfirmDelete'),
        btnExport: $('#btnExport'), btnImport: $('#btnImport'), importFileInput: $('#importFileInput'),
        btnCopyClipboard: $('#btnCopyClipboard'), btnPasteClipboard: $('#btnPasteClipboard'),
        btnToggleTheme: $('#btnToggleTheme'), btnManageSubjects: $('#btnManageSubjects'),
        btnResetProgress: $('#btnResetProgress'),
        modalCloseBtns: document.querySelectorAll('.modal-close-btn'),
        // 复习模式
        reviewMode: $('#reviewMode'), reviewSubject: $('#reviewSubject'), reviewProgress: $('#reviewProgress'),
        reviewCardContent: $('#reviewCardContent'), reviewCardBadge: $('#reviewCardBadge'), reviewCardDate: $('#reviewCardDate'),
        btnPrevQuestion: $('#btnPrevQuestion'), btnKnow: $('#btnKnow'), btnDontKnow: $('#btnDontKnow'),
        btnShowAnswer: $('#btnShowAnswer'), btnSkip: $('#btnSkip'), btnExitReview: $('#btnExitReview'),
        answerOverlay: $('#answerOverlay'), answerBody: $('#answerBody'),
        reviewCompleteBanner: $('#reviewCompleteBanner'),
      };
    }

    /* ==================== 事件 ==================== */
    _bindEvents() {
      const E = this.els;
      E.btnToggleSidebar.addEventListener('click', () => this._toggleSidebar());
      E.btnOpenSidebar.addEventListener('click', () => this._openSidebar());
      E.searchInput.addEventListener('input', () => this._onSearch());
      E.btnClearSearch.addEventListener('click', () => this._clearSearch());
      E.sortSelect.addEventListener('change', () => this._onSortChange());
      E.btnAdd.addEventListener('click', () => this._openEditModal(null));
      E.btnStartReview.addEventListener('click', () => this._startReview());
      E.btnSave.addEventListener('click', () => this._onSave());
      E.editForm.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.target.closest('.rich-editor__content')) { e.preventDefault(); this._onSave(); } });
      E.modalCloseBtns.forEach(b => b.addEventListener('click', () => this._closeAllModals()));
      [E.editOverlay, E.detailOverlay, E.subjectsOverlay, E.confirmOverlay, E.answerOverlay]
        .forEach(ov => ov.addEventListener('click', e => { if (e.target === ov) this._closeAllModals(); }));
      document.addEventListener('keydown', e => { if (e.key === 'Escape') this._closeAllModals(); });
      E.btnMarkReview.addEventListener('click', () => this._onMarkReview());
      E.btnEditFromDetail.addEventListener('click', () => this._onEditFromDetail());
      E.btnDeleteFromDetail.addEventListener('click', () => this._onDeleteFromDetail());
      E.btnConfirmDelete.addEventListener('click', () => this._onConfirmDelete());
      E.btnExport.addEventListener('click', () => this._onExport());
      E.btnImport.addEventListener('click', () => this.els.importFileInput.click());
      E.importFileInput.addEventListener('change', () => this._onImport());
      E.btnCopyClipboard.addEventListener('click', () => this._onCopyClipboard());
      E.btnPasteClipboard.addEventListener('click', () => this._onPasteClipboard());
      E.btnToggleTheme.addEventListener('click', () => { this._toggleTheme(); this._updateThemeBtn(); });
      E.btnManageSubjects.addEventListener('click', () => this._openSubjectsModal());
      E.btnResetProgress.addEventListener('click', () => this._onResetProgress());
      // 复习模式
      E.btnExitReview.addEventListener('click', () => this._exitReview());
      E.btnKnow.addEventListener('click', () => this._reviewAction('know'));
      E.btnDontKnow.addEventListener('click', () => this._reviewAction('dontknow'));
      E.btnShowAnswer.addEventListener('click', () => this._reviewShowAnswer());
      E.btnSkip.addEventListener('click', () => this._reviewAction('skip'));
      E.btnPrevQuestion.addEventListener('click', () => this._reviewPrev());
      document.getElementById('btnReviewReset').addEventListener('click', () => this._reviewReset());
      // 图片放大
      E.detailBody.addEventListener('click', e => { if (e.target.tagName === 'IMG') this._zoomImage(e.target.src); });
      E.reviewCardContent.addEventListener('click', e => { if (e.target.tagName === 'IMG') this._zoomImage(e.target.src); });
      // 富文本编辑器
      document.querySelectorAll('.rich-editor').forEach(ed => this._initRichEditor(ed));
    }

    /* ==================== 渲染 ==================== */
    _renderAll() {
      this._renderSubjectFilter();
      this._renderTagFilter();
      this._renderStats();
      this._renderCards();
    }

    _renderSubjectFilter() {
      const counts = this._countBy('subject');
      const c = this.els.subjectFilterList;
      c.innerHTML = '';
      c.appendChild(this._buildFilterItem({ label: '全部科目', active: this.filters.subjects.size === 0, count: this.items.length,
        onClick: () => { this.filters.subjects.clear(); this._rerender(); } }));
      for (const subj of this.subjects) {
        const active = this.filters.subjects.has(subj.name);
        c.appendChild(this._buildFilterItem({ color: subj.color, label: subj.name, active, count: counts[subj.name] || 0,
          onClick: () => { active ? this.filters.subjects.delete(subj.name) : this.filters.subjects.add(subj.name); this._rerender(); } }));
      }
    }

    _renderTagFilter() {
      const allTags = this._collectAllTags();
      const c = this.els.tagFilterList;
      c.innerHTML = '';
      if (allTags.length === 0) { c.innerHTML = '<span class="jy-text-muted jy-text-xs">暂无标签</span>'; return; }
      c.appendChild(this._buildFilterItem({ label: '全部标签', active: this.filters.tags.size === 0, count: this.items.length,
        onClick: () => { this.filters.tags.clear(); this._rerender(); } }));
      for (const { tag, count } of allTags) {
        const active = this.filters.tags.has(tag);
        c.appendChild(this._buildFilterItem({ label: tag, active, count, onClick: () => { active ? this.filters.tags.delete(tag) : this.filters.tags.add(tag); this._rerender(); } }));
      }
    }

    _buildFilterItem({ color, label, active, count, onClick }) {
      const d = document.createElement('div');
      d.className = 'filter-item' + (active ? ' is-active' : '');
      d.innerHTML = [
        color ? `<span class="filter-item__color" style="background:${color}"></span>` : '',
        `<span>${esc(label)}</span>`, `<span class="filter-item__count">${count}</span>`,
      ].join('');
      d.addEventListener('click', onClick);
      return d;
    }

    _renderStats() {
      const p = this.els.statsPanel;
      const total = this.items.length;
      if (total === 0) { p.innerHTML = '<div class="jy-text-muted jy-text-xs">暂无数据</div>'; return; }
      const bySubject = this._countBy('subject');
      const hardCount = this.items.filter(i => i.isHard).length;
      const normalCount = total - hardCount;
      let h = `<div class="stats-panel__row"><span>总计</span><strong>${total}</strong></div>`;
      h += `<div class="stats-panel__row"><span>普通库</span><span>${normalCount}</span></div>`;
      h += `<div class="stats-panel__row"><span>难题库</span><span>${hardCount}</span></div>`;
      h += '<div style="margin-top:var(--jy-space-2)">';
      for (const subj of this.subjects) {
        const cnt = bySubject[subj.name] || 0;
        if (cnt === 0) continue;
        const prog = this.progressMap.get(subj.name);
        const done = prog ? prog.lastReviewedIndex + 1 : 0;
        h += `<div class="stats-panel__row"><span style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:2px;background:${subj.color};display:inline-block"></span>${esc(subj.name)}</span><span>${cnt}题 / 复习${done}</span></div>`;
      }
      h += '</div>';
      p.innerHTML = h;
    }

    _renderCards() {
      const list = this._getFilteredItems();
      if (list.length === 0) { this.els.cardList.innerHTML = ''; this.els.emptyState.style.display = 'block'; return; }
      this.els.emptyState.style.display = 'none';
      this.els.cardList.innerHTML = list.map(item => this._buildCard(item)).join('');
    }

    _buildCard(item) {
      const color = this._getSubjectColor(item.subject);
      const preview = stripHtml(item.question);
      const text = preview.length > 120 ? preview.slice(0, 120) + '…' : preview;
      const hasImg = /<img[^>]*>/i.test(item.question) ? ' 📷' : '';
      const badge = item.isHard
        ? '<span class="card__badge card__badge--hard">难题</span>'
        : '<span class="card__badge card__badge--normal">普通</span>';
      const tags = (item.tags || []).map(t => `<span class="jy-tag">${esc(t)}</span>`).join('');
      const created = fmtDate(item.createdAt);
      const review = item.lastReviewedAt ? `<span class="card__review-badge">🔄 ${fmtDate(item.lastReviewedAt)}</span>` : '';
      return `<div class="card" data-id="${item.id}">
        <div class="card__header"><span class="card__subject" style="background:${color}">${esc(item.subject)}</span>${badge}</div>
        <div class="card__preview">${esc(text)}${hasImg}</div>
        ${tags ? `<div class="card__tags">${tags}</div>` : ''}
        <div class="card__footer"><span>${created}</span>${review}</div></div>`;
    }

    _getFilteredItems() {
      let list = [...this.items];
      if (this.filters.subjects.size > 0) list = list.filter(i => this.filters.subjects.has(i.subject));
      if (this.filters.tags.size > 0) list = list.filter(i => (i.tags || []).some(t => this.filters.tags.has(t)));
      if (this.searchQuery.trim()) {
        const q = this.searchQuery.trim().toLowerCase();
        list = list.filter(i => stripHtml(i.question).toLowerCase().includes(q));
      }
      const [field, order] = [this.sortBy, this.sortOrder];
      list.sort((a, b) => {
        let va = a[field] || 0, vb = b[field] || 0;
        if (va < vb) return order === 'asc' ? -1 : 1;
        if (va > vb) return order === 'asc' ? 1 : -1;
        return 0;
      });
      return list;
    }

    _countBy(field) { const m = {}; for (const i of this.items) { const k = i[field]; if (k != null) m[k] = (m[k] || 0) + 1; } return m; }
    _collectAllTags() { const m = new Map(); for (const i of this.items) for (const t of (i.tags || [])) m.set(t, (m.get(t) || 0) + 1); return [...m.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count); }

    async _rerender() {
      await this.reload();
      this._renderAll();
    }

    /* ==================== 复习模式 ==================== */
    _getActiveSubject() {
      if (this.filters.subjects.size === 1) return [...this.filters.subjects][0];
      return this.subjects[0]?.name || '';
    }

    async _startReview() {
      const subject = this._getActiveSubject();
      if (!subject) { alert('请先在侧边栏选择一个科目'); return; }
      const items = this.items.filter(i => i.subject === subject).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      if (items.length === 0) { alert('该科目暂无题目，请先添加'); return; }

      let prog = this.progressMap.get(subject);
      if (!prog) {
        prog = { subject, lastReviewedIndex: -1, lastReviewDate: '' };
        await this.db.put(PROGRESS_STORE, prog);
        this.progressMap.set(subject, prog);
      }

      let startIdx = prog.lastReviewedIndex + 1;
      if (startIdx >= items.length) {
        const ok = confirm('已完成该科目所有题目的复习！\n是否重新开始？');
        if (!ok) return;
        prog.lastReviewedIndex = -1;
        prog.lastReviewDate = '';
        await this.db.put(PROGRESS_STORE, prog);
        this.progressMap.set(subject, prog);
        startIdx = 0;
      }

      this.review = { active: true, subject, items, currentIndex: startIdx };
      this.els.cardList.style.display = 'none';
      this.els.emptyState.style.display = 'none';
      this.els.reviewMode.style.display = 'flex';
      this.els.reviewSubject.textContent = subject;
      this.els.reviewCompleteBanner.style.display = 'none';
      this._renderReviewCard();
    }

    _renderReviewCard() {
      const { items, currentIndex } = this.review;
      if (currentIndex >= items.length) {
        this._showReviewComplete();
        return;
      }
      const item = items[currentIndex];
      this.els.reviewCardContent.innerHTML = sanitizeHTML(item.question || '<span class="jy-text-muted">暂无题目</span>');
      this.els.reviewCardBadge.innerHTML = item.isHard
        ? '<span class="card__badge card__badge--hard">难题</span>'
        : '<span class="card__badge card__badge--normal">普通</span>';
      this.els.reviewCardBadge.setAttribute('data-hard', item.isHard ? '1' : '0');
      this.els.reviewCardDate.textContent = '创建于 ' + fmtDate(item.createdAt);
      this.els.reviewProgress.textContent = `${currentIndex + 1} / ${items.length}`;
      this.els.btnPrevQuestion.style.visibility = currentIndex > 0 ? 'visible' : 'hidden';
      this.els.reviewCompleteBanner.style.display = 'none';
    }

    _showReviewComplete() {
      this.els.reviewCardContent.innerHTML = '<div style="text-align:center;padding:40px"><p style="font-size:2rem">🎉</p><p style="font-size:1.2rem;font-weight:600;margin:12px 0">恭喜！本周复习完成</p></div>';
      this.els.reviewCardBadge.innerHTML = '';
      this.els.reviewCardDate.textContent = '';
      this.els.reviewProgress.textContent = '✓';
      this.els.btnPrevQuestion.style.visibility = 'hidden';
      this.els.reviewCompleteBanner.style.display = 'block';
    }

    async _reviewAction(action) {
      const { items, currentIndex, subject } = this.review;
      if (currentIndex >= items.length) return;
      const item = items[currentIndex];

      if (action === 'know') {
        if (item.isHard) { item.isHard = false; await this.db.put(STORE, item); }
      } else if (action === 'dontknow') {
        if (!item.isHard) { item.isHard = true; await this.db.put(STORE, item); }
      }
      // skip: don't modify isHard, don't update progress

      if (action !== 'skip') {
        item.lastReviewedAt = Date.now();
        await this.db.put(STORE, item);
        // Update progress
        const prog = this.progressMap.get(subject);
        if (prog) {
          prog.lastReviewedIndex = currentIndex;
          prog.lastReviewDate = new Date().toISOString().slice(0, 10);
          await this.db.put(PROGRESS_STORE, prog);
        }
      }

      this.review.currentIndex++;
      this._renderReviewCard();
    }

    _reviewShowAnswer() {
      const { items, currentIndex } = this.review;
      if (currentIndex >= items.length) return;
      const item = items[currentIndex];
      this.els.answerBody.innerHTML = sanitizeHTML(item.answer || '<span class="jy-text-muted">暂无解析</span>');
      this._openOverlay(this.els.answerOverlay);
    }

    _reviewPrev() {
      if (this.review.currentIndex > 0) {
        this.review.currentIndex--;
        this._renderReviewCard();
      }
    }

    async _reviewReset() {
      const { subject } = this.review;
      const prog = { subject, lastReviewedIndex: -1, lastReviewDate: '' };
      await this.db.put(PROGRESS_STORE, prog);
      this.progressMap.set(subject, prog);
      this.review.currentIndex = 0;
      this.els.reviewCompleteBanner.style.display = 'none';
      this._renderReviewCard();
    }

    async _exitReview() {
      this.review.active = false;
      this.els.reviewMode.style.display = 'none';
      this.els.cardList.style.display = '';
      await this.reload();
      this._renderAll();
    }

    async _onResetProgress() {
      const subject = this._getActiveSubject();
      if (!subject) { alert('请先选择一个科目'); return; }
      const confirmed = confirm(`确定要重置「${subject}」的复习进度吗？`);
      if (!confirmed) return;
      const prog = { subject, lastReviewedIndex: -1, lastReviewDate: '' };
      await this.db.put(PROGRESS_STORE, prog);
      this.progressMap.set(subject, prog);
      this._renderStats();
      alert('复习进度已重置');
    }

    /* ==================== 弹窗：编辑 ==================== */
    _openEditModal(item) {
      this.editingId = item ? item.id : null;
      this.els.editModalTitle.textContent = item ? '编辑错题' : '添加错题';
      this.els.editId.value = item ? item.id : '';
      const sel = this.els.editSubject;
      sel.innerHTML = this.subjects.map(s => `<option value="${escAttr(s.name)}">${esc(s.name)}</option>`).join('');
      if (item) {
        sel.value = item.subject;
        this.els.editIsHard.checked = !!item.isHard;
        this._setEditorContent('question', item.question || '');
        this._setEditorContent('answer', item.answer || '');
        this.els.editTags.value = (item.tags || []).join(', ');
        this.els.editSource.value = item.source || '';
      } else {
        sel.value = this.subjects[0]?.name || '';
        this.els.editIsHard.checked = false;
        this._setEditorContent('question', '');
        this._setEditorContent('answer', '');
        this.els.editTags.value = '';
        this.els.editSource.value = '';
      }
      this._openOverlay(this.els.editOverlay);
    }

    /* ==================== 弹窗：详情 ==================== */
    _openDetailModal(item) {
      const b = this.els.detailBody;
      const color = this._getSubjectColor(item.subject);
      const badge = item.isHard ? '<span class="card__badge card__badge--hard">难题</span>' : '<span class="card__badge card__badge--normal">普通</span>';
      const tags = (item.tags || []).map(t => `<span class="jy-tag">${esc(t)}</span>`).join(' ') || '—';
      const source = item.source || '—';
      const created = fmtDate(item.createdAt, true);
      const lastReview = item.lastReviewedAt ? fmtDate(item.lastReviewedAt, true) : '尚未复习';

      b.innerHTML = `
        <div class="detail-section"><span class="detail-section__label">📌 题目</span><div class="detail-section__content">${sanitizeHTML(item.question || '<span class="jy-text-muted">暂无</span>')}</div></div>
        <div class="detail-section"><span class="detail-section__label">💡 解析</span><div class="detail-section__content">${sanitizeHTML(item.answer || '<span class="jy-text-muted">暂无</span>')}</div></div>
        <div class="detail-meta">
          <span class="detail-meta__item"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${color}"></span> 科目：${esc(item.subject)}</span>
          <span class="detail-meta__item">${badge}</span>
          <span class="detail-meta__item">🏷️ 标签：${tags}</span>
          <span class="detail-meta__item">📖 来源：${esc(source)}</span>
          <span class="detail-meta__item">📅 添加：${created}</span>
          <span class="detail-meta__item">🔄 最近复习：${lastReview}</span>
        </div>`;
      b.setAttribute('data-detail-id', item.id);
      this._openOverlay(this.els.detailOverlay);
    }

    _openSubjectsModal() {
      const b = this.els.subjectsBody;
      const counts = this._countBy('subject');
      let h = '<div class="subject-manage-list">';
      for (const s of this.subjects) {
        h += `<div class="subject-manage-item"><span class="subject-manage-item__color" style="background:${s.color}"></span><span class="subject-manage-item__name">${esc(s.name)}</span><span class="subject-manage-item__count">${counts[s.name] || 0} 题</span></div>`;
      }
      h += '</div><div class="subject-add-row"><input type="text" id="newSubjectName" placeholder="新科目名称"><button id="btnAddSubject" class="jy-btn jy-btn--primary jy-btn--sm">+ 添加</button></div>';
      b.innerHTML = h;
      b.querySelector('#btnAddSubject').addEventListener('click', () => {
        const inp = b.querySelector('#newSubjectName');
        const name = inp.value.trim();
        if (!name) return;
        if (this.subjects.some(s => s.name === name)) { alert('已存在'); return; }
        const used = new Set(this.subjects.map(s => s.color));
        const color = COLORS_PRESET.find(c => !used.has(c)) || COLORS_PRESET[0];
        this.subjects.push({ name, color });
        this._saveSubjects();
        // 初始化复习进度
        this.db.put(PROGRESS_STORE, { subject: name, lastReviewedIndex: -1, lastReviewDate: '' });
        this._openSubjectsModal();
        this._rerender();
      });
      b.querySelector('#newSubjectName')?.addEventListener('keydown', e => { if (e.key === 'Enter') b.querySelector('#btnAddSubject')?.click(); });
      this._openOverlay(this.els.subjectsOverlay);
    }

    _openOverlay(ov) { ov.classList.add('is-open'); document.body.style.overflow = 'hidden'; }
    _closeAllModals() {
      [this.els.editOverlay, this.els.detailOverlay, this.els.subjectsOverlay, this.els.confirmOverlay, this.els.answerOverlay]
        .forEach(ov => ov.classList.remove('is-open'));
      document.body.style.overflow = this.review.active ? 'hidden' : '';
      this.editingId = null;
      this.pendingDeleteId = null;
    }

    /* ==================== 事件处理 ==================== */
    _toggleSidebar() { this.els.sidebar.classList.toggle('is-collapsed'); }
    _openSidebar() { this.els.sidebar.classList.remove('is-collapsed'); }
    _onSearch() { this.searchQuery = this.els.searchInput.value; this.els.btnClearSearch.style.display = this.searchQuery ? 'flex' : 'none'; this._rerender(); }
    _clearSearch() { this.els.searchInput.value = ''; this.searchQuery = ''; this.els.btnClearSearch.style.display = 'none'; this.els.searchInput.focus(); this._rerender(); }
    _onSortChange() { const [f, o] = this.els.sortSelect.value.split('-'); this.sortBy = f; this.sortOrder = o; this._rerender(); }

    async _onSave() {
      const id = this.els.editId.value;
      const item = {
        subject: this.els.editSubject.value,
        isHard: this.els.editIsHard.checked,
        question: this._getEditorContent('question'),
        answer: this._getEditorContent('answer'),
        tags: this.els.editTags.value.split(/[,，\s]+/).map(s => s.trim()).filter(Boolean),
        source: this.els.editSource.value.trim(),
      };
      if (!item.question.trim() && !item.answer.trim()) { alert('题目和解析至少填一项'); return; }

      if (id) {
        const existing = await this.db.get(STORE, parseInt(id));
        if (!existing) return;
        item.id = existing.id;
        item.createdAt = existing.createdAt || Date.now();
        item.lastReviewedAt = existing.lastReviewedAt || null;
        await this.db.put(STORE, item);
      } else {
        item.createdAt = Date.now();
        item.lastReviewedAt = null;
        await this.db.add(STORE, item);
      }
      this._closeAllModals();
      await this.reload();
      this._renderAll();
    }

    async _onMarkReview() {
      const id = parseInt(this.els.detailBody.getAttribute('data-detail-id'));
      if (!id) return;
      const item = await this.db.get(STORE, id);
      if (!item) return;
      item.lastReviewedAt = Date.now();
      await this.db.put(STORE, item);
      await this.reload();
      this._renderAll();
      this._openDetailModal(item);
    }

    _onEditFromDetail() {
      const id = parseInt(this.els.detailBody.getAttribute('data-detail-id'));
      if (!id) return;
      const item = this.items.find(i => i.id === id);
      if (!item) return;
      this._closeAllModals();
      setTimeout(() => this._openEditModal(item), 200);
    }

    _onDeleteFromDetail() {
      this.pendingDeleteId = parseInt(this.els.detailBody.getAttribute('data-detail-id'));
      if (!this.pendingDeleteId) return;
      this._openOverlay(this.els.confirmOverlay);
    }

    async _onConfirmDelete() {
      if (!this.pendingDeleteId) return;
      await this.db.delete(STORE, this.pendingDeleteId);
      this._closeAllModals();
      await this.reload();
      this._renderAll();
    }

    async _onExport() {
      const data = await this.db.exportAll([STORE, PROGRESS_STORE]);
      data._subjects = this.subjects;
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `JuYi-ErrorNotes-${fmtDate(Date.now()).replace(/\//g, '-')}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    async _onImport() {
      const file = this.els.importFileInput.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data._format || !data.stores?.[STORE]) throw new Error('格式不正确');
        const confirmed = confirm(`即将导入 ${data.stores[STORE].length} 条记录，确定覆盖？`);
        if (!confirmed) return;
        // 规范化导入数据
        const items = data.stores[STORE].map(item => ({
          ...item,
          isHard: item.isHard !== undefined ? item.isHard : false,
          createdAt: item.createdAt || Date.now(),
          lastReviewedAt: item.lastReviewedAt || null,
        }));
        await this.db.clear(STORE);
        for (const item of items) await this.db.add(STORE, item);
        // 导入进度（如果有）
        if (data.stores[PROGRESS_STORE]) {
          await this.db.clear(PROGRESS_STORE);
          for (const p of data.stores[PROGRESS_STORE]) await this.db.add(PROGRESS_STORE, p);
        }
        if (data._subjects) { this.subjects = data._subjects; this._saveSubjects(); }
        await this._loadProgress();
        await this.reload();
        this._renderAll();
        alert('导入成功！');
      } catch (err) { alert('导入失败：' + err.message); }
      finally { this.els.importFileInput.value = ''; }
    }

    async _onCopyClipboard() {
      const data = await this.db.exportAll([STORE, PROGRESS_STORE]);
      data._subjects = this.subjects;
      let text = JSON.stringify(data);
      const rawKB = (text.length / 1024).toFixed(0);
      let mode = 'raw';
      // Gzip compress if supported
      if (typeof CompressionStream !== 'undefined') {
        try {
          const blob = new Blob([text]);
          const cs = new CompressionStream('gzip');
          const compressed = await new Response(blob.stream().pipeThrough(cs)).blob();
          const buf = await compressed.arrayBuffer();
          const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
          text = '\x01gz' + base64; // magic prefix
          mode = 'gzip';
        } catch (_) {}
      }
      const finalKB = (text.length / 1024).toFixed(0);
      if (text.length > 3 * 1024 * 1024) {
        alert(`数据过大（${finalKB} KB），剪贴板可能截断。建议改用「导出备份」保存文件传输。`);
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        alert(`已复制！(${finalKB} KB${mode === 'gzip' ? '，已压缩' : ''})\n发给手机后在手机端点击「从剪贴板导入」`);
      } catch (e) {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
        alert(`已复制！(${finalKB} KB) → 发给手机后点「从剪贴板导入」`);
      }
    }

    async _onPasteClipboard() {
      let text = '';
      try { text = await navigator.clipboard.readText(); }
      catch (e) { text = prompt('请粘贴数据（在微信/QQ 中长按复制电脑发来的消息，然后粘贴到这里）：'); }
      if (!text || !text.trim()) { alert('没有读取到数据'); return; }
      // Decompress if gzip-prefixed
      if (text.startsWith('\x01gz')) {
        try {
          const base64 = text.slice(4);
          const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
          const ds = new DecompressionStream('gzip');
          const decompressed = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).text();
          text = decompressed;
        } catch (e) { alert('解压失败，请重新复制；或改用文件导入'); return; }
      }
      try {
        const data = JSON.parse(text);
        if (!data._format || !data.stores?.[STORE]) throw new Error('格式不正确');
        const confirmed = confirm(`即将导入 ${data.stores[STORE].length} 条记录，确定覆盖当前数据？`);
        if (!confirmed) return;
        const items = data.stores[STORE].map(item => ({
          ...item,
          isHard: item.isHard !== undefined ? item.isHard : false,
          createdAt: item.createdAt || Date.now(),
          lastReviewedAt: item.lastReviewedAt || null,
        }));
        await this.db.clear(STORE);
        for (const item of items) await this.db.add(STORE, item);
        if (data.stores[PROGRESS_STORE]) {
          await this.db.clear(PROGRESS_STORE);
          for (const p of data.stores[PROGRESS_STORE]) await this.db.add(PROGRESS_STORE, p);
        }
        if (data._subjects) { this.subjects = data._subjects; this._saveSubjects(); }
        await this._loadProgress();
        await this.reload();
        this._renderAll();
        alert('导入成功！');
      } catch (e) { alert('导入失败：' + e.message + '\n请重新复制或改用文件导入'); }
    }

    _updateThemeBtn() {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      this.els.btnToggleTheme.textContent = isDark ? '☀️ 明亮模式' : '🌙 暗色模式';
    }

    _onCardClick(e) {
      const card = e.target.closest('.card'); if (!card) return;
      const item = this.items.find(i => i.id === parseInt(card.dataset.id));
      if (item) this._openDetailModal(item);
    }

    _zoomImage(src) {
      const old = document.querySelector('.image-zoom-overlay'); if (old) old.remove();
      const ov = document.createElement('div'); ov.className = 'image-zoom-overlay';
      ov.innerHTML = `<img src="${src}" alt="">`;
      ov.addEventListener('click', () => ov.remove());
      document.body.appendChild(ov);
      requestAnimationFrame(() => ov.classList.add('is-open'));
    }

    /* ==================== 富文本编辑器 ==================== */
    _initRichEditor(container) {
      const content = container.querySelector('.rich-editor__content');
      const toolbar = container.querySelector('.rich-editor__toolbar');
      const fileInput = container.querySelector('.rich-editor__file-input');
      toolbar.querySelectorAll('button[data-cmd]').forEach(btn => {
        btn.addEventListener('click', () => {
          const cmd = btn.dataset.cmd;
          if (cmd === 'image') { fileInput.click(); return; }
          if (cmd === 'removeFormat') { document.execCommand('removeFormat', false, null); return; }
          document.execCommand(cmd, false, null); content.focus();
        });
      });
      const update = () => toolbar.querySelectorAll('button[data-cmd]').forEach(btn => {
        const cmd = btn.dataset.cmd; if (cmd === 'image' || cmd === 'removeFormat') return;
        btn.classList.toggle('is-active', document.queryCommandState(cmd));
      });
      content.addEventListener('keyup', update); content.addEventListener('mouseup', update); content.addEventListener('click', update);
      fileInput.addEventListener('change', () => { const f = fileInput.files[0]; if (f) { this._insertImage(content, f); fileInput.value = ''; } });
      content.addEventListener('paste', e => {
        const items = e.clipboardData?.items; if (!items) return;
        for (const item of items) { if (item.type.startsWith('image/')) { e.preventDefault(); const blob = item.getAsFile(); const r = new FileReader(); r.onload = () => document.execCommand('insertImage', false, r.result); r.readAsDataURL(blob); return; } }
      });
      content.addEventListener('drop', e => {
        const files = e.dataTransfer?.files; if (!files || files.length === 0) return;
        const imgs = [...files].filter(f => f.type.startsWith('image/')); if (imgs.length === 0) return;
        e.preventDefault(); imgs.forEach(f => this._insertImage(content, f));
      });
      content.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
    }
    _insertImage(content, file) { const r = new FileReader(); r.onload = () => { content.focus(); document.execCommand('insertImage', false, r.result); }; r.readAsDataURL(file); }
    _getEditorContent(name) { const el = document.querySelector(`.rich-editor[data-editor="${name}"] .rich-editor__content`); return el ? el.innerHTML : ''; }
    _setEditorContent(name, html) { const el = document.querySelector(`.rich-editor[data-editor="${name}"] .rich-editor__content`); if (el) el.innerHTML = html || ''; }
  }

  /* ================================================================
   * 工具函数
   * ================================================================ */
  function stripHtml(html) { if (!html) return ''; const d = document.createElement('div'); d.innerHTML = html; d.querySelectorAll('img').forEach(img => img.replaceWith(' [图片] ')); return d.textContent || ''; }
  function sanitizeHTML(html) { if (!html) return ''; return html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/on\w+\s*=\s*"[^"]*"/gi, '').replace(/on\w+\s*=\s*'[^']*'/gi, ''); }
  function esc(str) { if (!str) return ''; const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
  function escAttr(str) { return str.replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
  function fmtDate(ts, withTime) { if (!ts) return ''; const d = new Date(ts); const pad = n => String(n).padStart(2, '0'); const ds = `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`; return withTime ? `${ds} ${pad(d.getHours())}:${pad(d.getMinutes())}` : ds; }

  /* ================================================================
   * 启动
   * ================================================================ */
  document.addEventListener('DOMContentLoaded', () => {
    const app = new ErrorNotebookApp();
    app.init().then(() => {
      app.els.cardList.addEventListener('click', e => app._onCardClick(e));
      app._updateThemeBtn();
      console.log('JuYi 错题本 v2 已就绪');
    }).catch(err => console.error('初始化失败:', err));
  });
})();