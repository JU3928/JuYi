/**
 * JuYi — 共享图表库
 * ===================
 * 零依赖 Canvas 图表原语，供所有模块复用。
 *
 * 特性：
 * - 自动处理 devicePixelRatio 缩放（setTransform，无累积误差）
 * - 颜色默认读取 :root 的 --jy-* 设计令牌（跟随 data-theme 暗色模式与皮肤覆盖）
 * - 每张图返回命中点几何，供调用方做 hover/click 交互
 * - 空数据 / 单点数据分支内置
 *
 * 用法示例：
 *   JyCharts.line(canvas, { series: [{ data: [{x: ts, y: 70.5}] }] });
 *   JyCharts.donut(canvas, { items: [{label: '数学', value: 12}] });
 *
 * @module charts
 * @version 1.0.0
 */
;(function (global) {
  'use strict';

  /* ============================ 主题 ============================ */

  /** 读取 :root 上的 --jy-* 设计令牌，取不到用回退值 */
  function cssVar(name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name);
      return (v && v.trim()) ? v.trim() : fallback;
    } catch (_) {
      return fallback;
    }
  }

  /** 主题色盘：每次绘制时读取，跟随暗色模式与第三方皮肤 */
  function theme() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
      bg:    cssVar('--jy-surface', dark ? '#1a2332' : '#ffffff'),
      grid:  cssVar('--jy-border', dark ? '#334155' : '#e2e5ea'),
      text:  cssVar('--jy-text-secondary', dark ? '#94a3b8' : '#5f6b7a'),
      muted: cssVar('--jy-text-muted', dark ? '#64748b' : '#949dab'),
      line:  cssVar('--jy-primary', dark ? '#818cf8' : '#4f5de4'),
      area:  dark ? 'rgba(129,140,248,0.12)' : 'rgba(79,93,228,0.08)',
      success: cssVar('--jy-success', '#10b981'),
      danger:  cssVar('--jy-danger', '#ef4444'),
    };
  }

  /** 多系列默认色盘（主题无关的固定色相） */
  var PALETTE = ['#4f5de4', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];

  /* ============================ 画布准备 ============================ */

  /**
   * 按容器宽度与给定高度准备画布（DPR 缩放）。
   * @param {HTMLCanvasElement} canvas
   * @param {number} height - CSS 像素高度
   * @returns {{ctx: CanvasRenderingContext2D, W: number, H: number}}
   */
  function setup(canvas, height) {
    var dpr = window.devicePixelRatio || 1;
    var rect = (canvas.parentElement || canvas).getBoundingClientRect();
    var W = Math.max(rect.width || 300, 100);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = height + 'px';
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, W: W, H: height };
  }

  function drawEmpty(ctx, W, H, text, s) {
    ctx.fillStyle = s.text;
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, W / 2, H / 2);
    ctx.textBaseline = 'alphabetic';
  }

  /* ============================ 折线图 ============================ */

  /**
   * 多系列折线图（面积、数据点、装饰回调），返回命中点集合。
   *
   * @param {HTMLCanvasElement} canvas
   * @param {Object} opts
   * @param {number} [opts.height=300]
   * @param {{top:number,right:number,bottom:number,left:number}} [opts.pad]
   * @param {Array} opts.series - [{ data:[{x:number, y:number, datum?}], color?, dotColor?, area?, visible? }]
   * @param {string} [opts.xMode='value'] - 'value' 按 x 实际值映射；'index' 按数据序号等距
   * @param {number} [opts.xDomainSpan=86400000] - 仅一个 x 值时的跨度回退
   * @param {number} [opts.yTicks=5]
   * @param {number} [opts.yMargin=0.2] - y 值域上下留白比例
   * @param {Function} [opts.yTickFormat] - (v)=>string
   * @param {Function} [opts.xTickFormat] - (x)=>string
   * @param {number|'auto'} [opts.xTickEvery='auto'] - 每几个点画一个 x 标签
   * @param {string} [opts.emptyText='暂无数据']
   * @param {boolean} [opts.showArea=true]
   * @param {boolean} [opts.showDots=true]
   * @param {number} [opts.dotR=4] - 常规点半径
   * @param {string} [opts.dotInner] - 点内芯颜色（默认主题背景色）
   * @param {number} [opts.lineWidth=2.5]
   * @param {Function} [opts.dotLabel] - (datum)=>string|null，点在点上方文字
   * @param {Function} [opts.singleLabel] - (datum)=>string|null，单点分支的大字标签
   * @param {Function} [opts.singleDateLabel] - (datum)=>string|null，单点分支底部日期
   * @param {Function} [opts.decorate] - (ctx, x, y, datum, series)=>void，每点额外装饰（如截图外环）
   * @returns {{points: Array<{x:number,y:number,datum:*,series:Object}>, pad: Object, W: number, H: number}}
   */
  function line(canvas, opts) {
    opts = opts || {};
    var height = opts.height || 300;
    var pad = opts.pad || { top: 20, right: 20, bottom: 35, left: 50 };
    var prepared = setup(canvas, height);
    var ctx = prepared.ctx, W = prepared.W, H = prepared.H;
    var pw = W - pad.left - pad.right, ph = H - pad.top - pad.bottom;
    var s = theme();
    if (opts.colors) {
      s = {
        bg: opts.colors.bg !== undefined ? opts.colors.bg : s.bg,
        grid: opts.colors.grid !== undefined ? opts.colors.grid : s.grid,
        text: opts.colors.text !== undefined ? opts.colors.text : s.text,
        muted: s.muted,
        line: s.line,
        area: s.area,
      };
    }

    ctx.fillStyle = s.bg;
    ctx.fillRect(0, 0, W, H);

    // 收集可见系列
    var series = (opts.series || []).filter(function (sr) {
      return sr && (sr.visible !== false) && Array.isArray(sr.data) && sr.data.length > 0;
    });
    var points = [];

    var emptyText = opts.emptyText !== undefined ? opts.emptyText : '暂无数据';
    if (series.length === 0) {
      if (emptyText) drawEmpty(ctx, W, H, emptyText, s);
      return { points: points, pad: pad, W: W, H: H };
    }

    var allX = [], allY = [];
    series.forEach(function (sr, si) {
      if (!sr.color) sr.color = PALETTE[si % PALETTE.length];
      sr.data.forEach(function (d) {
        allX.push(d.x);
        allY.push(d.y);
      });
    });

    var minX = Math.min.apply(null, allX), maxX = Math.max.apply(null, allX);
    var xSpan = (maxX - minX) || (opts.xDomainSpan || 86400000);
    var minY = Math.min.apply(null, allY), maxY = Math.max.apply(null, allY);
    var ySpan = (maxY - minY) || (opts.ySpanFallback !== undefined ? opts.ySpanFallback : 1);
    var margin = (opts.yMargin !== undefined ? opts.yMargin : 0.2) * ySpan;
    if (opts.minMargin !== undefined && margin < opts.minMargin) margin = opts.minMargin;
    var yMin = Math.floor(minY - margin), yMax = Math.ceil(maxY + margin);

    var xMode = opts.xMode === 'index' ? 'index' : 'value';
    function toX(sr, i, x) {
      if (xMode === 'index') return pad.left + pw * (i / (sr.data.length - 1));
      return pad.left + pw * ((x - minX) / xSpan);
    }
    function toY(y) { return pad.top + ph * (1 - (y - yMin) / (yMax - yMin)); }

    // 网格 + Y 轴
    var yTicks = opts.yTicks || 5;
    var yTickFormat = opts.yTickFormat || function (v) { return String(Math.round(v)); };
    ctx.strokeStyle = s.grid;
    ctx.lineWidth = 0.5;
    ctx.font = opts.yFont || '11px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (var t = 0; t <= yTicks; t++) {
      var gy = pad.top + (ph / yTicks) * t;
      ctx.beginPath(); ctx.moveTo(pad.left, gy); ctx.lineTo(W - pad.right, gy); ctx.stroke();
      ctx.fillStyle = s.text;
      ctx.fillText(yTickFormat(yMax - (yMax - yMin) / yTicks * t), pad.left - 6, gy);
    }
    ctx.textBaseline = 'alphabetic';

    // 全部可见点（用于 x 标签与命中）
    var allPoints = series.map(function (sr) {
      return sr.data.map(function (d, i) { return { x: d.x, y: d.y, datum: d.datum !== undefined ? d.datum : d, series: sr, i: i }; });
    });

    var totalCount = allX.length;
    var singleMode = totalCount === 1;

    if (singleMode) {
      // 单点分支：居中大点 + 可选标签 + 可选日期
      var sp = allPoints[0][0];
      var cx = pad.left + pw / 2;
      var cy = pad.top + ph / 2;
      var sr = sp.series;
      var r = opts.singleDotR || 6;
      ctx.fillStyle = sr.color; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = opts.dotInner !== undefined ? opts.dotInner : s.bg;
      ctx.beginPath(); ctx.arc(cx, cy, r / 2, 0, Math.PI * 2); ctx.fill();
      if (opts.decorate) opts.decorate(ctx, cx, cy, sp.datum, sr);
      points.push({ x: cx, y: cy, datum: sp.datum, series: sr });
      if (opts.singleLabel) {
        var sl = opts.singleLabel(sp.datum);
        if (sl) {
          ctx.fillStyle = s.text; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText(sl, cx, cy - r - 8);
        }
      }
      if (opts.singleDateLabel) {
        var sd = opts.singleDateLabel(sp.datum);
        if (sd) {
          ctx.fillStyle = s.text; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText(sd, cx, H - pad.bottom + 18);
        }
      }
      return { points: points, pad: pad, W: W, H: H };
    }

    // 各系列：面积 / 折线 / 点
    series.forEach(function (sr) {
      var d = sr.data;
      var area = sr.area !== undefined ? sr.area : (opts.showArea === false ? null : s.area);

      if (area) {
        ctx.fillStyle = area;
        ctx.beginPath();
        d.forEach(function (pt, i) {
          var x = toX(sr, i, pt.x), y = toY(pt.y);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.lineTo(toX(sr, d.length - 1, d[d.length - 1].x), pad.top + ph);
        ctx.lineTo(toX(sr, 0, d[0].x), pad.top + ph);
        ctx.closePath();
        ctx.fill();
      }

      ctx.strokeStyle = sr.color;
      ctx.lineWidth = opts.lineWidth !== undefined ? opts.lineWidth : 2.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      d.forEach(function (pt, i) {
        var x = toX(sr, i, pt.x), y = toY(pt.y);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();

      if (opts.showDots === false) return;
      var dotR = opts.dotR || 4;
      var dotInner = opts.dotInner !== undefined ? opts.dotInner : s.bg;
      d.forEach(function (pt, i) {
        var x = toX(sr, i, pt.x), y = toY(pt.y);
        ctx.fillStyle = sr.dotColor || sr.color;
        ctx.beginPath(); ctx.arc(x, y, dotR, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = dotInner;
        ctx.beginPath(); ctx.arc(x, y, dotR / 2, 0, Math.PI * 2); ctx.fill();
        if (opts.decorate) opts.decorate(ctx, x, y, pt.datum !== undefined ? pt.datum : pt, sr);
        points.push({ x: x, y: y, datum: pt.datum !== undefined ? pt.datum : pt, series: sr });
        if (opts.dotLabel) {
          var dl = opts.dotLabel(pt.datum !== undefined ? pt.datum : pt);
          if (dl) {
            ctx.fillStyle = s.text; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
            ctx.fillText(dl, x, y - dotR - 4);
          }
        }
      });
    });

    // X 轴标签
    var xTickFormat = opts.xTickFormat || function (x) { return String(x); };
    var every = opts.xTickEvery !== undefined && opts.xTickEvery !== 'auto'
      ? opts.xTickEvery
      : Math.max(1, Math.floor(totalCount / 6));
    var sorted = allPoints.reduce(function (acc, arr) { return acc.concat(arr); }, [])
      .sort(function (a, b) { return a.x - b.x; });
    ctx.fillStyle = s.text;
    ctx.font = opts.xFont || '10px sans-serif';
    ctx.textAlign = 'center';
    var xLabelY = H - (opts.xLabelOffset !== undefined ? opts.xLabelOffset : 8);
    for (var li = 0; li < sorted.length; li += every) {
      var lp = sorted[li];
      var lx = toX(lp.series, lp.i, lp.x);
      ctx.fillText(xTickFormat(lp.x), lx, xLabelY);
    }

    return { points: points, pad: pad, W: W, H: H };
  }

  /* ============================ 环形图 ============================ */

  /**
   * 环形图（带中心文字）。
   * @param {Object} opts - { items:[{label,value,color?}], height?, thicknessRatio?, centerText?, centerSub? }
   */
  function donut(canvas, opts) {
    opts = opts || {};
    var height = opts.height || 200;
    var prepared = setup(canvas, height);
    var ctx = prepared.ctx, W = prepared.W, H = prepared.H;
    var s = theme();
    if (opts.colors) {
      s = { bg: opts.colors.bg !== undefined ? opts.colors.bg : s.bg, grid: s.grid, text: opts.colors.text !== undefined ? opts.colors.text : s.text, muted: s.muted, line: s.line, area: s.area };
    }

    ctx.clearRect(0, 0, W, H);
    var items = (opts.items || []).filter(function (it) { return it.value > 0; });
    var total = items.reduce(function (sum, it) { return sum + it.value; }, 0);
    var cx = W / 2, cy = H / 2;
    var radius = Math.min(W, H) / 2 - 8;
    var thickness = radius * (opts.thicknessRatio || 0.28);

    if (total <= 0) {
      drawEmpty(ctx, W, H, '暂无数据', s);
      return;
    }

    var angle = -Math.PI / 2;
    items.forEach(function (it, i) {
      var sweep = (it.value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, angle, angle + sweep);
      ctx.arc(cx, cy, radius - thickness, angle + sweep, angle, true);
      ctx.closePath();
      ctx.fillStyle = it.color || PALETTE[i % PALETTE.length];
      ctx.fill();
      angle += sweep;
    });

    if (opts.centerText || opts.centerSub) {
      ctx.textAlign = 'center';
      ctx.fillStyle = s.text;
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText(opts.centerText || '', cx, cy - (opts.centerSub ? 4 : -5));
      if (opts.centerSub) {
        ctx.fillStyle = s.muted;
        ctx.font = '11px sans-serif';
        ctx.fillText(opts.centerSub, cx, cy + 16);
      }
    }
  }

  /* ============================ 柱状图 ============================ */

  /**
   * 纵向柱状图。
   * @param {Object} opts - { items:[{label,value,color?}], height?, valueFormat? }
   */
  function bars(canvas, opts) {
    opts = opts || {};
    var height = opts.height || 240;
    var prepared = setup(canvas, height);
    var ctx = prepared.ctx, W = prepared.W, H = prepared.H;
    var s = theme();
    var pad = { top: 24, right: 12, bottom: 34, left: 12 };
    var pw = W - pad.left - pad.right, ph = H - pad.top - pad.bottom;

    ctx.fillStyle = s.bg;
    ctx.fillRect(0, 0, W, H);

    var items = opts.items || [];
    if (items.length === 0) { drawEmpty(ctx, W, H, '暂无数据', s); return; }
    var maxV = Math.max.apply(null, items.map(function (it) { return it.value; })) || 1;
    var valueFormat = opts.valueFormat || function (v) { return String(Math.round(v)); };

    var slot = pw / items.length;
    var barW = Math.min(slot * 0.6, 48);
    items.forEach(function (it, i) {
      var bh = ph * (it.value / maxV);
      var bx = pad.left + slot * i + (slot - barW) / 2;
      var by = pad.top + ph - bh;
      ctx.fillStyle = it.color || PALETTE[i % PALETTE.length];
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(bx, by, barW, bh, [4, 4, 0, 0]);
      else ctx.rect(bx, by, barW, bh);
      ctx.fill();

      ctx.fillStyle = s.text;
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(valueFormat(it.value, it, i), bx + barW / 2, by - 5);

      ctx.fillStyle = s.muted;
      ctx.font = '10px sans-serif';
      ctx.fillText(String(it.label).length > 8 ? String(it.label).slice(0, 7) + '…' : String(it.label), bx + barW / 2, H - pad.bottom + 16);
    });
  }

  /* ============================ 热力日历 ============================ */

  /** 颜色插值：c1/c2 为 '#rrggbb'，t ∈ [0,1] */
  function mixColor(c1, c2, t) {
    function hex(n) {
      var s = Math.round(n).toString(16);
      return s.length === 1 ? '0' + s : s;
    }
    function rgb(c) {
      var m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
      if (!m) return [0, 0, 0];
      var v = parseInt(m[1], 16);
      return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    }
    var a = rgb(c1), b = rgb(c2);
    return '#' + hex(a[0] + (b[0] - a[0]) * t) + hex(a[1] + (b[1] - a[1]) * t) + hex(a[2] + (b[2] - a[2]) * t);
  }

  /**
   * 月度热力日历（周一起始）。
   * @param {Object} opts - { yearMonth:'YYYY-MM', values:{'YYYY-MM-DD': 0..1}, height? }
   */
  function heatCalendar(canvas, opts) {
    opts = opts || {};
    var height = opts.height || 160;
    var prepared = setup(canvas, height);
    var ctx = prepared.ctx, W = prepared.W, H = prepared.H;
    var s = theme();

    ctx.clearRect(0, 0, W, H);
    var ym = opts.yearMonth || '';
    var m = /^(\d{4})-(\d{2})$/.exec(ym);
    if (!m) { drawEmpty(ctx, W, H, '日期格式应为 YYYY-MM', s); return; }
    var year = parseInt(m[1], 10), month = parseInt(m[2], 10);

    var WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
    var daysInMonth = new Date(year, month, 0).getDate();
    var firstDow = (new Date(year, month - 1, 1).getDay() + 6) % 7; // 周一=0
    var weeks = Math.ceil((firstDow + daysInMonth) / 7);

    var pad = { top: 24, right: 8, bottom: 8, left: 8 };
    var gridW = W - pad.left - pad.right, gridH = H - pad.top - pad.bottom;
    var cell = Math.min(Math.floor(gridW / 7), Math.floor(gridH / weeks), 26);
    if (cell < 6) cell = 6;
    var originX = pad.left + (gridW - cell * 7) / 2;
    var originY = pad.top + (gridH - cell * weeks) / 2;

    // 表头
    ctx.fillStyle = s.muted;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var w = 0; w < 7; w++) {
      ctx.fillText(WEEKDAYS[w], originX + cell * w + cell / 2, pad.top / 2 + 2);
    }
    ctx.textBaseline = 'alphabetic';

    var values = opts.values || {};
    var cFrom = opts.colorFrom || s.bg;
    var cTo = opts.colorTo || s.line;
    for (var d = 1; d <= daysInMonth; d++) {
      var idx = firstDow + d - 1;
      var col = idx % 7, row = Math.floor(idx / 7);
      var cx = originX + col * cell, cy = originY + row * cell;
      var v = values[ym + '-' + String(d).padStart(2, '0')];
      ctx.fillStyle = v > 0 ? mixColor(cFrom, cTo, Math.min(v, 1)) : s.bg;
      ctx.fillRect(cx + 1, cy + 1, cell - 2, cell - 2);
      ctx.fillStyle = v > 0.5 ? '#ffffff' : s.text;
      ctx.font = (cell >= 16 ? '10px' : '8px') + ' sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(d), cx + cell / 2, cy + cell / 2);
      ctx.textBaseline = 'alphabetic';
    }
  }

  /* ============================ 雷达图 ============================ */

  /**
   * 雷达图（多系列多边形）。
   * @param {Object} opts - { axes:[label,...], series:[{name?,color?,values:[0..1,...]}], height?, maxVal?, levels? }
   */
  function radar(canvas, opts) {
    opts = opts || {};
    var height = opts.height || 280;
    var prepared = setup(canvas, height);
    var ctx = prepared.ctx, W = prepared.W, H = prepared.H;
    var s = theme();

    ctx.clearRect(0, 0, W, H);
    var axes = opts.axes || [];
    var n = axes.length;
    if (n < 3) { drawEmpty(ctx, W, H, '雷达图至少需要 3 个维度', s); return; }

    var cx = W / 2, cy = H / 2 + 6;
    var radius = Math.min(W, H) / 2 - 34;
    var maxVal = opts.maxVal !== undefined ? opts.maxVal : 1;
    var levels = opts.levels || 5;

    function pt(i, r) {
      var a = -Math.PI / 2 + (Math.PI * 2 * i) / n;
      return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
    }

    // 同心网格
    for (var l = 1; l <= levels; l++) {
      ctx.beginPath();
      for (var i = 0; i < n; i++) {
        var p = pt(i, radius * l / levels);
        i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.strokeStyle = s.grid;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
    // 轴
    for (var a2 = 0; a2 < n; a2++) {
      var p2 = pt(a2, radius);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      ctx.fillStyle = s.text;
      ctx.font = '11px sans-serif';
      ctx.textAlign = p2.x >= cx ? 'left' : 'right';
      ctx.textBaseline = 'middle';
      var label = axes[a2];
      ctx.fillText(label, p2.x + (p2.x >= cx ? 6 : -6), p2.y);
      ctx.textBaseline = 'alphabetic';
    }

    // 系列
    (opts.series || []).forEach(function (sr, si) {
      var color = sr.color || PALETTE[si % PALETTE.length];
      ctx.beginPath();
      for (var k = 0; k < n; k++) {
        var v = Math.max(0, Math.min(sr.values[k] || 0, maxVal));
        var pp = pt(k, radius * v / maxVal);
        k === 0 ? ctx.moveTo(pp.x, pp.y) : ctx.lineTo(pp.x, pp.y);
      }
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.18;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
      for (var k2 = 0; k2 < n; k2++) {
        var v2 = Math.max(0, Math.min(sr.values[k2] || 0, maxVal));
        var pp2 = pt(k2, radius * v2 / maxVal);
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(pp2.x, pp2.y, 3, 0, Math.PI * 2); ctx.fill();
      }
    });
  }

  /* ============================ 标签词云 ============================ */

  /**
   * 标签词云（螺旋布局 + 矩形碰撞检测，词条按权重降序，最多 60 条）。
   * @param {Object} opts - { items:[{text,weight}], height?, minFont?, maxFont? }
   */
  function wordCloud(canvas, opts) {
    opts = opts || {};
    var height = opts.height || 260;
    var prepared = setup(canvas, height);
    var ctx = prepared.ctx, W = prepared.W, H = prepared.H;
    var s = theme();

    ctx.clearRect(0, 0, W, H);
    var items = (opts.items || []).slice().sort(function (a, b) { return b.weight - a.weight; }).slice(0, 60);
    if (items.length === 0) { drawEmpty(ctx, W, H, '暂无标签', s); return; }

    var maxWt = Math.max.apply(null, items.map(function (it) { return it.weight; })) || 1;
    var minWt = Math.min.apply(null, items.map(function (it) { return it.weight; })) || 0;
    var minFont = opts.minFont || 11, maxFont = opts.maxFont || 34;
    var placed = [];

    function overlaps(x, y, w, h) {
      for (var i = 0; i < placed.length; i++) {
        var r = placed[i];
        if (x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y) return true;
      }
      return false;
    }

    items.forEach(function (it, i) {
      var t = minWt === maxWt ? 0.5 : (it.weight - minWt) / (maxWt - minWt);
      var font = Math.round(minFont + (maxFont - minFont) * t);
      ctx.font = font + 'px sans-serif';
      var tw = ctx.measureText(String(it.text)).width;
      var th = font + 4;
      var a = 0, r = 0, placedOk = false, x = 0, y = 0;
      for (var step = 0; step < 400; step++) {
        x = W / 2 + Math.cos(a) * r - tw / 2;
        y = H / 2 + Math.sin(a) * r + th / 2 - th;
        if (x > 4 && y > 4 && x + tw < W - 4 && y + th < H - 4 && !overlaps(x, y, tw, th)) {
          placedOk = true;
          break;
        }
        a += 0.5;
        r += 1.4;
      }
      if (!placedOk) return;
      placed.push({ x: x, y: y, w: tw, h: th });
      var color = PALETTE[i % PALETTE.length];
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.85;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(String(it.text), x, y);
      ctx.globalAlpha = 1;
      ctx.textBaseline = 'alphabetic';
    });
  }

  /* ============================ 导出 ============================ */

  global.JyCharts = {
    setup: setup,
    theme: theme,
    cssVar: cssVar,
    PALETTE: PALETTE,
    line: line,
    donut: donut,
    bars: bars,
    heatCalendar: heatCalendar,
    radar: radar,
    wordCloud: wordCloud,
  };
})(window);
