;(function () {
  'use strict';

  const STORE = 'fitness';
  const LS_THEME = 'jy_theme';

  // ---- IndexedDB ----
  class DB {
    constructor() { this.db = null; }
    open(name, version, stores) {
      return new Promise((resolve, reject) => {
        const r = indexedDB.open(name, version);
        r.onupgradeneeded = e => {
          for (const [sn, def] of Object.entries(stores)) {
            const s = e.target.result.objectStoreNames.contains(sn) ? e.target.transaction.objectStore(sn) : e.target.result.createObjectStore(sn, { keyPath: def.keyPath, autoIncrement: def.autoIncrement !== false });
            for (const idx of def.indexes || []) { if (!s.indexNames.contains(idx.name)) s.createIndex(idx.name, idx.keyPath, { unique: idx.unique || false }); }
          }
        };
        r.onsuccess = e => { this.db = e.target.result; resolve(this.db); };
        r.onerror = e => reject(e.target.error);
      });
    }
    _tx(sn, mode, cb) { return new Promise((resolve, reject) => { const tx = this.db.transaction(sn, mode); const store = tx.objectStore(sn); const res = cb(store); if (res && typeof res.then === 'function') { res.then(resolve).catch(reject); } else { tx.oncomplete = () => resolve(res); tx.onerror = () => reject(tx.error); } }); }
    _p(r) { return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
    add(sn, item) { return this._tx(sn, 'readwrite', s => this._p(s.add(item))); }
    put(sn, item) { return this._tx(sn, 'readwrite', s => this._p(s.put(item))); }
    getAll(sn) { return this._tx(sn, 'readonly', s => this._p(s.getAll())); }
    delete(sn, id) { return this._tx(sn, 'readwrite', s => this._p(s.delete(id))); }
    clear(sn) { return this._tx(sn, 'readwrite', s => this._p(s.clear())); }
  }

  // ---- 主应用 ----
  class FitnessApp {
    constructor() {
      this.db = new DB();
      this.items = [];
      this.activeTab = 'weight';
      this.filterTags = new Set();
      this.pendingDeleteId = null;
      this.editingId = null;
    }

    async init() {
      if (localStorage.getItem(LS_THEME) === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
      // Bind DOM first so buttons always work
      this._cacheDom();
      this._bindEvents();
      try {
        await this.db.open('JuYiFitness', 1, { [STORE]: { keyPath: 'id', autoIncrement: true, indexes: [{ name: 'date', keyPath: 'date' }, { name: 'type', keyPath: 'type' }] } });
        await this.reload();
      } catch (e) {
        console.error('DB 初始化失败:', e);
        this.items = [];
      }
      this._renderAll();
    }

    async reload() { this.items = await this.db.getAll(STORE); }

    _cacheDom() {
      const $ = s => document.querySelector(s);
      this.els = {
        sidebar: $('#sidebar'), btnToggleSidebar: $('#btnToggleSidebar'), btnOpenSidebar: $('#btnOpenSidebar'),
        statsPanel: $('#statsPanel'), tagFilterList: $('#tagFilterList'),
        btnExport: $('#btnExport'), btnImport: $('#btnImport'), importFileInput: $('#importFileInput'),
        btnCopyClipboard: $('#btnCopyClipboard'), btnPasteClipboard: $('#btnPasteClipboard'),
        btnToggleTheme: $('#btnToggleTheme'), btnAdd: $('#btnAdd'),
        panelWeight: $('#panelWeight'), panelExercise: $('#panelExercise'), weightChart: $('#weightChart'),
        weightList: $('#weightList'), exerciseList: $('#exerciseList'), exerciseStatsRow: $('#exerciseStatsRow'),
        emptyState: $('#emptyState'),
        editOverlay: $('#editOverlay'), editModalTitle: $('#editModalTitle'), editForm: $('#editForm'),
        editId: $('#editId'), editType: $('#editType'), editDate: $('#editDate'),
        editWeight: $('#editWeight'), editExerciseType: $('#editExerciseType'),
        editDuration: $('#editDuration'), editIntensity: $('#editIntensity'),
        editNotes: $('#editNotes'), editTags: $('#editTags'), btnSave: $('#btnSave'),
        weightFields: $('#weightFields'), exerciseFields: $('#exerciseFields'),
        confirmOverlay: $('#confirmOverlay'), btnConfirmDelete: $('#btnConfirmDelete'),
        modalCloseBtns: document.querySelectorAll('.modal-close-btn'),
        tabs: document.querySelectorAll('.tab'),
      };
    }

    _bindEvents() {
      this.els.btnToggleSidebar.addEventListener('click', () => this.els.sidebar.classList.toggle('is-collapsed'));
      this.els.btnOpenSidebar.addEventListener('click', () => this.els.sidebar.classList.remove('is-collapsed'));
      this.els.btnAdd.addEventListener('click', () => this._openEdit(null));
      this.els.btnSave.addEventListener('click', () => this._onSave());
      this.els.editType.addEventListener('change', () => this._toggleFields());
      this.els.btnConfirmDelete.addEventListener('click', () => this._onConfirmDelete());
      this.els.btnExport.addEventListener('click', () => this._onExport());
      this.els.btnImport.addEventListener('click', () => this.els.importFileInput.click());
      this.els.importFileInput.addEventListener('change', () => this._onImport());
      this.els.btnCopyClipboard.addEventListener('click', () => this._onCopyClipboard());
      this.els.btnPasteClipboard.addEventListener('click', () => this._onPasteClipboard());
      this.els.btnToggleTheme.addEventListener('click', () => {
        const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem(LS_THEME, next);
        this.els.btnToggleTheme.textContent = next === 'dark' ? '☀️ 明亮模式' : '🌙 暗色模式';
        setTimeout(() => this._drawWeightChart(), 100);
      });
      this.els.modalCloseBtns.forEach(b => b.addEventListener('click', () => this._closeModals()));
      [this.els.editOverlay, this.els.confirmOverlay].forEach(ov => ov.addEventListener('click', e => { if (e.target === ov) this._closeModals(); }));
      document.addEventListener('keydown', e => { if (e.key === 'Escape') this._closeModals(); });
      this.els.tabs.forEach(tab => tab.addEventListener('click', () => {
        this.activeTab = tab.dataset.tab;
        this.els.tabs.forEach(t => t.classList.toggle('active', t === tab));
        this._renderPanel();
      }));
      window.addEventListener('resize', () => { if (window._fitnessApp) window._fitnessApp._drawWeightChart(); });
    }

    // ---- 渲染 ----
    _renderAll() {
      this._renderTags();
      this._renderPanel();
      this._renderStats();
    }

    _renderPanel() {
      const isWeight = this.activeTab === 'weight';
      this.els.panelWeight.style.display = isWeight ? '' : 'none';
      this.els.panelExercise.style.display = isWeight ? 'none' : '';
      if (isWeight) {
        this._renderWeight();
        setTimeout(() => this._drawWeightChart(), 50);
      } else {
        this._renderExercise();
      }
    }

    _renderWeight() {
      const list = this._filtered('weight');
      const el = this.els.weightList;
      if (list.length === 0) { el.innerHTML = '<div class="jy-empty"><div class="jy-empty__icon">⚖️</div><div class="jy-empty__text">暂无体重记录</div></div>'; return; }
      el.innerHTML = list.sort((a, b) => b.date - a.date).map(r => `
        <div class="record-item" data-id="${r.id}">
          <div class="record-item__icon">⚖️</div>
          <div class="record-item__body"><div class="record-item__main">${r.weight} kg</div>${r.notes ? `<div class="record-item__sub">${esc(r.notes)}</div>` : ''}${this._tagBadges(r)}</div>
          <div class="record-item__right"><div class="record-item__date">${fmtDate(r.date)}</div></div>
        </div>`).join('');
      el.querySelectorAll('.record-item').forEach(item => item.addEventListener('click', e => { if (!e.target.closest('.jy-tag')) this._openEdit(parseInt(item.dataset.id)); }));
    }

    _renderExercise() {
      const list = this._filtered('exercise');
      const el = this.els.exerciseList;
      const stats = this._exerciseStats(list);
      this.els.exerciseStatsRow.innerHTML = `<div class="exercise-stat-card"><div class="exercise-stat-card__value">${stats.count}</div><div class="exercise-stat-card__label">总次数</div></div><div class="exercise-stat-card"><div class="exercise-stat-card__value">${stats.totalMin}</div><div class="exercise-stat-card__label">总时长(分)</div></div><div class="exercise-stat-card"><div class="exercise-stat-card__value">${stats.avgIntensity}</div><div class="exercise-stat-card__label">平均强度</div></div>`;
      if (list.length === 0) { el.innerHTML = '<div class="jy-empty"><div class="jy-empty__icon">💪</div><div class="jy-empty__text">暂无运动记录</div></div>'; return; }
      el.innerHTML = list.sort((a, b) => b.date - a.date).map(r => `
        <div class="record-item" data-id="${r.id}">
          <div class="record-item__icon">💪</div>
          <div class="record-item__body"><div class="record-item__main">${esc(r.exerciseType || '运动')} · ${r.duration}分钟 · ${'★'.repeat(r.intensity||3)}</div>${r.notes ? `<div class="record-item__sub">${esc(r.notes)}</div>` : ''}${this._tagBadges(r)}</div>
          <div class="record-item__right"><div class="record-item__date">${fmtDate(r.date)}</div></div>
        </div>`).join('');
      el.querySelectorAll('.record-item').forEach(item => item.addEventListener('click', e => { if (!e.target.closest('.jy-tag')) this._openEdit(parseInt(item.dataset.id)); }));
    }

    _exerciseStats(list) {
      const count = list.length;
      const totalMin = list.reduce((s, r) => s + (r.duration || 0), 0);
      const avgIntensity = count > 0 ? (list.reduce((s, r) => s + (r.intensity || 3), 0) / count).toFixed(1) : '-';
      return { count, totalMin, avgIntensity };
    }

    _tagBadges(r) {
      const tags = this._filteredTags(r.tags);
      if (!tags || tags.length === 0) return '';
      return `<div class="record-item__tags">${tags.map(t => `<span class="jy-tag" data-tag="${escAttr(t)}">${esc(t)}</span>`).join('')}</div>`;
    }

    _renderTags() {
      const all = new Map(); for (const r of this.items) for (const t of (r.tags || [])) all.set(t, (all.get(t) || 0) + 1);
      const c = this.els.tagFilterList;
      c.innerHTML = '';
      if (all.size === 0) { c.innerHTML = '<span class="jy-text-muted jy-text-xs">暂无标签</span>'; return; }
      c.appendChild(this._buildFilterItem('全部', this.filterTags.size === 0, this.items.length, () => { this.filterTags.clear(); this._renderPanel(); this._renderTags(); }));
      for (const [tag, cnt] of [...all].sort((a, b) => b[1] - a[1])) {
        const active = this.filterTags.has(tag);
        c.appendChild(this._buildFilterItem(tag, active, cnt, () => { active ? this.filterTags.delete(tag) : this.filterTags.add(tag); this._renderPanel(); this._renderTags(); }));
      }
    }

    _buildFilterItem(label, active, count, onClick) {
      const d = document.createElement('div'); d.className = 'filter-item' + (active ? ' is-active' : '');
      d.innerHTML = `<span>${esc(label)}</span><span class="filter-item__count">${count}</span>`;
      d.addEventListener('click', onClick); return d;
    }

    _renderStats() {
      const p = this.els.statsPanel;
      const weights = this.items.filter(r => r.type === 'weight').sort((a, b) => a.date - b.date);
      const exercises = this.items.filter(r => r.type === 'exercise');
      let h = `<div class="stats-panel__row"><span>总记录</span><strong>${this.items.length}</strong></div>`;
      if (weights.length >= 2) {
        const first = weights[0].weight, last = weights[weights.length - 1].weight, diff = (last - first).toFixed(1);
        h += `<div class="stats-panel__row"><span>体重变化</span><span style="color:${diff >= 0 ? 'var(--jy-danger)' : 'var(--jy-success)'}">${diff > 0 ? '+' : ''}${diff} kg</span></div>`;
      }
      h += `<div class="stats-panel__row"><span>运动次数</span><span>${exercises.length}</span></div>`;
      p.innerHTML = h;
    }

    // ---- 体重曲线图 ----
    _drawWeightChart() {
      const canvas = this.els.weightChart;
      if (!canvas || this.activeTab !== 'weight') return;
      const data = this._filtered('weight').sort((a, b) => a.date - b.date);
      if (data.length < 2) { canvas.style.display = 'none'; return; }
      canvas.style.display = 'block';

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = 300 * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = '300px';

      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      const W = rect.width, H = 300;
      const pad = { top: 20, right: 30, bottom: 40, left: 50 };
      const pw = W - pad.left - pad.right, ph = H - pad.top - pad.bottom;

      const weights = data.map(d => d.weight);
      const minW = Math.floor(Math.min(...weights) - 1);
      const maxW = Math.ceil(Math.max(...weights) + 1);

      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      ctx.clearRect(0, 0, W, H);
      const style = {
        bg: isDark ? '#1e293b' : '#ffffff',
        grid: isDark ? '#334155' : '#e5e7eb',
        text: isDark ? '#94a3b8' : '#6b7280',
        line: isDark ? '#818cf8' : '#4f46e5',
        dot: isDark ? '#a5b4fc' : '#6366f1',
      };

      ctx.fillStyle = style.bg; ctx.fillRect(0, 0, W, H);

      // Grid
      ctx.strokeStyle = style.grid; ctx.lineWidth = 0.5;
      const ySteps = 5;
      for (let i = 0; i <= ySteps; i++) {
        const y = pad.top + (ph / ySteps) * i;
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
        ctx.fillStyle = style.text; ctx.font = '11px sans-serif'; ctx.textAlign = 'right';
        ctx.fillText((maxW - (maxW - minW) / ySteps * i).toFixed(1), pad.left - 8, y + 4);
      }

      // X labels
      ctx.textAlign = 'center';
      const xStep = data.length > 7 ? Math.ceil(data.length / 7) : 1;
      for (let i = 0; i < data.length; i += xStep) {
        const x = pad.left + (pw / (data.length - 1)) * i;
        ctx.fillText(fmtDate(data[i].date).slice(5), x, H - pad.bottom + 16);
      }

      // Line
      ctx.strokeStyle = style.line; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
      ctx.beginPath();
      data.forEach((d, i) => {
        const x = pad.left + (pw / (data.length - 1)) * i;
        const y = pad.top + ph * (1 - (d.weight - minW) / (maxW - minW));
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Dots
      data.forEach((d, i) => {
        const x = pad.left + (pw / (data.length - 1)) * i;
        const y = pad.top + ph * (1 - (d.weight - minW) / (maxW - minW));
        ctx.fillStyle = style.dot; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = style.bg; ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
      });

      // Area fill
      ctx.fillStyle = isDark ? 'rgba(129,140,248,0.1)' : 'rgba(79,70,229,0.08)';
      ctx.beginPath();
      data.forEach((d, i) => {
        const x = pad.left + (pw / (data.length - 1)) * i;
        const y = pad.top + ph * (1 - (d.weight - minW) / (maxW - minW));
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.lineTo(pad.left + pw, pad.top + ph); ctx.lineTo(pad.left, pad.top + ph); ctx.closePath(); ctx.fill();
    }

    // ---- 筛选 ----
    _filtered(type) { let list = this.items.filter(r => r.type === type); if (this.filterTags.size > 0) list = list.filter(r => (r.tags || []).some(t => this.filterTags.has(t))); return list; }
    _filteredTags(tags) { if (!tags) return null; if (this.filterTags.size === 0) return tags; return tags.filter(t => this.filterTags.has(t)); }

    // ---- 编辑 ----
    _openEdit(id) {
      this.editingId = id;
      const item = id ? this.items.find(r => r.id === id) : null;
      this.els.editModalTitle.textContent = item ? '编辑记录' : '添加记录';
      this.els.editId.value = item ? item.id : '';
      this.els.editType.value = item ? item.type : this.activeTab === 'exercise' ? 'exercise' : 'weight';
      this.els.editDate.value = item ? toDateStr(item.date) : toDateStr(Date.now());
      this.els.editWeight.value = item && item.type === 'weight' ? item.weight : '';
      this.els.editExerciseType.value = item && item.type === 'exercise' ? (item.exerciseType || '') : '';
      this.els.editDuration.value = item && item.type === 'exercise' ? (item.duration || '') : '';
      this.els.editIntensity.value = item && item.type === 'exercise' ? (item.intensity || 3) : 3;
      this.els.editNotes.value = item ? (item.notes || '') : '';
      this.els.editTags.value = item ? (item.tags || []).join(', ') : '';
      this._toggleFields();
      this._openOverlay(this.els.editOverlay);
    }

    _toggleFields() {
      const isWeight = this.els.editType.value === 'weight';
      this.els.weightFields.style.display = isWeight ? '' : 'none';
      this.els.exerciseFields.style.display = isWeight ? 'none' : '';
    }

    async _onSave() {
      const id = this.els.editId.value;
      const type = this.els.editType.value;
      const item = { type, date: new Date(this.els.editDate.value).getTime(), notes: this.els.editNotes.value.trim(), tags: this.els.editTags.value.split(/[,，\s]+/).map(s => s.trim()).filter(Boolean), createdAt: Date.now() };
      if (type === 'weight') {
        const w = parseFloat(this.els.editWeight.value);
        if (isNaN(w) || w <= 0) { alert('请输入有效体重'); return; }
        item.weight = w;
      } else {
        item.exerciseType = this.els.editExerciseType.value.trim();
        item.duration = parseInt(this.els.editDuration.value) || 0;
        item.intensity = parseInt(this.els.editIntensity.value) || 3;
        if (!item.exerciseType) { alert('请输入运动项目'); return; }
      }
      if (id) { item.id = parseInt(id); await this.db.put(STORE, item); }
      else { await this.db.add(STORE, item); }
      this._closeModals();
      await this.reload();
      this._renderAll();
    }

    async _onConfirmDelete() {
      if (!this.pendingDeleteId) return;
      await this.db.delete(STORE, this.pendingDeleteId);
      this._closeModals();
      await this.reload();
      this._renderAll();
    }

    _openOverlay(ov) { ov.classList.add('is-open'); document.body.style.overflow = 'hidden'; }
    _closeModals() {
      [this.els.editOverlay, this.els.confirmOverlay].forEach(ov => ov.classList.remove('is-open'));
      document.body.style.overflow = '';
      this.editingId = null; this.pendingDeleteId = null;
    }

    // ---- 导出导入 ----
    async _onExport() {
      const data = { _format: 'JuYiFitness/1', exportedAt: new Date().toISOString(), items: await this.db.getAll(STORE) };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const a = document.createElement('a');
      a.href = url; a.download = `JuYi-Fitness-${fmtDate(Date.now()).replace(/\//g, '-')}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    }

    async _onImport() {
      const file = this.els.importFileInput.files[0]; if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!data.items) throw new Error('格式错误');
        if (!confirm(`导入 ${data.items.length} 条记录？当前数据将被覆盖。`)) return;
        await this.db.clear(STORE);
        for (const item of data.items) await this.db.add(STORE, item);
        await this.reload(); this._renderAll();
      } catch (e) { alert('导入失败: ' + e.message); }
      finally { this.els.importFileInput.value = ''; }
    }

    async _onCopyClipboard() {
      const items = await this.db.getAll(STORE);
      const data = { _format: 'JuYiFitness/1', exportedAt: new Date().toISOString(), items };
      const json = JSON.stringify(data);
      try { await navigator.clipboard.writeText(json); alert('已复制到剪贴板！发给手机后点「从剪贴板导入」'); }
      catch (e) { const ta = document.createElement('textarea'); ta.value = json; ta.style.cssText = 'position:fixed;left:-9999px'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); alert('已复制！'); }
    }

    async _onPasteClipboard() {
      let text = '';
      try { text = await navigator.clipboard.readText(); } catch (e) { text = prompt('请粘贴数据：'); }
      if (!text || !text.trim()) { alert('没有读取到数据'); return; }
      try {
        const data = JSON.parse(text);
        if (!data.items) throw new Error('格式错误');
        if (!confirm(`导入 ${data.items.length} 条记录？当前数据将被覆盖。`)) return;
        await this.db.clear(STORE);
        for (const item of data.items) await this.db.add(STORE, item);
        await this.reload(); this._renderAll();
        alert('导入成功！');
      } catch (e) { alert('导入失败: ' + e.message); }
    }
  }

  // ---- 工具 ----
  function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function escAttr(s) { return (s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
  function fmtDate(ts) { if (!ts) return ''; const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  function toDateStr(ts) { return fmtDate(ts); }

  document.addEventListener('DOMContentLoaded', () => {
    const app = new FitnessApp();
    window._fitnessApp = app;
    app.init().then(() => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      app.els.btnToggleTheme.textContent = isDark ? '☀️ 明亮模式' : '🌙 暗色模式';
      // Delete via long-press or context menu: add delete handler
      document.addEventListener('contextmenu', e => {
        const item = e.target.closest('.record-item');
        if (item) { e.preventDefault(); app.pendingDeleteId = parseInt(item.dataset.id); app._openOverlay(app.els.confirmOverlay); }
      });
    });
  });
})();