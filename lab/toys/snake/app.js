/* ================================================================
 * 贪吃蛇 — 界面逻辑
 * 引擎：snake-engine.js（纯函数）；数据：JuYiSnake IndexedDB
 * ================================================================ */
;(function () {
  'use strict';

  var DB_NAME = 'JuYiSnake';
  var STORE = 'record';
  var FORMAT = 'JuYiSnake/1';
  var LS_SPEED = 'jy_snake_speed';
  var LS_THEME = 'jy_theme';

  var SPEEDS = {
    slow:   { label: '🐢 慢', ms: 240 },
    medium: { label: '🐇 中', ms: 150 },
    fast:   { label: '⚡ 快', ms: 90 },
  };

  var LOGICAL = 600; // 画布逻辑尺寸
  var E = window.SnakeEngine;
  var CELL = LOGICAL / E.GRID;

  var db = new JuYiDB();
  var els = {};

  var game = null;      // 引擎状态
  var paused = false;
  var timer = null;
  var speedKey = 'medium';
  var touchStart = null;

  /* ==================== 初始化 ==================== */
  async function init() {
    cacheDom();
    bindEvents();
    initTheme();
    if (typeof JuYiDB === 'undefined' || typeof E === 'undefined') {
      els.statsPanel.textContent = '❌ 依赖加载失败（db-core.js 或 snake-engine.js），请检查文件';
      return;
    }
    speedKey = localStorage.getItem(LS_SPEED) in SPEEDS ? localStorage.getItem(LS_SPEED) : 'medium';
    els.speedSelect.value = speedKey;
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
    els.speedSelect = document.getElementById('speedSelect');
    els.btnPause = document.getElementById('btnPause');
    els.btnRestart = document.getElementById('btnRestart');
    els.btnTheme = document.getElementById('btnTheme');
    els.score = document.getElementById('score');
    els.highScore = document.getElementById('highScore');
    els.steps = document.getElementById('steps');
    els.statsPanel = document.getElementById('statsPanel');
    els.pauseOverlay = document.getElementById('pauseOverlay');
    els.overOverlay = document.getElementById('overOverlay');
    els.overTitle = document.getElementById('overTitle');
    els.overDetail = document.getElementById('overDetail');
    els.btnResume = document.getElementById('btnResume');
    els.btnAgain = document.getElementById('btnAgain');
    els.btnOverClose = document.getElementById('btnOverClose');
    els.btnExport = document.getElementById('btnExport');
    els.btnImport = document.getElementById('btnImport');
    els.importFileInput = document.getElementById('importFileInput');
  }

  function bindEvents() {
    els.speedSelect.addEventListener('change', function () {
      speedKey = els.speedSelect.value;
      localStorage.setItem(LS_SPEED, speedKey);
      updateHigh();
      if (!paused && game && game.alive) schedule(); // 新速度下一格生效
    });

    els.btnPause.addEventListener('click', togglePause);
    els.btnResume.addEventListener('click', resume);
    els.btnRestart.addEventListener('click', function () { newGame(); });
    els.btnTheme.addEventListener('click', toggleTheme);
    els.btnAgain.addEventListener('click', function () { newGame(); });
    els.btnOverClose.addEventListener('click', function () {
      els.overOverlay.style.display = 'none';
    });
    els.btnExport.addEventListener('click', exportData);
    els.btnImport.addEventListener('click', function () { els.importFileInput.click(); });
    els.importFileInput.addEventListener('change', function () {
      if (els.importFileInput.files && els.importFileInput.files[0]) {
        importData(els.importFileInput.files[0]);
        els.importFileInput.value = '';
      }
    });

    // 键盘：方向键 / WASD / 空格暂停 / 回车重开
    window.addEventListener('keydown', function (e) {
      if (e.target && (e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT')) return;
      var key = e.key;
      var dir = null;
      if (key === 'ArrowUp' || key === 'w' || key === 'W') dir = 'up';
      else if (key === 'ArrowDown' || key === 's' || key === 'S') dir = 'down';
      else if (key === 'ArrowLeft' || key === 'a' || key === 'A') dir = 'left';
      else if (key === 'ArrowRight' || key === 'd' || key === 'D') dir = 'right';
      if (dir) {
        e.preventDefault();
        turn(dir);
        return;
      }
      if (key === ' ') {
        e.preventDefault();
        togglePause();
        return;
      }
      if (key === 'Enter' && game && !game.alive) {
        e.preventDefault();
        newGame();
      }
    });

    // 触屏滑动转向
    els.canvas.addEventListener('touchstart', function (e) {
      if (e.touches.length === 1) touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: true });
    els.canvas.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
    els.canvas.addEventListener('touchend', function (e) {
      if (!touchStart) return;
      var t = e.changedTouches[0];
      var dx = t.clientX - touchStart.x;
      var dy = t.clientY - touchStart.y;
      touchStart = null;
      var THRESHOLD = 24;
      if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return; // 误触
      if (Math.abs(dx) > Math.abs(dy)) turn(dx > 0 ? 'right' : 'left');
      else turn(dy > 0 ? 'down' : 'up');
    });

    // 虚拟方向键
    document.querySelectorAll('.snk__dpad-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var dir = btn.getAttribute('data-dir');
        if (dir === 'pause') togglePause();
        else turn(dir);
      });
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
    game = E.createState(20);
    paused = false;
    hideOverlays();
    els.btnPause.textContent = '⏸ 暂停';
    updateHigh();
    render();
    updateStatus();
    schedule();
  }

  function turn(dir) {
    if (!game || !game.alive) return;
    E.turn(game, dir);
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(tick, SPEEDS[speedKey].ms);
  }

  function tick() {
    if (paused || !game || !game.alive) return;
    E.step(game);
    render();
    updateStatus();
    if (!game.alive) gameOver();
    else schedule();
  }

  function pause() {
    if (!game || !game.alive) return;
    paused = true;
    if (timer) clearTimeout(timer);
    els.btnPause.textContent = '▶ 继续';
    els.pauseOverlay.style.display = 'flex';
  }

  function resume() {
    paused = false;
    els.btnPause.textContent = '⏸ 暂停';
    els.pauseOverlay.style.display = 'none';
    schedule();
  }

  function togglePause() {
    if (paused) resume();
    else pause();
  }

  function gameOver() {
    els.overTitle.textContent = game.won ? '🎉 全屏通关！' : '💀 游戏结束';
    els.overDetail.textContent = '得分 ' + game.score + ' · 长度 ' + game.snake.length;
    els.overOverlay.style.display = 'flex';
    recordGame();
  }

  function hideOverlays() {
    els.pauseOverlay.style.display = 'none';
    els.overOverlay.style.display = 'none';
  }

  /* ==================== 状态显示 ==================== */
  function updateStatus() {
    els.score.textContent = game ? game.score : 0;
    els.steps.textContent = game ? game.steps : 0;
  }

  /* ==================== 战绩 ==================== */
  function recordGame() {
    db.add(STORE, {
      speed: speedKey,
      score: game.score,
      length: game.snake.length,
      createdAt: Date.now(),
    }).then(function () {
      updateStats();
      updateHigh();
    }).catch(function () { /* 记录失败不影响对局 */ });
  }

  async function updateStats() {
    var records = [];
    try { records = await db.getAll(STORE); } catch (e) { records = []; }
    els.statsPanel.textContent = '';
    if (!records.length) {
      els.statsPanel.textContent = '暂无战绩，先吃一个 🍎 吧';
      return;
    }
    var order = ['slow', 'medium', 'fast'];
    for (var i = 0; i < order.length; i++) {
      var key = order[i];
      var best = 0, games = 0;
      records.forEach(function (r) {
        if (r.speed !== key) return;
        games++;
        if (r.score > best) best = r.score;
      });
      if (!games) continue;
      var chip = document.createElement('div');
      chip.className = 'snk__stats-chip';
      chip.textContent = SPEEDS[key].label + '：最高 ' + best + ' · ' + games + ' 局';
      els.statsPanel.appendChild(chip);
    }
  }

  async function updateHigh() {
    var best = 0;
    try {
      var records = await db.getAll(STORE);
      records.forEach(function (r) {
        if (r.speed === speedKey && r.score > best) best = r.score;
      });
    } catch (e) { /* 空库 */ }
    els.highScore.textContent = best;
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
      a.download = 'juyi-snake-backup.json';
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
        await updateHigh();
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
    ctx.fillStyle = cssVar('--snake-bg');
    ctx.fillRect(0, 0, LOGICAL, LOGICAL);
    ctx.strokeStyle = cssVar('--snake-grid');
    ctx.lineWidth = 1;
    for (var i = 1; i < E.GRID; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL, 0);
      ctx.lineTo(i * CELL, LOGICAL);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * CELL);
      ctx.lineTo(LOGICAL, i * CELL);
      ctx.stroke();
    }

    if (!game) return;

    // 食物（带核的苹果圆）
    if (game.food) {
      var fx = game.food.x * CELL + CELL / 2;
      var fy = game.food.y * CELL + CELL / 2;
      ctx.beginPath();
      ctx.arc(fx, fy, CELL * 0.36, 0, Math.PI * 2);
      ctx.fillStyle = cssVar('--snake-food');
      ctx.fill();
      ctx.beginPath();
      ctx.arc(fx - CELL * 0.08, fy - CELL * 0.08, CELL * 0.1, 0, Math.PI * 2);
      ctx.fillStyle = cssVar('--snake-food-core');
      ctx.fill();
    }

    // 蛇身（尾→头，头最后画在最上层）
    for (var s = game.snake.length - 1; s >= 1; s--) {
      drawSegment(ctx, game.snake[s].x, game.snake[s].y, cssVar('--snake-body'));
    }
    drawHead(ctx, game.snake[0].x, game.snake[0].y);
  }

  function drawSegment(ctx, gx, gy, color) {
    var cx = gx * CELL + CELL / 2, cy = gy * CELL + CELL / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, CELL * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function drawHead(ctx, gx, gy) {
    var cx = gx * CELL + CELL / 2, cy = gy * CELL + CELL / 2;
    drawSegment(ctx, gx, gy, cssVar('--snake-head'));
    // 眼睛（沿行进方向）
    var d = E.DIRS[game.dir];
    var px = -d.y, py = d.x; // 垂直方向
    var ex = cx + d.x * CELL * 0.18, ey = cy + d.y * CELL * 0.18;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ex + px * CELL * 0.12, ey + py * CELL * 0.12, CELL * 0.09, 0, Math.PI * 2);
    ctx.arc(ex - px * CELL * 0.12, ey - py * CELL * 0.12, CELL * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(ex + px * CELL * 0.12 + d.x * CELL * 0.04, ey + py * CELL * 0.12 + d.y * CELL * 0.04, CELL * 0.045, 0, Math.PI * 2);
    ctx.arc(ex - px * CELL * 0.12 + d.x * CELL * 0.04, ey - py * CELL * 0.12 + d.y * CELL * 0.04, CELL * 0.045, 0, Math.PI * 2);
    ctx.fill();
  }

  init();
})();