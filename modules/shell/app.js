;(function () {
  'use strict';

  const DB_NAME = 'JuYiShell';
  const DB_VERSION = 2;
  const STORE = 'cards';
  const LS_DAILY = 'shell_daily_quote';
  const LS_USED = 'shell_used_quotes';
  const LS_THEME = 'jy_theme';

  const PRESET_CATEGORIES = ['数学公式', '408专业课', '英语美言'];

  /* ================================================================
   * English motivational quote bank (考研英语)
   * Each entry: { en, zh, theme }
   * ================================================================ */
  const QUOTE_BANK = [
    { en: 'The only way to do great work is to love what you do.', zh: '成就伟业的唯一途径是热爱你所做的事。', theme: '热爱' },
    { en: 'It does not matter how slowly you go as long as you do not stop.', zh: '只要不停下，走得慢一点也没关系。', theme: '坚持' },
    { en: 'The future belongs to those who believe in the beauty of their dreams.', zh: '未来属于那些相信梦想之美的人。', theme: '梦想' },
    { en: 'Success is not final, failure is not fatal: it is the courage to continue that counts.', zh: '成功不是终点，失败也非末日，最重要的是继续前行的勇气。', theme: '勇气' },
    { en: 'The secret of getting ahead is getting started.', zh: '领先的秘诀就是开始行动。', theme: '行动' },
    { en: 'Difficulties in life are intended to make us better, not bitter.', zh: '生活中的困难是为了让我们变得更好，而不是更痛苦。', theme: '成长' },
    { en: 'What we do today will determine what we will achieve tomorrow.', zh: '今日之所为，决定明日之所成。', theme: '自律' },
    { en: 'The pain you feel today will be the strength you feel tomorrow.', zh: '今日的痛苦将是明日的力量。', theme: '奋斗' },
    { en: 'Every master was once a beginner. Every expert was once an amateur.', zh: '每一个大师都曾是初学者，每一个专家都曾是业余者。', theme: '成长' },
    { en: 'You never know how strong you are until being strong is the only choice.', zh: '直到坚强成为唯一的选择，你才知道自己有多强。', theme: '勇气' },
    { en: 'The harder you work, the luckier you get.', zh: '越努力，越幸运。', theme: '奋斗' },
    { en: 'Action is the foundational key to all success.', zh: '行动是一切成功的基础。', theme: '行动' },
    { en: 'Small daily improvements over time lead to stunning results.', zh: '日积月累的小进步会带来惊人的成果。', theme: '坚持' },
    { en: 'Your attitude, not your aptitude, will determine your altitude.', zh: '决定你高度的不是天资，而是态度。', theme: '态度' },
    { en: 'Dream big and dare to fail.', zh: '敢于梦想，不惧失败。', theme: '梦想' },
    { en: 'The only limit to our realization of tomorrow will be our doubts of today.', zh: '实现明天理想的唯一障碍是今天的疑虑。', theme: '自信' },
    { en: 'Perseverance is not a long race; it is many short races one after another.', zh: '坚持不是一场长跑，而是无数短跑的接力。', theme: '坚持' },
    { en: 'Knowledge speaks, but wisdom listens.', zh: '知识在于言说，智慧在于倾听。', theme: '智慧' },
    { en: 'Time you enjoy wasting is not wasted time.', zh: '享受过的时间不算浪费。', theme: '时间' },
    { en: 'Courage does not always roar. Sometimes courage is the quiet voice at the end of the day saying, "I will try again tomorrow."', zh: '勇气不总是咆哮，有时它是日暮时分那句轻声的"明天再来"。', theme: '勇气' },
    { en: 'A river cuts through rock not because of its power but because of its persistence.', zh: '河流切开岩石，不是靠力量，而是靠坚持。', theme: '坚持' },
    { en: 'The best time to plant a tree was 20 years ago. The second best time is now.', zh: '种树最好的时间是二十年前，其次是现在。', theme: '行动' },
    { en: 'Strive not to be a success, but rather to be of value.', zh: '不要努力成为成功的人，而要努力成为有价值的人。', theme: '成长' },
    { en: 'In the middle of difficulty lies opportunity.', zh: '困境之中，蕴藏机遇。', theme: '希望' },
    { en: 'The only person you should try to be better than is who you were yesterday.', zh: '你唯一需要超越的人，是昨天的自己。', theme: '成长' },
    { en: 'Discipline is the bridge between goals and accomplishment.', zh: '自律是目标与成就之间的桥梁。', theme: '自律' },
    { en: 'Challenges are what make life interesting. Overcoming them is what makes life meaningful.', zh: '挑战让生活有趣，克服挑战让生活有意义。', theme: '奋斗' },
    { en: 'The journey of a thousand miles begins with a single step.', zh: '千里之行，始于足下。', theme: '行动' },
    { en: 'What lies behind us and what lies before us are tiny matters compared to what lies within us.', zh: '与我们内心的力量相比，身后的往事和前方的未知都微不足道。', theme: '自信' },
    { en: 'Success is the sum of small efforts, repeated day in and day out.', zh: '成功是日复一日微小努力的总和。', theme: '坚持' },
    { en: 'Don\'t watch the clock; do what it does. Keep going.', zh: '不要盯着时钟看——像它那样，永不停歇。', theme: '时间' },
    { en: 'Believe you can and you\'re halfway there.', zh: '相信你可以，你就已经成功了一半。', theme: '自信' },
    { en: 'No one can make you feel inferior without your consent.', zh: '未经你的同意，没有人能让你感到自卑。', theme: '自信' },
    { en: 'Hardships often prepare ordinary people for an extraordinary destiny.', zh: '苦难常常为平凡人预备不平凡的命运。', theme: '奋斗' },
    { en: 'If you want to lift yourself up, lift up someone else.', zh: '要想提升自己，先帮助别人。', theme: '智慧' },
    { en: 'The only place where your dream becomes impossible is in your own thinking.', zh: '梦想只有在你的思想里才会变得不可能。', theme: '梦想' },
    { en: 'Start where you are. Use what you have. Do what you can.', zh: '从此刻出发，用你所有，尽你所能。', theme: '行动' },
    { en: 'Optimism is the faith that leads to achievement.', zh: '乐观是通向成就的信念。', theme: '希望' },
    { en: 'Great things are done by a series of small things brought together.', zh: '伟大的成就由无数小事汇聚而成。', theme: '坚持' },
    { en: 'The function of education is to teach one to think intensively and to think critically.', zh: '教育的功能是教会人深度思考和批判性思考。', theme: '智慧' },
  ];

  /* ================================================================
   * Utilities
   * ================================================================ */
  /* esc / escAttr / stripHtml / sanitizeHtml — provided by shared/utils.js */
  function fmtDate(ts) {
    const d = new Date(ts);
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }
  function todayKey() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* ================================================================
   * AI Quote generation engine
   * Uses curated quote bank with intelligent dedup & randomization.
   * Async signature so it can be replaced with a real API call later.
   * ================================================================ */
  async function generateAIQuote(existingEns) {
    // Build used set from localStorage + existing cards
    const usedRaw = localStorage.getItem(LS_USED);
    const usedSet = new Set(usedRaw ? JSON.parse(usedRaw) : []);
    if (existingEns && existingEns.length) {
      existingEns.forEach(function (en) { usedSet.add(en.trim().toLowerCase()); });
    }

    // Filter to unused quotes
    let pool = QUOTE_BANK.filter(function (q) {
      return !usedSet.has(q.en.trim().toLowerCase());
    });

    // Fall back to full pool if too few unused
    if (pool.length < 5) {
      pool = QUOTE_BANK;
      // Clear very old used entries to make room
      localStorage.setItem(LS_USED, JSON.stringify([]));
    }

    // Pick random
    const idx = Math.floor(Math.random() * pool.length);
    const chosen = pool[idx];

    // Track used
    usedSet.add(chosen.en.trim().toLowerCase());
    // Keep last 100
    const usedArr = Array.from(usedSet).slice(-100);
    localStorage.setItem(LS_USED, JSON.stringify(usedArr));

    return {
      english: chosen.en,
      chinese: chosen.zh,
      theme: chosen.theme
    };
  }

  /* ================================================================
   * Main App
   * ================================================================ */
  class ShellApp {
    constructor() {
      this.db = new JuYiDB();
      this.cards = [];
      this.filters = { category: '', tags: new Set(), folder: '' };
      this.searchQuery = '';
      this.sortOrder = 'newest'; // 'newest' | 'oldest'
      this.editingId = null;
      this.pendingDeleteId = null;
      this.dailyQuote = null;
      this._dbReady = false;
      this._viewingFileId = null;
    }

    /* ---- lifecycle ---- */
    async init() {
      this._restoreTheme();
      this._cacheDom();
      this._bindEvents();

      // Open IndexedDB — try primary name first, then fallback
      this._dbReady = await this._tryOpenDB(DB_NAME);
      if (!this._dbReady) {
        // Primary DB failed — try fallback name to bypass any corruption
        var fallbackName = DB_NAME + '_v2';
        console.warn('拾贝：主数据库打开失败，尝试备用库 ' + fallbackName);
        this._dbReady = await this._tryOpenDB(fallbackName);
        if (this._dbReady) {
          // Store the active DB name for later use
          this._activeDBName = fallbackName;
        }
      } else {
        this._activeDBName = DB_NAME;
      }

      // Show storage warning if completely unavailable
      if (!this._dbReady) {
        this._showStorageWarning();
      }

      // Daily quote — only needs localStorage, works even without IndexedDB
      try {
        await this._loadDailyQuote();
      } catch (e) {
        console.warn('拾贝：每日美言加载失败', e);
        this.dailyQuote = null;
      }

      // Always render the UI regardless of init errors
      this.render();
    }

    _cacheDom() {
      var d = document;
      this.$dailySection = d.getElementById('dailySection');
      this.$dailyEn = d.getElementById('dailyEn');
      this.$dailyZh = d.getElementById('dailyZh');
      this.$dailyTheme = d.getElementById('dailyTheme');
      this.$dailyDate = d.getElementById('dailyDate');
      this.$btnRefresh = d.getElementById('btnRefreshQuote');
      this.$btnCollect = d.getElementById('btnCollectQuote');
      this.$btnAdd = d.getElementById('btnAdd');
      this.$searchInput = d.getElementById('searchInput');
      this.$btnClearSearch = d.getElementById('btnClearSearch');
      this.$sortSelect = d.getElementById('sortSelect');
      this.$categoryFilter = d.getElementById('categoryFilter');
      this.$tagFilter = d.getElementById('tagFilter');
      this.$cardGrid = d.getElementById('cardGrid');
      this.$emptyState = d.getElementById('emptyState');
      this.$cardCount = d.getElementById('cardCount');

      // Modal: add/edit
      this.$overlay = d.getElementById('editOverlay');
      this.$modalTitle = d.getElementById('editModalTitle');
      this.$editId = d.getElementById('editId');
      this.$editTitle = d.getElementById('editTitle');
      this.$editContent = d.getElementById('editContent');
      this.$editCategory = d.getElementById('editCategory');
      this.$editTags = d.getElementById('editTags');
      this.$btnSave = d.getElementById('btnSave');

      // Modal: delete confirm
      this.$deleteOverlay = d.getElementById('deleteOverlay');
      this.$deleteMsg = d.getElementById('deleteMsg');
      this.$btnConfirmDelete = d.getElementById('btnConfirmDelete');

      // Modal: card detail
      this.$detailOverlay = d.getElementById('detailOverlay');
      this.$detailTitle = d.getElementById('detailTitle');
      this.$detailContent = d.getElementById('detailContent');
      this.$detailMeta = d.getElementById('detailMeta');

      // Import
      this.$importFile = d.getElementById('importFile');
      this.$btnImport = d.getElementById('btnImport');
      this.$btnExport = d.getElementById('btnExport');

      // File import
      this.$btnImportFile = d.getElementById('btnImportFile');
      this.$fileInput = d.getElementById('fileInput');

      // Folder
      this.$folderTree = d.getElementById('folderTree');
      this.$btnNewFolder = d.getElementById('btnNewFolder');

      // File viewer
      this.$fileViewerOverlay = d.getElementById('fileViewerOverlay');
      this.$fileViewerTitle = d.getElementById('fileViewerTitle');
      this.$fileViewerBody = d.getElementById('fileViewerBody');
      this.$btnDownloadFile = d.getElementById('btnDownloadFile');
      this._currentFileData = null; // for download
    }

    _bindEvents() {
      var self = this;
      // Daily quote
      this.$btnRefresh.addEventListener('click', function () { self._refreshQuote(); });
      this.$btnCollect.addEventListener('click', function () { self._collectQuote(); });

      // Card actions
      this.$btnAdd.addEventListener('click', function () { self._openModal(null); });
      this.$btnSave.addEventListener('click', function () { self._handleSave(); });
      this.$btnConfirmDelete.addEventListener('click', function () { self._handleDelete(); });

      // Search
      this.$searchInput.addEventListener('input', function () {
        self.searchQuery = this.value.trim().toLowerCase();
        self.$btnClearSearch.style.display = self.searchQuery ? 'flex' : 'none';
        self.renderCards();
      });
      this.$btnClearSearch.addEventListener('click', function () {
        self.$searchInput.value = '';
        self.searchQuery = '';
        this.style.display = 'none';
        self.renderCards();
      });

      // Sort
      this.$sortSelect.addEventListener('change', function () {
        self.sortOrder = this.value;
        self.renderCards();
      });

      // Import
      this.$btnImport.addEventListener('click', function () { self.$importFile.click(); });
      this.$importFile.addEventListener('change', function () { self._handleImport(this); });
      this.$btnExport.addEventListener('click', function () { self._handleExport(); });

      // Global: close modals (click overlay background or X button)
      document.addEventListener('click', function (e) {
        if (e.target.classList.contains('jy-overlay') && e.target.classList.contains('modal-close-target')) {
          e.target.classList.remove('is-open');
        }
        if (e.target.classList.contains('modal-close-btn')) {
          var overlay = e.target.closest('.jy-overlay');
          if (overlay) overlay.classList.remove('is-open');
        }
        // File viewer: also close on overlay click
        if (e.target.id === 'fileViewerOverlay') {
          e.target.classList.remove('is-open');
        }
      });

      // Paste image in content editor
      this.$editContent.addEventListener('paste', function (e) {
        self._handlePaste(e);
      });

      // Theme toggle
      var btnTheme = document.getElementById('btnToggleTheme');
      if (btnTheme) {
        btnTheme.addEventListener('click', function () { self._toggleTheme(); });
      }

      // File import
      if (this.$btnImportFile) {
        this.$btnImportFile.addEventListener('click', function () { self.$fileInput.click(); });
      }
      if (this.$fileInput) {
        this.$fileInput.addEventListener('change', function () { self._handleFileImport(this); });
      }

      // Folder
      if (this.$btnNewFolder) {
        this.$btnNewFolder.addEventListener('click', function () { self._createFolder(); });
      }
      if (this.$folderTree) {
        this.$folderTree.addEventListener('click', function (e) {
          var item = e.target.closest('.folder-tree__item');
          if (!item) return;
          var folder = item.dataset.folder || '';
          self._selectFolder(folder);
        });
      }

      // File viewer
      if (this.$btnDownloadFile) {
        this.$btnDownloadFile.addEventListener('click', function () { self._downloadCurrentFile(); });
      }

      // Drag & drop file import on card grid
      if (this.$cardGrid) {
        this.$cardGrid.addEventListener('dragover', function (e) { e.preventDefault(); });
        this.$cardGrid.addEventListener('drop', function (e) {
          e.preventDefault();
          var files = e.dataTransfer.files;
          if (files && files.length) self._processFiles(files);
        });
      }
    }

    /* ---- Theme ---- */
    _restoreTheme() {
      var saved = localStorage.getItem(LS_THEME);
      if (saved === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    }
    _toggleTheme() {
      var current = document.documentElement.getAttribute('data-theme');
      var next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem(LS_THEME, next);
      var btn = document.getElementById('btnToggleTheme');
      if (btn) btn.textContent = next === 'dark' ? '☀️ 亮色模式' : '🌙 暗色模式';
    }

    /* ---- Data ---- */
    async _tryOpenDB(name) {
      try {
        await this.db.open(name, DB_VERSION, {
          [STORE]: { keyPath: 'id', autoIncrement: true, indexes: [{ name: 'byCategory', keyPath: 'category' }, { name: 'byCreatedAt', keyPath: 'createdAt' }] }
        });
        this.cards = await this.db.getAll(STORE) || [];
        console.log('拾贝：数据库 ' + name + ' 就绪，' + this.cards.length + ' 张卡片');
        return true;
      } catch (e) {
        console.error('拾贝：数据库 ' + name + ' 打开失败', e);
        return false;
      }
    }

    _showStorageWarning() {
      // Show a dismissible warning banner at the top of the card grid
      var banner = document.createElement('div');
      banner.className = 'storage-warning';
      banner.innerHTML = '<span>⚠️ 浏览器数据存储不可用，卡片无法保存。请检查是否开启无痕模式或禁用了网站数据。</span><button class="storage-warning__close">✕</button>';
      this.$cardGrid.parentNode.insertBefore(banner, this.$cardGrid);
      banner.querySelector('.storage-warning__close').addEventListener('click', function () {
        banner.remove();
      });
      // Also disable action buttons that need DB
      this.$btnAdd.disabled = true;
      this.$btnAdd.title = '存储不可用';
      this.$btnCollect.disabled = true;
      this.$btnCollect.title = '存储不可用';
      this.$btnImport.disabled = true;
      this.$btnImport.title = '存储不可用';
      this.$btnExport.disabled = true;
      this.$btnExport.title = '存储不可用';
    }

    async _loadCards() {
      this.cards = await this.db.getAll(STORE) || [];
    }

    async _saveCard(card) {
      if (card.id) {
        card.updatedAt = new Date().toISOString();
        await this.db.put(STORE, card);
      } else {
        card.createdAt = new Date().toISOString();
        card.updatedAt = card.createdAt;
        var id = await this.db.add(STORE, card);
        card.id = id;
      }
      await this._loadCards();
    }

    async _deleteCard(id) {
      await this.db.delete(STORE, id);
      await this._loadCards();
    }

    /* ---- Daily Quote ---- */
    async _loadDailyQuote() {
      var raw = localStorage.getItem(LS_DAILY);
      var today = todayKey();
      if (raw) {
        try {
          var cached = JSON.parse(raw);
          if (cached.date === today && cached.quote) {
            this.dailyQuote = cached.quote;
            return;
          }
        } catch (e) { /* ignore */ }
      }
      // Generate new quote for today
      await this._generateNewQuote(today);
    }

    async _generateNewQuote(dateKey) {
      // Collect existing English sentences from user's cards for dedup
      var existingEns = this.cards
        .filter(function (c) { return c.source === 'daily' || c.category === '英语美言'; })
        .map(function (c) { return (c.title || '').trim(); });

      var quote = await generateAIQuote(existingEns);
      this.dailyQuote = quote;
      localStorage.setItem(LS_DAILY, JSON.stringify({ date: dateKey || todayKey(), quote: quote }));
    }

    async _refreshQuote() {
      this.$btnRefresh.disabled = true;
      this.$btnRefresh.textContent = '⏳ 生成中...';
      try {
        await this._generateNewQuote(todayKey());
        this.renderDailyQuote();
      } catch (e) {
        alert('生成失败，请稍后重试');
      }
      this.$btnRefresh.disabled = false;
      this.$btnRefresh.textContent = '🔄 换一句';
    }

    async _collectQuote() {
      if (!this.dailyQuote) return;
      if (!this._dbReady) {
        alert('数据存储不可用，无法收藏。请检查浏览器是否开启了无痕模式或禁用了网站数据存储。');
        return;
      }
      this.$btnCollect.disabled = true;
      this.$btnCollect.textContent = '⏳ 收藏中...';
      try {
        var card = {
          title: this.dailyQuote.english,
          content: '<p>' + esc(this.dailyQuote.chinese) + '</p>',
          category: '英语美言',
          tags: [this.dailyQuote.theme, '每日精选'],
          source: 'daily',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await this._saveCard(card);
        // Visual feedback
        this.$btnCollect.textContent = '✅ 已收藏';
        setTimeout(function () {
          var btn = document.getElementById('btnCollectQuote');
          if (btn) { btn.textContent = '⭐ 收藏为卡片'; btn.disabled = false; }
        }, 2000);
        this.renderCards();
        this.renderFilters();
      } catch (e) {
        console.error('收藏失败', e);
        alert('收藏失败：' + (e.message || '未知错误'));
        this.$btnCollect.textContent = '⭐ 收藏为卡片';
        this.$btnCollect.disabled = false;
      }
    }

    /* ---- Paste image handler ---- */
    _handlePaste(e) {
      var items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (item.type.indexOf('image') !== -1) {
          e.preventDefault();
          var blob = item.getAsFile();
          var reader = new FileReader();
          var self = this;
          reader.onload = function (ev) {
            var img = document.createElement('img');
            img.src = ev.target.result;
            img.style.maxWidth = '100%';
            img.style.display = 'block';
            img.style.margin = '0.5rem 0';
            // Insert at cursor
            var sel = window.getSelection();
            if (sel.rangeCount) {
              var range = sel.getRangeAt(0);
              range.deleteContents();
              range.insertNode(img);
              // Move cursor after image
              range.setStartAfter(img);
              range.collapse(true);
              sel.removeAllRanges();
              sel.addRange(range);
            } else {
              self.$editContent.appendChild(img);
            }
          };
          reader.readAsDataURL(blob);
          return;
        }
      }
    }

    /* ---- File Import ---- */
    _handleFileImport(input) {
      if (!this._dbReady) { alert('数据存储不可用'); input.value = ''; return; }
      var files = input.files;
      if (!files || !files.length) return;
      this._processFiles(files);
      input.value = '';
    }

    async _processFiles(files) {
      var self = this;
      for (var i = 0; i < files.length; i++) {
        var file = files[i];
        var reader = new FileReader();
        var result = await new Promise(function (resolve) {
          reader.onload = function (e) { resolve({ name: file.name, type: file.type, data: e.target.result, size: file.size }); };
          reader.onerror = function () { resolve(null); };
          reader.readAsDataURL(file);
        });
        if (!result) { alert(file.name + ' 读取失败'); continue; }

        var card = {
          title: file.name,
          content: '',
          category: '导入文件',
          tags: [self._fileTypeLabel(result.type, file.name)],
          source: 'file',
          type: 'file',
          fileName: file.name,
          fileType: result.type,
          fileData: result.data,
          fileSize: result.size,
          folder: self.filters.folder || '默认',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        // Parse XMind for preview content
        if (/\.xmind$/i.test(file.name)) {
          try {
            var buffer = await file.arrayBuffer();
            var mindMap = await XMindParser.parse(buffer);
            if (mindMap) {
              card.content = mindMap.html;
            }
          } catch (e) { /* keep empty content */ }
        }

        await self._saveCard(card);
      }
      self.render();
    }

    _fileTypeLabel(mimeType, fileName) {
      if (/\.xmind$/i.test(fileName)) return 'XMind';
      if (/\.pdf$/i.test(fileName)) return 'PDF';
      if (/image\//.test(mimeType)) return '图片';
      return '文件';
    }

    /* ---- Folder ---- */
    _selectFolder(folder) {
      this.filters.folder = folder;
      this.renderCards();
      this.renderFolderTree();
    }

    _createFolder() {
      var name = prompt('请输入文件夹名称：');
      if (!name || !name.trim()) return;
      name = name.trim();
      // Create folder by saving an empty marker — or just switch to it
      this.filters.folder = name;
      this.renderCards();
      this.renderFolderTree();
    }

    _getFolders() {
      var folders = new Set();
      this.cards.forEach(function (c) {
        if (c.folder) folders.add(c.folder);
        else folders.add('默认');
      });
      var arr = Array.from(folders).sort();
      // Move '默认' to front
      var defIdx = arr.indexOf('默认');
      if (defIdx > 0) { arr.splice(defIdx, 1); arr.unshift('默认'); }
      return arr;
    }

    renderFolderTree() {
      var folders = this._getFolders();
      var counts = {};
      this.cards.forEach(function (c) {
        var f = c.folder || '默认';
        counts[f] = (counts[f] || 0) + 1;
      });
      var html = '<span class="folder-tree__item folder-tree__item--all' + (this.filters.folder === '' ? ' is-active' : '') + '" data-folder="">📂 全部（' + this.cards.length + '）</span>';
      folders.forEach(function (f) {
        html += '<span class="folder-tree__item' + (this.filters.folder === f ? ' is-active' : '') + '" data-folder="' + esc(f) + '">📁 ' + esc(f) + '（' + (counts[f] || 0) + '）</span>';
      }, this);
      this.$folderTree.innerHTML = html;
    }

    /* ---- File Viewer ---- */
    _openFileViewer(card) {
      if (!card || card.type !== 'file') return;
      this._viewingFileId = card.id;
      this._currentFileData = card.fileData;
      this.$fileViewerTitle.textContent = card.fileName || card.title;

      var body = this.$fileViewerBody;
      body.innerHTML = '';
      var isPDF = /\.pdf$/i.test(card.fileName || '');
      var isImage = (card.fileType || '').indexOf('image/') === 0;
      var isXMind = /\.xmind$/i.test(card.fileName || '');

      if (isImage) {
        body.innerHTML = '<img src="' + card.fileData + '" style="max-width:100%;max-height:65vh;display:block;margin:0 auto" alt="">';
      } else if (isPDF) {
        body.innerHTML = '<iframe src="' + card.fileData + '" style="width:100%;height:65vh;border:none" title="PDF"></iframe>';
      } else if (isXMind) {
        if (card.content) {
          body.innerHTML = card.content;
        } else {
          body.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--jy-text-muted)">🧠 XMind 文件<br><small>解析中...若持续显示此消息，请点击下方按钮下载原文件</small></div>';
        }
      } else {
        body.innerHTML = '<div style="text-align:center;padding:2rem"><div style="font-size:3rem;margin-bottom:1rem">📄</div><p>' + esc(card.fileName || '未知文件') + '</p><p style="color:var(--jy-text-muted)">此格式暂不支持在线预览，请下载查看</p></div>';
      }

      this.$fileViewerOverlay.classList.add('is-open');
    }

    _downloadCurrentFile() {
      if (!this._currentFileData) return;
      var card = this.cards.find(function (c) { return c.id === this._viewingFileId; }, this);
      var filename = card ? card.fileName : 'download';
      var a = document.createElement('a');
      a.href = this._currentFileData;
      a.download = filename;
      a.click();
    }

    /* ---- Card CRUD ---- */
    _openModal(card) {
      this.editingId = card ? card.id : null;
      this.$modalTitle.textContent = card ? '编辑卡片' : '新建卡片';
      this.$editId.value = card ? card.id : '';
      this.$editTitle.value = card ? card.title : '';
      this.$editContent.innerHTML = card ? sanitizeHtml(card.content) : '';
      this.$editCategory.value = card ? card.category : '';
      this.$editTags.value = card && card.tags ? card.tags.join('，') : '';
      this.$overlay.classList.add('is-open');
      // Focus
      setTimeout(function () {
        if (!card) { document.getElementById('editTitle').focus(); }
      }, 100);
    }

    _handleSave() {
      if (!this._dbReady) { alert('数据存储不可用，无法保存。'); return; }
      var self = this;
      var title = this.$editTitle.value.trim();
      var content = this.$editContent.innerHTML.trim();
      var category = this.$editCategory.value.trim();
      var tagsRaw = this.$editTags.value.trim();
      var tags = tagsRaw ? tagsRaw.split(/[,，]/).map(function (t) { return t.trim(); }).filter(Boolean) : [];

      if (!title) { alert('请输入标题'); return; }

      var card = {
        title: title,
        content: content || '<p></p>',
        category: category || '未分类',
        tags: tags,
        source: 'manual'
      };

      if (this.editingId) {
        card.id = this.editingId;
        var existing = this.cards.find(function (c) { return c.id === self.editingId; });
        if (existing) {
          card.createdAt = existing.createdAt;
          card.source = existing.source;
        }
      }

      this._saveCard(card).then(function () {
        self.$overlay.classList.remove('is-open');
        self.editingId = null;
        self.renderCards();
        self.renderFilters();
      });
    }

    _handleDelete() {
      if (!this._dbReady) { alert('数据存储不可用，无法删除。'); return; }
      var self = this;
      if (this.pendingDeleteId == null) return;
      this._deleteCard(this.pendingDeleteId).then(function () {
        self.$deleteOverlay.classList.remove('is-open');
        self.pendingDeleteId = null;
        self.renderCards();
        self.renderFilters();
      });
    }

    _confirmDelete(id) {
      this.pendingDeleteId = id;
      var card = this.cards.find(function (c) { return c.id === id; });
      this.$deleteMsg.textContent = '确定删除卡片「' + (card ? card.title : '') + '」？此操作不可撤销。';
      this.$deleteOverlay.classList.add('is-open');
    }

    _openDetail(card) {
      this.$detailTitle.textContent = card.title;
      this.$detailContent.innerHTML = sanitizeHtml(card.content);
      var metaParts = [];
      if (card.category) metaParts.push('📂 ' + esc(card.category));
      if (card.tags && card.tags.length) metaParts.push('🏷 ' + card.tags.map(esc).join(' · '));
      metaParts.push('🕐 ' + fmtDate(card.createdAt));
      if (card.source === 'daily') metaParts.push('📌 每日精选');
      this.$detailMeta.textContent = metaParts.join(' ｜ ');
      this.$detailOverlay.classList.add('is-open');
      // Bind edit/delete buttons in detail
      var self = this;
      document.getElementById('btnDetailEdit').onclick = function () {
        self.$detailOverlay.classList.remove('is-open');
        self._openModal(card);
      };
      document.getElementById('btnDetailDelete').onclick = function () {
        self.$detailOverlay.classList.remove('is-open');
        self._confirmDelete(card.id);
      };
    }

    /* ---- Export/Import ---- */
    _handleExport() {
      var data = {
        _format: 'JuYiShell/1',
        exportedAt: new Date().toISOString(),
        version: DB_VERSION,
        cards: this.cards
      };
      var json = JSON.stringify(data, null, 2);
      var blob = new Blob([json], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'shell-backup-' + todayKey() + '.json';
      a.click();
      URL.revokeObjectURL(url);
    }

    _handleImport(input) {
      if (!this._dbReady) { alert('数据存储不可用，无法导入。'); input.value = ''; return; }
      var self = this;
      var file = input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = async function (e) {
        try {
          var data = JSON.parse(e.target.result);
          if (data._format !== 'JuYiShell/1') { alert('文件格式不正确'); return; }
          if (!confirm('导入将覆盖当前所有卡片数据（共 ' + (data.cards ? data.cards.length : 0) + ' 张），确定继续？')) return;
          await self.db.clear(STORE);
          if (data.cards && data.cards.length) {
            for (var i = 0; i < data.cards.length; i++) {
              await self.db.add(STORE, data.cards[i]);
            }
          }
          await self._loadCards();
          self.render();
          alert('导入成功！共 ' + data.cards.length + ' 张卡片');
        } catch (err) {
          alert('导入失败：' + err.message);
        }
      };
      reader.readAsText(file);
      input.value = '';
    }

    /* ---- Render ---- */
    render() {
      this.renderDailyQuote();
      this.renderFolderTree();
      this.renderCards();
      this.renderFilters();
    }

    renderDailyQuote() {
      if (!this.dailyQuote) {
        this.$dailyEn.textContent = '正在生成今日美言...';
        this.$dailyZh.textContent = '首次加载请稍候，如长时间无响应请点击下方「换一句」';
        this.$dailyTheme.textContent = '加载中';
        this.$dailyDate.textContent = todayKey();
        return;
      }
      this.$dailyEn.textContent = this.dailyQuote.english;
      this.$dailyZh.textContent = this.dailyQuote.chinese;
      this.$dailyTheme.textContent = this.dailyQuote.theme;
      this.$dailyDate.textContent = todayKey();
    }

    renderFilters() {
      var self = this;
      // Category filter chips
      var categories = new Set();
      PRESET_CATEGORIES.forEach(function (c) { categories.add(c); });
      this.cards.forEach(function (c) { if (c.category) categories.add(c.category); });

      var catHtml = '<span class="filter-chip' + (self.filters.category === '' ? ' is-active' : '') + '" data-cat="">全部</span>';
      categories.forEach(function (cat) {
        catHtml += '<span class="filter-chip' + (self.filters.category === cat ? ' is-active' : '') + '" data-cat="' + esc(cat) + '">' + esc(cat) + '</span>';
      });
      this.$categoryFilter.innerHTML = catHtml;

      // Bind category filter clicks
      this.$categoryFilter.querySelectorAll('.filter-chip').forEach(function (chip) {
        chip.addEventListener('click', function () {
          self.filters.category = this.dataset.cat;
          self.renderCards();
          self.renderFilters();
        });
      });

      // Tag filter chips (show top tags)
      var tagCounts = {};
      this.cards.forEach(function (c) {
        if (c.tags && c.tags.length) {
          c.tags.forEach(function (t) { tagCounts[t] = (tagCounts[t] || 0) + 1; });
        }
      });
      var sortedTags = Object.entries(tagCounts).sort(function (a, b) { return b[1] - a[1]; });
      var tagHtml = '';
      sortedTags.forEach(function (_a) {
        var tag = _a[0], count = _a[1];
        var active = self.filters.tags.has(tag);
        tagHtml += '<span class="filter-chip filter-chip--tag' + (active ? ' is-active' : '') + '" data-tag="' + esc(tag) + '">' + esc(tag) + ' (' + count + ')</span>';
      });
      if (!tagHtml) tagHtml = '<span style="font-size:var(--jy-font-size-sm);color:var(--jy-text-muted)">暂无标签</span>';
      this.$tagFilter.innerHTML = tagHtml;

      // Bind tag filter clicks
      this.$tagFilter.querySelectorAll('.filter-chip--tag').forEach(function (chip) {
        chip.addEventListener('click', function () {
          var tag = this.dataset.tag;
          if (self.filters.tags.has(tag)) {
            self.filters.tags.delete(tag);
          } else {
            self.filters.tags.add(tag);
          }
          self.renderCards();
          self.renderFilters();
        });
      });
    }

    renderCards() {
      var self = this;
      // Filter
      var filtered = this.cards.slice();
      if (this.filters.folder) {
        filtered = filtered.filter(function (c) { return (c.folder || '默认') === self.filters.folder; });
      }
      if (this.filters.category) {
        filtered = filtered.filter(function (c) { return c.category === self.filters.category; });
      }
      if (this.filters.tags.size > 0) {
        filtered = filtered.filter(function (c) {
          return c.tags && c.tags.some(function (t) { return self.filters.tags.has(t); });
        });
      }
      if (this.searchQuery) {
        var q = this.searchQuery;
        filtered = filtered.filter(function (c) {
          return (c.title && c.title.toLowerCase().indexOf(q) !== -1) ||
                 (c.content && c.content.replace(/<[^>]*>/g, '').toLowerCase().indexOf(q) !== -1);
        });
      }

      // Sort
      filtered.sort(function (a, b) {
        var ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        var tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return self.sortOrder === 'oldest' ? ta - tb : tb - ta;
      });

      // Render
      this.$cardCount.textContent = '共 ' + filtered.length + ' 张';
      if (filtered.length === 0) {
        this.$cardGrid.innerHTML = '';
        this.$emptyState.style.display = 'block';
        return;
      }
      this.$emptyState.style.display = 'none';

      var html = '';
      filtered.forEach(function (card) {
        if (card.type === 'file') {
          html += self._buildFileCard(card);
        } else {
          html += self._buildNoteCard(card);
        }
      });
      this.$cardGrid.innerHTML = html;

      // Bind card click
      this.$cardGrid.querySelectorAll('.card').forEach(function (el) {
        el.addEventListener('click', function () {
          var id = parseInt(this.dataset.id);
          var card = self.cards.find(function (c) { return c.id === id; });
          if (!card) return;
          if (card.type === 'file') self._openFileViewer(card);
          else self._openDetail(card);
        });
      });
    }

    _buildNoteCard(card) {
      var contentText = (card.content || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      if (contentText.length > 120) contentText = contentText.substring(0, 120) + '...';
      var titleEsc = esc(card.title || '无标题');
      var catEsc = esc(card.category || '未分类');
      var tagsHtml = '';
      if (card.tags && card.tags.length) {
        tagsHtml = card.tags.map(function (t) { return '<span class="card-tag">' + esc(t) + '</span>'; }).join('');
      }
      var sourceBadge = card.source === 'daily' ? '<span class="card-badge card-badge--daily">每日精选</span>' : '';
      return '<div class="card card--note" data-id="' + card.id + '">' +
        '<div class="card__body"><div class="card__header"><h3 class="card__title">' + titleEsc + '</h3>' + sourceBadge + '</div>' +
        '<p class="card__preview">' + esc(contentText) + '</p><div class="card__tags">' + tagsHtml + '</div></div>' +
        '<div class="card__footer"><span class="card__category">📂 ' + catEsc + '</span><span class="card__date">' + fmtDate(card.createdAt) + '</span></div></div>';
    }

    _buildFileCard(card) {
      var isImage = (card.fileType || '').indexOf('image/') === 0;
      var isPDF = /\.pdf$/i.test(card.fileName || '');
      var isXMind = /\.xmind$/i.test(card.fileName || '');
      var icon = isImage ? '🖼️' : isPDF ? '📕' : isXMind ? '🧠' : '📄';
      var label = isImage ? '图片' : isPDF ? 'PDF' : isXMind ? 'XMind' : '文件';
      var sizeStr = card.fileSize ? (card.fileSize > 1024 * 1024 ? (card.fileSize / 1024 / 1024).toFixed(1) + ' MB' : (card.fileSize / 1024).toFixed(0) + ' KB') : '';

      var previewHTML = '';
      if (isImage) {
        previewHTML = '<div class="card__thumb"><img src="' + card.fileData + '" alt="" loading="lazy"></div>';
      } else {
        previewHTML = '<div class="card__icon-big">' + icon + '</div>';
      }

      return '<div class="card card--file" data-id="' + card.id + '">' +
        '<div class="card__body">' + previewHTML +
        '<div class="card__file-info">' +
        '<h3 class="card__title" title="' + esc(card.fileName || card.title) + '">' + esc((card.fileName || card.title).length > 30 ? (card.fileName || card.title).slice(0, 30) + '...' : (card.fileName || card.title)) + '</h3>' +
        '<span class="card__file-meta">' + label + (sizeStr ? ' · ' + sizeStr : '') + '</span>' +
        '</div></div>' +
        '<div class="card__footer"><span class="card__category">📁 ' + esc(card.folder || '默认') + '</span><span class="card__date">' + fmtDate(card.createdAt) + '</span></div></div>';
    }
  }

  /* ================================================================
   * Bootstrap
   * ================================================================ */
  var app = new ShellApp();
  app.init().catch(function (err) {
    console.error('Shell init error:', err);
  });

})();
