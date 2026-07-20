/**
 * JuYi — 共享工具函数
 * ======================
 * HTML 净化、转义等通用安全工具。
 *
 * 零依赖，纯浏览器原生 API。
 *
 * @module utils
 * @version 1.0.0
 */

/**
 * 使用 DOM 白名单机制净化 HTML，移除危险标签/属性。
 * 用于在 innerHTML 赋值前清理用户提交的富文本。
 *
 * @param {string} html - 原始 HTML 字符串
 * @returns {string} 净化后的安全 HTML
 */
function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return '';

  // 用 DOMParser 解析为 DOM 树
  var doc;
  try {
    doc = new DOMParser().parseFromString(html, 'text/html');
  } catch (_) {
    return '';
  }

  // 白名单：允许的标签
  var TAG = {
    p:1, br:1, b:1, strong:1, i:1, em:1, u:1, s:1, del:1, ins:1,
    ul:1, ol:1, li:1, span:1, div:1,
    h1:1, h2:1, h3:1, h4:1, h5:1, h6:1,
    blockquote:1, pre:1, code:1, sub:1, sup:1, hr:1, wbr:1,
    a:1, img:1, table:1, thead:1, tbody:1, tr:1, th:1, td:1,
    dl:1, dt:1, dd:1, abbr:1, cite:1, q:1, small:1, mark:1,
  };

  // 白名单：允许的属性（不含 on* 事件处理器）
  var ATTR = {
    href:1, target:1, rel:1, title:1, alt:1,
    src:1, width:1, height:1, loading:1,
    class:1, style:1, dir:1, lang:1,
    colspan:1, rowspan:1, scope:1, // table
    start:1, type:1,               // ol
  };

  walk(doc.body);

  return doc.body.innerHTML;

  function walk(node) {
    if (!node) return;
    // 处理子节点（倒序，因为可能会移除节点）
    var child = node.firstChild;
    while (child) {
      var next = child.nextSibling;
      walk(child);
      child = next;
    }
    // 元素节点：检查标签和属性
    if (node.nodeType === 1) {
      var tagName = (node.tagName || '').toLowerCase();
      if (!TAG[tagName]) {
        // 不被允许的标签：unwrap（用子节点替换）
        unwrap(node);
        return;
      }
      // 清理属性
      var attrs = node.getAttributeNames ? node.getAttributeNames() : [];
      for (var i = 0; i < attrs.length; i++) {
        var a = attrs[i];
        var la = a.toLowerCase();
        // 移除事件处理器和不在白名单中的属性
        if (la.indexOf('on') === 0 || !ATTR[la]) {
          node.removeAttribute(a);
        }
      }
      // 校验特殊属性
      if (tagName === 'a' && node.hasAttribute('href')) {
        var href = node.getAttribute('href').trim();
        if (/^javascript:/i.test(href) || /^data:text\/html/i.test(href)) {
          node.removeAttribute('href');
        }
      }
      if (tagName === 'img' && node.hasAttribute('src')) {
        var src = node.getAttribute('src').trim();
        // 只允许 data: 和 http(s): 协议
        if (!/^(data:|https?:)/i.test(src)) {
          node.removeAttribute('src');
        }
      }
    } else if (node.nodeType === 8) {
      // 移除 HTML 注释（可能含条件注释等）
      node.parentNode && node.parentNode.removeChild(node);
    }
  }

  function unwrap(el) {
    var parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) {
      parent.insertBefore(el.firstChild, el);
    }
    parent.removeChild(el);
  }
}

/**
 * HTML 文本转义 — 用于将纯文本安全插入 HTML。
 * 使用 DOM textContent 赋值（最安全的转义方式）。
 *
 * @param {string} str
 * @returns {string}
 */
function esc(str) {
  if (!str) return '';
  var d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/**
 * HTML 属性值转义 — 防引号闭合。
 *
 * @param {string} str
 * @returns {string}
 */
function escAttr(str) {
  if (!str) return '';
  return String(str).replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * 从 HTML 中提取纯文本（用于摘要/搜索）。
 *
 * @param {string} html
 * @returns {string}
 */
function stripHtml(html) {
  if (!html) return '';
  // 先用净化器确保安全，再提取文本
  var safe = sanitizeHtml(html);
  var d = document.createElement('div');
  d.innerHTML = safe;
  // 将图片替换为占位符
  var imgs = d.querySelectorAll('img');
  for (var i = 0; i < imgs.length; i++) {
    imgs[i].replaceWith(' [图片] ');
  }
  return (d.textContent || '').trim();
}
