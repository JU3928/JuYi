;(function () {
  'use strict';

  const DB_NAME = 'JuYiBattleReport';
  const DB_VERSION = 1;
  const STORE_QUESTIONS = 'questions';
  const STORE_TEMPLATES = 'templates';
  const STORE_RATINGS = 'ratings';
  const LS_THEME = 'jy_theme';

  const TAG_POOL = [
    '二分查找','前缀和','差分','双指针','滑动窗口','单调栈','单调队列',
    'BFS','DFS','回溯','贪心','动态规划','背包DP','区间DP','树形DP','状态压缩DP',
    '最短路','最小生成树','并查集','线段树','树状数组','Trie树','KMP',
    '哈希表','字符串','数学','数论','模拟','分治','排序','位运算',
    '拓扑排序','LCA','RMQ','博弈论','概率论','矩阵快速幂'
  ];

  const PLATFORMS = [
    { key: 'leetcode',   label: 'LeetCode',    color: '#3b82f6', fill: 'rgba(59,130,246,0.08)' },
    { key: 'nowcoder',   label: 'NowCoder',    color: '#10b981', fill: 'rgba(16,185,129,0.08)' },
    { key: 'codeforces', label: 'Codeforces',  color: '#f97316', fill: 'rgba(249,115,22,0.08)' },
  ];

  /* ================================================================
   * Utility
   * ================================================================ */
  function esc(str) {
    if (!str) return '';
    const d = document.createElement('div'); d.textContent = str; return d.innerHTML;
  }
  function escAttr(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function fmtDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function fmtDateShort(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return (d.getMonth() + 1) + '/' + d.getDate();
  }

  /* ================================================================
   * App
   * ================================================================ */
  class BattleReportApp {
    constructor() {
      this.db = new JuYiDB();
      this.questions = [];
      this.templates = [];
      this.ratings = [];
      // Filters
      this.filterTags = new Set();
      this.searchQuery = '';
      this.sortBy = 'createdAt';
      this.sortOrder = 'desc';
      // Chart
      this.chartVisibility = { leetcode: true, nowcoder: true, codeforces: true };
      this._chartPoints = [];
      // Edit state
      this._selectedPlatform = 'leetcode';
      this._screenshotData = null; // base64 data URL or null
      this._pendingDelete = null;
    }

    /* ---- lifecycle ---- */
    async init() {
      // 诊断
      if (typeof JuYiDB === 'undefined') { alert('❌ JuYiDB 未加载'); return; }
      this._restoreTheme();
      this._cacheDom();
      this._bindEvents();
      await this.db.open(DB_NAME, DB_VERSION, {
        [STORE_QUESTIONS]: {
          keyPath: 'id', autoIncrement: true,
          indexes: [{ name: 'createdAt', keyPath: 'createdAt' }]
        },
        [STORE_TEMPLATES]: {
          keyPath: 'id', autoIncrement: true, indexes: []
        },
        [STORE_RATINGS]: {
          keyPath: 'id', autoIncrement: true,
          indexes: [
            { name: 'platform', keyPath: 'platform' },
            { name: 'date', keyPath: 'date' }
          ]
        }
      });
      await this.reload();
      this._renderAll();
    }

    _restoreTheme() {
      if (localStorage.getItem(LS_THEME) === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    }

    _cacheDom() {
      const $ = (s) => document.querySelector(s);
      this.els = {
        btnToggleTheme: $('#btnToggleTheme'),
        // Chart
        ratingChart: $('#ratingChart'), chartTooltip: $('#chartTooltip'), chartEmpty: $('#chartEmpty'),
        legendLeetcode: $('#legendLeetcode'), legendNowcoder: $('#legendNowcoder'), legendCodeforces: $('#legendCodeforces'),
        btnAddRating: $('#btnAddRating'), btnManageRatings: $('#btnManageRatings'),
        // Questions
        searchInput: $('#searchInput'), btnClearSearch: $('#btnClearSearch'),
        sortSelect: $('#sortSelect'), tagFilterBar: $('#tagFilterBar'),
        questionCount: $('#questionCount'),
        btnAddQuestion: $('#btnAddQuestion'),
        questionGrid: $('#questionGrid'), questionEmpty: $('#questionEmpty'),
        // Templates
        btnAddTemplate: $('#btnAddTemplate'),
        templateList: $('#templateList'), templateEmpty: $('#templateEmpty'),
        // Question modal
        qOverlay: $('#qOverlay'), qModalTitle: $('#qModalTitle'),
        qId: $('#qId'), qNumber: $('#qNumber'), qTitle: $('#qTitle'), qUrl: $('#qUrl'),
        qTagList: $('#qTagList'), qTemplateList: $('#qTemplateList'),
        btnSaveQuestion: $('#btnSaveQuestion'),
        // Template modal
        tOverlay: $('#tOverlay'), tModalTitle: $('#tModalTitle'),
        tId: $('#tId'), tName: $('#tName'), tTagList: $('#tTagList'),
        tDescription: $('#tDescription'), tCode: $('#tCode'), tCodeGutter: $('#tCodeGutter'),
        tComplexity: $('#tComplexity'),
        btnSaveTemplate: $('#btnSaveTemplate'),
        // Rating modal
        rOverlay: $('#rOverlay'), rDate: $('#rDate'), rPlatformCards: $('#rPlatformCards'),
        rScreenshotFile: $('#rScreenshotFile'), rScreenshotPreview: $('#rScreenshotPreview'),
        rScreenshotImg: $('#rScreenshotImg'), btnPickScreenshot: $('#btnPickScreenshot'),
        btnRemoveScreenshot: $('#btnRemoveScreenshot'),
        rRatingValue: $('#rRatingValue'), btnSaveRating: $('#btnSaveRating'),
        lightboxOverlay: $('#lightboxOverlay'), lightboxImg: $('#lightboxImg'),
        // Manage ratings
        mrOverlay: $('#mrOverlay'), mrList: $('#mrList'),
        // Link template modal
        linkOverlay: $('#linkOverlay'), linkTemplateList: $('#linkTemplateList'),
        linkQuestionId: $('#linkQuestionId'), btnSaveLink: $('#btnSaveLink'),
        // Confirm delete
        confirmOverlay: $('#confirmOverlay'), confirmMsg: $('#confirmMsg'),
        btnConfirmDelete: $('#btnConfirmDelete'),
      };
    }

    _bindEvents() {
      const E = this.els;

      // Theme
      E.btnToggleTheme.addEventListener('click', () => this._toggleTheme());

      // Chart
      E.legendLeetcode.addEventListener('click', () => { this.chartVisibility.leetcode = !this.chartVisibility.leetcode; this._drawChart(); });
      E.legendNowcoder.addEventListener('click', () => { this.chartVisibility.nowcoder = !this.chartVisibility.nowcoder; this._drawChart(); });
      E.legendCodeforces.addEventListener('click', () => { this.chartVisibility.codeforces = !this.chartVisibility.codeforces; this._drawChart(); });
      E.btnAddRating.addEventListener('click', () => this._openRatingModal());
      E.btnManageRatings.addEventListener('click', () => this._openManageRatingsModal());
      E.btnSaveRating.addEventListener('click', () => this._saveRating());

      // Questions
      E.searchInput.addEventListener('input', () => { this.searchQuery = E.searchInput.value; E.btnClearSearch.style.display = this.searchQuery ? '' : 'none'; this._renderQuestionGrid(); });
      E.btnClearSearch.addEventListener('click', () => { E.searchInput.value = ''; this.searchQuery = ''; E.btnClearSearch.style.display = 'none'; E.searchInput.focus(); this._renderQuestionGrid(); });
      E.sortSelect.addEventListener('change', () => { const [f, o] = E.sortSelect.value.split('-'); this.sortBy = f; this.sortOrder = o; this._renderQuestionGrid(); });
      E.btnAddQuestion.addEventListener('click', () => this._openQuestionModal(null));
      E.btnSaveQuestion.addEventListener('click', () => this._saveQuestion());
      E.questionGrid.addEventListener('click', (e) => this._onQuestionGridClick(e));

      // Templates
      E.btnAddTemplate.addEventListener('click', () => this._openTemplateModal(null));
      E.btnSaveTemplate.addEventListener('click', () => this._saveTemplate());
      // Code editor
      E.tCode.addEventListener('input', () => this._updateLineNumbers());
      E.tCode.addEventListener('keydown', (e) => this._onCodeKeydown(e));
      E.tCode.addEventListener('scroll', () => this._syncCodeScroll());
      E.templateList.addEventListener('click', (e) => this._onTemplateListClick(e));

      // Link template
      E.btnSaveLink.addEventListener('click', () => this._saveLink());

      // Confirm delete
      E.btnConfirmDelete.addEventListener('click', () => this._confirmDelete());

      // Modals general
      document.querySelectorAll('.modal-close-btn').forEach(btn => {
        btn.addEventListener('click', () => this._closeAllOverlays());
      });
      document.querySelectorAll('.jy-overlay').forEach(ov => {
        ov.addEventListener('click', (e) => { if (e.target === ov) this._closeAllOverlays(); });
      });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this._closeAllOverlays(); });

      // Screenshot
      E.btnPickScreenshot.addEventListener('click', () => E.rScreenshotFile.click());
      E.rScreenshotFile.addEventListener('change', () => this._onScreenshotPicked());
      E.btnRemoveScreenshot.addEventListener('click', () => this._removeScreenshot());
      // Lightbox
      E.lightboxOverlay.addEventListener('click', () => this._closeLightbox());
      E.lightboxImg.addEventListener('click', (e) => e.stopPropagation());

      // Chart
      E.ratingChart.addEventListener('mousemove', (e) => this._onChartHover(e));
      E.ratingChart.addEventListener('mouseleave', () => { E.chartTooltip.style.display = 'none'; });
      E.ratingChart.addEventListener('click', (e) => this._onChartClick(e));
      window.addEventListener('resize', () => { if (window._battleReportApp) this._drawChart(); });
    }

    /* ---- theme ---- */
    _toggleTheme() {
      const cur = document.documentElement.getAttribute('data-theme');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem(LS_THEME, next);
      this.els.btnToggleTheme.innerHTML = next === 'dark' ? '☀️ 亮色模式' : '🌙 暗色模式';
      this._drawChart();
    }

    /* ---- data ---- */
    async reload() {
      this.questions = await this.db.getAll(STORE_QUESTIONS);
      this.templates = await this.db.getAll(STORE_TEMPLATES);
      this.ratings = await this.db.getAll(STORE_RATINGS);
    }

    /* ---- overlay ---- */
    _openOverlay(ov) { ov.classList.add('is-open'); document.body.style.overflow = 'hidden'; }
    _closeAllOverlays() {
      document.querySelectorAll('.jy-overlay').forEach(ov => ov.classList.remove('is-open'));
      document.body.style.overflow = '';
    }

    /* ---- render all ---- */
    _renderAll() {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      this.els.btnToggleTheme.innerHTML = isDark ? '☀️ 亮色模式' : '🌙 暗色模式';
      this._renderTagFilters();
      this._renderQuestionGrid();
      this._renderTemplateList();
      this._drawChart();
    }

    /* ================================================================
     * RATING & CHART
     * ================================================================ */
    _drawChart() {
      const canvas = this.els.ratingChart;
      if (!canvas) return;

      // Prepare series
      const series = PLATFORMS.map(p => ({
        ...p,
        data: this.ratings.filter(r => r.platform === p.key).sort((a, b) => a.date - b.date),
        visible: this.chartVisibility[p.key]
      }));

      // Update legend display
      ['leetcode','nowcoder','codeforces'].forEach((key, i) => {
        const el = this.els['legend' + key.charAt(0).toUpperCase() + key.slice(1)];
        if (el) el.className = 'br-legend__item' + (this.chartVisibility[key] ? '' : ' br-legend__item--hidden');
      });

      const allVisible = series.filter(sr => sr.visible).flatMap(sr => sr.data);
      if (allVisible.length === 0) {
        this.els.chartEmpty.style.display = 'flex';
        this.els.chartTooltip.style.display = 'none';
        return;
      }
      this.els.chartEmpty.style.display = 'none';

      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const result = JyCharts.line(canvas, {
        height: 290,
        pad: { top: 20, right: 20, bottom: 35, left: 50 },
        colors: {
          bg: isDark ? '#1e293b' : '#fafbfc',
          grid: isDark ? '#334155' : '#e5e7eb',
          text: isDark ? '#94a3b8' : '#6b7280',
        },
        series: series.filter(sr => sr.visible && sr.data.length > 0).map(sr => ({
          key: sr.key,
          color: sr.color,
          area: isDark ? sr.fill.replace('0.08', '0.12') : sr.fill,
          data: sr.data.map(r => ({ x: r.date, y: r.rating, datum: r })),
        })),
        yTicks: 4,
        yTickFormat: v => String(Math.round(v)),
        ySpanFallback: 100, // 只有一条记录时值域回退 ±20%
        xTickFormat: x => fmtDateShort(x),
        xTickEvery: Math.max(1, Math.floor(allVisible.length / 6)),
        emptyText: '',
        dotR: 4,
        dotInner: '#fff',
        singleDotR: 5,
        decorate: (ctx, x, y, datum, sr) => {
          if (datum && datum.screenshot) {
            ctx.strokeStyle = sr.color;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(x, y, 7, 0, Math.PI * 2);
            ctx.stroke();
          }
        },
      });

      this._chartPoints = result.points.map(p => ({
        x: p.x,
        y: p.y,
        platform: p.series.key,
        rating: p.datum.rating,
        date: p.datum.date,
        screenshot: p.datum.screenshot || null,
      }));
    }

    _onChartHover(e) {
      if (!this._chartPoints || this._chartPoints.length === 0) return;
      const rect = e.target.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      let nearest = null, minDist = Infinity;
      for (const pt of this._chartPoints) {
        const dx = pt.x - mx, dy = pt.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist && dist < 30) { minDist = dist; nearest = pt; }
      }
      const tt = this.els.chartTooltip;
      if (nearest) {
        const plat = PLATFORMS.find(p => p.key === nearest.platform);
        tt.innerHTML = `<strong style="color:${plat.color}">${plat.label}</strong> ${fmtDate(nearest.date)}<br>Rating: <strong>${nearest.rating}</strong>${nearest.screenshot ? ' 🖼️' : ''}`;
        tt.style.display = 'block';
        tt.style.left = Math.min(nearest.x + 12, rect.width - 150) + 'px';
        tt.style.top = Math.max(nearest.y - 45, 5) + 'px';
        if (nearest.screenshot) this.els.ratingChart.style.cursor = 'pointer';
        else this.els.ratingChart.style.cursor = 'crosshair';
      } else {
        tt.style.display = 'none';
        this.els.ratingChart.style.cursor = 'crosshair';
      }
    }

    _onChartClick(e) {
      if (!this._chartPoints || this._chartPoints.length === 0) return;
      const rect = e.target.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      for (const pt of this._chartPoints) {
        const dx = pt.x - mx, dy = pt.y - my;
        if (Math.sqrt(dx * dx + dy * dy) < 20 && pt.screenshot) {
          this._openLightbox(pt.screenshot);
          return;
        }
      }
    }

    /* ---- Rating CRUD ---- */
    _openRatingModal() {
      this.els.rDate.value = new Date().toISOString().slice(0, 10);
      this.els.rRatingValue.value = '';
      this._selectedPlatform = 'leetcode';
      // Reset screenshot
      this._screenshotData = null;
      this.els.rScreenshotFile.value = '';
      this.els.rScreenshotPreview.style.display = 'none';
      this.els.btnPickScreenshot.style.display = '';
      this.els.rPlatformCards.innerHTML = PLATFORMS.map(p => `
        <div class="br-platform-card${p.key === 'leetcode' ? ' is-selected' : ''}" data-platform="${p.key}">
          <div class="br-platform-card__name" style="color:${p.color}">${p.label}</div>
        </div>
      `).join('');
      this.els.rPlatformCards.querySelectorAll('.br-platform-card').forEach(card => {
        card.addEventListener('click', () => {
          this.els.rPlatformCards.querySelectorAll('.br-platform-card').forEach(c => c.classList.remove('is-selected'));
          card.classList.add('is-selected');
          this._selectedPlatform = card.dataset.platform;
        });
      });
      this._openOverlay(this.els.rOverlay);
    }

    async _saveRating() {
      const rating = parseInt(this.els.rRatingValue.value);
      if (isNaN(rating) || rating <= 0) { alert('请输入有效的 Rating 值'); return; }
      const rec = {
        platform: this._selectedPlatform,
        date: new Date(this.els.rDate.value).getTime(),
        rating, createdAt: Date.now()
      };
      if (this._screenshotData) rec.screenshot = this._screenshotData;
      await this.db.add(STORE_RATINGS, rec);
      this._closeAllOverlays();
      await this.reload();
      this._drawChart();
    }

    /* ---- Screenshot ---- */
    _onScreenshotPicked() {
      const file = this.els.rScreenshotFile.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        this._screenshotData = reader.result;
        this.els.rScreenshotImg.src = reader.result;
        this.els.rScreenshotPreview.style.display = 'inline-block';
        this.els.btnPickScreenshot.style.display = 'none';
      };
      reader.readAsDataURL(file);
    }

    _removeScreenshot() {
      this._screenshotData = null;
      this.els.rScreenshotFile.value = '';
      this.els.rScreenshotPreview.style.display = 'none';
      this.els.btnPickScreenshot.style.display = '';
    }

    _openLightbox(src) {
      this.els.lightboxImg.src = src;
      this._openOverlay(this.els.lightboxOverlay);
    }

    _closeLightbox() {
      this.els.lightboxOverlay.classList.remove('is-open');
      document.body.style.overflow = '';
    }

    _openManageRatingsModal() {
      const list = [...this.ratings].sort((a, b) => b.date - a.date);
      if (list.length === 0) {
        this.els.mrList.innerHTML = '<div class="jy-empty"><div class="jy-empty__text">暂无记录</div></div>';
      } else {
        this.els.mrList.innerHTML = `<table class="jy-table"><thead><tr><th>平台</th><th>日期</th><th>Rating</th><th>截图</th><th>操作</th></tr></thead><tbody>
          ${list.map(r => {
            const p = PLATFORMS.find(x => x.key === r.platform) || { label: r.platform, color: '#999' };
            const ssHTML = r.screenshot
              ? `<img src="${r.screenshot}" class="br-screenshot-thumb" data-screenshot="${escAttr(r.screenshot)}" title="点击查看大图">`
              : '<span style="color:var(--jy-text-muted);font-size:var(--jy-font-size-xs)">—</span>';
            return `<tr>
              <td><span style="color:${p.color};font-weight:600">${p.label}</span></td>
              <td>${fmtDate(r.date)}</td>
              <td><strong>${r.rating}</strong></td>
              <td>${ssHTML}</td>
              <td><button class="jy-btn jy-btn--danger jy-btn--sm del-rating-btn" data-id="${r.id}">删除</button></td>
            </tr>`;
          }).join('')}
        </tbody></table>`;
        this.els.mrList.querySelectorAll('.br-screenshot-thumb').forEach(img => {
          img.addEventListener('click', () => this._openLightbox(img.dataset.screenshot));
        });
        this.els.mrList.querySelectorAll('.del-rating-btn').forEach(btn => {
          btn.addEventListener('click', () => this._requestDelete(STORE_RATINGS, parseInt(btn.dataset.id)));
        });
      }
      this._openOverlay(this.els.mrOverlay);
    }

    /* ================================================================
     * QUESTIONS
     * ================================================================ */
    _renderTagFilters() {
      this.els.tagFilterBar.innerHTML = TAG_POOL.map(tag => {
        const active = this.filterTags.has(tag);
        return `<span class="br-filter-item${active ? ' is-active' : ''}" data-tag="${escAttr(tag)}">${esc(tag)}</span>`;
      }).join('');
      this.els.tagFilterBar.querySelectorAll('.br-filter-item').forEach(el => {
        el.addEventListener('click', () => {
          const tag = el.dataset.tag;
          this.filterTags.has(tag) ? this.filterTags.delete(tag) : this.filterTags.add(tag);
          this._renderTagFilters();
          this._renderQuestionGrid();
        });
      });
    }

    _getFilteredQuestions() {
      let list = [...this.questions];
      if (this.filterTags.size > 0) {
        list = list.filter(q => [...this.filterTags].every(t => (q.tags || []).includes(t)));
      }
      if (this.searchQuery.trim()) {
        const q = this.searchQuery.trim().toLowerCase();
        list = list.filter(item =>
          (item.title || '').toLowerCase().includes(q) ||
          String(item.number || '').includes(q)
        );
      }
      list.sort((a, b) => {
        let va, vb;
        if (this.sortBy === 'number') {
          va = parseInt(a.number) || 0; vb = parseInt(b.number) || 0;
        } else {
          va = a.createdAt || 0; vb = b.createdAt || 0;
        }
        return this.sortOrder === 'asc' ? va - vb : vb - va;
      });
      return list;
    }

    _renderQuestionGrid() {
      const list = this._getFilteredQuestions();
      this.els.questionCount.textContent = list.length + ' 题';
      if (list.length === 0) {
        this.els.questionGrid.style.display = 'none';
        this.els.questionEmpty.style.display = '';
        return;
      }
      this.els.questionEmpty.style.display = 'none';
      this.els.questionGrid.style.display = '';
      this.els.questionGrid.innerHTML = list.map((item, i) => this._buildQuestionCard(item, i)).join('');
    }

    _buildQuestionCard(item, idx) {
      const tagsHTML = (item.tags || []).map(t => `<span class="jy-tag">${esc(t)}</span>`).join('');
      const tCount = (item.templateIds || []).length;
      const url = item.url || `https://leetcode.cn/problems/`;
      const delay = Math.min(idx * 30, 300);
      return `
        <div class="br-qcard" data-id="${item.id}" style="animation:cardIn 0.35s ease both;animation-delay:${delay}ms">
          <div class="br-qcard__header">
            <span class="br-qcard__number">${item.number ? '#' + esc(String(item.number)) : '—'}</span>
            <div class="br-qcard__actions">
              <button class="jy-btn jy-btn--icon edit-q-btn" data-id="${item.id}" title="编辑">✎</button>
              <button class="jy-btn jy-btn--icon link-tpl-btn" data-id="${item.id}" title="关联模板">🔗</button>
              <button class="jy-btn jy-btn--icon delete-q-btn" data-id="${item.id}" title="删除">🗑</button>
            </div>
          </div>
          <div class="br-qcard__title">
            <a href="${escAttr(url)}" target="_blank" rel="noopener" title="在力扣中打开">${esc(item.title || '未命名')}</a>
          </div>
          ${tagsHTML ? `<div class="br-qcard__tags">${tagsHTML}</div>` : ''}
          <div class="br-qcard__footer">
            <span>${fmtDate(item.createdAt)}</span>
            ${tCount > 0 ? `<span class="br-qcard__tcount">📋 ${tCount} 模板</span>` : ''}
          </div>
        </div>`;
    }

    _onQuestionGridClick(e) {
      const editBtn = e.target.closest('.edit-q-btn');
      const linkBtn = e.target.closest('.link-tpl-btn');
      const delBtn = e.target.closest('.delete-q-btn');
      if (editBtn) { e.stopPropagation(); this._openQuestionModal(parseInt(editBtn.dataset.id)); return; }
      if (linkBtn) { e.stopPropagation(); this._openLinkModal(parseInt(linkBtn.dataset.id)); return; }
      if (delBtn) { e.stopPropagation(); this._requestDelete(STORE_QUESTIONS, parseInt(delBtn.dataset.id)); return; }
    }

    _openQuestionModal(id) {
      const item = id ? this.questions.find(q => q.id === id) : null;
      this.els.qModalTitle.textContent = item ? '编辑题目' : '录入题目';
      this.els.qId.value = item ? item.id : '';
      this.els.qNumber.value = item ? (item.number || '') : '';
      this.els.qTitle.value = item ? (item.title || '') : '';
      this.els.qUrl.value = item ? (item.url || '') : '';
      this.els.qTagList.innerHTML = TAG_POOL.map(tag => {
        const sel = item && (item.tags || []).includes(tag);
        return `<span class="br-filter-item${sel ? ' is-active' : ''}" data-tag="${escAttr(tag)}">${esc(tag)}</span>`;
      }).join('');
      this.els.qTagList.querySelectorAll('.br-filter-item').forEach(el => {
        el.addEventListener('click', () => el.classList.toggle('is-active'));
      });
      const selTpls = item ? (item.templateIds || []) : [];
      this.els.qTemplateList.innerHTML = this.templates.length === 0
        ? '<span class="jy-text-muted jy-text-xs">暂无模板，请先创建模板</span>'
        : this.templates.map(t =>
            `<label class="br-checkbox-label">
              <input type="checkbox" value="${t.id}" ${selTpls.includes(t.id) ? 'checked' : ''}>
              <span>${esc(t.name)}</span>
            </label>`).join('');
      this._openOverlay(this.els.qOverlay);
      if (!item) setTimeout(() => this.els.qTitle.focus(), 150);
    }

    async _saveQuestion() {
      const id = this.els.qId.value;
      const number = this.els.qNumber.value.trim();
      const title = this.els.qTitle.value.trim();
      if (!title) { alert('请输入题名'); return; }
      const tags = [];
      this.els.qTagList.querySelectorAll('.br-filter-item.is-active').forEach(el => tags.push(el.dataset.tag));
      const templateIds = [];
      this.els.qTemplateList.querySelectorAll('input:checked').forEach(cb => templateIds.push(parseInt(cb.value)));
      const item = {
        number, title, url: this.els.qUrl.value.trim(), tags, templateIds,
        createdAt: id ? (this.questions.find(q => q.id === parseInt(id))?.createdAt || Date.now()) : Date.now()
      };
      if (id) { item.id = parseInt(id); await this.db.put(STORE_QUESTIONS, item); }
      else { await this.db.add(STORE_QUESTIONS, item); }
      this._closeAllOverlays();
      await this.reload();
      this._renderQuestionGrid();
      this._renderTemplateList(); // update reverse links
    }

    /* ---- Link template ---- */
    _openLinkModal(questionId) {
      const q = this.questions.find(x => x.id === questionId);
      if (!q) return;
      this.els.linkQuestionId.value = questionId;
      const selTpls = q.templateIds || [];
      this.els.linkTemplateList.innerHTML = this.templates.length === 0
        ? '<span class="jy-text-muted jy-text-xs">暂无模板</span>'
        : this.templates.map(t =>
            `<label class="br-checkbox-label">
              <input type="checkbox" value="${t.id}" ${selTpls.includes(t.id) ? 'checked' : ''}>
              <span>${esc(t.name)}</span>
            </label>`).join('');
      this._openOverlay(this.els.linkOverlay);
    }

    async _saveLink() {
      const questionId = parseInt(this.els.linkQuestionId.value);
      const q = this.questions.find(x => x.id === questionId);
      if (!q) return;
      const templateIds = [];
      this.els.linkTemplateList.querySelectorAll('input:checked').forEach(cb => templateIds.push(parseInt(cb.value)));
      q.templateIds = templateIds;
      await this.db.put(STORE_QUESTIONS, q);
      this._closeAllOverlays();
      await this.reload();
      this._renderQuestionGrid();
      this._renderTemplateList();
    }

    /* ================================================================
     * TEMPLATES
     * ================================================================ */
    _renderTemplateList() {
      if (this.templates.length === 0) {
        this.els.templateList.style.display = 'none';
        this.els.templateEmpty.style.display = '';
        return;
      }
      this.els.templateEmpty.style.display = 'none';
      this.els.templateList.style.display = '';
      this.els.templateList.innerHTML = this.templates.map((item, i) => this._buildTemplateCard(item, i)).join('');
    }

    _buildTemplateCard(item, idx) {
      const tagsHTML = (item.tags || []).map(t => `<span class="jy-tag">${esc(t)}</span>`).join('');
      const linked = this.questions.filter(q => (q.templateIds || []).includes(item.id));
      const linkedHTML = linked.length > 0
        ? `<div class="br-tcard__linked">📎 ${linked.map(q => `<a href="${escAttr(q.url || '#')}" target="_blank" rel="noopener">#${esc(String(q.number || '?'))}</a>`).join(' ')}</div>`
        : '';
      const delay = Math.min(idx * 30, 300);
      return `
        <div class="br-tcard" data-id="${item.id}" style="animation:cardIn 0.35s ease both;animation-delay:${delay}ms">
          <div class="br-tcard__header">
            <span class="br-tcard__name">${esc(item.name || '未命名')}</span>
            <div class="br-qcard__actions">
              <button class="jy-btn jy-btn--icon edit-t-btn" data-id="${item.id}" title="编辑">✎</button>
              <button class="jy-btn jy-btn--icon delete-t-btn" data-id="${item.id}" title="删除">🗑</button>
            </div>
          </div>
          ${tagsHTML ? `<div class="br-tcard__tags">${tagsHTML}</div>` : ''}
          ${item.description ? `<div class="br-tcard__desc">${esc(item.description)}</div>` : ''}
          ${item.code ? `<div class="br-tcard__code"><pre><code>${esc(item.code)}</code></pre><button class="copy-code-btn jy-btn jy-btn--ghost jy-btn--sm" data-code="${escAttr(item.code)}" title="复制代码">📋 复制</button></div>` : ''}
          ${item.complexity ? `<div class="br-tcard__complexity">⏱ ${esc(item.complexity)}</div>` : ''}
          ${linkedHTML}
        </div>`;
    }

    _onTemplateListClick(e) {
      const editBtn = e.target.closest('.edit-t-btn');
      const delBtn = e.target.closest('.delete-t-btn');
      const copyBtn = e.target.closest('.copy-code-btn');
      if (editBtn) { e.stopPropagation(); this._openTemplateModal(parseInt(editBtn.dataset.id)); return; }
      if (delBtn) { e.stopPropagation(); this._requestDelete(STORE_TEMPLATES, parseInt(delBtn.dataset.id)); return; }
      if (copyBtn) { e.stopPropagation(); this._copyCode(copyBtn.dataset.code); return; }
    }

    _copyCode(code) {
      navigator.clipboard.writeText(code).then(() => {
        // brief feedback via button text swap
      }).catch(() => {
        const ta = document.createElement('textarea'); ta.value = code;
        ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
      });
    }

    /* ---- Code editor helpers ---- */
    _updateLineNumbers() {
      const textarea = this.els.tCode;
      const gutter = this.els.tCodeGutter;
      const lines = Math.max(textarea.value.split('\n').length, 1);
      const curLines = (gutter.textContent.match(/\n/g) || []).length + 1;
      if (curLines !== lines && gutter.children.length !== lines) {
        let html = '';
        for (let i = 1; i <= lines; i++) html += `<span>${i}</span>\n`;
        gutter.innerHTML = html;
      }
      // Auto-resize textarea to fit content (cap at 500px, scroll beyond)
      textarea.style.height = 'auto';
      const h = Math.min(Math.max(textarea.scrollHeight, 120), 500);
      textarea.style.height = h + 'px';
      textarea.style.overflowY = textarea.scrollHeight > 500 ? 'auto' : 'hidden';
    }

    _onCodeKeydown(e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        const ta = e.target;
        const start = ta.selectionStart, end = ta.selectionEnd;
        ta.value = ta.value.substring(0, start) + '    ' + ta.value.substring(end);
        ta.selectionStart = ta.selectionEnd = start + 4;
        this._updateLineNumbers();
      }
      // Prevent Enter from submitting the form, let it create newline normally
      if (e.key === 'Enter') {
        e.stopPropagation();
        setTimeout(() => this._updateLineNumbers(), 10);
      }
    }

    _syncCodeScroll() {
      this.els.tCodeGutter.scrollTop = this.els.tCode.scrollTop;
      this.els.tCodeGutter.style.height = this.els.tCode.style.height;
    }

    _openTemplateModal(id) {
      const item = id ? this.templates.find(t => t.id === id) : null;
      this.els.tModalTitle.textContent = item ? '编辑模板' : '新建模板';
      this.els.tId.value = item ? item.id : '';
      this.els.tName.value = item ? (item.name || '') : '';
      this.els.tDescription.value = item ? (item.description || '') : '';
      this.els.tCode.value = item ? (item.code || '') : '';
      this.els.tComplexity.value = item ? (item.complexity || '') : '';
      this.els.tTagList.innerHTML = TAG_POOL.map(tag => {
        const sel = item && (item.tags || []).includes(tag);
        return `<span class="br-filter-item${sel ? ' is-active' : ''}" data-tag="${escAttr(tag)}">${esc(tag)}</span>`;
      }).join('');
      this.els.tTagList.querySelectorAll('.br-filter-item').forEach(el => {
        el.addEventListener('click', () => el.classList.toggle('is-active'));
      });
      this._openOverlay(this.els.tOverlay);
      setTimeout(() => this._updateLineNumbers(), 50);
      if (!item) setTimeout(() => this.els.tName.focus(), 150);
    }

    async _saveTemplate() {
      const id = this.els.tId.value;
      const name = this.els.tName.value.trim();
      if (!name) { alert('请输入模板名称'); return; }
      const tags = [];
      this.els.tTagList.querySelectorAll('.br-filter-item.is-active').forEach(el => tags.push(el.dataset.tag));
      const item = {
        name, tags,
        description: this.els.tDescription.value.trim(),
        code: this.els.tCode.value,
        complexity: this.els.tComplexity.value.trim(),
        createdAt: id ? (this.templates.find(t => t.id === parseInt(id))?.createdAt || Date.now()) : Date.now()
      };
      if (id) { item.id = parseInt(id); await this.db.put(STORE_TEMPLATES, item); }
      else { await this.db.add(STORE_TEMPLATES, item); }
      this._closeAllOverlays();
      await this.reload();
      this._renderTemplateList();
      this._renderQuestionGrid(); // update template count on question cards
    }

    /* ---- delete ---- */
    _requestDelete(storeName, id) {
      const labels = { [STORE_QUESTIONS]: '题目', [STORE_TEMPLATES]: '模板', [STORE_RATINGS]: 'Rating 记录' };
      this._pendingDelete = { store: storeName, id };
      this.els.confirmMsg.textContent = `确定删除此${labels[storeName] || '记录'}？此操作不可恢复。`;
      this._openOverlay(this.els.confirmOverlay);
    }

    async _confirmDelete() {
      if (!this._pendingDelete) return;
      const { store, id } = this._pendingDelete;
      await this.db.delete(store, id);
      this._pendingDelete = null;
      this._closeAllOverlays();
      await this.reload();
      // If deleting from manage ratings modal, re-render it
      if (this.els.mrOverlay && this.els.mrOverlay.classList.contains('is-open')) this._openManageRatingsModal();
      this._renderAll();
    }
  }

  /* ================================================================
   * Bootstrap
   * ================================================================ */
  document.addEventListener('DOMContentLoaded', () => {
    const app = new BattleReportApp();
    window._battleReportApp = app;
    app.init().catch(err => { console.error('战报板初始化失败:', err); alert('战报板初始化失败：' + (err && err.message || err)); });
  });

})();
