;(function(){
  'use strict';

  const DB_NAME = 'JuYiLabImageTools';
  const DB_VERSION = 1;
  const STORE = 'history';

  /* ================================================================
   * App State
   * ================================================================ */
  const db = new JuYiDB();
  let currentImage = null;       // data URL of currently displayed image
  let currentFilename = null;    // auto-generated filename
  let history = [];

  /* ================================================================
   * DOM refs
   * ================================================================ */
  const $ = (sel) => document.querySelector(sel);
  const els = {};
  function cacheDom() {
    els.pasteZone = $('#pasteZone');
    els.previewPanel = $('#previewPanel');
    els.previewImg = $('#previewImg');
    els.imgInfo = $('#imgInfo');
    els.btnDownload = $('#btnDownload');
    els.btnCopyAgain = $('#btnCopyAgain');
    els.btnClear = $('#btnClear');
    els.historyPanel = $('#historyPanel');
    els.historyCount = $('#historyCount');
    els.historyGrid = $('#historyGrid');
    els.btnClearHistory = $('#btnClearHistory');
    els.btnToggleTheme = $('#btnToggleTheme');
  }

  /* ================================================================
   * Theme
   * ================================================================ */
  function initTheme() {
    const saved = localStorage.getItem('jy_theme');
    if (saved === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      els.btnToggleTheme.textContent = '☀️';
    }
    els.btnToggleTheme.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('jy_theme', next);
      els.btnToggleTheme.textContent = next === 'dark' ? '☀️' : '🌙';
    });
  }

  /* ================================================================
   * Toast
   * ================================================================ */
  let toastTimer = null;
  function showToast(msg) {
    const old = document.querySelector('.it-toast');
    if (old) old.remove();
    if (toastTimer) clearTimeout(toastTimer);
    const el = document.createElement('div');
    el.className = 'it-toast';
    el.textContent = msg;
    document.body.appendChild(el);
    toastTimer = setTimeout(() => {
      el.classList.add('is-fading');
      el.addEventListener('animationend', () => el.remove());
    }, 1800);
  }

  /* ================================================================
   * Paste handling
   * ================================================================ */
  function handlePaste(e) {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault();
        const blob = item.getAsFile();
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result;
          setImage(dataUrl, blob.type);
          addToHistory(dataUrl, blob.type);
        };
        reader.readAsDataURL(blob);
        return;
      }
    }
  }

  function handlePasteZoneClick() {
    // Visual feedback only — actual paste needs keyboard
    showToast('请按 Ctrl+V 粘贴剪贴板中的图片');
  }

  function setImage(dataUrl, mimeType) {
    currentImage = dataUrl;
    const ext = mimeToExt(mimeType);
    currentFilename = 'image_' + formatTimestamp() + '.' + ext;

    els.previewImg.src = dataUrl;
    els.previewPanel.style.display = '';
    els.pasteZone.style.display = 'none';

    // Image info
    const img = new Image();
    img.onload = () => {
      const sizeKB = Math.round(dataUrl.length * 3 / 4 / 1024); // approx base64 → bytes
      els.imgInfo.textContent = img.naturalWidth + '×' + img.naturalHeight + ' · ~' + sizeKB + ' KB · ' + ext.toUpperCase();
    };
    img.src = dataUrl;
  }

  function mimeToExt(mime) {
    const map = {
      'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif',
      'image/webp': 'webp', 'image/bmp': 'bmp', 'image/svg+xml': 'svg'
    };
    return map[mime] || 'png';
  }

  function formatTimestamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' +
           pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
  }

  /* ================================================================
   * Download
   * ================================================================ */
  function downloadImage() {
    if (!currentImage) return;

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = currentFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('✅ 图片已下载: ' + currentFilename);
      });
    };
    img.src = currentImage;
  }

  /* ================================================================
   * Copy to clipboard
   * ================================================================ */
  async function copyToClipboard() {
    if (!currentImage) return;
    try {
      const resp = await fetch(currentImage);
      const blob = await resp.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob })
      ]);
      showToast('📋 图片已复制到剪贴板');
    } catch (err) {
      showToast('⚠️ 复制失败: ' + err.message);
    }
  }

  /* ================================================================
   * Clear
   * ================================================================ */
  function clearPreview() {
    currentImage = null;
    currentFilename = null;
    els.previewImg.src = '';
    els.previewPanel.style.display = 'none';
    els.pasteZone.style.display = '';
  }

  /* ================================================================
   * History
   * ================================================================ */
  async function loadHistory() {
    history = await db.getAll(STORE);
    // Newest first
    history.reverse();
    renderHistory();
  }

  function renderHistory() {
    if (history.length === 0) {
      els.historyPanel.style.display = 'none';
      return;
    }
    els.historyPanel.style.display = '';
    els.historyCount.textContent = history.length;
    els.historyGrid.innerHTML = history.map((item, idx) => `
      <div class="it-history-item" data-idx="${idx}" title="${esc(item.filename)}">
        <img src="${item.dataUrl}" alt="" loading="lazy">
        <button class="it-history-item__dl" data-idx="${idx}" title="下载">💾</button>
      </div>
    `).join('');
  }

  function onHistoryClick(e) {
    const dlBtn = e.target.closest('.it-history-item__dl');
    const itemEl = e.target.closest('.it-history-item');
    if (!itemEl) return;
    const idx = parseInt(itemEl.dataset.idx);
    const item = history[idx];
    if (!item) return;

    if (dlBtn) {
      // Download from history
      e.stopPropagation();
      downloadHistoryItem(item);
      return;
    }

    // Load into preview
    setImage(item.dataUrl, item.mimeType);
  }

  function downloadHistoryItem(item) {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = item.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('✅ 已下载: ' + item.filename);
      });
    };
    img.src = item.dataUrl;
  }

  async function addToHistory(dataUrl, mimeType) {
    const ext = mimeToExt(mimeType);
    const filename = 'image_' + formatTimestamp() + '.' + ext;
    const record = { dataUrl, mimeType, filename, createdAt: Date.now() };
    await db.add(STORE, record);
    await loadHistory();
  }

  async function clearHistory() {
    if (!confirm('确定要清空所有粘贴历史吗？')) return;
    await db.clear(STORE);
    history = [];
    renderHistory();
    showToast('🗑️ 历史已清空');
  }

  /* ================================================================
   * Keyboard shortcuts
   * ================================================================ */
  function handleKeyDown(e) {
    // Ctrl+S / Ctrl+Shift+S — download
    if ((e.ctrlKey || e.metaKey) && e.key === 's' && currentImage) {
      e.preventDefault();
      downloadImage();
    }
    // Escape — clear
    if (e.key === 'Escape' && currentImage) {
      clearPreview();
    }
  }

  /* ================================================================
   * Helpers
   * ================================================================ */
  function esc(str) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(str).replace(/[&<>"']/g, c => map[c]);
  }

  /* ================================================================
   * Init
   * ================================================================ */
  async function init() {
    cacheDom();
    initTheme();

    // DB
    await db.open(DB_NAME, DB_VERSION, { [STORE]: { keyPath: 'id', autoIncrement: true, indexes: [] } });
    await loadHistory();

    // Events
    document.addEventListener('paste', handlePaste);
    document.addEventListener('keydown', handleKeyDown);
    els.pasteZone.addEventListener('click', handlePasteZoneClick);
    els.btnDownload.addEventListener('click', downloadImage);
    els.btnCopyAgain.addEventListener('click', copyToClipboard);
    els.btnClear.addEventListener('click', clearPreview);
    els.historyGrid.addEventListener('click', onHistoryClick);
    els.btnClearHistory.addEventListener('click', clearHistory);
  }

  init().catch(err => {
    console.error('万能图片 init error:', err);
  });

})();
