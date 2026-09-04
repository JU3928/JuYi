;(function () {
  'use strict';

  const DB_NAME = 'JuYiDB';
  const DB_VERSION = 2;
  const STORE = 'errorNotebook';
  const PROGRESS_STORE = 'reviewProgress';
  const LS_SUBJECTS = 'jy_error_notebook_subjects';
  const LS_THEME = 'jy_theme';
  const LS_REDO_STATE = 'jy_error_notebook_redo_state';
  const REDO_LEVEL_LABEL = { mastered: '已掌握', fuzzy: '模糊', failed: '未掌握' };

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

      // 重做状态
      this.redo = {
        active: false,
        settings: null,   // { count, weakOnly, hardFilter, subjects:[] }
        queue: [],        // 剩余题目 id 列表
        index: 0,
        results: [],      // { id, level } 本次已评
        skipped: 0,
        total: 0,
      };
      // 重做设置面板的科目选择（未确认前）
      this.redoSetupSubjects = new Set();
    }

    /* ==================== 初始化 ==================== */
    async init() {
      // 诊断：确认 shared 模块已正确加载
      if (typeof JuYiDB === 'undefined') { var em = document.getElementById('cardList'); if (em) em.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--jy-danger)">❌ JuYiDB 未加载（shared/db-core.js 可能加载失败）</div>'; return; }
      if (typeof sanitizeHtml === 'undefined') { var em2 = document.getElementById('cardList'); if (em2) em2.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--jy-danger)">❌ sanitizeHtml 未加载（shared/utils.js 可能加载失败）</div>'; return; }
      this._initTheme();
      this._loadSubjects();
      await this._openDB();
      await this._migrateData();
      await this._loadProgress();
      await this.reload();
      this._cacheDom();
      this._bindEvents();
      // 手机屏宽下默认收起侧边栏（fixed 抽屉，避免遮挡主区按钮）
      if (window.innerWidth <= 768) {
        this.els.sidebar.classList.add('is-collapsed');
      }
      this._renderAll();

      // 支持从 error-book 跳转定位（?id=123）
      var urlParams = new URLSearchParams(window.location.search);
      var targetId = urlParams.get('id');
      if (targetId) {
        var self = this;
        this.db.get('errorNotebook', Number(targetId)).then(function (item) {
          if (item) self._openDetailModal(item);
          else alert('该题目已不存在或已被删除');
        });
      }
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
        if (item.redoMastery === undefined) { item.redoMastery = null; dirty = true; }
        if (item.redoCount === undefined) { item.redoCount = 0; dirty = true; }
        if (item.lastRedoAt === undefined) { item.lastRedoAt = 0; dirty = true; }
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
        btnAdd: $('#btnAdd'), btnStartReview: $('#btnStartReview'), btnStartRedo: $('#btnStartRedo'),
        cardList: $('#cardList'), emptyState: $('#emptyState'),
        editOverlay: $('#editOverlay'), editModalTitle: $('#editModalTitle'), editForm: $('#editForm'),
        editId: $('#editId'), editSubject: $('#editSubject'), editIsHard: $('#editIsHard'),
        editTags: $('#editTags'), editSource: $('#editSource'), btnSave: $('#btnSave'),
        detailOverlay: $('#detailOverlay'), detailBody: $('#detailBody'),
        btnMarkReview: $('#btnMarkReview'), btnEditFromDetail: $('#btnEditFromDetail'), btnDeleteFromDetail: $('#btnDeleteFromDetail'),
        subjectsOverlay: $('#subjectsOverlay'), subjectsBody: $('#subjectsBody'),
        confirmOverlay: $('#confirmOverlay'), btnConfirmDelete: $('#btnConfirmDelete'),
        btnExport: $('#btnExport'), btnImport: $('#btnImport'), importFileInput: $('#importFileInput'),
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
        // 重做模式
        redoMode: $('#redoMode'), redoProgress: $('#redoProgress'),
        redoCardContent: $('#redoCardContent'), redoCardBadge: $('#redoCardBadge'), redoCardDate: $('#redoCardDate'),
        btnRedoMastered: $('#btnRedoMastered'), btnRedoFuzzy: $('#btnRedoFuzzy'), btnRedoFailed: $('#btnRedoFailed'),
        btnRedoShowAnswer: $('#btnRedoShowAnswer'), btnRedoSkip: $('#btnRedoSkip'), btnExitRedo: $('#btnExitRedo'),
        redoEndScreen: $('#redoEndScreen'),
        // 重做设置弹窗
        redoSetupOverlay: $('#redoSetupOverlay'), redoCount: $('#redoCount'),
        redoSubjectChips: $('#redoSubjectChips'), redoHardFilter: $('#redoHardFilter'),
        redoWeakOnly: $('#redoWeakOnly'), btnRedoStart: $('#btnRedoStart'),
        redoResumeBanner: $('#redoResumeBanner'), redoResumeText: $('#redoResumeText'),
        btnRedoResume: $('#btnRedoResume'), btnRedoDiscard: $('#btnRedoDiscard'),
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
      // 重做模式
      E.btnStartRedo.addEventListener('click', () => this._openRedoSetup());
      E.btnRedoStart.addEventListener('click', () => this._startRedoFromSetup());
      E.btnRedoResume.addEventListener('click', () => this._resumeRedo());
      E.btnRedoDiscard.addEventListener('click', () => this._discardRedoState());
      E.btnExitRedo.addEventListener('click', () => this._exitRedo());
      E.btnRedoMastered.addEventListener('click', () => this._redoAnswer('mastered'));
      E.btnRedoFuzzy.addEventListener('click', () => this._redoAnswer('fuzzy'));
      E.btnRedoFailed.addEventListener('click', () => this._redoAnswer('failed'));
      E.btnRedoShowAnswer.addEventListener('click', () => this._redoShowAnswer());
      E.btnRedoSkip.addEventListener('click', () => this._redoSkip());
      E.btnSave.addEventListener('click', () => this._onSave());
      E.editForm.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.target.closest('.rich-editor__content')) { e.preventDefault(); this._onSave(); } });
      E.modalCloseBtns.forEach(b => b.addEventListener('click', () => this._closeAllModals()));
      [E.editOverlay, E.detailOverlay, E.subjectsOverlay, E.confirmOverlay, E.answerOverlay, E.redoSetupOverlay]
        .forEach(ov => ov.addEventListener('click', e => { if (e.target === ov) this._closeAllModals(); }));
      document.addEventListener('keydown', e => { if (e.key === 'Escape') this._closeAllModals(); });
      E.btnMarkReview.addEventListener('click', () => this._onMarkReview());
      E.btnEditFromDetail.addEventListener('click', () => this._onEditFromDetail());
      E.btnDeleteFromDetail.addEventListener('click', () => this._onDeleteFromDetail());
      E.btnConfirmDelete.addEventListener('click', () => this._onConfirmDelete());
      E.btnExport.addEventListener('click', () => this._onExport());
      E.btnImport.addEventListener('click', () => this.els.importFileInput.click());
      E.importFileInput.addEventListener('change', () => this._onImport());
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
      // 图片放大（详情 / 复习卡 / 重做卡 / 解析弹窗）
      E.detailBody.addEventListener('click', e => { if (e.target.tagName === 'IMG') this._zoomImage(e.target.src); });
      E.reviewCardContent.addEventListener('click', e => { if (e.target.tagName === 'IMG') this._zoomImage(e.target.src); });
      E.redoCardContent.addEventListener('click', e => { if (e.target.tagName === 'IMG') this._zoomImage(e.target.src); });
      E.answerBody.addEventListener('click', e => { if (e.target.tagName === 'IMG') this._zoomImage(e.target.src); });
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
        h += `<div class="stats-panel__row"><span style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:2px;background:${subj.color};display:inline-block"></span>${esc(subj.name)}</span><span>复习${done} / ${cnt}题</span></div>`;
      }
      h += '</div>';
      p.innerHTML = h;
    }

    _renderCards() {
      const list = this._getFilteredItems();
      if (list.length === 0) { this.els.cardList.innerHTML = ''; this.els.emptyState.style.display = 'block'; return; }
      this.els.emptyState.style.display = 'none';
      this.els.cardList.innerHTML = list.map((item, i) => this._buildCard(item).replace('class="card"', `class="card card-in" style="animation-delay:${i*40}ms"`)).join('');
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
      const redo = item.redoCount
        ? `<span class="card__review-badge card__redo-badge">🎲 重${item.redoCount} · ${esc(REDO_LEVEL_LABEL[item.redoMastery] || '未记录')}</span>`
        : '';
      return `<div class="card" data-id="${item.id}">
        <div class="card__header"><span class="card__subject" style="background:${color}">${esc(item.subject)}</span>${badge}</div>
        <div class="card__preview">${esc(text)}${hasImg}</div>
        ${tags ? `<div class="card__tags">${tags}</div>` : ''}
        <div class="card__footer"><span>${created}</span>${review}${redo}</div></div>`;
    }

    _getFilteredItems() {
      let list = [...this.items];
      if (this.filters.subjects.size > 0) list = list.filter(i => this.filters.subjects.has(i.subject));
      if (this.filters.tags.size > 0) list = list.filter(i => (i.tags || []).some(t => this.filters.tags.has(t)));
      if (this.searchQuery.trim()) {
        const q = this.searchQuery.trim().toLowerCase();
        list = list.filter(i => {
          if (stripHtml(i.question).toLowerCase().includes(q)) return true;
          if ((i.source || '').toLowerCase().includes(q)) return true;
          if ((i.tags || []).some(t => t.toLowerCase().includes(q))) return true;
          return false;
        });
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
      if (!subject) { alert('请先在侧边栏选择一个科目','error'); return; }
      const items = this.items.filter(i => i.subject === subject).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      if (items.length === 0) { alert('该科目暂无题目，请先添加','error'); return; }

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
      this.els.reviewCardContent.innerHTML = sanitizeHtml(item.question || '<span class="jy-text-muted">暂无题目</span>');
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
      this.els.answerBody.innerHTML = sanitizeHtml(item.answer || '<span class="jy-text-muted">暂无解析</span>');
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

    /* ==================== 重做模式 ==================== */
    _openRedoSetup() {
      if (this.items.length === 0) { alert('还没有错题，请先添加','error'); return; }
      this.redoSetupSubjects = new Set();
      this._buildRedoSubjectChips();
      const saved = this._getSavedRedoState();
      if (saved && saved.queue.length > 0) {
        this.els.redoResumeText.textContent = `上次重做中断于第 ${saved.index} / ${saved.total} 题`;
        this.els.redoResumeBanner.style.display = 'flex';
      } else {
        this.els.redoResumeBanner.style.display = 'none';
      }
      this._openOverlay(this.els.redoSetupOverlay);
    }

    _buildRedoSubjectChips() {
      const c = this.els.redoSubjectChips;
      const counts = this._countBy('subject');
      const chip = (label, active, count, onClick) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'redo-chip' + (active ? ' is-active' : '');
        b.innerHTML = `${esc(label)}${count !== undefined ? ` <span class="redo-chip__count">${count}</span>` : ''}`;
        b.addEventListener('click', onClick);
        return b;
      };
      c.innerHTML = '';
      c.appendChild(chip('全部', this.redoSetupSubjects.size === 0, this.items.length, () => {
        this.redoSetupSubjects.clear(); this._buildRedoSubjectChips();
      }));
      for (const subj of this.subjects) {
        const active = this.redoSetupSubjects.has(subj.name);
        c.appendChild(chip(subj.name, active, counts[subj.name] || 0, () => {
          active ? this.redoSetupSubjects.delete(subj.name) : this.redoSetupSubjects.add(subj.name);
          this._buildRedoSubjectChips();
        }));
      }
    }

    _getSavedRedoState() {
      try {
        const raw = localStorage.getItem(LS_REDO_STATE);
        if (!raw) return null;
        const s = JSON.parse(raw);
        if (!s || !Array.isArray(s.queue) || typeof s.index !== 'number') return null;
        return s;
      } catch (_) { return null; }
    }

    _saveRedoState() {
      if (!this.redo.active) return;
      localStorage.setItem(LS_REDO_STATE, JSON.stringify({
        queue: this.redo.queue, index: this.redo.index,
        results: this.redo.results, skipped: this.redo.skipped,
        total: this.redo.total, settings: this.redo.settings,
        savedAt: Date.now(),
      }));
    }

    _clearRedoState() { localStorage.removeItem(LS_REDO_STATE); }

    _discardRedoState() {
      this._clearRedoState();
      this.els.redoResumeBanner.style.display = 'none';
    }

    _startRedoFromSetup() {
      const count = Math.max(1, Math.min(200, parseInt(this.els.redoCount.value, 10) || 10));
      const hardFilter = this.els.redoHardFilter.value;
      const weakOnly = this.els.redoWeakOnly.checked;
      const subjects = [...this.redoSetupSubjects];

      let pool = this.items;
      if (subjects.length > 0) pool = pool.filter(i => subjects.includes(i.subject));
      if (hardFilter === 'hard') pool = pool.filter(i => i.isHard);
      if (hardFilter === 'normal') pool = pool.filter(i => !i.isHard);

      const queueItems = computeRedoQueue(pool, { count, weakOnly });
      if (queueItems.length === 0) { alert('没有符合条件的题目','error'); return; }

      this._closeAllModals();
      this._startRedo({
        queue: queueItems.map(i => i.id),
        settings: { count, weakOnly, hardFilter, subjects },
        index: 0, results: [], skipped: 0, total: queueItems.length,
      });
    }

    _resumeRedo() {
      const saved = this._getSavedRedoState();
      if (!saved) return;
      const existingIds = new Set(this.items.map(i => i.id));
      const queue = saved.queue.filter(id => existingIds.has(id));
      if (queue.length === 0) { this._discardRedoState(); alert('上次队列中的题目已被删除','error'); return; }
      this._closeAllModals();
      this._startRedo({
        queue, settings: saved.settings || { count: queue.length, weakOnly: true, hardFilter: 'all', subjects: [] },
        index: saved.index, results: saved.results || [], skipped: saved.skipped || 0,
        total: saved.total || queue.length,
      });
    }

    _startRedo(state) {
      this.redo = { active: true, ...state };
      this.els.cardList.style.display = 'none';
      this.els.emptyState.style.display = 'none';
      this.els.redoMode.style.display = 'flex';
      this.els.redoEndScreen.style.display = 'none';
      this._renderRedoCard();
      this._saveRedoState();
    }

    _renderRedoCard() {
      const { queue, index } = this.redo;
      if (index >= queue.length) { this._showRedoEnd(); return; }
      const item = this.items.find(i => i.id === queue[index]);
      if (!item) { // 题目已被删除 → 跳过
        this.redo.index++;
        this._saveRedoState();
        this._renderRedoCard();
        return;
      }
      const card = this.els.redoMode.querySelector('.review-card');
      if (card) card.style.display = '';
      this.els.redoCardContent.innerHTML = sanitizeHtml(item.question || '<span class="jy-text-muted">暂无题目</span>');
      this.els.redoCardBadge.innerHTML = `<span class="card__subject" style="background:${this._getSubjectColor(item.subject)}">${esc(item.subject)}</span>`
        + (item.isHard ? '<span class="card__badge card__badge--hard">难题</span>' : '<span class="card__badge card__badge--normal">普通</span>');
      this.els.redoCardDate.textContent = `创建于 ${fmtDate(item.createdAt)} · 已重做 ${item.redoCount || 0} 次`;
      this.els.redoProgress.textContent = `${index + 1} / ${this.redo.total}`;
    }

    async _redoAnswer(level) {
      const { queue, index } = this.redo;
      if (index >= queue.length) return;
      const item = this.items.find(i => i.id === queue[index]);
      if (item) {
        item.redoMastery = level;
        item.redoCount = (item.redoCount || 0) + 1;
        item.lastRedoAt = Date.now();
        await this.db.put(STORE, item);
        this.redo.results.push({ id: item.id, level });
      }
      this.redo.index++;
      this._saveRedoState();
      this._renderRedoCard();
    }

    _redoSkip() {
      this.redo.skipped++;
      this.redo.index++;
      this._saveRedoState();
      this._renderRedoCard();
    }

    _redoShowAnswer() {
      const { queue, index } = this.redo;
      if (index >= queue.length) return;
      const item = this.items.find(i => i.id === queue[index]);
      if (!item) return;
      this.els.answerBody.innerHTML = sanitizeHtml(item.answer || '<span class="jy-text-muted">暂无解析</span>');
      this._openOverlay(this.els.answerOverlay);
    }

    _showRedoEnd() {
      const { results, skipped, total } = this.redo;
      const countOf = l => results.filter(r => r.level === l).length;
      const mastered = countOf('mastered'), fuzzy = countOf('fuzzy'), failed = countOf('failed');
      const weak = results.filter(r => r.level === 'fuzzy' || r.level === 'failed')
        .map(r => this.items.find(i => i.id === r.id))
        .filter(Boolean);

      let h = `<div class="redo-end">
        <div class="redo-end__title">🎉 本次重做完成</div>
        <div class="redo-end__stats">
          <div class="redo-end__stat"><strong>${total}</strong><span>总题数</span></div>
          <div class="redo-end__stat redo-end__stat--ok"><strong>${mastered}</strong><span>✅ 掌握</span></div>
          <div class="redo-end__stat redo-end__stat--fuzzy"><strong>${fuzzy}</strong><span>🤔 模糊</span></div>
          <div class="redo-end__stat redo-end__stat--bad"><strong>${failed}</strong><span>❌ 未掌握</span></div>
          <div class="redo-end__stat"><strong>${skipped}</strong><span>⏭ 跳过</span></div>
        </div>`;
      if (weak.length > 0) {
        h += `<div class="redo-end__weak">
          <div class="redo-end__weak-title">📌 弱题清单（下次重做将优先出现）</div>
          ${weak.map(w => {
            const preview = stripHtml(w.question);
            const text = preview.length > 60 ? preview.slice(0, 60) + '…' : preview;
            return `<div class="redo-weak-item" data-id="${w.id}">
              <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${this._getSubjectColor(w.subject)}"></span>
              <span class="redo-weak-item__text">${esc(text)}</span>
              <span class="jy-text-muted jy-text-xs">${esc(w.subject)}</span>
            </div>`;
          }).join('')}
        </div>`;
      }
      h += `<div class="redo-end__actions">
        <button id="btnRedoFinish" class="jy-btn jy-btn--primary">✅ 完成</button>
      </div></div>`;

      this.els.redoEndScreen.innerHTML = h;
      this.els.redoEndScreen.style.display = '';
      this.els.redoEndScreen.querySelectorAll('.redo-weak-item').forEach(el => {
        el.addEventListener('click', () => {
          const item = this.items.find(i => i.id === parseInt(el.dataset.id, 10));
          if (item) this._openDetailModal(item);
        });
      });
      this.els.redoEndScreen.querySelector('#btnRedoFinish').addEventListener('click', () => this._exitRedo(true));
      const card = this.els.redoMode.querySelector('.review-card');
      if (card) card.style.display = 'none';
      this.els.redoProgress.textContent = '✓';
      this._clearRedoState();
    }

    async _exitRedo(finished) {
      if (!finished) {
        const ok = confirm('重做尚未完成。\n确定退出吗？本次进度将被丢弃。');
        if (!ok) return;
        this._clearRedoState();
      }
      this.redo.active = false;
      this.els.redoMode.style.display = 'none';
      this.els.cardList.style.display = '';
      await this.reload();
      this._renderAll();
    }

    async _onResetProgress() {
      const subject = this._getActiveSubject();
      if (!subject) { alert('请先选择一个科目','error'); return; }
      const confirmed = confirm(`确定要重置「${subject}」的复习进度吗？`);
      if (!confirmed) return;
      const prog = { subject, lastReviewedIndex: -1, lastReviewDate: '' };
      await this.db.put(PROGRESS_STORE, prog);
      this.progressMap.set(subject, prog);
      this._renderStats();
      alert('复习进度已重置','success');
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
      const lastRedo = item.redoCount
        ? `🎲 重做 ${item.redoCount} 次 · 最近${REDO_LEVEL_LABEL[item.redoMastery] || '未记录'}（${fmtDate(item.lastRedoAt, true)}）`
        : '尚未重做';

      b.innerHTML = `
        <div class="detail-section"><span class="detail-section__label">📌 题目</span><div class="detail-section__content">${sanitizeHtml(item.question || '<span class="jy-text-muted">暂无</span>')}</div></div>
        <div class="detail-section"><span class="detail-section__label">💡 解析</span><div class="detail-section__content">${sanitizeHtml(item.answer || '<span class="jy-text-muted">暂无</span>')}</div></div>
        <div class="detail-meta">
          <span class="detail-meta__item"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${color}"></span> 科目：${esc(item.subject)}</span>
          <span class="detail-meta__item">${badge}</span>
          <span class="detail-meta__item">🏷️ 标签：${tags}</span>
          <span class="detail-meta__item">📖 来源：${esc(source)}</span>
          <span class="detail-meta__item">📅 添加：${created}</span>
          <span class="detail-meta__item">🔄 最近复习：${lastReview}</span>
          <span class="detail-meta__item">${lastRedo}</span>
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
        if (this.subjects.some(s => s.name === name)) { alert('已存在','error'); return; }
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
      [this.els.editOverlay, this.els.detailOverlay, this.els.subjectsOverlay, this.els.confirmOverlay, this.els.answerOverlay, this.els.redoSetupOverlay]
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
      if (!item.question.trim() && !item.answer.trim()) { alert('题目和解析至少填一项','error'); return; }

      if (id) {
        const existing = await this.db.get(STORE, parseInt(id));
        if (!existing) return;
        item.id = existing.id;
        item.createdAt = existing.createdAt || Date.now();
        item.lastReviewedAt = existing.lastReviewedAt || null;
        item.redoMastery = existing.redoMastery || null;
        item.redoCount = existing.redoCount || 0;
        item.lastRedoAt = existing.lastRedoAt || 0;
        await this.db.put(STORE, item);
      } else {
        item.createdAt = Date.now();
        item.lastReviewedAt = null;
        item.redoMastery = null;
        item.redoCount = 0;
        item.lastRedoAt = 0;
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
        alert('导入成功！','success');
      } catch (err) { alert('导入失败：' + err.message, 'error'); }
      finally { this.els.importFileInput.value = ''; }
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
    _setEditorContent(name, html) { const el = document.querySelector(`.rich-editor[data-editor="${name}"] .rich-editor__content`); if (el) el.innerHTML = sanitizeHtml(html) || ''; }
  }

  /* ================================================================
   * 工具函数
   * ================================================================ */
  /* esc / escAttr / stripHtml / sanitizeHtml — provided by shared/utils.js */
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
    }).catch(err => {
      console.error('初始化失败:', err);
      var el = document.getElementById('cardList');
      if (el) el.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--jy-danger)">⚠️ 初始化失败：' + (err && err.message || err) + '<br><small>请检查浏览器控制台（F12）获取详情</small></div>';
      var empty = document.getElementById('emptyState');
      if (empty) empty.style.display = 'none';
    });
  });
})();