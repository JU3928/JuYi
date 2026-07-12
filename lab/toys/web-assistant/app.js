;(function () {
  'use strict';

  /* ================================================================
   * Constants
   * ================================================================ */
  const DB_NAME = 'JuYiWebAssist';
  const DB_VERSION = 1;
  const STORE = 'articles';
  const LS_THEME = 'jy_theme';
  const LS_API_KEY = 'wa_api_key';
  const FIRECRAWL_SCRAPE = 'https://api.firecrawl.dev/v1/scrape';
  const FIRECRAWL_SEARCH = 'https://api.firecrawl.dev/v1/search';

  /* ================================================================
   * IndexedDB
   * ================================================================ */
  class DB {
    constructor() { this.db = null; }
    open(name, version, stores) {
      return new Promise(function (resolve, reject) {
        var req = indexedDB.open(name, version);
        req.onupgradeneeded = function (e) {
          var db = e.target.result;
          Object.keys(stores).forEach(function (sn) {
            var def = stores[sn];
            if (!db.objectStoreNames.contains(sn)) {
              var s = db.createObjectStore(sn, { keyPath: def.keyPath, autoIncrement: def.autoIncrement !== false });
              (def.indexes || []).forEach(function (idx) {
                if (!s.indexNames.contains(idx.name)) s.createIndex(idx.name, idx.keyPath, { unique: idx.unique || false });
              });
            }
          });
        };
        req.onsuccess = function (e) { this.db = e.target.result; resolve(this.db); }.bind(this);
        req.onerror = function (e) { reject(e.target.error); };
      }.bind(this));
    }
    _p(req) { return new Promise(function (resolve, reject) { req.onsuccess = function () { resolve(req.result); }; req.onerror = function () { reject(req.error); }; }); }
    _tx(sn, mode, cb) {
      var self = this;
      return new Promise(function (resolve, reject) {
        var tx = self.db.transaction(sn, mode);
        var store = tx.objectStore(sn);
        var result = cb(store);
        if (result && typeof result.then === 'function') { result.then(resolve).catch(reject); }
        else { tx.oncomplete = function () { resolve(result); }; tx.onerror = function () { reject(tx.error); }; }
      });
    }
    add(sn, item) { return this._tx(sn, 'readwrite', function (s) { return this._p(s.add(item)); }.bind(this)); }
    put(sn, item) { return this._tx(sn, 'readwrite', function (s) { return this._p(s.put(item)); }.bind(this)); }
    getAll(sn) { return this._tx(sn, 'readonly', function (s) { return this._p(s.getAll()); }.bind(this)); }
    delete(sn, id) { return this._tx(sn, 'readwrite', function (s) { return this._p(s.delete(id)); }.bind(this)); }
    clear(sn) { return this._tx(sn, 'readwrite', function (s) { return this._p(s.clear()); }.bind(this)); }
    getByIndex(sn, idx, val) { return this._tx(sn, 'readonly', function (s) { return this._p(s.index(idx).getAll(val)); }.bind(this)); }
  }

  /* ================================================================
   * Utilities
   * ================================================================ */
  function esc(s) { if (!s) return ''; var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function fmtDate(ts) { var d = new Date(ts); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); }
  function previewMD(md, len) { var t = (md||'').replace(/^#+\s.*$/gm,'').replace(/\*\*/g,'').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/\n{2,}/g,' ').trim(); return t.length > len ? t.slice(0,len)+'...' : t; }

  /* ================================================================
   * Firecrawl API
   * ================================================================ */
  function getApiKey() { return localStorage.getItem(LS_API_KEY) || ''; }

  async function fwScrape(url) {
    var key = getApiKey();
    if (!key) throw new Error('请先在设置中填入 Firecrawl API Key');
    var res = await fetch(FIRECRAWL_SCRAPE, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer '+key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url, formats: ['markdown'] })
    });
    if (!res.ok) { var e = await res.json().catch(function(){return{};}); throw new Error(e.message || 'HTTP '+res.status); }
    var data = await res.json();
    return { title: (data.data && data.data.metadata && data.data.metadata.title) || url, markdown: data.data ? (data.data.markdown || '') : '' };
  }

  async function fwSearch(query, limit) {
    limit = limit || 5;
    var key = getApiKey();
    if (!key) throw new Error('请先在设置中填入 Firecrawl API Key');
    var res = await fetch(FIRECRAWL_SEARCH, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer '+key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: query, limit: limit, scrapeOptions: { formats: ['markdown'] } })
    });
    if (!res.ok) { var e = await res.json().catch(function(){return{};}); throw new Error(e.message || 'HTTP '+res.status); }
    var data = await res.json();
    return (data.data || []).map(function (r) { return { title: r.title || r.url, url: r.url, markdown: r.markdown || '' }; });
  }

  /* ================================================================
   * App
   * ================================================================ */
  function App() {
    var self = this;
    self.db = new DB();
    self.articles = [];
    self.tab = 'clip';
    self.searchQuery = '';
    self.filterTag = '';
    self._dbReady = false;
  }

  App.prototype.init = function () {
    var self = this;
    if (localStorage.getItem(LS_THEME) === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    self._cacheDom();
    self._bindEvents();
    self.db.open(DB_NAME, DB_VERSION, (function () { var s = {}; s[STORE] = { keyPath: 'id', autoIncrement: true, indexes: [{ name: 'byTag', keyPath: 'tags', unique: false, multiEntry: true }, { name: 'byCreated', keyPath: 'createdAt' }] }; return s; })()).then(function () {
      self._dbReady = true;
      return self._load();
    }).then(function () { self._render(); });
  };

  App.prototype._cacheDom = function () {
    var d = document;
    this.$tabs = d.querySelectorAll('.wa-tab');
    this.$tabClip = d.getElementById('tabClip');
    this.$tabSearch = d.getElementById('tabSearch');
    this.$tabLib = d.getElementById('tabLib');
    this.$urlInput = d.getElementById('urlInput');
    this.$btnScrape = d.getElementById('btnScrape');
    this.$queryInput = d.getElementById('queryInput');
    this.$searchLimit = d.getElementById('searchLimit');
    this.$btnSearchSave = d.getElementById('btnSearchSave');
    this.$libSearch = d.getElementById('libSearch');
    this.$libTagFilter = d.getElementById('libTagFilter');
    this.$articleList = d.getElementById('articleList');
    this.$articleCount = d.getElementById('articleCount');
    this.$statusBar = d.getElementById('statusBar');
    this.$statusText = d.getElementById('statusText');
    this.$apiKeyInput = d.getElementById('apiKeyInput');
    this.$btnSaveKey = d.getElementById('btnSaveKey');
    this.$settingsPanel = d.getElementById('settingsPanel');
    this.$btnToggleSettings = d.getElementById('btnToggleSettings');
    this.$btnExportAll = d.getElementById('btnExportAll');
    this.$btnClearAll = d.getElementById('btnClearAll');
    this.$detailOverlay = d.getElementById('detailOverlay');
    this.$detailTitle = d.getElementById('detailTitle');
    this.$detailMeta = d.getElementById('detailMeta');
    this.$detailContent = d.getElementById('detailContent');
  };

  App.prototype._bindEvents = function () {
    var self = this;
    var d = document;

    // Tabs
    self.$tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        self.tab = this.dataset.tab;
        self._render();
      });
    });

    // Scrape
    self.$btnScrape.addEventListener('click', function () { self._doScrape(); });
    self.$urlInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') self._doScrape(); });

    // Search+Save
    self.$btnSearchSave.addEventListener('click', function () { self._doSearchSave(); });
    self.$queryInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') self._doSearchSave(); });

    // Library
    self.$libSearch.addEventListener('input', function () { self.searchQuery = this.value.trim().toLowerCase(); self._renderArticles(); });

    // Export/Clear
    self.$btnExportAll.addEventListener('click', function () { self._exportAll(); });
    self.$btnClearAll.addEventListener('click', function () { if (confirm('确定清空全部收藏？')) self._clearAll(); });

    // Settings
    self.$btnToggleSettings.addEventListener('click', function () { self.$settingsPanel.classList.toggle('is-open'); });
    self.$btnSaveKey.addEventListener('click', function () {
      var k = self.$apiKeyInput.value.trim();
      if (!k) { alert('请输入 API Key'); return; }
      localStorage.setItem(LS_API_KEY, k);
      self.$apiKeyInput.value = '';
      self.$settingsPanel.classList.remove('is-open');
      self._showToast('API Key 已保存', 'ok');
    });

    // Theme
    var btnTheme = d.getElementById('btnToggleTheme');
    if (btnTheme) btnTheme.addEventListener('click', function () { self._toggleTheme(); });

    // Modal close
    d.addEventListener('click', function (e) {
      if (e.target.classList.contains('modal-close-btn')) {
        var o = e.target.closest('.jy-overlay');
        if (o) o.classList.remove('is-open');
      }
    });
  };

  /* ---- Data ---- */
  App.prototype._load = function () {
    var self = this;
    if (!self._dbReady) { self.articles = []; return Promise.resolve(); }
    return self.db.getAll(STORE).then(function (a) { self.articles = (a||[]).sort(function (x, y) { return new Date(y.createdAt) - new Date(x.createdAt); }); });
  };

  App.prototype._save = function (article) {
    var self = this;
    article.createdAt = article.createdAt || new Date().toISOString();
    article.updatedAt = new Date().toISOString();
    return self.db.add(STORE, article).then(function (id) { article.id = id; self.articles.unshift(article); });
  };

  App.prototype._remove = function (id) {
    var self = this;
    return self.db.delete(STORE, id).then(function () { self.articles = self.articles.filter(function (a) { return a.id !== id; }); });
  };

  App.prototype._clearAll = function () {
    var self = this;
    return self.db.clear(STORE).then(function () { self.articles = []; self._render(); });
  };

  /* ---- Scrape ---- */
  App.prototype._doScrape = function () {
    var self = this;
    var url = self.$urlInput.value.trim();
    if (!url) { alert('请输入网页 URL'); return; }
    if (!/^https?:\/\/.+/.test(url)) { alert('请输入完整的 URL（以 http:// 或 https:// 开头）'); return; }
    self._setStatus('loading', '🔍 正在抓取...');
    self.$btnScrape.disabled = true;
    fwScrape(url).then(function (r) {
      return self._save({ url: url, title: r.title, markdown: r.markdown, tags: [], source: 'clip' });
    }).then(function () {
      self._setStatus('ok', '✅ 剪藏成功');
      self.$urlInput.value = '';
      self._render();
    }).catch(function (e) {
      self._setStatus('err', '❌ '+e.message);
    }).finally(function () { self.$btnScrape.disabled = false; });
  };

  /* ---- Search + Save ---- */
  App.prototype._doSearchSave = function () {
    var self = this;
    var query = self.$queryInput.value.trim();
    if (!query) { alert('请输入搜索关键词'); return; }
    var limit = Math.min(parseInt(self.$searchLimit.value) || 5, 10);
    self._setStatus('loading', '🔍 正在搜索并抓取...');
    self.$btnSearchSave.disabled = true;
    fwSearch(query, limit).then(function (results) {
      if (!results.length) { self._setStatus('ok', '⚠️ 未找到结果'); return; }
      var saved = 0;
      return Promise.all(results.map(function (r) {
        return self._save({ url: r.url, title: r.title, markdown: r.markdown, tags: [query], source: 'search' }).then(function () { saved++; });
      })).then(function () { self._setStatus('ok', '✅ 已收藏 '+saved+' 篇'); });
    }).catch(function (e) {
      self._setStatus('err', '❌ '+e.message);
    }).finally(function () { self.$btnSearchSave.disabled = false; self.$queryInput.value = ''; self._render(); });
  };

  /* ---- Export ---- */
  App.prototype._exportAll = function () {
    var out = self.articles.map(function (a) { return '# '+a.title+'\n\n> '+a.url+'\n\n'+a.markdown+'\n\n---\n'; }).join('\n');
    var blob = new Blob([out], { type: 'text/markdown' });
    var url = URL.createObjectURL(blob);
    var el = document.createElement('a');
    el.href = url; el.download = 'web-assistant-export.md'; el.click();
    URL.revokeObjectURL(url);
    self._showToast('已导出 '+self.articles.length+' 篇', 'ok');
  };

  App.prototype._exportOne = function (id) {
    var a = self.articles.find(function (x) { return x.id === id; });
    if (!a) return;
    var out = '# '+a.title+'\n\n> '+a.url+'\n\n'+a.markdown;
    var blob = new Blob([out], { type: 'text/markdown' });
    var url = URL.createObjectURL(blob);
    var el = document.createElement('a');
    el.href = url; el.download = (a.title||'article').replace(/[\\/:*?"<>|]/g,'_')+'.md'; el.click();
    URL.revokeObjectURL(url);
  };

  /* ---- Detail ---- */
  App.prototype._openDetail = function (id) {
    var a = self.articles.find(function (x) { return x.id === id; });
    if (!a) return;
    this.$detailTitle.textContent = a.title;
    this.$detailMeta.innerHTML = '<span>🔗 <a href="'+esc(a.url)+'" target="_blank">'+esc(a.url)+'</a></span> <span>🕐 '+fmtDate(a.createdAt)+'</span>' + (a.tags.length ? ' <span>🏷 '+a.tags.map(esc).join(' · ')+'</span>' : '');
    this.$detailContent.textContent = a.markdown || '(无内容)';
    this.$detailOverlay.classList.add('is-open');
    var self = this;
    document.getElementById('btnDetailExport').onclick = function () { self._exportOne(id); };
    document.getElementById('btnDetailDelete').onclick = function () { self.$detailOverlay.classList.remove('is-open'); self._remove(id).then(function () { self._render(); }); };
  };

  /* ---- Render ---- */
  App.prototype._render = function () {
    var self = this;
    // Tabs
    self.$tabs.forEach(function (t) { t.classList.toggle('active', t.dataset.tab === self.tab); });
    self.$tabClip.style.display = self.tab === 'clip' ? 'block' : 'none';
    self.$tabSearch.style.display = self.tab === 'search' ? 'block' : 'none';
    self.$tabLib.style.display = self.tab === 'lib' ? 'block' : 'none';
    // Restore API key display
    var savedKey = getApiKey();
    if (savedKey) self.$apiKeyInput.placeholder = '已保存 ('+savedKey.slice(0,8)+'...)';
    self._renderArticles();
  };

  App.prototype._renderArticles = function () {
    var self = this;
    var filtered = self.articles.slice();
    if (self.searchQuery) {
      var q = self.searchQuery;
      filtered = filtered.filter(function (a) {
        return (a.title||'').toLowerCase().indexOf(q) !== -1 || (a.markdown||'').toLowerCase().indexOf(q) !== -1 || (a.url||'').toLowerCase().indexOf(q) !== -1;
      });
    }
    if (self.filterTag) {
      filtered = filtered.filter(function (a) { return (a.tags||[]).indexOf(self.filterTag) !== -1; });
    }
    self.$articleCount.textContent = filtered.length;
    // Tags
    var tagCounts = {};
    self.articles.forEach(function (a) { (a.tags||[]).forEach(function (t) { tagCounts[t] = (tagCounts[t]||0)+1; }); });
    var sortedTags = Object.entries(tagCounts).sort(function (a, b) { return b[1]-a[1]; });
    var tagHtml = '<span class="wa-tag' + (!self.filterTag ? ' active' : '') + '" data-tag="">全部</span>';
    sortedTags.forEach(function (e) { tagHtml += '<span class="wa-tag' + (self.filterTag === e[0] ? ' active' : '') + '" data-tag="'+esc(e[0])+'">'+esc(e[0])+' ('+e[1]+')</span>'; });
    self.$libTagFilter.innerHTML = tagHtml;
    self.$libTagFilter.querySelectorAll('.wa-tag').forEach(function (t) {
      t.addEventListener('click', function () { self.filterTag = this.dataset.tag; self._renderArticles(); });
    });

    if (!filtered.length) {
      self.$articleList.innerHTML = '<div class="jy-empty"><div class="jy-empty__icon">📭</div><div class="jy-empty__text">暂无收藏</div><div class="jy-empty__sub">剪藏或搜藏后文章会出现在这里</div></div>';
      return;
    }
    var html = '';
    filtered.forEach(function (a) {
      html += '<div class="wa-article" data-id="'+a.id+'">' +
        '<div class="wa-article__header">' +
          '<h3 class="wa-article__title">'+esc(a.title||a.url)+'</h3>' +
          (a.source === 'search' ? '<span class="wa-badge wa-badge--search">搜索</span>' : '<span class="wa-badge wa-badge--clip">剪藏</span>') +
        '</div>' +
        '<p class="wa-article__preview">'+esc(previewMD(a.markdown, 150))+'</p>' +
        '<div class="wa-article__footer">' +
          '<span class="wa-article__url">🔗 '+esc((a.url||'').replace(/https?:\/\//,'').slice(0,50))+'</span>' +
          '<span class="wa-article__time">'+fmtDate(a.createdAt)+'</span>' +
        '</div>' +
      '</div>';
    });
    self.$articleList.innerHTML = html;
    self.$articleList.querySelectorAll('.wa-article').forEach(function (el) {
      el.addEventListener('click', function () { self._openDetail(parseInt(this.dataset.id)); });
    });
  };

  /* ---- Toast ---- */
  App.prototype._showToast = function (msg, type) {
    var el = document.createElement('div');
    el.className = 'wa-toast wa-toast--' + (type||'ok');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 2500);
  };

  /* ---- Status bar ---- */
  App.prototype._setStatus = function (type, msg) {
    this.$statusBar.className = 'wa-status wa-status--' + type;
    this.$statusText.textContent = msg;
  };

  /* ---- Theme ---- */
  App.prototype._toggleTheme = function () {
    var cur = document.documentElement.getAttribute('data-theme'), next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(LS_THEME, next);
    var btn = document.getElementById('btnToggleTheme');
    if (btn) btn.textContent = next === 'dark' ? '☀️' : '🌙';
  };

  /* ================================================================
   * Bootstrap
   * ================================================================ */
  document.addEventListener('DOMContentLoaded', function () { new App().init(); });

})();
