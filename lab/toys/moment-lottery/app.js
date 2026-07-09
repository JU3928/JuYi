;(function () {
  'use strict';

  /* ================================================================
   * Constants & Configuration
   * ================================================================ */
  const DB_NAME = 'JuYiLabLottery';
  const DB_VERSION = 1;
  const STORE_HISTORY = 'lotteryHistory';
  const LS_THEME = 'jy_theme';
  const MIN_AVATAR_SIZE = 28;   // minimum avatar dimension in pixels
  const MAX_AVATAR_SIZE = 180;  // maximum avatar dimension in pixels

  /* ================================================================
   * IndexedDB wrapper (inline, follows project convention)
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
              db.createObjectStore(sn, { keyPath: def.keyPath, autoIncrement: def.autoIncrement !== false });
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
    getAll(sn) { return this._tx(sn, 'readonly', function (s) { return this._p(s.getAll()); }.bind(this)); }
    delete(sn, id) { return this._tx(sn, 'readwrite', function (s) { return this._p(s.delete(id)); }.bind(this)); }
    clear(sn) { return this._tx(sn, 'readwrite', function (s) { return this._p(s.clear()); }.bind(this)); }
  }

  /* ================================================================
   * Utilities
   * ================================================================ */
  function fmtDate(ts) { var d = new Date(ts); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /* ================================================================
   * Pure Canvas Auto-Detection Engine
   *
   * Pipeline:
   *   1. Load image → hidden canvas at working resolution
   *   2. Grayscale
   *   3. Sobel edge detection → edge magnitude map
   *   4. Adaptive threshold → binary edge image
   *   5. Contour tracing (Moore neighbor)
   *   6. Shape filtering: aspect ratio ~1:1, size range, rounded corners
   *   7. Grid alignment clustering (screenshots have regular avatar grids)
   *   8. Deduplicate overlapping candidates → output bbox list
   * ================================================================ */
  var AutoDetect = {};

  /** Load image from file/src and return HTMLImageElement */
  AutoDetect.loadImage = function (src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = src;
    });
  };

  /** Convert ImageData to grayscale array (0-255 per pixel) */
  AutoDetect.toGrayscale = function (imageData) {
    var w = imageData.width, h = imageData.height;
    var gray = new Uint8Array(w * h);
    var data = imageData.data;
    for (var i = 0; i < w * h; i++) {
      var p = i * 4;
      gray[i] = Math.round(data[p] * 0.299 + data[p+1] * 0.587 + data[p+2] * 0.114);
    }
    return { width: w, height: h, data: gray };
  };

  /** Simple Gaussian blur (3x3 kernel) on grayscale */
  AutoDetect.blur = function (gray) {
    var w = gray.width, h = gray.height, src = gray.data;
    var dst = new Uint8Array(w * h);
    for (var y = 1; y < h - 1; y++) {
      for (var x = 1; x < w - 1; x++) {
        var sum = 0;
        for (var dy = -1; dy <= 1; dy++) {
          for (var dx = -1; dx <= 1; dx++) {
            sum += src[(y+dy)*w + (x+dx)] * [1,2,1,2,4,2,1,2,1][(dy+1)*3+(dx+1)];
          }
        }
        dst[y*w+x] = Math.round(sum / 16);
      }
    }
    // Copy edges
    for (var y = 0; y < h; y++) { dst[y*w] = src[y*w]; dst[y*w+w-1] = src[y*w+w-1]; }
    for (var x = 0; x < w; x++) { dst[x] = src[x]; dst[(h-1)*w+x] = src[(h-1)*w+x]; }
    return { width: w, height: h, data: dst };
  };

  /** Sobel edge detection → magnitude map 0-255 */
  AutoDetect.sobelEdges = function (gray) {
    var w = gray.width, h = gray.height, src = gray.data;
    var mag = new Uint8Array(w * h);
    var max = 0;
    for (var y = 1; y < h - 1; y++) {
      for (var x = 1; x < w - 1; x++) {
        var gx = -src[(y-1)*w+(x-1)] + src[(y-1)*w+(x+1)]
               - 2*src[y*w+(x-1)] + 2*src[y*w+(x+1)]
               - src[(y+1)*w+(x-1)] + src[(y+1)*w+(x+1)];
        var gy = -src[(y-1)*w+(x-1)] - 2*src[(y-1)*w+x] - src[(y-1)*w+(x+1)]
               + src[(y+1)*w+(x-1)] + 2*src[(y+1)*w+x] + src[(y+1)*w+(x+1)];
        var m = Math.sqrt(gx*gx + gy*gy);
        mag[y*w+x] = Math.round(m);
        if (m > max) max = m;
      }
    }
    // Normalize to 0-255, threshold at 15% of max
    var threshold = max * 0.12;
    var bin = new Uint8Array(w * h);
    for (var i = 0; i < w * h; i++) { bin[i] = mag[i] >= threshold ? 255 : 0; }
    return { width: w, height: h, data: bin, magnitude: mag };
  };

  /** Flood-fill to find connected components in binary image, return bounding boxes */
  AutoDetect.findBlobs = function (bin, minSize, maxSize) {
    var w = bin.width, h = bin.height, data = bin.data;
    var visited = new Uint8Array(w * h);
    var blobs = [];

    function flood(x, y) {
      var stack = [[x, y]];
      var minX = x, maxX = x, minY = y, maxY = y, count = 0;
      while (stack.length > 0) {
        var p = stack.pop();
        var px = p[0], py = p[1];
        if (px < 0 || py < 0 || px >= w || py >= h) continue;
        if (visited[py*w+px] || !data[py*w+px]) continue;
        visited[py*w+px] = 1;
        count++;
        if (px < minX) minX = px; if (px > maxX) maxX = px;
        if (py < minY) minY = py; if (py > maxY) maxY = py;
        stack.push([px-1,py],[px+1,py],[px,py-1],[px,py+1],[px-1,py-1],[px+1,py-1],[px-1,py+1],[px+1,py+1]);
      }
      return { cx: minX, cy: minY, cw: maxX-minX+1, ch: maxY-minY+1, area: count };
    }

    for (var y = 1; y < h - 1; y++) {
      for (var x = 1; x < w - 1; x++) {
        if (data[y*w+x] && !visited[y*w+x]) {
          var blob = flood(x, y);
          var bw = blob.cw, bh = blob.ch;
          // Size filter
          if (bw >= minSize && bw <= maxSize && bh >= minSize && bh <= maxSize) {
            // Aspect ratio filter: ~1:1 (allow 0.7~1.4)
            var ar = bw / bh;
            if (ar >= 0.65 && ar <= 1.55) {
              // Solidity: area / bounding box area should be decent
              var solidity = blob.area / (bw * bh);
              if (solidity >= 0.15) {
                blobs.push(blob);
              }
            }
          }
        }
      }
    }
    return blobs;
  };

  /** Check if a blob has rounded corners (detect curve at corners) */
  AutoDetect.hasRoundedCorners = function (bin, blob) {
    var w = bin.width, data = bin.data;
    var x1 = blob.cx, y1 = blob.cy, x2 = blob.cx + blob.cw - 1, y2 = blob.cy + blob.ch - 1;
    var margin = Math.max(3, Math.floor(Math.min(blob.cw, blob.ch) * 0.15));
    // Check 4 corners: if edge pixels are absent in corner regions, likely rounded
    var corners = [[x1, y1], [x2, y1], [x1, y2], [x2, y2]];
    var missing = 0;
    for (var c = 0; c < 4; c++) {
      var cx = corners[c][0], cy = corners[c][1];
      var edgeCount = 0;
      for (var dy = 0; dy < margin; dy++) {
        for (var dx = 0; dx < margin; dx++) {
          var sx = cx + (cx === x1 ? dx : -dx);
          var sy = cy + (cy === y1 ? dy : -dy);
          if (sx >= 0 && sy >= 0 && sx < w && sy < bin.height && data[sy*w+sx]) edgeCount++;
        }
      }
      if (edgeCount < margin * margin * 0.5) missing++;
    }
    return missing >= 1; // At least one corner shows rounding
  };

  /** Cluster blobs by grid alignment — find regular grid patterns */
  AutoDetect.clusterGrid = function (blobs) {
    if (blobs.length < 2) return blobs;
    // Find dominant size and spacing
    var sizes = blobs.map(function (b) { return Math.max(b.cw, b.ch); });
    sizes.sort(function (a, b) { return a - b; });
    var medianSize = sizes[Math.floor(sizes.length / 2)];
    // Filter blobs that are close to median size
    var filtered = blobs.filter(function (b) {
      var s = Math.max(b.cw, b.ch);
      return s >= medianSize * 0.7 && s <= medianSize * 1.4;
    });
    // Also detect grid spacing
    if (filtered.length >= 3) {
      var xGaps = [], yGaps = [];
      var sortedX = filtered.slice().sort(function (a, b) { return a.cx - b.cx; });
      var sortedY = filtered.slice().sort(function (a, b) { return a.cy - b.cy; });
      for (var i = 1; i < sortedX.length; i++) {
        var gap = sortedX[i].cx - (sortedX[i-1].cx + sortedX[i-1].cw);
        if (gap > 0 && gap < medianSize * 2) xGaps.push(gap);
      }
      for (var j = 1; j < sortedY.length; j++) {
        var gapY = sortedY[j].cy - (sortedY[j-1].cy + sortedY[j-1].ch);
        if (gapY > 0 && gapY < medianSize * 2) yGaps.push(gapY);
      }
      if (xGaps.length > 0 || yGaps.length > 0) {
        return filtered;
      }
    }
    return filtered;
  };

  /** Deduplicate overlapping bounding boxes using IoU */
  AutoDetect.dedup = function (blobs) {
    if (blobs.length <= 1) return blobs;
    var result = [];
    blobs.sort(function (a, b) { return (b.cw * b.ch) - (a.cw * a.ch); }); // Larger first
    for (var i = 0; i < blobs.length; i++) {
      var overlaps = false;
      for (var j = 0; j < result.length; j++) {
        var interX = Math.max(0, Math.min(blobs[i].cx + blobs[i].cw, result[j].cx + result[j].cw) - Math.max(blobs[i].cx, result[j].cx));
        var interY = Math.max(0, Math.min(blobs[i].cy + blobs[i].ch, result[j].cy + result[j].ch) - Math.max(blobs[i].cy, result[j].cy));
        var inter = interX * interY;
        var union = blobs[i].cw * blobs[i].ch + result[j].cw * result[j].ch - inter;
        if (union > 0 && inter / union > 0.4) { overlaps = true; break; }
      }
      if (!overlaps) result.push(blobs[i]);
    }
    return result;
  };

  /**
   * Main entry: detect avatars in an image
   * @param {HTMLImageElement} img - the loaded image
   * @param {number} [scale=1] - processing scale (1 = full size, 0.5 = half)
   * @returns {Array<{cx:number, cy:number, cw:number, ch:number}>} detected bounding boxes
   */
  AutoDetect.detect = function (img, scale) {
    scale = scale || 1;
    var can = document.createElement('canvas');
    var procW = Math.round(img.width * scale), procH = Math.round(img.height * scale);
    can.width = procW; can.height = procH;
    var ctx = can.getContext('2d');
    ctx.drawImage(img, 0, 0, procW, procH);

    // Pipeline
    var imageData = ctx.getImageData(0, 0, procW, procH);
    var gray = AutoDetect.toGrayscale(imageData);
    gray = AutoDetect.blur(gray);
    var bin = AutoDetect.sobelEdges(gray); // Uses magnitude internally but returns binary data

    // Scale min/max based on processing resolution
    var minS = Math.round(MIN_AVATAR_SIZE * scale);
    var maxS = Math.round(MAX_AVATAR_SIZE * scale);

    var blobs = AutoDetect.findBlobs(bin, minS, maxS);

    // Filter by rounded corners
    blobs = blobs.filter(function (b) { return AutoDetect.hasRoundedCorners(bin, b); });

    // Cluster by grid
    blobs = AutoDetect.clusterGrid(blobs);

    // Deduplicate
    blobs = AutoDetect.dedup(blobs);

    // Scale back to original coordinates
    var invScale = 1 / scale;
    return blobs.map(function (b) {
      return { cx: Math.round(b.cx * invScale), cy: Math.round(b.cy * invScale), cw: Math.round(b.cw * invScale), ch: Math.round(b.ch * invScale) };
    });
  };

  /* ================================================================
   * OpenCV.js Optional Advanced Mode
   * Loads opencv.js from CDN on demand (only when toggle is on)
   * ================================================================ */
  var OpenCVHelper = {
    _loaded: false,
    _loading: false,

    ensureLoaded: function () {
      var self = this;
      if (self._loaded) return Promise.resolve();
      if (self._loading) {
        return new Promise(function (resolve) {
          var check = setInterval(function () { if (self._loaded) { clearInterval(check); resolve(); } }, 200);
        });
      }
      self._loading = true;
      return new Promise(function (resolve, reject) {
        var script = document.createElement('script');
        script.src = 'https://docs.opencv.org/4.10.0/opencv.js';
        script.async = true;
        script.onload = function () {
          if (window.cv && cv.onRuntimeInitialized !== undefined) {
            cv.onRuntimeInitialized = function () {
              self._loaded = true; self._loading = false; resolve();
            };
          } else {
            self._loaded = true; self._loading = false; resolve();
          }
        };
        script.onerror = function () {
          self._loading = false;
          reject(new Error('OpenCV.js 加载失败，请检查网络连接后刷新重试'));
        };
        document.head.appendChild(script);
      });
    },

    /** Detect avatars using OpenCV contours */
    detect: function (img) {
      var self = this;
      return self.ensureLoaded().then(function () {
        var src = cv.imread(img);
        var gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        var blurred = new cv.Mat();
        cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
        var edges = new cv.Mat();
        cv.Canny(blurred, edges, 50, 150);
        var contours = new cv.MatVector();
        var hierarchy = new cv.Mat();
        cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        var results = [];
        for (var i = 0; i < contours.size(); i++) {
          var cnt = contours.get(i);
          var rect = cv.boundingRect(cnt);
          var bw = rect.width, bh = rect.height;
          if (bw >= MIN_AVATAR_SIZE && bh >= MIN_AVATAR_SIZE && bw <= MAX_AVATAR_SIZE && bh <= MAX_AVATAR_SIZE) {
            var ar = bw / bh;
            if (ar >= 0.65 && ar <= 1.55) {
              var area = cv.contourArea(cnt);
              var bboxArea = bw * bh;
              if (area / bboxArea >= 0.3) {
                results.push({ cx: rect.x, cy: rect.y, cw: bw, ch: bh });
              }
            }
          }
        }
        src.delete(); gray.delete(); blurred.delete(); edges.delete();
        contours.delete(); hierarchy.delete();
        return AutoDetect.clusterGrid(AutoDetect.dedup(results));
      });
    }
  };

  /* ================================================================
   * Canvas Interaction Manager
   * Handles: zoom/pan, manual drag-select, blue box rendering
   * ================================================================ */
  function CanvasManager(canvasEl, wrapEl) {
    this.canvas = canvasEl;
    this.wrap = wrapEl;
    this.ctx = canvasEl.getContext('2d');
    this.img = null;               // HTMLImageElement
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.detections = [];          // [{cx,cy,cw,ch}]
    this.manualSelections = [];    // same format
    this.isDragging = false;
    this.dragStart = null;
    this.isPanning = false;
    this.panStart = null;
    this.avatarPool = [];         // [{dataURL, source: 'auto'|'manual'}]
    this.onPoolChange = null;     // callback
  }

  CanvasManager.prototype.loadImage = function (img) {
    this.img = img;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.detections = [];
    this.manualSelections = [];
    this._fitToWrap();
    this._render();
  };

  CanvasManager.prototype._fitToWrap = function () {
    if (!this.img) return;
    var ww = this.wrap.clientWidth, wh = this.wrap.clientHeight;
    var iw = this.img.width, ih = this.img.height;
    var fitScale = Math.min(ww / iw, wh / ih, 1);
    this.scale = fitScale;
    this.offsetX = (ww - iw * fitScale) / 2;
    this.offsetY = (wh - ih * fitScale) / 2;
  };

  CanvasManager.prototype._imgToCanvas = function (ix, iy) {
    return { x: ix * this.scale + this.offsetX, y: iy * this.scale + this.offsetY };
  };
  CanvasManager.prototype._canvasToImg = function (cx, cy) {
    return { x: (cx - this.offsetX) / this.scale, y: (cy - this.offsetY) / this.scale };
  };

  CanvasManager.prototype.setDetections = function (dets) {
    this.detections = dets;
    this._syncPool();
    this._render();
  };

  CanvasManager.prototype.addManualSelection = function (x, y, w, h) {
    this.manualSelections.push({ cx: Math.round(x), cy: Math.round(y), cw: Math.round(w), ch: Math.round(h) });
    this._syncPool();
    this._render();
  };

  CanvasManager.prototype.clearAll = function () {
    this.detections = [];
    this.manualSelections = [];
    this.avatarPool = [];
    this._syncPool();
    this._render();
  };

  CanvasManager.prototype.removeDetection = function (index) {
    if (index < this.detections.length) this.detections.splice(index, 1);
    else this.manualSelections.splice(index - this.detections.length, 1);
    this._syncPool();
    this._render();
  };

  CanvasManager.prototype._syncPool = function () {
    if (!this.img) { this.avatarPool = []; if (this.onPoolChange) this.onPoolChange(); return; }
    var self = this;
    var pool = [];
    var all = this.detections.map(function (d) { return Object.assign({}, d, { source: 'auto' }); })
              .concat(this.manualSelections.map(function (d) { return Object.assign({}, d, { source: 'manual' }); }));
    all.forEach(function (d) {
      var size = Math.min(d.cw, d.ch);
      var cx = d.cx + d.cw / 2, cy = d.cy + d.ch / 2;
      // Create circular crop
      var can = document.createElement('canvas');
      can.width = 120; can.height = 120;
      var ctx = can.getContext('2d');
      ctx.beginPath();
      ctx.arc(60, 60, 60, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(self.img, cx - size/2, cy - size/2, size, size, 0, 0, 120, 120);
      pool.push({ dataURL: can.toDataURL('image/png'), source: d.source, bbox: d, index: pool.length });
    });
    this.avatarPool = pool;
    if (this.onPoolChange) this.onPoolChange();
  };

  CanvasManager.prototype._render = function () {
    var cw = this.wrap.clientWidth, ch = this.wrap.clientHeight;
    this.canvas.width = cw; this.canvas.height = ch;
    this.canvas.style.width = cw + 'px'; this.canvas.style.height = ch + 'px';
    var ctx = this.ctx;
    ctx.clearRect(0, 0, cw, ch);
    if (!this.img) return;

    // Draw image
    ctx.drawImage(this.img, this.offsetX, this.offsetY, this.img.width * this.scale, this.img.height * this.scale);

    // Draw detection boxes (blue)
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    var self = this;
    this.detections.forEach(function (d) {
      var p = self._imgToCanvas(d.cx, d.cy);
      var w = d.cw * self.scale, h = d.ch * self.scale;
      ctx.strokeRect(p.x, p.y, w, h);
      // Label
      ctx.fillStyle = '#3b82f6';
      ctx.font = '10px sans-serif';
      ctx.fillText('auto', p.x, p.y - 4);
    });

    // Draw manual boxes (green)
    ctx.strokeStyle = '#10b981';
    this.manualSelections.forEach(function (d) {
      var p = self._imgToCanvas(d.cx, d.cy);
      var w = d.cw * self.scale, h = d.ch * self.scale;
      ctx.strokeRect(p.x, p.y, w, h);
      ctx.fillStyle = '#10b981';
      ctx.font = '10px sans-serif';
      ctx.fillText('manual', p.x, p.y - 4);
    });

    // Draw drag marquee if active
    if (this._marquee) {
      var m = this._marquee;
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 2]);
      ctx.strokeRect(m.x, m.y, m.w, m.h);
      ctx.setLineDash([]);
    }
  };

  /* ---- Zoom / Pan ---- */
  CanvasManager.prototype.zoom = function (factor) {
    this.scale = clamp(this.scale * factor, 0.1, 5);
    this._render();
  };
  CanvasManager.prototype.fitToWrap = function () { this._fitToWrap(); this._render(); };
  CanvasManager.prototype.startPan = function (x, y) { this.isPanning = true; this.panStart = { x: x - this.offsetX, y: y - this.offsetY }; };
  CanvasManager.prototype.movePan = function (x, y) {
    if (!this.isPanning) return;
    this.offsetX = x - this.panStart.x;
    this.offsetY = y - this.panStart.y;
    this._render();
  };
  CanvasManager.prototype.endPan = function () { this.isPanning = false; };

  /* ---- Drag select (manual add) ---- */
  CanvasManager.prototype.startDrag = function (cx, cy) {
    this.isDragging = true;
    this.dragStart = this._canvasToImg(cx, cy);
    this._marquee = { x: cx, y: cy, w: 0, h: 0 };
  };
  CanvasManager.prototype.moveDrag = function (cx, cy) {
    if (!this.isDragging) return;
    this._marquee.w = cx - this._marquee.x;
    this._marquee.h = cy - this._marquee.y;
    this._render();
  };
  CanvasManager.prototype.endDrag = function () {
    if (!this.isDragging) return;
    this.isDragging = false;
    if (this._marquee && Math.abs(this._marquee.w) > 10 && Math.abs(this._marquee.h) > 10) {
      var m = this._marquee;
      var x = Math.min(m.x, m.x + m.w), y = Math.min(m.y, m.y + m.h);
      var w = Math.abs(m.w), h = Math.abs(m.h);
      var imgPt = this._canvasToImg(x, y);
      var imgW = w / this.scale, imgH = h / this.scale;
      this.addManualSelection(imgPt.x, imgPt.y, imgW, imgH);
    }
    this._marquee = null;
    this._render();
  };

  /* ---- Get all avatar images (for lottery) ---- */
  CanvasManager.prototype.getAvatarPool = function () { return this.avatarPool; };

  /* ================================================================
   * Lottery Engine
   * Three animation modes: jump / marquee / wheel
   * ================================================================ */
  function LotteryEngine(stageEl, onFinish) {
    this.stage = stageEl;
    this.onFinish = onFinish || function () {};
    this._timer = null;
    this._running = false;
  }

  /** Jump animation: grid of avatars with random highlighting */
  LotteryEngine.prototype.runJump = function (avatars, count, duration, allowRepeat, onReveal) {
    var self = this;
    self._running = true;
    var pool = avatars.slice();
    var html = '<div class="ml-jump-grid">';
    pool.forEach(function (a, i) { html += '<div class="ml-jump-avatar" data-i="' + i + '"><img src="' + a.dataURL + '" alt=""></div>'; });
    html += '</div>';
    self.stage.innerHTML = html;

    var cards = self.stage.querySelectorAll('.ml-jump-avatar');
    var interval = 80; // ms between jumps
    var elapsed = 0;
    var highlighted = new Set();

    function tick() {
      if (elapsed >= duration * 1000) {
        self._running = false;
        // Select final winners
        var winners = [];
        var available = allowRepeat ? pool : pool.filter(function (a, i) { return highlighted.has(i); });
        if (available.length < count) available = pool;
        // Shuffle and pick
        var shuffled = available.slice().sort(function () { return Math.random() - 0.5; });
        winners = shuffled.slice(0, Math.min(count, shuffled.length));
        // Highlight winners
        cards.forEach(function (c) { c.classList.remove('is-highlighted'); });
        winners.forEach(function (w) { cards[w.index].classList.add('is-highlighted'); });
        if (onReveal) onReveal(winners);
        return;
      }
      // Random highlight
      cards.forEach(function (c) { c.classList.remove('is-highlighted'); });
      var numHighlight = Math.min(Math.max(count, 2), cards.length);
      var indices = [];
      while (indices.length < numHighlight) {
        var r = Math.floor(Math.random() * cards.length);
        if (indices.indexOf(r) === -1) indices.push(r);
      }
      indices.forEach(function (i) { cards[i].classList.add('is-highlighted'); highlighted.add(parseInt(cards[i].dataset.i)); });
      elapsed += interval;
      self._timer = setTimeout(tick, interval);
    }
    tick();
  };

  /** Marquee: horizontal scrolling strip */
  LotteryEngine.prototype.runMarquee = function (avatars, count, duration, allowRepeat, onReveal) {
    var self = this;
    self._running = true;
    // Create long strip with repeated avatars
    var triple = avatars.concat(avatars).concat(avatars);
    self.stage.innerHTML = '<div class="ml-marquee-wrap"><div class="ml-marquee-strip" id="marqueeStrip"></div></div>';
    var strip = document.getElementById('marqueeStrip');
    var html = '';
    triple.forEach(function (a, i) { html += '<div class="ml-marquee-item" data-idx="' + (i % avatars.length) + '"><img src="' + a.dataURL + '" alt=""></div>'; });
    strip.innerHTML = html;
    var itemW = 96; // 80 + 16 gap
    var startTime = Date.now();

    function scroll() {
      var elapsed = (Date.now() - startTime) / 1000;
      if (elapsed >= duration) {
        self._running = false;
        // Pick winner from the "center" position
        var winners = [];
        var picked = allowRepeat ? [] : [];
        for (var w = 0; w < count; w++) {
          var ri = Math.floor(Math.random() * avatars.length);
          if (!allowRepeat) {
            var tries = 0;
            while (picked.indexOf(ri) !== -1 && tries < 50) { ri = Math.floor(Math.random() * avatars.length); tries++; }
            picked.push(ri);
          }
          winners.push(Object.assign({}, avatars[ri], { index: ri }));
        }
        // Highlight
        var mAvatars = strip.querySelectorAll('.ml-marquee-item');
        mAvatars.forEach(function (a) { a.classList.remove('is-winner'); });
        if (onReveal) onReveal(winners);
        return;
      }
      var speed = 300 + Math.random() * 400;
      strip.style.transform = 'translateX(-' + (elapsed * speed % (avatars.length * itemW)) + 'px)';
      self._timer = requestAnimationFrame(scroll);
    }
    scroll();
  };

  /** Wheel: circular rotating wheel */
  LotteryEngine.prototype.runWheel = function (avatars, count, duration, allowRepeat, onReveal) {
    var self = this;
    self._running = true;
    var n = avatars.length;
    if (n < 3) { self.runJump(avatars, count, duration, allowRepeat, onReveal); return; }

    var radius = 180;
    var centerX = 250, centerY = 220;
    var svgParts = [];
    var anglePer = (2 * Math.PI) / n;
    avatars.forEach(function (a, i) {
      var startAngle = i * anglePer - Math.PI / 2;
      var endAngle = startAngle + anglePer;
      var x1 = centerX + radius * Math.cos(startAngle);
      var y1 = centerY + radius * Math.sin(startAngle);
      var x2 = centerX + radius * Math.cos(endAngle);
      var y2 = centerY + radius * Math.sin(endAngle);
      var largeArc = anglePer > Math.PI ? 1 : 0;
      var pathD = 'M' + centerX + ',' + centerY + ' L' + x1 + ',' + y1 + ' A' + radius + ',' + radius + ' 0 ' + largeArc + ',1 ' + x2 + ',' + y2 + ' Z';
      svgParts.push({ d: pathD, fill: 'hsl(' + (i * 360 / n) + ',60%,50%)' });
    });

    var html = '<div class="ml-wheel-wrap"><div class="ml-wheel-pointer">▼</div><svg width="500" height="440" id="wheelSvg">';
    svgParts.forEach(function (p, i) {
      html += '<path d="' + p.d + '" fill="' + p.fill + '" stroke="#fff" stroke-width="2" data-i="' + i + '"/>';
      // Simple text
      var midAngle = i * anglePer + anglePer / 2 - Math.PI / 2;
      var tx = centerX + radius * 0.65 * Math.cos(midAngle);
      var ty = centerY + radius * 0.65 * Math.sin(midAngle);
      html += '<text x="' + tx + '" y="' + ty + '" text-anchor="middle" fill="#fff" font-size="11">' + (i + 1) + '</text>';
    });
    html += '<circle cx="' + centerX + '" cy="' + centerY + '" r="30" fill="#fff" stroke="var(--jy-primary)" stroke-width="3"/><text x="' + centerX + '" y="' + centerY + '" text-anchor="middle" dy="5" font-weight="700" font-size="14">🎰</text>';
    html += '</svg><div class="ml-wheel-winner" id="wheelWinner"></div></div>';
    self.stage.innerHTML = html;

    var svg = document.getElementById('wheelSvg');
    var rotation = 0;
    var totalRotation = 720 + Math.random() * 1440 + 360 * (count - 1);
    var startTime = Date.now();

    function rotate() {
      var elapsed = (Date.now() - startTime) / 1000;
      var progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      var eased = 1 - Math.pow(1 - progress, 3);
      rotation = eased * totalRotation;
      svg.style.transform = 'rotate(' + rotation + 'deg)';
      svg.style.transformOrigin = centerX + 'px ' + centerY + 'px';

      if (progress >= 1) {
        self._running = false;
        // Determine winners
        var finalAngle = (rotation % 360) * Math.PI / 180;
        var winners = [];
        var picked = [];
        for (var w = 0; w < count; w++) {
          var ri = Math.floor(Math.random() * n);
          if (!allowRepeat) {
            var tries = 0;
            while (picked.indexOf(ri) !== -1 && tries < 50) { ri = Math.floor(Math.random() * n); tries++; }
            picked.push(ri);
          }
          winners.push(Object.assign({}, avatars[ri], { index: ri }));
        }
        document.getElementById('wheelWinner').textContent = '🎉 中奖!';
        if (onReveal) onReveal(winners);
        return;
      }
      self._timer = requestAnimationFrame(rotate);
    }
    rotate();
  };

  LotteryEngine.prototype.run = function (mode, avatars, count, duration, allowRepeat, onReveal) {
    if (mode === 'marquee') this.runMarquee(avatars, count, duration, allowRepeat, onReveal);
    else if (mode === 'wheel') this.runWheel(avatars, count, duration, allowRepeat, onReveal);
    else this.runJump(avatars, count, duration, allowRepeat, onReveal);
  };

  LotteryEngine.prototype.stop = function () {
    if (this._timer) { clearTimeout(this._timer); cancelAnimationFrame(this._timer); this._timer = null; }
    this._running = false;
  };

  /* ================================================================
   * App Controller
   * ================================================================ */
  function App() {
    this.db = new DB();
    this.canvasMgr = null;
    this.lotteryEngine = null;
    this.history = [];
    this.currentWinners = [];
    this._dbReady = false;
  }

  App.prototype.init = function () {
    var self = this;
    this._restoreTheme();
    this._cacheDom();
    this._bindEvents();

    // Init canvas manager
    this.canvasMgr = new CanvasManager(this.$canvas, this.$canvasWrap);
    this.canvasMgr.onPoolChange = function () { self._renderAvatarPool(); };
    this.lotteryEngine = new LotteryEngine(this.$lotteryStage, function () {});

    // Open DB
    this.db.open(DB_NAME, DB_VERSION, (function () {
      var s = {}; s[STORE_HISTORY] = { keyPath: 'id', autoIncrement: true };
      return s;
    })()).then(function () {
      self._dbReady = true;
      return self._loadHistory();
    }).catch(function (e) {
      console.warn('Lottery DB init failed:', e);
      self._dbReady = false;
    });

    // Resize handler
    window.addEventListener('resize', function () { if (self.canvasMgr.img) self.canvasMgr._render(); });
  };

  App.prototype._cacheDom = function () {
    var d = document;
    this.$canvas = d.getElementById('mainCanvas');
    this.$canvasWrap = d.getElementById('canvasWrap');
    this.$canvasPlaceholder = d.getElementById('canvasPlaceholder');
    this.$fileInput = d.getElementById('fileInput');
    this.$avatarGrid = d.getElementById('avatarGrid');
    this.$avatarCount = d.getElementById('avatarCount');
    this.$lotteryOverlay = d.getElementById('lotteryOverlay');
    this.$lotteryStage = d.getElementById('lotteryStage');
    this.$resultOverlay = d.getElementById('resultOverlay');
    this.$resultGrid = d.getElementById('resultGrid');
    this.$historyBody = d.getElementById('historyBody');
    this.$historyCount = d.getElementById('historyCount');
    this.$detectStatus = d.getElementById('detectStatus');
    this.$detectStatusText = d.getElementById('detectStatusText');
    this.$drawCount = d.getElementById('drawCount');
    this.$animType = d.getElementById('animType');
    this.$animDuration = d.getElementById('animDuration');
    this.$allowRepeat = d.getElementById('allowRepeat');
    this.$showParticles = d.getElementById('showParticles');
    this.$toggleOpenCV = d.getElementById('toggleOpenCV');
    this.$importFile = d.getElementById('importFile');
  };

  App.prototype._bindEvents = function () {
    var self = this;
    var d = document;

    // File upload
    this.$fileInput.addEventListener('change', function () {
      if (this.files[0]) self._handleUpload(this.files[0]);
    });

    // Load demo
    d.getElementById('btnLoadDemo').addEventListener('click', function () { self._loadDemoImage(); });

    // Auto detect
    d.getElementById('btnAutoDetect').addEventListener('click', function () { self._runDetection(); });

    // Clear all
    d.getElementById('btnClearAll').addEventListener('click', function () { self.canvasMgr.clearAll(); });

    // Clear pool
    d.getElementById('btnClearPool').addEventListener('click', function () { self.canvasMgr.clearAll(); });

    // Zoom
    d.getElementById('btnZoomIn').addEventListener('click', function () { self.canvasMgr.zoom(1.2); });
    d.getElementById('btnZoomOut').addEventListener('click', function () { self.canvasMgr.zoom(0.8); });
    d.getElementById('btnZoomFit').addEventListener('click', function () { self.canvasMgr.fitToWrap(); });

    // Lottery
    d.getElementById('btnStartLottery').addEventListener('click', function () { self._startLottery(); });
    d.getElementById('btnReveal').addEventListener('click', function () { self._revealLottery(); });
    d.getElementById('btnCancelLottery').addEventListener('click', function () { self._cancelLottery(); });
    d.getElementById('btnReroll').addEventListener('click', function () {
      self.$resultOverlay.classList.remove('is-open');
      self._startLottery();
    });

    // Export/Import
    d.getElementById('btnExport').addEventListener('click', function () { self._exportData(); });
    d.getElementById('btnImport').addEventListener('click', function () { self.$importFile.click(); });
    this.$importFile.addEventListener('change', function () { self._importData(this); });

    // History toggle
    d.getElementById('historyToggle').addEventListener('click', function () {
      d.getElementById('historyPanel').classList.toggle('is-collapsed');
    });

    // Canvas mouse events
    var wrap = this.$canvasWrap;
    wrap.addEventListener('mousedown', function (e) {
      var r = wrap.getBoundingClientRect();
      var cx = e.clientX - r.left, cy = e.clientY - r.top;
      if (e.shiftKey || e.button === 1) { self.canvasMgr.startPan(cx, cy); return; }
      self.canvasMgr.startDrag(cx, cy);
    });
    wrap.addEventListener('mousemove', function (e) {
      var r = wrap.getBoundingClientRect();
      var cx = e.clientX - r.left, cy = e.clientY - r.top;
      self.canvasMgr.moveDrag(cx, cy);
      self.canvasMgr.movePan(cx, cy);
    });
    wrap.addEventListener('mouseup', function () { self.canvasMgr.endDrag(); self.canvasMgr.endPan(); });
    wrap.addEventListener('mouseleave', function () { self.canvasMgr.endDrag(); self.canvasMgr.endPan(); });
    wrap.addEventListener('wheel', function (e) {
      e.preventDefault();
      self.canvasMgr.zoom(e.deltaY < 0 ? 1.1 : 0.9);
    });

    // Touch events
    wrap.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) {
        var r = wrap.getBoundingClientRect();
        self.canvasMgr.startPan(e.touches[0].clientX - r.left, e.touches[0].clientY - r.top);
        return;
      }
      var r = wrap.getBoundingClientRect();
      self.canvasMgr.startDrag(e.touches[0].clientX - r.left, e.touches[0].clientY - r.top);
    });
    wrap.addEventListener('touchmove', function (e) {
      var r = wrap.getBoundingClientRect();
      self.canvasMgr.moveDrag(e.touches[0].clientX - r.left, e.touches[0].clientY - r.top);
      self.canvasMgr.movePan(e.touches[0].clientX - r.left, e.touches[0].clientY - r.top);
    });
    wrap.addEventListener('touchend', function () { self.canvasMgr.endDrag(); self.canvasMgr.endPan(); });

    // Modal close
    d.addEventListener('click', function (e) {
      if (e.target.classList.contains('modal-close-btn')) {
        var o = e.target.closest('.jy-overlay');
        if (o) o.classList.remove('is-open');
      }
    });

    // Theme
    var btnTheme = d.getElementById('btnToggleTheme');
    if (btnTheme) btnTheme.addEventListener('click', function () { self._toggleTheme(); });
  };

  /* ---- Image loading ---- */
  App.prototype._handleUpload = function (file) {
    var self = this;
    var reader = new FileReader();
    reader.onload = function (e) {
      AutoDetect.loadImage(e.target.result).then(function (img) {
        self.canvasMgr.loadImage(img);
        self.$canvasPlaceholder.style.display = 'none';
      });
    };
    reader.readAsDataURL(file);
  };

  App.prototype._loadDemoImage = function () {
    // Generate a synthetic demo grid of colored circles/avatars
    var self = this;
    var can = document.createElement('canvas');
    can.width = 600; can.height = 400;
    var ctx = can.getContext('2d');
    ctx.fillStyle = '#f5f6f8'; ctx.fillRect(0, 0, 600, 400);

    var colors = ['#4f5de4','#10b981','#ef4444','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#84cc16','#f97316','#3b82f6','#a855f7','#14b8a6'];
    var emojis = ['😀','🐱','🐶','🌟','🎸','🌈','🍕','🚀','💻','🎨','🔥','💡'];
    for (var row = 0; row < 3; row++) {
      for (var col = 0; col < 8; col++) {
        var cx = 50 + col * 70, cy = 50 + row * 120;
        var idx = (row * 8 + col) % colors.length;
        ctx.beginPath();
        ctx.arc(cx + 25, cy + 25, 25, 0, Math.PI * 2);
        ctx.fillStyle = colors[idx];
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '20px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emojis[idx], cx + 25, cy + 25);
      }
    }

    // Add some rounded-rect borders to simulate avatar frames
    ctx.strokeStyle = '#e2e5ea'; ctx.lineWidth = 2;
    for (var row2 = 0; row2 < 3; row2++) {
      for (var col2 = 0; col2 < 8; col2++) {
        var bx = 50 + col2 * 70, by = 50 + row2 * 120;
        ctx.beginPath();
        ctx.roundRect(bx, by, 50, 50, 10);
        ctx.stroke();
      }
    }

    AutoDetect.loadImage(can.toDataURL()).then(function (img) {
      self.canvasMgr.loadImage(img);
      self.$canvasPlaceholder.style.display = 'none';
    });
  };

  /* ---- Detection ---- */
  App.prototype._runDetection = function () {
    if (!this.canvasMgr.img) { alert('请先上传截图或加载示例图片'); return; }
    var self = this;
    var useOpenCV = this.$toggleOpenCV.checked;

    self._showDetectStatus('🔍 正在检测头像...');
    var startTime = Date.now();

    function finish(dets) {
      var elapsed = Date.now() - startTime;
      self.canvasMgr.setDetections(dets);
      self._hideDetectStatus();
      var msg = dets.length > 0 ? '✅ 检测到 ' + dets.length + ' 个头像（耗时 ' + elapsed + 'ms）' : '⚠️ 未检测到头像，请尝试手动框选';
      if (dets.length === 0) self._showDetectStatus(msg);
      else { self._showDetectStatus(msg); setTimeout(function () { self._hideDetectStatus(); }, 2000); }
    }

    if (useOpenCV) {
      self._showDetectStatus('📦 正在加载 OpenCV.js（首次可能需要几秒）...');
      OpenCVHelper.detect(self.canvasMgr.img).then(finish).catch(function (e) {
        self._hideDetectStatus();
        alert('OpenCV 检测失败：' + e.message + '\n\n已自动回退到原生算法');
        // Fallback to native
        self._runNativeDetection(finish);
      });
    } else {
      self._runNativeDetection(finish);
    }
  };

  App.prototype._runNativeDetection = function (cb) {
    var self = this;
    // Use requestAnimationFrame to not block UI
    requestAnimationFrame(function () {
      var scale = self.canvasMgr.img.width > 1000 ? 0.5 : (self.canvasMgr.img.width > 2000 ? 0.3 : 1);
      var dets = AutoDetect.detect(self.canvasMgr.img, scale);
      cb(dets);
    });
  };

  App.prototype._showDetectStatus = function (msg) {
    this.$detectStatus.style.display = 'block';
    this.$detectStatusText.textContent = msg;
  };
  App.prototype._hideDetectStatus = function () { this.$detectStatus.style.display = 'none'; };

  /* ---- Avatar Pool Render ---- */
  App.prototype._renderAvatarPool = function () {
    var self = this;
    var pool = this.canvasMgr.getAvatarPool();
    this.$avatarCount.textContent = pool.length;

    if (pool.length === 0) {
      this.$avatarGrid.innerHTML = '<div class="ml-empty">暂无头像<br><small>上传截图后点击「自动识别」或手动框选</small></div>';
      return;
    }

    var html = '';
    pool.forEach(function (a, i) {
      html += '<div class="ml-avatar-item" data-pool-idx="' + i + '">' +
        '<img src="' + a.dataURL + '" alt="">' +
        '<button class="ml-avatar-item__del" data-pool-idx="' + i + '" title="删除">✕</button>' +
      '</div>';
    });
    this.$avatarGrid.innerHTML = html;

    // Bind delete
    this.$avatarGrid.querySelectorAll('.ml-avatar-item__del').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        self.canvasMgr.removeDetection(parseInt(this.dataset.poolIdx));
      });
    });
  };

  /* ---- Lottery ---- */
  App.prototype._startLottery = function () {
    var pool = this.canvasMgr.getAvatarPool();
    if (pool.length === 0) { alert('头像池为空，请先上传截图并检测/框选头像'); return; }
    var drawCount = Math.min(parseInt(this.$drawCount.value) || 1, pool.length);
    var animType = this.$animType.value;
    var duration = parseFloat(this.$animDuration.value) || 3;
    var allowRepeat = this.$allowRepeat.checked;
    var showParticles = this.$showParticles.checked;
    var self = this;

    this.$lotteryOverlay.style.display = 'flex';
    this.lotteryEngine.run(animType, pool, drawCount, duration, allowRepeat, function (winners) {
      self.currentWinners = winners;
      if (showParticles) self._spawnParticles();
    });
  };

  App.prototype._revealLottery = function () {
    this.lotteryEngine.stop();
    this.$lotteryOverlay.style.display = 'none';
    this._showResults();
  };

  App.prototype._cancelLottery = function () {
    this.lotteryEngine.stop();
    this.$lotteryOverlay.style.display = 'none';
    this.currentWinners = [];
  };

  App.prototype._showResults = function () {
    var winners = this.currentWinners;
    if (!winners || winners.length === 0) return;
    var html = '';
    winners.forEach(function (w, i) {
      html += '<div class="ml-result-item"><img src="' + w.dataURL + '" alt=""><div class="ml-result-item__label">中奖 #' + (i+1) + '</div></div>';
    });
    this.$resultGrid.innerHTML = html;
    this.$resultOverlay.classList.add('is-open');

    // Save to history
    this._saveHistory(winners);
  };

  App.prototype._spawnParticles = function () {
    var emojis = ['🎉','🎊','✨','🌟','💫','🎯','🎰','🎪'];
    for (var i = 0; i < 30; i++) {
      var p = document.createElement('div');
      p.className = 'ml-particle';
      p.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      p.style.left = (Math.random() * 80 + 10) + '%';
      p.style.top = (Math.random() * 60 + 20) + '%';
      p.style.setProperty('--px', (Math.random() * 300 - 150) + 'px');
      p.style.setProperty('--py', (Math.random() * -300 - 100) + 'px');
      p.style.animationDuration = (Math.random() * 1 + 1) + 's';
      document.body.appendChild(p);
      setTimeout(function () { p.remove(); }, 2000);
    }
  };

  /* ---- History ---- */
  App.prototype._saveHistory = function (winners) {
    var self = this;
    var record = {
      date: new Date().toISOString(),
      count: winners.length,
      avatars: winners.map(function (w) { return w.dataURL; })
    };
    if (this._dbReady) {
      this.db.add(STORE_HISTORY, record).then(function () { return self._loadHistory(); });
    } else {
      // Fallback to memory
      this.history.unshift(record);
      this._renderHistory();
    }
  };

  App.prototype._loadHistory = function () {
    var self = this;
    return this.db.getAll(STORE_HISTORY).then(function (records) {
      self.history = (records || []).sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
      self._renderHistory();
    });
  };

  App.prototype._renderHistory = function () {
    this.$historyCount.textContent = this.history.length;
    if (this.history.length === 0) {
      this.$historyBody.innerHTML = '<div class="ml-empty">暂无抽奖记录</div>';
      return;
    }
    var html = '';
    this.history.forEach(function (r) {
      var avatarsHtml = (r.avatars || []).slice(0, 10).map(function (a) { return '<img src="' + a + '" alt="">'; }).join('');
      html += '<div class="ml-history-item"><span>🎉 ' + (r.count || 1) + '人中奖</span><div class="ml-history-item__imgs">' + avatarsHtml + '</div><span class="ml-history-item__time">' + fmtDate(r.date) + '</span></div>';
    });
    this.$historyBody.innerHTML = html;
  };

  /* ---- Export/Import ---- */
  App.prototype._exportData = function () {
    var data = {
      _format: 'JuYiLabLottery/1',
      exportedAt: new Date().toISOString(),
      history: this.history,
      avatarPool: this.canvasMgr.getAvatarPool().map(function (a) { return { dataURL: a.dataURL, source: a.source }; })
    };
    var json = JSON.stringify(data, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'lottery-backup-' + fmtDate(new Date()).replace(/\s/g,'_') + '.json';
    a.click(); URL.revokeObjectURL(url);
  };

  App.prototype._importData = function (input) {
    var self = this;
    var file = input.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = JSON.parse(e.target.result);
        if (data._format !== 'JuYiLabLottery/1') { alert('文件格式不正确'); return; }
        if (data.avatarPool && data.avatarPool.length) {
          self.canvasMgr.avatarPool = data.avatarPool;
          self._renderAvatarPool();
        }
        if (data.history) { self.history = data.history; self._renderHistory(); }
        alert('导入成功！');
      } catch (err) { alert('导入失败：' + err.message); }
    };
    reader.readAsText(file);
    input.value = '';
  };

  /* ---- Theme ---- */
  App.prototype._restoreTheme = function () {
    if (localStorage.getItem(LS_THEME) === 'dark') { document.documentElement.setAttribute('data-theme', 'dark'); }
    var btn = document.getElementById('btnToggleTheme');
    if (btn) btn.textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙';
  };
  App.prototype._toggleTheme = function () {
    var cur = document.documentElement.getAttribute('data-theme'), next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(LS_THEME, next);
    var btn = document.getElementById('btnToggleTheme');
    if (btn) btn.textContent = next === 'dark' ? '☀️' : '🌙';
    if (this.canvasMgr && this.canvasMgr.img) this.canvasMgr._render();
  };

  /* ================================================================
   * Bootstrap
   * ================================================================ */
  document.addEventListener('DOMContentLoaded', function () {
    new App().init();
  });

})();
