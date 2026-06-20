;(function () {
  'use strict';

  const STORE = 'accounting';
  const LS_THEME = 'jy_theme';

  const EXPENSE_COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#ec4899','#78716c','#6b7280'];
  const INCOME_COLORS  = ['#22c55e','#10b981','#06b6d4','#3b82f6','#8b5cf6','#f59e0b','#ec4899'];

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

  class AccountingApp {
    constructor() {
      this.db = new DB();
      this.items = [];
      this.currentMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
      this.filterCategories = new Set();
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
        await this.db.open('JuYiAccounting', 1, { [STORE]: { keyPath: 'id', autoIncrement: true, indexes: [{ name: 'date', keyPath: 'date' }, { name: 'type', keyPath: 'type' }] } });
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
        statsPanel: $('#statsPanel'), categoryFilterList: $('#categoryFilterList'), tagFilterList: $('#tagFilterList'),
        btnExport: $('#btnExport'), btnImport: $('#btnImport'), importFileInput: $('#importFileInput'),
        btnToggleTheme: $('#btnToggleTheme'),
        monthLabel: $('#monthLabel'), btnPrevMonth: $('#btnPrevMonth'), btnNextMonth: $('#btnNextMonth'),
        btnAddIncome: $('#btnAddIncome'), btnAddExpense: $('#btnAddExpense'),
        totalIncome: $('#totalIncome'), totalExpense: $('#totalExpense'), balance: $('#balance'),
        pieChart: $('#pieChart'), pieLegend: $('#pieLegend'), recordList: $('#recordList'), emptyState: $('#emptyState'),
        editOverlay: $('#editOverlay'), editModalTitle: $('#editModalTitle'), editForm: $('#editForm'),
        editId: $('#editId'), radioIncome: $('#radioIncome'), radioExpense: $('#radioExpense'),
        editAmount: $('#editAmount'), editCategory: $('#editCategory'), editDate: $('#editDate'),
        editNotes: $('#editNotes'), editTags: $('#editTags'), btnSave: $('#btnSave'),
        confirmOverlay: $('#confirmOverlay'), btnConfirmDelete: $('#btnConfirmDelete'),
        modalCloseBtns: document.querySelectorAll('.modal-close-btn'),
      };
    }

    _bindEvents() {
      this.els.btnToggleSidebar.addEventListener('click', () => this.els.sidebar.classList.toggle('is-collapsed'));
      this.els.btnOpenSidebar.addEventListener('click', () => this.els.sidebar.classList.remove('is-collapsed'));
      this.els.btnAddIncome.addEventListener('click', () => this._openEdit(null, 'income'));
      this.els.btnAddExpense.addEventListener('click', () => this._openEdit(null, 'expense'));
      this.els.btnSave.addEventListener('click', () => this._onSave());
      this.els.btnConfirmDelete.addEventListener('click', () => this._onConfirmDelete());
      this.els.btnPrevMonth.addEventListener('click', () => this._changeMonth(-1));
      this.els.btnNextMonth.addEventListener('click', () => this._changeMonth(1));
      this.els.btnExport.addEventListener('click', () => this._onExport());
      this.els.btnImport.addEventListener('click', () => this.els.importFileInput.click());
      this.els.importFileInput.addEventListener('change', () => this._onImport());
      this.els.btnToggleTheme.addEventListener('click', () => {
        const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem(LS_THEME, next);
        this.els.btnToggleTheme.textContent = next === 'dark' ? '☀️ 明亮模式' : '🌙 暗色模式';
        setTimeout(() => this._drawPie(), 100);
      });
      this.els.modalCloseBtns.forEach(b => b.addEventListener('click', () => this._closeModals()));
      [this.els.editOverlay, this.els.confirmOverlay].forEach(ov => ov.addEventListener('click', e => { if (e.target === ov) this._closeModals(); }));
      document.addEventListener('keydown', e => { if (e.key === 'Escape') this._closeModals(); });
      this.els.editTypeRadio = document.querySelectorAll('input[name="editTypeRadio"]');
    }

    // ---- 月份 ----
    _changeMonth(delta) {
      const [y, m] = this.currentMonth.split('-').map(Number);
      const d = new Date(y, m - 1 + delta, 1);
      this.currentMonth = d.toISOString().slice(0, 7);
      this._renderAll();
    }

    // ---- 筛选 ----
    _monthItems() {
      return this.items.filter(r => {
        const d = new Date(r.date); return d.toISOString().slice(0, 7) === this.currentMonth;
      }).filter(r => {
        if (this.filterCategories.size > 0 && !this.filterCategories.has(r.category)) return false;
        if (this.filterTags.size > 0 && !(r.tags || []).some(t => this.filterTags.has(t))) return false;
        return true;
      });
    }

    // ---- 渲染 ----
    _renderAll() {
      const [y, m] = this.currentMonth.split('-');
      this.els.monthLabel.textContent = `${y}年${parseInt(m)}月`;
      this._renderCategories();
      this._renderTags();
      this._renderSummary();
      this._drawPie();
      this._renderList();
      this._renderStats();
    }

    _renderSummary() {
      const items = this._monthItems();
      const income = items.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0);
      const expense = items.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
      this.els.totalIncome.textContent = '¥' + income.toFixed(2);
      this.els.totalExpense.textContent = '¥' + expense.toFixed(2);
      const bal = income - expense;
      this.els.balance.textContent = (bal >= 0 ? '¥' : '-¥') + Math.abs(bal).toFixed(2);
      this.els.balance.style.color = bal >= 0 ? 'var(--jy-success)' : 'var(--jy-danger)';
    }

    _drawPie() {
      const canvas = this.els.pieChart; if (!canvas) return;
      const items = this._monthItems().filter(r => r.type === 'expense');
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const ctx = canvas.getContext('2d');
      const cx = 100, cy = 100, r = 90;
      ctx.clearRect(0, 0, 200, 200);

      // Category aggregates
      const cats = new Map();
      for (const r of items) cats.set(r.category, (cats.get(r.category) || 0) + r.amount);
      const entries = [...cats].sort((a, b) => b[1] - a[1]);
      const total = entries.reduce((s, [, v]) => s + v, 0);

      // Legend
      this.els.pieLegend.innerHTML = entries.length === 0
        ? '<div class="jy-text-muted jy-text-sm">本月无支出</div>'
        : entries.map(([cat, amt], i) => `<div class="pie-legend__item"><span class="pie-legend__dot" style="background:${EXPENSE_COLORS[i % EXPENSE_COLORS.length]}"></span><span class="pie-legend__name">${esc(cat)}</span><span class="pie-legend__amount">¥${amt.toFixed(0)}</span></div>`).join('');

      if (total === 0) { ctx.fillStyle = isDark ? '#334155' : '#e5e7eb'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); return; }

      let angle = -Math.PI / 2;
      for (let i = 0; i < entries.length; i++) {
        const slice = (entries[i][1] / total) * Math.PI * 2;
        ctx.fillStyle = EXPENSE_COLORS[i % EXPENSE_COLORS.length];
        ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, angle, angle + slice); ctx.closePath(); ctx.fill();
        // Label
        if (slice > 0.3) {
          const mid = angle + slice / 2;
          ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText(Math.round((entries[i][1] / total) * 100) + '%', cx + Math.cos(mid) * r * 0.6, cy + Math.sin(mid) * r * 0.6);
        }
        angle += slice;
      }
      ctx.fillStyle = isDark ? '#1e293b' : '#ffffff'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2); ctx.fill();
    }

    _renderList() {
      const items = this._monthItems().sort((a, b) => b.date - a.date);
      if (items.length === 0) { this.els.recordList.innerHTML = ''; this.els.emptyState.style.display = 'block'; return; }
      this.els.emptyState.style.display = 'none';
      this.els.recordList.innerHTML = items.map(r => {
        const isIncome = r.type === 'income';
        const icon = isIncome ? '↑' : '↓';
        const cls = isIncome ? 'record-item--income' : 'record-item--expense';
        const sign = isIncome ? '+' : '-';
        return `<div class="record-item ${cls}" data-id="${r.id}">
          <div class="record-item__icon">${icon}</div>
          <div class="record-item__body"><div class="record-item__main">${esc(r.category || '未分类')}</div>${r.notes ? `<div class="record-item__sub">${esc(r.notes)}</div>` : ''}${(r.tags||[]).map(t => `<span class="jy-tag jy-text-xs">${esc(t)}</span>`).join(' ')}</div>
          <div class="record-item__right"><div class="record-item__amount">${sign}¥${r.amount.toFixed(2)}</div><div class="record-item__date">${fmtDate(r.date)}</div></div></div>`;
      }).join('');
      this.els.recordList.querySelectorAll('.record-item').forEach(el => el.addEventListener('click', () => this._openEdit(parseInt(el.dataset.id))));
    }

    _renderCategories() {
      const all = new Map();
      for (const r of this.items) { if (r.category) all.set(r.category, (all.get(r.category) || 0) + 1); }
      const c = this.els.categoryFilterList; c.innerHTML = '';
      if (all.size === 0) { c.innerHTML = '<span class="jy-text-muted jy-text-xs">暂无</span>'; return; }
      c.appendChild(this._buildFilterItem('全部分类', this.filterCategories.size === 0, this.items.length, () => { this.filterCategories.clear(); this._renderAll(); }));
      for (const [cat, cnt] of [...all].sort((a, b) => b[1] - a[1])) {
        const active = this.filterCategories.has(cat);
        c.appendChild(this._buildFilterItem(cat, active, cnt, () => { active ? this.filterCategories.delete(cat) : this.filterCategories.add(cat); this._renderAll(); }));
      }
    }

    _renderTags() {
      const all = new Map(); for (const r of this.items) for (const t of (r.tags || [])) all.set(t, (all.get(t) || 0) + 1);
      const c = this.els.tagFilterList; c.innerHTML = '';
      if (all.size === 0) { c.innerHTML = '<span class="jy-text-muted jy-text-xs">暂无标签</span>'; return; }
      c.appendChild(this._buildFilterItem('全部标签', this.filterTags.size === 0, this.items.length, () => { this.filterTags.clear(); this._renderAll(); }));
      for (const [tag, cnt] of [...all].sort((a, b) => b[1] - a[1])) {
        const active = this.filterTags.has(tag);
        c.appendChild(this._buildFilterItem(tag, active, cnt, () => { active ? this.filterTags.delete(tag) : this.filterTags.add(tag); this._renderAll(); }));
      }
    }

    _buildFilterItem(label, active, count, onClick) {
      const d = document.createElement('div'); d.className = 'filter-item' + (active ? ' is-active' : '');
      d.innerHTML = `<span>${esc(label)}</span><span class="filter-item__count">${count}</span>`;
      d.addEventListener('click', onClick); return d;
    }

    _renderStats() {
      const all = this.items;
      const totalInc = all.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0);
      const totalExp = all.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
      this.els.statsPanel.innerHTML = `<div class="stats-panel__row"><span>总记录</span><strong>${all.length}</strong></div><div class="stats-panel__row"><span>累计收入</span><span style="color:var(--jy-success)">¥${totalInc.toFixed(0)}</span></div><div class="stats-panel__row"><span>累计支出</span><span style="color:var(--jy-danger)">¥${totalExp.toFixed(0)}</span></div>`;
    }

    // ---- 编辑 ----
    _openEdit(id, defaultType) {
      this.editingId = id;
      const item = id ? this.items.find(r => r.id === id) : null;
      this.els.editModalTitle.textContent = item ? '编辑记录' : '添加记录';
      this.els.editId.value = item ? item.id : '';
      this.els.editAmount.value = item ? item.amount : '';
      this.els.editDate.value = item ? toDateStr(item.date) : toDateStr(Date.now());
      this.els.editNotes.value = item ? (item.notes || '') : '';
      this.els.editTags.value = item ? (item.tags || []).join(', ') : '';
      const type = item ? item.type : (defaultType || 'expense');
      this.els.radioIncome.checked = type === 'income';
      this.els.radioExpense.checked = type === 'expense';
      if (item && item.category) {
        const opts = this.els.editCategory.querySelectorAll('option');
        for (const opt of opts) { if (opt.value === item.category) { opt.selected = true; break; } }
      }
      this._openOverlay(this.els.editOverlay);
    }

    async _onSave() {
      const id = this.els.editId.value;
      const type = this.els.radioIncome.checked ? 'income' : 'expense';
      const amount = parseFloat(this.els.editAmount.value);
      if (!amount || amount <= 0) { alert('请输入有效金额'); return; }
      const item = { type, amount, category: this.els.editCategory.value, date: new Date(this.els.editDate.value).getTime(), notes: this.els.editNotes.value.trim(), tags: this.els.editTags.value.split(/[,，\s]+/).map(s => s.trim()).filter(Boolean), createdAt: Date.now() };
      if (id) { item.id = parseInt(id); await this.db.put(STORE, item); }
      else { await this.db.add(STORE, item); }
      this._closeModals(); await this.reload(); this._renderAll();
    }

    async _onConfirmDelete() {
      if (!this.pendingDeleteId) return;
      await this.db.delete(STORE, this.pendingDeleteId);
      this._closeModals(); await this.reload(); this._renderAll();
    }

    _openOverlay(ov) { ov.classList.add('is-open'); document.body.style.overflow = 'hidden'; }
    _closeModals() { [this.els.editOverlay, this.els.confirmOverlay].forEach(ov => ov.classList.remove('is-open')); document.body.style.overflow = ''; this.editingId = null; this.pendingDeleteId = null; }

    async _onExport() {
      const data = { _format: 'JuYiAccounting/1', exportedAt: new Date().toISOString(), items: await this.db.getAll(STORE) };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const a = document.createElement('a');
      a.href = url; a.download = `JuYi-Accounting-${fmtDate(Date.now()).replace(/\//g, '-')}.json`;
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
  }

  function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function fmtDate(ts) { if (!ts) return ''; const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  function toDateStr(ts) { return fmtDate(ts); }

  document.addEventListener('DOMContentLoaded', () => {
    const app = new AccountingApp();
    window._accountingApp = app;
    app.init().then(() => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      app.els.btnToggleTheme.textContent = isDark ? '☀️ 明亮模式' : '🌙 暗色模式';
      // Right-click to delete
      document.addEventListener('contextmenu', e => {
        const item = e.target.closest('.record-item');
        if (item) { e.preventDefault(); app.pendingDeleteId = parseInt(item.dataset.id); app._openOverlay(app.els.confirmOverlay); }
      });
    });
  });
})();