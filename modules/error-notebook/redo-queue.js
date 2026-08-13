/* ================================================================
 * redo-queue.js — 重做模式抽取算法（纯函数，独立可测）
 * 依赖：无。由 index.html 和 test.html 共同加载。
 * ================================================================ */
;(function (global) {
  'use strict';

  const G_NEVER = 0;   // 从未重做过
  const G_FAILED = 1;  // 上次未掌握
  const G_FUZZY = 2;   // 上次模糊
  const G_MASTERED = 3; // 上次掌握

  /** 题目所属优先级分组 */
  function groupOf(item) {
    if (!item.redoCount) return G_NEVER;
    if (item.redoMastery === 'failed') return G_FAILED;
    if (item.redoMastery === 'fuzzy') return G_FUZZY;
    if (item.redoMastery === 'mastered') return G_MASTERED;
    return G_NEVER; // 边缘：有重做次数但无结果 → 视为未重做
  }

  /** 组内排序：lastRedoAt 升序（最久未重做在前；从未重做为 0 天然最前） */
  function compare(a, b) {
    const ga = groupOf(a), gb = groupOf(b);
    if (ga !== gb) return ga - gb;
    return (a.lastRedoAt || 0) - (b.lastRedoAt || 0);
  }

  /**
   * 计算重做队列
   * @param {Array} items 题目列表（需含 redoCount/redoMastery/lastRedoAt，缺省视为未重做）
   * @param {Object} [opts] { count: 抽题数(默认10), weakOnly: 只抽弱题(排除掌握) }
   * @returns {Array} 按优先级排序的最多 count 条
   */
  function computeRedoQueue(items, opts) {
    const count = opts && typeof opts.count === 'number' ? opts.count : 10;
    if (!Array.isArray(items) || items.length === 0 || count <= 0) return [];
    const sorted = items.slice().sort(compare);
    const pool = (opts && opts.weakOnly)
      ? sorted.filter(i => groupOf(i) !== G_MASTERED)
      : sorted;
    return pool.slice(0, count);
  }

  global.computeRedoQueue = computeRedoQueue;
})(window);
