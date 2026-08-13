/* ================================================================
 * 五子棋 — 界面逻辑
 * 引擎：gomoku-engine.js（纯函数）；数据：JuYiGomoku IndexedDB
 * ================================================================ */
;(function () {
  'use strict';

  var DB_NAME = 'JuYiGomoku';
  var STORE = 'record';
  var FORMAT = 'JuYiGomoku/1';
  var LS_DIFF = 'jy_gomoku_difficulty';
  var LS_FIRST = 'jy_gomoku_player_first';
  var LS_THEME = 'jy_theme';

  var LOGICAL = 600;           // 画布逻辑尺寸
  var MARGIN = 30;             // 棋盘边距
  var CELL = (LOGICAL - MARGIN * 2) / 14;

  var DIFF_LABEL = { easy: '简单', medium: '中等', hard: '困难' };

  var db = new JuYiDB();
  var els = {};
  var E = window.GomokuEngine;

  var state = {
    board: null,
    history: [],          // [{x, y, p}]
    player: E.BLACK,
    ai: E.WHITE,
    playerFirst: true,
    difficulty: 'medium',
    turn: null,           // E.BLACK / E.WHITE
    over: false,
    thinking: false,
  };
  var hoverCell = null;

  /* ==================== 初始化 ==================== */
  async function init() {
    cacheDom();
    bindEvents();
    initTheme();
    if (typeof JuYiDB === 'undefined' || typeof E === 'undefined') {
      els.statsPanel.textContent = '❌ 依赖加载失败（db-core.js 或 gomoku-engine.js），请检查文件';
      return;
    }
    try {
      await db.open(DB_NAME, 1, {
        [STORE]: { keyPath: 'id', autoIncrement: true, indexes: [] },
      });
    } catch (e) {
      els.statsPanel.textContent = '❌ 数据库打开失败：' + e.message;
      return;
    }
    await updateStats();
    newGame();
  }

  function cacheDom() {
    els.canvas = document.getElementById('boardCanvas');
    els.difficultySelect = document.getElementById('difficultySelect');
    els.firstSelect = document.getElementById('firstSelect');
    els.difficultyTag = document.getElementById('difficultyTag');
    els.btnUndo = document.getElementById('btnUndo');
    els.btnNew = document.getElementById('btnNew');
    els.btnTheme = document.getElementById('btnTheme');
    els.turnText = document.getElementById('turnText');
    els.moveCount = document.getElementById('moveCount');
    els.statsPanel = document.getElementById('statsPanel');
    els.banner = document.getElementById('resultBanner');
    els.resultText = document.getElementById('resultText');
    els.btnAgain = document.getElementById('btnAgain');
    els.btnBannerClose = document.getElementById('btnBannerClose');
    els.btnExport = document.getElementById('btnExport');
    els.btnImport = document.getElementById('btnImport');
    els.importFileInput = document.getElementById('importFileInput');
  }

  function bindEvents() {
    els.canvas.addEventListener('click', onCanvasClick);
    els.canvas.addEventListener('mousemove', onCanvasMove);
    els.canvas.addEventListener('mouseleave', function () { hoverCell = null; render(); });

    els.difficultySelect.addEventListener('change', function () {
      state.difficulty = els.difficultySelect.value;
      localStorage.setItem(LS_DIFF, state.difficulty);
      els.difficultyTag.textContent = DIFF_LABEL[state.difficulty] || state.difficulty;
    });

    els.firstSelect.addEventListener('change', function () {
      localStorage.setItem(LS_FIRST, els.firstSelect.value);
      newGame(); // 先手是开局属性，改了直接重开
    });

    els.btnUndo.addEventListener('click', undo);
    els.btnNew.addEventListener('click', function () { newGame(); });
    els.btnTheme.addEventListener('click', toggleTheme);
    els.btnAgain.addEventListener('click', function () { hideBanner(); newGame(); });
    els.btnBannerClose.addEventListener('click', hideBanner);
    els.btnExport.addEventListener('click', exportData);
    els.btnImport.addEventListener('click', function () { els.importFileInput.click(); });
    els.importFileInput.addEventListener('change', function () {
      if (els.importFileInput.files && els.importFileInput.files[0]) {
        importData(els.importFileInput.files[0]);
        els.importFileInput.value = '';
      }
    });
    window.addEventListener('resize', render);
  }

  /* ==================== 主题 ==================== */
  function initTheme() {
    if (localStorage.getItem(LS_THEME) === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      els.btnTheme.textContent = '☀️';
    }
  }
  function toggleTheme() {
    var cur = document.documentElement.getAttribute('data-theme');
    var next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(LS_THEME, next);
    els.btnTheme.textContent = next === 'dark' ? '☀️' : '🌙';
    render();
  }

  /* ==================== 对局流程 ==================== */
  function newGame() {
    state.board = E.createBoard();
    state.history = [];
    state.over = false;
    state.thinking = false;
    state.playerFirst = els.firstSelect.value === 'player';
    state.player = state.playerFirst ? E.BLACK : E.WHITE;
    state.ai = state.playerFirst ? E.WHITE : E.BLACK;
    state.turn = state.playerFirst ? state.player : state.ai;
    hideBanner();
    render();
    updateStatus();
    if (!state.playerFirst) scheduleAI();
  }

  function onCanvasClick(e) {
    if (state.over || state.thinking || state.turn !== state.player) return;
    var cell = eventToCell(e);
    if (!cell) return;
    if (state.board[cell.y][cell.x] !== E.EMPTY) return;
    playerMove(cell.x, cell.y);
  }

  function onCanvasMove(e) {
    if (state.over || state.thinking || state.turn !== state.player) {
      if (hoverCell) { hoverCell = null; render(); }
      return;
    }
    var cell = eventToCell(e);
    if (cell && state.board[cell.y][cell.x] !== E.EMPTY) cell = null;
    if (!cell && !hoverCell) return;
    if ((cell && hoverCell && cell.x === hoverCell.x && cell.y === hoverCell.y) || (!cell && !hoverCell)) return;
    hoverCell = cell;
    render();
  }

  /** 屏幕坐标 → 棋盘格（不在落点范围内返回 null） */
  function eventToCell(e) {
    var rect = els.canvas.getBoundingClientRect();
    var scale = rect.width / LOGICAL;
    var lx = (e.clientX - rect.left) / scale;
    var ly = (e.clientY - rect.top) / scale;
    var x = Math.round((lx - MARGIN) / CELL);
    var y = Math.round((ly - MARGIN) / CELL);
    if (!E.inBounds(x, y)) return null;
    var cx = MARGIN + x * CELL, cy = MARGIN + y * CELL;
    if (Math.hypot(lx - cx, ly - cy) > CELL * 0.5) return null;
    return { x: x, y: y };
  }

  function playerMove(x, y) {
    place(x, y, state.player);
    if (E.checkWin(state.board, x, y, state.player)) { finish('win'); return; }
    if (E.isFull(state.board)) { finish('draw'); return; }
    state.turn = state.ai;
    updateStatus();
    scheduleAI();
  }

  function scheduleAI() {
    state.thinking = true;
    updateStatus();
    setTimeout(aiTurn, 420);
  }

  function aiTurn() {
    state.thinking = false;
    if (state.over) return;
    var m = E.aiMove(state.board, state.ai, state.difficulty);
    place(m.x, m.y, state.ai);
    if (E.checkWin(state.board, m.x, m.y, state.ai)) { finish('lose'); return; }
    if (E.isFull(state.board)) { finish('draw'); return; }
    state.turn = state.player;
    updateStatus();
  }

  function place(x, y, p) {
    state.board[y][x] = p;
    state.history.push({ x: x, y: y, p: p });
    render();
  }

  function finish(result) {
    state.over = true;
    state.thinking = false;
    hoverCell = null;
    render();
    updateStatus();
    recordGame(result);
    showBanner(result);
  }

  function undo() {
    if (state.over || state.thinking || !state.history.length) return;
    var last = state.history.pop();
    state.board[last.y][last.x] = E.EMPTY;
    if (state.history.length && state.history[state.history.length - 1].p === state.player) {
      var p2 = state.history.pop();
      state.board[p2.y][p2.x] = E.EMPTY;
    }
    state.turn = state.player;
    render();
    updateStatus();
    // AI 先手被悔回空盘：AI 重新开局
    if (!state.playerFirst && !state.history.length) {
      state.turn = state.ai;
      updateStatus();
      scheduleAI();
    }
  }

  /* ==================== 结算横幅 ==================== */
  var RESULT_TEXT = {
    win: '🎉 恭喜获胜！',
    lose: '🤖 AI 获胜，再来一局',
    draw: '🤝 平局',
  };
  function showBanner(result) {
    els.resultText.textContent = RESULT_TEXT[result];
    els.banner.style.display = 'flex';
  }
  function hideBanner() {
    els.banner.style.display = 'none';
  }

  /* ==================== 状态显示 ==================== */
  function playerName(p) {
    return p === E.BLACK ? '黑棋' : '白棋';
  }
  function updateStatus() {
    els.moveCount.textContent = '已下 ' + state.history.length + ' 手';
    if (state.over) {
      els.turnText.textContent = '对局结束';
      return;
    }
    if (state.thinking) { els.turnText.textContent = 'AI 思考中…'; return; }
    els.turnText.textContent = '轮到你（' + playerName(state.player) + '）';
  }

  /* ==================== 战绩 ==================== */
  function recordGame(result) {
    db.add(STORE, {
      difficulty: state.difficulty,
      result: result,
      playerFirst: state.playerFirst,
      moves: state.history.length,
      createdAt: Date.now(),
    }).then(updateStats).catch(function () { /* 记录失败不影响对局 */ });
  }

  async function updateStats() {
    var records = [];
    try { records = await db.getAll(STORE); } catch (e) { records = []; }
    els.statsPanel.textContent = '';
    if (!records.length) {
      els.statsPanel.textContent = '暂无战绩，先下一局吧';
      return;
    }
    var order = ['easy', 'medium', 'hard'];
    for (var i = 0; i < order.length; i++) {
      var diff = order[i];
      var w = 0, l = 0, d = 0;
      records.forEach(function (r) {
        if (r.difficulty !== diff) return;
        if (r.result === 'win') w++;
        else if (r.result === 'lose') l++;
        else d++;
      });
      if (!w && !l && !d) continue;
      var chip = document.createElement('div');
      chip.className = 'gmk__stats-chip';
      var label = document.createElement('span');
      label.textContent = DIFF_LABEL[diff] + '：';
      var win = document.createElement('span');
      win.className = 'gmk__win';
      win.textContent = w + '胜 ';
      var lose = document.createElement('span');
      lose.className = 'gmk__lose';
      lose.textContent = l + '负';
      var draw = document.createElement('span');
      draw.textContent = ' ' + d + '平';
      chip.appendChild(label);
      chip.appendChild(win);
      chip.appendChild(lose);
      chip.appendChild(draw);
      els.statsPanel.appendChild(chip);
    }
  }

  /* ==================== 导出 / 导入 ==================== */
  function exportData() {
    db.getAll(STORE).then(function (records) {
      var data = {
        _format: FORMAT,
        exportedAt: new Date().toISOString(),
        records: records,
      };
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'juyi-gomoku-backup.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });
  }

  function importData(file) {
    var reader = new FileReader();
    reader.onload = async function () {
      try {
        var data = JSON.parse(reader.result);
        if (data._format !== FORMAT) throw new Error('格式不符：' + (data._format || '未知'));
        if (!Array.isArray(data.records)) throw new Error('缺少战绩数据');
        await db.clear(STORE);
        for (var i = 0; i < data.records.length; i++) {
          await db.add(STORE, data.records[i]);
        }
        await updateStats();
        alert('✅ 导入成功：' + data.records.length + ' 条战绩');
      } catch (e) {
        alert('❌ 导入失败：' + e.message);
      }
    };
    reader.readAsText(file);
  }

  /* ==================== Canvas 渲染 ==================== */
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function render() {
    var canvas = els.canvas;
    if (!canvas) return;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = LOGICAL * dpr;
    canvas.height = LOGICAL * dpr;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 背景 + 网格
    ctx.fillStyle = cssVar('--gomoku-board');
    ctx.fillRect(0, 0, LOGICAL, LOGICAL);
    ctx.strokeStyle = cssVar('--gomoku-line');
    ctx.lineWidth = 1;
    for (var i = 0; i < E.SIZE; i++) {
      ctx.beginPath();
      ctx.moveTo(MARGIN, MARGIN + i * CELL);
      ctx.lineTo(MARGIN + 14 * CELL, MARGIN + i * CELL);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(MARGIN + i * CELL, MARGIN);
      ctx.lineTo(MARGIN + i * CELL, MARGIN + 14 * CELL);
      ctx.stroke();
    }
    // 星位
    ctx.fillStyle = cssVar('--gomoku-star');
    [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]].forEach(function (s) {
      ctx.beginPath();
      ctx.arc(MARGIN + s[0] * CELL, MARGIN + s[1] * CELL, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });

    if (!state.board) return;
    // 棋子
    for (var h = 0; h < state.history.length; h++) {
      drawStone(ctx, state.history[h].x, state.history[h].y, state.history[h].p);
    }
    // 最后一手标记
    if (state.history.length) {
      var last = state.history[state.history.length - 1];
      ctx.beginPath();
      ctx.arc(MARGIN + last.x * CELL, MARGIN + last.y * CELL, CELL * 0.16, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(231,76,60,0.9)';
      ctx.fill();
    }
    // 悬停预览
    if (hoverCell) {
      ctx.globalAlpha = 0.45;
      drawStone(ctx, hoverCell.x, hoverCell.y, state.player);
      ctx.globalAlpha = 1;
    }
  }

  function drawStone(ctx, x, y, p) {
    var cx = MARGIN + x * CELL, cy = MARGIN + y * CELL, r = CELL * 0.42;
    var g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
    if (p === E.BLACK) {
      g.addColorStop(0, '#5a5a5a');
      g.addColorStop(1, '#111111');
    } else {
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, '#c8c8c8');
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    if (p === E.WHITE) {
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  init();
})();
