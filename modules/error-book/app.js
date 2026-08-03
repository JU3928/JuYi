;(function () {
  'use strict';

  /* ================================================================
   * Constants
   * ================================================================ */
  var DB_NAME = 'JuYiDB';
  var DB_VERSION = 2;
  var STORE = 'errorNotebook';
  var LS_SUBJECTS = 'jy_error_notebook_subjects';
  var BATCH_SIZE = 20;

  function fmtDate(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  var MOTTOS = [
    '知错能改，善莫大焉',
    '错误是最好的老师',
    '每一道错题都是进步的阶梯',
    '温故而知新，可以为师矣',
    '不积跬步，无以至千里',
  ];

  var TAG_COLORS = [
    '#c0392b','#e67e22','#d4a017','#8b5e3c','#a0522d',
    '#b8860b','#cd853f','#d2691e','#8b4513','#a0522d',
  ];

  /* ================================================================
   * State
   * ================================================================ */
  var db = new JuYiDB();
  var state = {
    allItems: [],
    subjects: [],
    stats: { subjectMap: {}, tagFreq: {}, totalHard: 0, totalQuestions: 0 },
    currentSubject: null,
    bookItems: [],
  };

  /* ================================================================
   * DOM cache
   * ================================================================ */
  var els = {};
  function _cacheDom() {
    els.shelfView = document.getElementById('shelf-view');
    els.bookView = document.getElementById('book-view');
    els.coverOverlay = document.getElementById('cover-overlay');
    els.coverImage = document.getElementById('coverImage');
    els.bookShelf = document.getElementById('bookShelf');
    els.shelfEmpty = document.getElementById('shelfEmpty');
    els.pieCanvas = document.getElementById('pieCanvas');
    els.pieCenter = document.getElementById('pieCenter');
    els.statCards = document.getElementById('statCards');
    els.tagCloud = document.getElementById('tagCloud');
    els.pageList = document.getElementById('pageList');
    els.bookViewTitle = document.getElementById('bookViewTitle');
    els.bookProgress = document.getElementById('bookProgress');
    els.btnBackShelf = document.getElementById('btnBackShelf');
  }

  /* ================================================================
   * Init
   * ================================================================ */
  async function _init() {
    _cacheDom();
    _bindEvents();
    await _loadData();
    _loadSubjects();
    _renderAll();
  }

  function _bindEvents() {
    els.btnBackShelf.addEventListener('click', _backToShelf);
  }

  /* ================================================================
   * Data
   * ================================================================ */
  async function _loadData() {
    await db.open(DB_NAME, DB_VERSION, {
      [STORE]: { keyPath: 'id', autoIncrement: true, indexes: [] },
      reviewProgress: { keyPath: 'subject', autoIncrement: false, indexes: [] },
    });
    state.allItems = await db.getAll(STORE) || [];
    console.log('error-book: 加载了 ' + state.allItems.length + ' 条错题记录');
    _calcStats();
  }

  function _loadSubjects() {
    try {
      var raw = localStorage.getItem(LS_SUBJECTS);
      if (raw) { state.subjects = JSON.parse(raw); if (!Array.isArray(state.subjects) || !state.subjects.length) throw new Error(); }
      else throw new Error();
    } catch (e) {
      state.subjects = [
        { name: '政治', color: '#dc2626' }, { name: '英语', color: '#2563eb' },
        { name: '数学', color: '#059669' }, { name: '数据结构', color: '#7c3aed' },
        { name: '计组', color: '#0891b2' }, { name: '操作系统', color: '#ea580c' },
        { name: '计网', color: '#10b981' },
      ];
    }
  }

  function _getSubjectColor(name) {
    var s = state.subjects.find(function (x) { return x.name === name; });
    return s ? s.color : '#888';
  }

  function _getSubjectName(name) {
    return name || '未分类';
  }

  /* ================================================================
   * Stats calculation
   * ================================================================ */
  function _calcStats() {
    var sm = {}, tf = {}, totalHard = 0;
    state.allItems.forEach(function (item) {
      var s = item.subject || '未分类';
      if (!sm[s]) sm[s] = { count: 0, hardCount: 0, color: _getSubjectColor(s) };
      sm[s].count++;
      if (item.isHard) { sm[s].hardCount++; totalHard++; }
      (item.tags || []).forEach(function (t) {
        tf[t] = (tf[t] || 0) + 1;
      });
    });
    state.stats = {
      subjectMap: sm,
      tagFreq: tf,
      totalHard: totalHard,
      totalQuestions: state.allItems.length,
    };
  }

  /* ================================================================
   * Render orchestration
   * ================================================================ */
  function _renderAll() {
    _renderShelf();
  }

  /* ================================================================
   * Shelf view
   * ================================================================ */
  function _renderShelf() {
    els.shelfView.style.display = '';
    els.bookView.style.display = 'none';
    var sm = state.stats.subjectMap;
    var names = Object.keys(sm);
    names.sort(function (a, b) { return sm[b].count - sm[a].count; });

    if (names.length === 0) {
      els.bookShelf.innerHTML = '';
      els.shelfEmpty.style.display = 'block';
      return;
    }
    els.shelfEmpty.style.display = 'none';

    var html = '';
    names.forEach(function (name) {
      var d = sm[name];
      html += '<div class="eb-spine-card" data-subject="' + esc(name) + '">' +
        '<div class="eb-spine-card__bar" style="background:' + d.color + '"></div>' +
        '<div class="eb-spine-card__body">' +
          '<div class="eb-spine-card__title">' + esc(_getSubjectName(name)) + '</div>' +
          '<div class="eb-spine-card__subtitle">共 ' + d.count + ' 题 · 难题 ' + d.hardCount + ' 道</div>' +
          '<div class="eb-spine-card__hint">点击翻阅 →</div>' +
        '</div></div>';
    });
    els.bookShelf.innerHTML = html;

    els.bookShelf.querySelectorAll('.eb-spine-card').forEach(function (card) {
      card.addEventListener('click', function () {
        _enterBook(this.dataset.subject);
      });
    });
  }

  /* ================================================================
   * P1: Canvas pie chart
   * ================================================================ */
  function _renderPieChart() {
    var canvas = els.pieCanvas;
    var sm = state.stats.subjectMap;
    var entries = Object.entries(sm);
    if (!entries.length) {
      var dprCtx = canvas.getContext('2d');
      var dprScale = window.devicePixelRatio || 1;
      var ccw = 320, cch = 320;
      canvas.width = ccw * dprScale; canvas.height = cch * dprScale;
      dprCtx.scale(dprScale, dprScale);
      dprCtx.clearRect(0, 0, ccw, cch);
      els.pieCenter.textContent = '0';
      return;
    }

    var dpr = window.devicePixelRatio || 1;
    var w = 320, h = 320;
    canvas.width = w * dpr; canvas.height = h * dpr;
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    var cx = w / 2, cy = h / 2, r = 110, innerR = 55;
    var total = state.allItems.length;
    var angle = -Math.PI / 2;

    entries.forEach(function (entry) {
      var name = entry[0], d = entry[1];
      var sliceAngle = (d.count / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, angle, angle + sliceAngle);
      ctx.closePath();
      ctx.fillStyle = d.color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label
      var midAngle = angle + sliceAngle / 2;
      var lx = cx + Math.cos(midAngle) * (r + 18);
      var ly = cy + Math.sin(midAngle) * (r + 18);
      ctx.fillStyle = '#2c2416';
      ctx.font = '11px ' + getComputedStyle(document.body).fontFamily;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var pct = Math.round((d.count / total) * 100);
      if (pct >= 5) ctx.fillText(pct + '%', lx, ly);

      angle += sliceAngle;
    });

    // Inner circle
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.fillStyle = '#faf8f5';
    ctx.fill();
    ctx.strokeStyle = '#e5ddd0';
    ctx.lineWidth = 2;
    ctx.stroke();

    els.pieCenter.textContent = total;
  }

  /* ================================================================
   * P1: Stat cards
   * ================================================================ */
  function _renderStatCards() {
    var sm = state.stats.subjectMap;
    els.statCards.innerHTML =
      '<div class="eb-stat-card"><div class="eb-stat-card__value">' + state.allItems.length + '</div><div class="eb-stat-card__label">总错题数</div></div>' +
      '<div class="eb-stat-card"><div class="eb-stat-card__value">' + state.stats.totalHard + '</div><div class="eb-stat-card__label">难题总数</div></div>' +
      '<div class="eb-stat-card"><div class="eb-stat-card__value">' + Object.keys(sm).length + '</div><div class="eb-stat-card__label">涉及科目数</div></div>';
  }

  /* ================================================================
   * P3: Tag cloud
   * ================================================================ */
  function _renderTagCloud() {
    var tf = state.stats.tagFreq;
    var entries = Object.entries(tf).sort(function (a, b) { return b[1] - a[1]; });
    if (!entries.length) { els.tagCloud.innerHTML = ''; return; }

    var html = '';
    entries.forEach(function (entry, i) {
      var tag = entry[0], count = entry[1];
      var size = Math.min(36, 14 + count * 2);
      var dim = Math.max(44, size * 2.5);
      var color = TAG_COLORS[i % TAG_COLORS.length];
      html += '<div class="eb-tag-bubble" data-tag="' + esc(tag) + '" style="width:' + dim + 'px;height:' + dim + 'px;font-size:' + size + 'px;background:' + color + '15;color:' + color + '" title="' + esc(tag) + ' ' + count + ' 题">' +
        '<div style="text-align:center;line-height:1.2">' + esc(tag) + '<br><small style="font-size:0.55em">' + count + '</small></div>' +
        '</div>';
    });
    els.tagCloud.innerHTML = html;

    els.tagCloud.querySelectorAll('.eb-tag-bubble').forEach(function (bubble) {
      bubble.addEventListener('click', function () {
        var tag = this.dataset.tag;
        _filterByTag(tag);
      });
    });
  }

  function _filterByTag(tag) {
    var filtered = state.allItems.filter(function (item) {
      return (item.tags || []).indexOf(tag) !== -1;
    });
    _showTagFilterModal(tag, filtered);
  }

  function _showTagFilterModal(tag, items) {
    // Remove old modal if exists
    var old = document.querySelector('.eb-tag-modal-overlay');
    if (old) old.remove();

    var overlay = document.createElement('div');
    overlay.className = 'eb-tag-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center';
    var modal = document.createElement('div');
    modal.style.cssText = 'background:var(--eb-surface);border-radius:var(--eb-radius);max-width:700px;width:90%;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.3)';

    var head = '<div style="padding:1rem 1.5rem;border-bottom:1px solid var(--eb-border);display:flex;align-items:center;justify-content:space-between">' +
      '<span style="font-weight:700;font-family:var(--eb-font-serif)">🏷️ ' + esc(tag) + '（' + items.length + ' 题）</span>' +
      '<button class="eb-btn eb-btn--ghost" onclick="this.closest(\'.eb-tag-modal-overlay\').remove()">✕</button></div>';

    var body = '<div style="flex:1;overflow-y:auto;padding:1rem 1.5rem">';
    if (items.length === 0) {
      body += '<div class="eb-empty-text">暂无匹配题目</div>';
    } else {
      items.forEach(function (item) {
        var preview = stripHtml(item.question);
        if (preview.length > 80) preview = preview.slice(0, 80) + '…';
        body += '<div style="background:var(--eb-bg);border-radius:8px;padding:0.75rem 1rem;margin-bottom:0.5rem;display:flex;align-items:center;gap:0.75rem">' +
          '<span style="width:8px;height:8px;border-radius:50%;background:' + _getSubjectColor(item.subject) + ';flex-shrink:0"></span>' +
          '<span style="flex:1;font-size:0.85rem">' + esc(preview) + '</span>' +
          '<span style="font-size:0.75rem;color:var(--eb-text-muted);white-space:nowrap">' + esc(item.subject) + '</span>' +
        '</div>';
      });
    }
    body += '</div>';

    modal.innerHTML = head + body;
    overlay.appendChild(modal);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  /* ================================================================
   * Enter book (cover + pages)
   * ================================================================ */
  function _enterBook(subjectName) {
    state.currentSubject = subjectName;
    state.bookItems = state.allItems.filter(function (item) {
      return item.subject === subjectName;
    }).sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
    _showCover(subjectName);
  }

  /* ================================================================
   * P2: Cover generation
   * ================================================================ */
  function _showCover(subjectName) {
    var sm = state.stats.subjectMap;
    var d = sm[subjectName] || { count: 0, hardCount: 0, color: '#888' };
    var canvas = document.createElement('canvas');
    var w = 1200, h = 800;
    canvas.width = w; canvas.height = h;
    var ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#faf6ef';
    ctx.fillRect(0, 0, w, h);

    // Noise texture
    var imageData = ctx.getImageData(0, 0, w, h);
    var data = imageData.data;
    for (var i = 0; i < data.length; i += 4) {
      var noise = (Math.random() - 0.5) * 18;
      data[i] = Math.min(255, Math.max(0, data[i] + noise));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
    }
    ctx.putImageData(imageData, 0, 0);

    // Decorative border
    ctx.strokeStyle = d.color;
    ctx.lineWidth = 6;
    ctx.strokeRect(40, 40, w - 80, h - 80);
    ctx.strokeStyle = '#c0a878';
    ctx.lineWidth = 1;
    ctx.strokeRect(50, 50, w - 100, h - 100);

    // Title
    ctx.fillStyle = '#2c2416';
    ctx.font = 'bold 72px Georgia, "Times New Roman", serif';
    ctx.textAlign = 'center';
    ctx.fillText('《' + _getSubjectName(subjectName) + '错题集》', w / 2, h / 2 - 20);

    // Subtitle
    ctx.fillStyle = '#6b5f4f';
    ctx.font = '28px Georgia, "Times New Roman", serif';
    ctx.fillText('共 ' + d.count + ' 道题 · ' + d.hardCount + ' 道难题', w / 2, h / 2 + 50);

    // Color bar
    ctx.fillStyle = d.color;
    ctx.fillRect(w / 2 - 200, h / 2 + 80, 400, 4);

    // Date
    var now = new Date();
    var dateStr = now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日';
    ctx.fillStyle = '#9b8e7a';
    ctx.font = '20px Georgia, "Times New Roman", serif';
    ctx.fillText(dateStr, w / 2, h - 120);

    // Motto
    var motto = MOTTOS[Math.floor(Math.random() * MOTTOS.length)];
    ctx.fillStyle = '#8b5e3c';
    ctx.font = 'italic 22px Georgia, "Times New Roman", serif';
    ctx.fillText('"' + motto + '"', w / 2, h - 80);

    // Show cover
    els.coverImage.src = canvas.toDataURL('image/png');
    els.coverOverlay.style.display = 'flex';
    els.coverOverlay.classList.remove('is-fading');

    // After 1.2s display, fade out (0.6s transition) then show pages
    setTimeout(function () {
      els.coverOverlay.classList.add('is-fading');
      setTimeout(function () {
        els.coverOverlay.style.display = 'none';
        els.coverOverlay.classList.remove('is-fading');
        _renderBookPages(subjectName);
      }, 650);
    }, 1200);
  }

  /* ================================================================
   * Book pages view
   * ================================================================ */
  function _renderBookPages(subjectName) {
    els.shelfView.style.display = 'none';
    els.bookView.style.display = '';
    els.pageList.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--eb-text-muted)">加载中...</div>';

    els.bookViewTitle.textContent = _getSubjectName(subjectName);
    els.bookProgress.textContent = state.bookItems.length + ' 题';

    var items = state.bookItems;
    if (!items || !items.length) {
      els.pageList.innerHTML = '<div class="eb-empty-text" style="padding:2rem;text-align:center">该科目暂无题目</div>';
      return;
    }

    els.pageList.innerHTML = '';
    _batchRender(items, 0);
  }

  function _batchRender(items, start) {
    var end = Math.min(start + BATCH_SIZE, items.length);
    for (var i = start; i < end; i++) {
      try {
        _appendQuestionCard(items[i], i, items.length);
      } catch (e) {
        console.error('渲染第' + (i+1) + '题出错:', e, 'item:', items[i]);
        var errDiv = document.createElement('div');
        errDiv.style.cssText = 'padding:1rem;color:var(--eb-danger);border:1px solid var(--eb-danger);border-radius:8px;margin:0.5rem 0;font-size:0.85rem;word-break:break-all';
        errDiv.textContent = '⚠️ 渲染第' + (i+1) + '题出错: ' + (e && (e.message || e.toString()));
        els.pageList.appendChild(errDiv);
      }
    }
    if (end < items.length) {
      requestAnimationFrame(function () { _batchRender(items, end); });
    } else {
      _bindScrollProgress(items);
    }
  }

  function _appendQuestionCard(item, index, total) {
    var color = _getSubjectColor(item.subject);
    var tagsHtml = (item.tags || []).map(function (t) {
      return '<span class="eb-tag">' + esc(t) + '</span>';
    }).join('');
    var hardBadge = item.isHard ? '<span class="eb-hard">⭐ 难题</span>' : '';
    var dateStr = fmtDate(item.createdAt);

    var div = document.createElement('div');
    div.className = 'eb-question-page';
    div.setAttribute('data-index', index);
    div.innerHTML =
      '<div class="eb-question-page__header">' +
        '<span class="eb-dot" style="background:' + color + '"></span>' +
        '<span>' + esc(item.subject) + '</span>' +
        (hardBadge || '') +
        '<span style="margin-left:auto">#' + (index + 1) + '</span>' +
      '</div>' +
      '<div class="eb-question-page__body">' + sanitizeHtml(item.question || '<span style="color:var(--eb-text-muted)">暂无题目</span>') + '</div>' +
      (tagsHtml ? '<div class="eb-question-page__tags">' + tagsHtml + '</div>' : '') +
      '<div class="eb-question-page__footer">' +
        '<span style="font-size:0.78rem;color:var(--eb-text-muted)">' + dateStr + '</span>' +
        '<button class="eb-btn eb-btn--accent jump-btn" data-id="' + item.id + '">📖 在错题本中查看解析</button>' +
      '</div>';

    if (index < total - 1) {
      var divider = document.createElement('div');
      divider.className = 'eb-question-page__divider';
      els.pageList.appendChild(div);
    }

    els.pageList.appendChild(div);

    // Bind jump button
    div.querySelector('.jump-btn').addEventListener('click', function (e) {
      e.stopPropagation();
      _jumpToNotebook(parseInt(this.dataset.id));
    });
  }

  function _bindScrollProgress(items) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var idx = parseInt(entry.target.getAttribute('data-index'));
          if (!isNaN(idx)) {
            els.bookProgress.textContent = '第 ' + (idx + 1) + ' / ' + items.length + ' 题';
          }
        }
      });
    }, { threshold: 0.5 });

    els.pageList.querySelectorAll('.eb-question-page').forEach(function (page) {
      observer.observe(page);
    });
  }

  /* ================================================================
   * Cross-module navigation
   * ================================================================ */
  function _jumpToNotebook(itemId) {
    try {
      var url = '../error-notebook/index.html?id=' + itemId;
      window.open(url, '_blank');
    } catch (e) {
      alert('⚠️ 无法打开错题本模块，请确保文件存在');
    }
  }

  function _backToShelf() {
    els.bookView.style.display = 'none';
    els.shelfView.style.display = '';
    els.pageList.innerHTML = '';
    state.currentSubject = null;
    state.bookItems = [];
  }

  /* ================================================================
   * Bootstrap
   * ================================================================ */
  _init().catch(function (err) {
    console.error('错题图鉴初始化失败:', err);
    var el = document.getElementById('bookShelf');
    if (el) el.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--eb-danger);font-size:1.1rem">⚠️ 初始化失败：' + (err && err.message || err) + '<br><small>请检查浏览器控制台（F12）</small></div>';
  });

})();
