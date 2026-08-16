/* ================================================================
 * 数据中心 — 跨模块只读聚合面板
 * ================================================================
 * 只读打开各模块的 IndexedDB 与 localStorage，做聚合统计与可视化。
 * 不写任何库、不创建任何存储键，对现有模块零侵入。
 */
;(function () {
  'use strict';

  const LS_THEME = 'jy_theme';
  const SCHED_PREFIX = 'jy_sched_';

  // 与根 index.html SYS_DB_NAMES 保持一致的数据库清单
  const DB_NAMES = [
    'JuYiDB',              // 错题本/错题图鉴
    'JuYiShell',           // 拾贝
    'JuYiFitness',         // 健身
    'JuYiQuestionBook',    // 做题本
    'JuYiBattleReport',    // 战报板
    'JuYiGomoku',          // 五子棋
  ];

  const PLATFORM_COLORS = {
    leetcode: '#3b82f6',
    nowcoder: '#10b981',
    codeforces: '#f97316',
  };
  const PLATFORM_LABELS = {
    leetcode: 'LeetCode',
    nowcoder: 'NowCoder',
    codeforces: 'Codeforces',
  };
  const DIFF_LABELS = { easy: '简单', medium: '中等', hard: '困难' };

  const data = { dbs: {}, checkins: [] };

  /* ============================ 工具 ============================ */

  function fmtDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function fmtDateTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return fmtDate(ts) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function esc(s) {
    if (s === null || s === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(s);
    return div.innerHTML;
  }

  /** 打开一个数据库并把所有 store 读进内存（只读） */
  function readDB(name) {
    return new Promise(function (resolve) {
      var req = indexedDB.open(name);
      req.onerror = function () { resolve(null); };
      req.onsuccess = function () {
        var db = req.result;
        var names = Array.from(db.objectStoreNames);
        var stores = {};
        var remaining = names.length;
        if (remaining === 0) { db.close(); resolve(stores); return; }
        names.forEach(function (sn) {
          try {
            var tx = db.transaction(sn, 'readonly');
            var getAll = tx.objectStore(sn).getAll();
            getAll.onsuccess = function () { stores[sn] = getAll.result || []; remaining--; if (remaining === 0) { db.close(); resolve(stores); } };
            getAll.onerror = function () { stores[sn] = []; remaining--; if (remaining === 0) { db.close(); resolve(stores); } };
          } catch (e) {
            stores[sn] = [];
            remaining--;
            if (remaining === 0) { db.close(); resolve(stores); }
          }
        });
      };
    });
  }

  /** 读取计划表打卡（localStorage 全量扫描） */
  function readCheckins() {
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && key.indexOf(SCHED_PREFIX) === 0) {
          try {
            var rec = JSON.parse(localStorage.getItem(key));
            if (rec && rec.date && rec.checks) out.push(rec);
          } catch (_) { /* 跳过损坏记录 */ }
        }
      }
    } catch (_) { /* localStorage 不可用 */ }
    return out;
  }

  /* ============================ 聚合 ============================ */

  /** 读取错题本科目颜色表（localStorage），失败回退哈希色 */
  function readSubjectColors() {
    var map = {};
    try {
      var raw = localStorage.getItem('jy_error_notebook_subjects');
      if (raw) {
        JSON.parse(raw).forEach(function (s) { if (s && s.name) map[s.name] = s.color; });
      }
    } catch (_) { /* 忽略 */ }
    return map;
  }
  function hashColor(name) {
    var h = 0;
    for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
    return 'hsl(' + h + ',60%,55%)';
  }

  function aggErrorNotebook(items) {
    var subjectMap = {}, tagFreq = {}, mastery = {};
    var totalHard = 0;
    items.forEach(function (it) {
      var s = it.subject || '未分类';
      if (!subjectMap[s]) subjectMap[s] = { count: 0, hardCount: 0 };
      subjectMap[s].count++;
      if (it.isHard) { subjectMap[s].hardCount++; totalHard++; }
      if (!mastery[s]) mastery[s] = { score: 0, n: 0 };
      if (it.redoCount > 0 && it.redoMastery) {
        var sc = it.redoMastery === 'mastered' ? 1 : (it.redoMastery === 'fuzzy' ? 0.6 : 0.2);
        mastery[s].score += sc;
        mastery[s].n++;
      }
      (it.tags || []).forEach(function (t) { tagFreq[t] = (tagFreq[t] || 0) + 1; });
    });
    return { subjectMap: subjectMap, tagFreq: tagFreq, mastery: mastery, totalHard: totalHard, total: items.length };
  }

  function aggQuestionBooks(books, answersRecords) {
    var answerMap = {};
    (answersRecords || []).forEach(function (r) { answerMap[r.bookId] = r; });
    return (books || []).map(function (b) {
      var rec = answerMap[b.id];
      var rate = null;
      if (rec && rec.answers) {
        if (b.type === 'choice') {
          if (rec.correctAnswers) {
            var keys = Object.keys(rec.correctAnswers);
            var correct = keys.filter(function (k) { return rec.answers[k] && rec.answers[k] === rec.correctAnswers[k]; }).length;
            if (keys.length > 0) rate = Math.round(correct / keys.length * 100);
          }
        } else {
          var values = Object.values(rec.answers).filter(function (v) { return v; });
          if (values.length > 0) {
            var ok = values.filter(function (v) { return v === '正确'; }).length;
            rate = Math.round(ok / values.length * 100);
          }
        }
      }
      return { name: b.name, rate: rate, type: b.type };
    });
  }

  function aggFitness(items) {
    var weights = items.filter(function (r) { return r.type === 'weight' && r.weight > 0; })
      .sort(function (a, b) { return a.date - b.date; });
    var exMap = {};
    items.filter(function (r) { return r.type === 'exercise'; }).forEach(function (r) {
      var name = r.exerciseType || '未命名';
      exMap[name] = (exMap[name] || 0) + (r.duration || 0);
    });
    return {
      weights: weights.map(function (r) { return { x: r.date, y: r.weight, datum: r }; }),
      exerciseBars: Object.keys(exMap).map(function (k) { return { label: k, value: Math.round(exMap[k]) }; }).sort(function (a, b) { return b.value - a.value; }),
    };
  }

  function aggRatings(ratings) {
    var out = [];
    Object.keys(PLATFORM_LABELS).forEach(function (key) {
      var list = ratings.filter(function (r) { return r.platform === key; }).sort(function (a, b) { return a.date - b.date; });
      if (list.length > 0) {
        out.push({
          key: key,
          color: PLATFORM_COLORS[key],
          data: list.map(function (r) { return { x: r.date, y: r.rating, datum: r }; }),
        });
      }
    });
    return out;
  }

  function aggGomoku(records) {
    var result = { win: 0, lose: 0, draw: 0, byDiff: {} };
    records.forEach(function (r) {
      result[r.result] = (result[r.result] || 0) + 1;
      var d = r.difficulty || 'unknown';
      if (!result.byDiff[d]) result.byDiff[d] = { win: 0, total: 0 };
      result.byDiff[d].total++;
      if (r.result === 'win') result.byDiff[d].win++;
    });
    return result;
  }

  function aggShell(cards) {
    var catMap = {};
    cards.forEach(function (c) {
      var cat = c.category || '未分类';
      catMap[cat] = (catMap[cat] || 0) + 1;
    });
    return catMap;
  }

  /* ============================ 渲染 ============================ */

  function renderOverview() {
    const err = aggErrorNotebook(data.dbs['JuYiDB'] && data.dbs['JuYiDB'].errorNotebook || []);
    const books = (data.dbs['JuYiQuestionBook'] && data.dbs['JuYiQuestionBook'].questionBooks) || [];
    const fitness = (data.dbs['JuYiFitness'] && data.dbs['JuYiFitness'].fitness) || [];
    const battle = (data.dbs['JuYiBattleReport'] && data.dbs['JuYiBattleReport'].ratings) || [];
    const gomoku = (data.dbs['JuYiGomoku'] && data.dbs['JuYiGomoku'].record) || [];
    const shell = (data.dbs['JuYiShell'] && data.dbs['JuYiShell'].cards) || [];

    var bookTotal = books.reduce(function (s, b) { return s + (b.questionCount || 0); }, 0);
    var checkinDays = data.checkins.filter(function (c) {
      return Object.values(c.checks || {}).some(Boolean);
    }).length;

    var cards = [
      { value: err.total, label: '错题总数（难题 ' + err.totalHard + '）' },
      { value: books.length, label: '做题本（共 ' + bookTotal + ' 题）' },
      { value: checkinDays, label: '打卡天数' },
      { value: fitness.length, label: '健身记录' },
      { value: battle.length, label: '比赛记录' },
      { value: gomoku.length, label: '五子棋对局' },
      { value: shell.length, label: '拾贝卡片' },
    ];
    document.getElementById('overview').innerHTML = cards.map(function (c) {
      return '<div class="db-overview-card"><div class="db-overview-card__value">' + c.value + '</div><div class="db-overview-card__label">' + esc(c.label) + '</div></div>';
    }).join('');
  }

  function renderErrorSection() {
    var sec = document.getElementById('sec-error');
    var items = (data.dbs['JuYiDB'] && data.dbs['JuYiDB'].errorNotebook) || [];
    if (!items.length) { sec.style.display = 'none'; return; }
    sec.style.display = '';
    var agg = aggErrorNotebook(items);

    // 科目分布
    var subjectColors = readSubjectColors();
    var entries = Object.keys(agg.subjectMap).map(function (name) {
      return { label: name, value: agg.subjectMap[name].count, color: subjectColors[name] || hashColor(name) };
    }).sort(function (a, b) { return b.value - a.value; });
    JyCharts.donut(document.getElementById('c-error-subjects'), {
      height: 200,
      items: entries,
      centerText: String(agg.total),
      centerSub: '道错题',
    });

    // 掌握度雷达（有重做数据的科目）
    var axes = [], values = [];
    Object.keys(agg.mastery).forEach(function (s) {
      if (agg.mastery[s].n > 0) {
        axes.push(s);
        values.push(agg.mastery[s].score / agg.mastery[s].n);
      }
    });
    var radarBox = document.getElementById('box-error-radar');
    if (axes.length >= 3) {
      radarBox.style.display = '';
      JyCharts.radar(document.getElementById('c-error-radar'), {
        height: 240,
        axes: axes,
        series: [{ values: values }],
      });
    } else {
      radarBox.style.display = 'none';
    }

    // 标签词云
    var tagBox = document.getElementById('box-error-tags');
    var tags = Object.keys(agg.tagFreq).map(function (t) { return { text: t, weight: agg.tagFreq[t] }; });
    if (tags.length > 0) {
      tagBox.style.display = '';
      JyCharts.wordCloud(document.getElementById('c-error-tags'), { height: 200, items: tags });
    } else {
      tagBox.style.display = 'none';
    }
  }

  function renderBooksSection() {
    var sec = document.getElementById('sec-books');
    var books = (data.dbs['JuYiQuestionBook'] && data.dbs['JuYiQuestionBook'].questionBooks) || [];
    var answers = (data.dbs['JuYiQuestionBook'] && data.dbs['JuYiQuestionBook'].questionAnswers) || [];
    if (!books.length) { sec.style.display = 'none'; return; }
    sec.style.display = '';
    var rows = aggQuestionBooks(books, answers).map(function (r) {
      return { label: r.name, value: r.rate === null ? 0 : r.rate, color: r.rate === null ? '#cbd5e1' : undefined, rate: r.rate };
    });
    JyCharts.bars(document.getElementById('c-books'), {
      height: 240,
      items: rows,
      valueFormat: function (v, item) { return item.rate === null ? '未核对' : v + '%'; },
    });
  }

  function renderFitnessSection() {
    var sec = document.getElementById('sec-fitness');
    var items = (data.dbs['JuYiFitness'] && data.dbs['JuYiFitness'].fitness) || [];
    if (!items.length) { sec.style.display = 'none'; return; }
    sec.style.display = '';
    var agg = aggFitness(items);

    var weightBox = document.getElementById('box-weight');
    if (agg.weights.length > 0) {
      weightBox.style.display = '';
      JyCharts.line(document.getElementById('c-weight'), {
        height: 300,
        series: [{ data: agg.weights }],
        xTickFormat: function (x) { return fmtDate(x).slice(5); },
        dotLabel: function (d) { return d.weight.toFixed(1); },
        emptyText: '暂无体重数据',
      });
    } else {
      weightBox.style.display = 'none';
    }

    var exBox = document.getElementById('box-exercise');
    if (agg.exerciseBars.length > 0) {
      exBox.style.display = '';
      JyCharts.bars(document.getElementById('c-exercise'), { height: 300, items: agg.exerciseBars, valueFormat: function (v) { return v + ' 分'; } });
    } else {
      exBox.style.display = 'none';
    }
  }

  function renderBattleSection() {
    var sec = document.getElementById('sec-battle');
    var ratings = (data.dbs['JuYiBattleReport'] && data.dbs['JuYiBattleReport'].ratings) || [];
    var series = aggRatings(ratings);
    if (!series.length) { sec.style.display = 'none'; return; }
    sec.style.display = '';
    JyCharts.line(document.getElementById('c-ratings'), {
      height: 260,
      series: series,
      xTickFormat: function (x) { return fmtDate(x).slice(5); },
      yTickFormat: function (v) { return String(Math.round(v)); },
      decorate: function (ctx, x, y, datum, sr) {
        ctx.fillStyle = sr.color;
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(datum.rating), x, y - 8);
      },
    });
  }

  function renderGomokuSection() {
    var sec = document.getElementById('sec-gomoku');
    var records = (data.dbs['JuYiGomoku'] && data.dbs['JuYiGomoku'].record) || [];
    if (!records.length) { sec.style.display = 'none'; return; }
    sec.style.display = '';
    var agg = aggGomoku(records);
    JyCharts.donut(document.getElementById('c-gomoku'), {
      height: 200,
      items: [
        { label: '胜', value: agg.win, color: '#10b981' },
        { label: '负', value: agg.lose, color: '#ef4444' },
        { label: '平', value: agg.draw, color: '#f59e0b' },
      ],
      centerText: String(records.length),
      centerSub: '局',
    });

    var html = '';
    Object.keys(DIFF_LABELS).forEach(function (d) {
      var st = agg.byDiff[d];
      if (!st || st.total === 0) return;
      var pct = Math.round(st.win / st.total * 100);
      html += '<div class="db-gomoku-row"><span class="db-gomoku-row__name">' + esc(DIFF_LABELS[d]) + '</span>' +
        '<div class="db-gomoku-row__bar"><div class="db-gomoku-row__fill" style="width:' + pct + '%"></div></div>' +
        '<span class="db-gomoku-row__text">' + st.win + '胜 / ' + st.total + '局（' + pct + '%）</span></div>';
    });
    document.getElementById('gomokuStats').innerHTML = html || '<span style="color:var(--jy-text-muted);font-size:var(--jy-font-size-sm)">暂无分档记录</span>';
  }

  function renderHeatSection() {
    var sec = document.getElementById('sec-heat');
    if (!data.checkins.length) { sec.style.display = 'none'; return; }
    sec.style.display = '';

    // 按天聚合完成率
    var dayMap = {};
    data.checkins.forEach(function (rec) {
      var checks = rec.checks || {};
      var keys = Object.keys(checks);
      if (!keys.length) return;
      var done = keys.filter(function (k) { return checks[k]; }).length;
      dayMap[rec.date] = done / keys.length;
    });

    var now = new Date();
    var months = [];
    for (var m = 0; m < 3; m++) {
      var d = new Date(now.getFullYear(), now.getMonth() - m, 1);
      months.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
    }
    var grid = document.getElementById('heatGrid');
    grid.innerHTML = months.map(function (ym, i) {
      return '<div><div class="db-heat-item__title">' + esc(ym.replace('-', ' 年 ') + ' 月') + '</div><canvas id="c-heat-' + i + '" height="150"></canvas></div>';
    }).join('');
    months.forEach(function (ym, i) {
      var values = {};
      Object.keys(dayMap).forEach(function (date) {
        if (date.slice(0, 7) === ym) values[date] = dayMap[date];
      });
      JyCharts.heatCalendar(document.getElementById('c-heat-' + i), { yearMonth: ym, values: values, height: 150 });
    });
  }

  function renderShellSection() {
    var sec = document.getElementById('sec-shell');
    var cards = (data.dbs['JuYiShell'] && data.dbs['JuYiShell'].cards) || [];
    if (!cards.length) { sec.style.display = 'none'; return; }
    sec.style.display = '';
    var catMap = aggShell(cards);
    var entries = Object.keys(catMap).map(function (name, i) {
      return { label: name, value: catMap[name], color: JyCharts.PALETTE[i % JyCharts.PALETTE.length] };
    }).sort(function (a, b) { return b.value - a.value; });
    JyCharts.donut(document.getElementById('c-shell'), {
      height: 200,
      items: entries,
      centerText: String(cards.length),
      centerSub: '张卡片',
    });
  }

  function renderTimeline() {
    var sec = document.getElementById('sec-timeline');
    var events = [];
    function push(list, icon, ts, text) { if (ts) list.push({ icon: icon, ts: ts, text: text }); }

    (data.dbs['JuYiDB'] && data.dbs['JuYiDB'].errorNotebook || []).forEach(function (it) {
      push(events, '📒', it.createdAt, '错题本：新增「' + (it.subject || '未分类') + '」错题' + (it.isHard ? '（难题）' : ''));
    });
    (data.dbs['JuYiFitness'] && data.dbs['JuYiFitness'].fitness || []).forEach(function (it) {
      push(events, '🏃', it.date || it.createdAt, '健身：' + (it.type === 'weight' ? '体重 ' + it.weight + 'kg' : '运动 ' + (it.exerciseType || '') + ' ' + (it.duration || 0) + ' 分钟'));
    });
    (data.dbs['JuYiShell'] && data.dbs['JuYiShell'].cards || []).forEach(function (it) {
      push(events, '🐚', it.createdAt, '拾贝：收藏「' + (it.title || '') + '」');
    });
    (data.dbs['JuYiBattleReport'] && data.dbs['JuYiBattleReport'].ratings || []).forEach(function (it) {
      push(events, '⚔️', it.date, '战报板：' + (PLATFORM_LABELS[it.platform] || it.platform) + ' Rating ' + it.rating);
    });
    (data.dbs['JuYiGomoku'] && data.dbs['JuYiGomoku'].record || []).forEach(function (it) {
      var res = it.result === 'win' ? '胜' : (it.result === 'lose' ? '负' : '平');
      push(events, '🎯', it.createdAt, '五子棋：' + (DIFF_LABELS[it.difficulty] || '') + '难度一局（' + res + '）');
    });

    events.sort(function (a, b) { return b.ts - a.ts; });
    events = events.slice(0, 12);
    if (!events.length) { sec.style.display = 'none'; return; }
    sec.style.display = '';
    document.getElementById('timeline').innerHTML = events.map(function (e) {
      return '<div class="db-timeline-item"><span class="db-timeline-item__icon">' + e.icon + '</span>' +
        '<span class="db-timeline-item__date">' + esc(fmtDateTime(e.ts)) + '</span>' +
        '<span class="db-timeline-item__text">' + esc(e.text) + '</span></div>';
    }).join('');
  }

  function renderAll() {
    renderOverview();
    renderErrorSection();
    renderBooksSection();
    renderFitnessSection();
    renderBattleSection();
    renderGomokuSection();
    renderHeatSection();
    renderShellSection();
    renderTimeline();

    var sections = ['sec-error', 'sec-books', 'sec-fitness', 'sec-battle', 'sec-gomoku', 'sec-heat', 'sec-shell', 'sec-timeline'];
    var anyVisible = sections.some(function (id) { return document.getElementById(id).style.display !== 'none'; });
    document.getElementById('emptyAll').style.display = anyVisible ? 'none' : '';
  }

  /* ============================ 主题 ============================ */

  function restoreTheme() {
    var saved = localStorage.getItem(LS_THEME);
    if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    updateThemeButton();
  }
  function updateThemeButton() {
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.getElementById('btnToggleTheme').textContent = isDark ? '☀️ 明亮模式' : '🌙 暗色模式';
  }
  function toggleTheme() {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem(LS_THEME, next); } catch (_) {}
    updateThemeButton();
    renderAll(); // 图表跟随主题重绘
  }

  /* ============================ 启动 ============================ */

  async function init() {
    if (typeof JyCharts === 'undefined') {
      alert('❌ shared/charts.js 未加载');
      return;
    }
    restoreTheme();
    document.getElementById('btnToggleTheme').addEventListener('click', toggleTheme);

    var results = await Promise.all(DB_NAMES.map(function (name) {
      return readDB(name).then(function (stores) { return { name: name, stores: stores }; }).catch(function () { return { name: name, stores: {} }; });
    }));
    results.forEach(function (r) { data.dbs[r.name] = r.stores || {}; });
    data.checkins = readCheckins();
    renderAll();
  }

  document.addEventListener('DOMContentLoaded', function () {
    init().catch(function (err) {
      console.error('数据中心初始化失败', err);
      alert('数据中心初始化失败：' + (err && err.message || err));
    });
  });
})();
