/* ================================================================
 * gomoku-engine.js — 五子棋核心引擎（纯函数，独立可测）
 * 依赖：无。由 index.html 和 test.html 共同加载。
 *
 * 三档 AI：
 *   easy   简单 — 随机落子，小概率看见杀招 / 堵对手
 *   medium 中等 — 贪心启发：进攻分 + 防守分取最大
 *   hard   困难 — 立即杀/堵优先，否则 minimax + αβ 剪枝（深 4 层）
 * ================================================================ */
;(function (global) {
  'use strict';

  var SIZE = 15;
  var EMPTY = 0, BLACK = 1, WHITE = 2;
  var DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
  var WIN_SCORE = 10000000;

  /* ==================== 棋盘基础 ==================== */

  function createBoard() {
    var b = new Array(SIZE);
    for (var y = 0; y < SIZE; y++) b[y] = new Array(SIZE).fill(EMPTY);
    return b;
  }

  function inBounds(x, y) {
    return x >= 0 && x < SIZE && y >= 0 && y < SIZE;
  }

  /** 在 (x,y) 落子后检测 player 是否五连（含长连，>=5 即胜） */
  function checkWin(board, x, y, player) {
    for (var d = 0; d < DIRS.length; d++) {
      var dx = DIRS[d][0], dy = DIRS[d][1];
      var n = 1;
      for (var s = 1; s < 5; s++) {
        var nx = x + dx * s, ny = y + dy * s;
        if (!inBounds(nx, ny) || board[ny][nx] !== player) break;
        n++;
      }
      for (var s2 = 1; s2 < 5; s2++) {
        var nx2 = x - dx * s2, ny2 = y - dy * s2;
        if (!inBounds(nx2, ny2) || board[ny2][nx2] !== player) break;
        n++;
      }
      if (n >= 5) return true;
    }
    return false;
  }

  function isFull(board) {
    for (var y = 0; y < SIZE; y++)
      for (var x = 0; x < SIZE; x++)
        if (board[y][x] === EMPTY) return false;
    return true;
  }

  /** 候选落点：已有棋子周围 2 格内的空点；空盘返回天元 */
  function candidates(board) {
    var set = new Set();
    for (var y = 0; y < SIZE; y++) {
      for (var x = 0; x < SIZE; x++) {
        if (board[y][x] === EMPTY) continue;
        for (var dy = -2; dy <= 2; dy++) {
          for (var dx = -2; dx <= 2; dx++) {
            var nx = x + dx, ny = y + dy;
            if (inBounds(nx, ny) && board[ny][nx] === EMPTY) set.add(ny * SIZE + nx);
          }
        }
      }
    }
    if (!set.size) set.add(7 * SIZE + 7);
    var out = [];
    set.forEach(function (k) { out.push({ x: k % SIZE, y: Math.floor(k / SIZE) }); });
    return out;
  }

  /* ==================== 启发评估 ==================== */

  /** (连子数, 开放端数) → 分值 */
  function lineScore(count, open) {
    if (count >= 5) return 1000000;
    if (count === 4) return open >= 2 ? 100000 : 10000;
    if (count === 3) return open >= 2 ? 8000 : 800;
    if (count === 2) return open >= 2 ? 500 : 60;
    if (count === 1) return open >= 2 ? 20 : 5;
    return 0;
  }

  /** 假设 player 落在 (x,y)（未落子），该点的进攻启发值 */
  function attackScore(board, x, y, player) {
    var total = 0;
    for (var d = 0; d < DIRS.length; d++) {
      var dx = DIRS[d][0], dy = DIRS[d][1];
      var count = 1, open = 0;
      for (var s = 1; s < 5; s++) {
        var nx = x + dx * s, ny = y + dy * s;
        if (inBounds(nx, ny) && board[ny][nx] === player) { count++; continue; }
        if (inBounds(nx, ny) && board[ny][nx] === EMPTY) open++;
        break;
      }
      for (var s2 = 1; s2 < 5; s2++) {
        var nx2 = x - dx * s2, ny2 = y - dy * s2;
        if (inBounds(nx2, ny2) && board[ny2][nx2] === player) { count++; continue; }
        if (inBounds(nx2, ny2) && board[ny2][nx2] === EMPTY) open++;
        break;
      }
      total += lineScore(count, open);
    }
    return total;
  }

  /** 模拟 player 落 (x,y) 是否立即获胜（不修改原棋盘） */
  function wouldWin(board, x, y, player) {
    board[y][x] = player;
    var w = checkWin(board, x, y, player);
    board[y][x] = EMPTY;
    return w;
  }

  /** 全盘静态评估：me 视角（Σ己方进攻值 − Σ对方进攻值） */
  function evaluateBoard(board, me, opp) {
    var s = 0;
    for (var y = 0; y < SIZE; y++) {
      for (var x = 0; x < SIZE; x++) {
        var v = board[y][x];
        if (v === me) s += attackScore(board, x, y, me);
        else if (v === opp) s -= attackScore(board, x, y, opp);
      }
    }
    return s;
  }

  /** 候选点按「进攻+防守」降序截断，用于缩小搜索空间 */
  function orderedCandidates(board, me, opp, cap) {
    var list = candidates(board).map(function (c) {
      return { c: c, s: attackScore(board, c.x, c.y, me) + attackScore(board, c.x, c.y, opp) };
    });
    list.sort(function (a, b) { return b.s - a.s; });
    return list.slice(0, cap).map(function (o) { return o.c; });
  }

  /** 找到立即获胜的落点（无则 null） */
  function findWinMove(board, player) {
    var cs = candidates(board);
    for (var i = 0; i < cs.length; i++) {
      if (wouldWin(board, cs[i].x, cs[i].y, player)) return cs[i];
    }
    return null;
  }

  /* ==================== AI 决策 ==================== */

  /** 负极大值 + αβ 剪枝；返回 cur 视角的分值 */
  function negamax(board, depth, alpha, beta, cur, opp, cap) {
    if (depth === 0) return evaluateBoard(board, cur, opp);
    var cs = orderedCandidates(board, cur, opp, cap);
    if (!cs.length) return 0; // 平局
    var best = -Infinity;
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i];
      board[c.y][c.x] = cur;
      var score;
      if (checkWin(board, c.x, c.y, cur)) score = WIN_SCORE + depth; // 越早赢越好
      else score = -negamax(board, depth - 1, -beta, -alpha, opp, cur, cap);
      board[c.y][c.x] = EMPTY;
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break; // 剪枝
    }
    return best;
  }

  /** 困难档：杀/堵优先，否则 4 层 minimax 选点 */
  function hardMove(board, player) {
    var opp = player === BLACK ? WHITE : BLACK;
    var win = findWinMove(board, player);
    if (win) return win;
    var block = findWinMove(board, opp);
    if (block) return block;

    var cs = orderedCandidates(board, player, opp, 14);
    var best = null, bestScore = -Infinity;
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i];
      board[c.y][c.x] = player;
      var score = checkWin(board, c.x, c.y, player)
        ? WIN_SCORE
        : -negamax(board, 3, -Infinity, Infinity, opp, player, 12);
      board[c.y][c.x] = EMPTY;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    return best;
  }

  /** 中等档：杀/堵优先，否则贪心 max(进攻+防守) */
  function mediumMove(board, player) {
    var opp = player === BLACK ? WHITE : BLACK;
    var win = findWinMove(board, player);
    if (win) return win;
    var block = findWinMove(board, opp);
    if (block) return block;

    var cs = candidates(board);
    var best = null, bestScore = -1;
    for (var i = 0; i < cs.length; i++) {
      var s = attackScore(board, cs[i].x, cs[i].y, player)
            + attackScore(board, cs[i].x, cs[i].y, opp);
      if (s > bestScore) { bestScore = s; best = cs[i]; }
    }
    return best;
  }

  /** 简单档：随机落子；小概率看见杀招 / 堵对手，故意放水 */
  function easyMove(board, player) {
    var opp = player === BLACK ? WHITE : BLACK;
    var cs = candidates(board);
    var win = findWinMove(board, player);
    if (win && Math.random() < 0.5) return win;
    var block = findWinMove(board, opp);
    if (block && Math.random() < 0.4) return block;
    return cs[Math.floor(Math.random() * cs.length)];
  }

  /**
   * AI 落子入口（不修改传入棋盘）
   * @param {number[][]} board
   * @param {number} player BLACK / WHITE
   * @param {string} level 'easy' | 'medium' | 'hard'（未知值按 medium 处理）
   * @returns {{x:number, y:number}} 落点
   */
  function aiMove(board, player, level) {
    if (level === 'easy') return easyMove(board, player);
    if (level === 'hard') return hardMove(board, player);
    return mediumMove(board, player);
  }

  global.GomokuEngine = {
    SIZE: SIZE,
    EMPTY: EMPTY,
    BLACK: BLACK,
    WHITE: WHITE,
    createBoard: createBoard,
    inBounds: inBounds,
    checkWin: checkWin,
    isFull: isFull,
    candidates: candidates,
    attackScore: attackScore,
    wouldWin: wouldWin,
    findWinMove: findWinMove,
    aiMove: aiMove,
  };
})(window);
