/* ================================================================
 * snake-engine.js — 贪吃蛇核心引擎（纯函数状态机，独立可测）
 * 依赖：无。由 index.html 和 test.html 共同加载。
 *
 * 规则：
 *   - 20×20 网格，蛇初始 3 节居中向右移动
 *   - 吃食物 +1 分并变长；撞墙/撞自己死亡；吃满全屏通关
 *   - 转向用单格队列：连续快速转向以最后一次为准，180° 掉头被忽略
 *   - 蛇尾即将让出的格子不算「撞自己」（经典规则）
 * ================================================================ */
;(function (global) {
  'use strict';

  var GRID = 20;
  var DIRS = {
    up:    { x: 0,  y: -1 },
    down:  { x: 0,  y: 1 },
    left:  { x: -1, y: 0 },
    right: { x: 1,  y: 0 },
  };

  function isOpposite(a, b) {
    return DIRS[a].x + DIRS[b].x === 0 && DIRS[a].y + DIRS[b].y === 0;
  }

  function inBounds(p, grid) {
    return p.x >= 0 && p.x < grid && p.y >= 0 && p.y < grid;
  }

  function move(p, dir) {
    return { x: p.x + DIRS[dir].x, y: p.y + DIRS[dir].y };
  }

  /**
   * 创建新对局状态
   * @param {number} [grid] 网格边长（默认 20）
   * @param {Function} [rng] 可选随机数生成器（返回 [0,1)），测试注入用
   */
  function createState(grid, rng) {
    grid = grid || GRID;
    var cy = Math.floor(grid / 2);
    var state = {
      grid: grid,
      snake: [{ x: cy, y: cy }, { x: cy - 1, y: cy }, { x: cy - 2, y: cy }],
      dir: 'right',
      pendingDir: null,
      score: 0,
      steps: 0,
      alive: true,
      won: false,
      food: null,
    };
    state.food = spawnFood(state, rng);
    return state;
  }

  /** 随机生成一个不在蛇身上的食物；无空位返回 null（通关） */
  function spawnFood(state, rng) {
    var occupied = new Set();
    for (var i = 0; i < state.snake.length; i++) {
      occupied.add(state.snake[i].y * state.grid + state.snake[i].x);
    }
    var total = state.grid * state.grid;
    if (occupied.size >= total) return null;

    if (rng) {
      for (var tries = 0; tries < total * 2; tries++) {
        var idx = Math.floor(rng() * total);
        if (!occupied.has(idx)) return { x: idx % state.grid, y: Math.floor(idx / state.grid) };
      }
      // rng 运气太差：顺序扫描第一个空位兜底
      for (var j = 0; j < total; j++) {
        if (!occupied.has(j)) return { x: j % state.grid, y: Math.floor(j / state.grid) };
      }
      return null;
    }

    var free = [];
    for (var k = 0; k < total; k++) if (!occupied.has(k)) free.push(k);
    var pick = free[Math.floor(Math.random() * free.length)];
    return { x: pick % state.grid, y: Math.floor(pick / state.grid) };
  }

  /** 转向：写入单格队列，掉头/无效方向在 step 时处理 */
  function turn(state, dir) {
    if (!state.alive) return state;
    if (!DIRS[dir]) return state;
    state.pendingDir = dir;
    return state;
  }

  /**
   * 前进一格
   * @param {Object} state
   * @param {Object} [opts] { rng } — 吃食后生成新食物的随机源
   * @returns {Object} 同一 state 引用（便于链式调用）
   */
  function step(state, opts) {
    opts = opts || {};
    if (!state.alive) return state;

    // 应用待转方向（禁止 180° 掉头）
    if (state.pendingDir && !isOpposite(state.pendingDir, state.dir)) {
      state.dir = state.pendingDir;
    }
    state.pendingDir = null;

    var nh = move(state.snake[0], state.dir);
    // 撞墙
    if (!inBounds(nh, state.grid)) {
      state.alive = false;
      return state;
    }

    var eating = !!state.food && nh.x === state.food.x && nh.y === state.food.y;
    if (!eating) {
      // 撞自己（尾节即将让出的格子除外）
      var limit = state.snake.length - 1;
      for (var i = 0; i < limit; i++) {
        if (state.snake[i].x === nh.x && state.snake[i].y === nh.y) {
          state.alive = false;
          return state;
        }
      }
      state.snake.pop();
    }
    state.snake.unshift(nh);
    state.steps++;

    if (eating) {
      state.score++;
      state.food = spawnFood(state, opts.rng);
      if (!state.food) { // 蛇占满全屏 = 通关
        state.alive = false;
        state.won = true;
      }
    }
    return state;
  }

  global.SnakeEngine = {
    GRID: GRID,
    DIRS: DIRS,
    isOpposite: isOpposite,
    inBounds: inBounds,
    move: move,
    createState: createState,
    spawnFood: spawnFood,
    turn: turn,
    step: step,
  };
})(window);
