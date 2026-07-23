/**
 * Minimal XMind file parser
 * ==========================
 * XMind (.xmind) files are ZIP archives containing content.json or content.xml.
 * This parser extracts the topic tree without external dependencies.
 */

var XMindParser = (function () {
  'use strict';

  /** Read a little-endian 32-bit unsigned integer at position `pos` in `buf` */
  function readU32(buf, pos) {
    return (buf[pos] | (buf[pos + 1] << 8) | (buf[pos + 2] << 16) | (buf[pos + 3] << 24)) >>> 0;
  }

  /** Read a little-endian 16-bit unsigned integer */
  function readU16(buf, pos) {
    return (buf[pos] | (buf[pos + 1] << 8)) >>> 0;
  }

  /** Find the End of Central Directory record signature in a Uint8Array */
  function findEOCD(buf) {
    for (var i = buf.length - 22; i >= 0; i--) {
      if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Parse a ZIP buffer, return a map of filename → Uint8Array.
   * Only extracts files needed for XMind parsing (content.json, content.xml).
   */
  function unzipSelected(buf) {
    var eocd = findEOCD(buf);
    if (eocd < 0) return null;

    var cdOffset = readU32(buf, eocd + 16);
    var cdSize = readU32(buf, eocd + 12);
    var cdEntries = readU16(buf, eocd + 10);

    var files = {};
    var pos = cdOffset;
    var MAX = Math.min(cdOffset + cdSize, buf.length);

    for (var i = 0; i < cdEntries && pos + 46 < MAX; i++) {
      if (buf[pos] !== 0x50 || buf[pos + 1] !== 0x4b) break;
      var fnLen = readU16(buf, pos + 28);
      var extraLen = readU16(buf, pos + 30);
      var commentLen = readU16(buf, pos + 32);
      var localOffset = readU32(buf, pos + 42);

      var name = '';
      for (var j = 0; j < fnLen; j++) name += String.fromCharCode(buf[pos + 46 + j]);

      // Extract only content files
      var contentMatch = name.match(/(?:^|\/)content\.(json|xml)$/i);
      if (contentMatch) {
        var lp = localOffset;
        if (lp + 30 >= buf.length) { pos += 46 + fnLen + extraLen + commentLen; continue; }
        var lfnLen = readU16(buf, lp + 26);
        var lExtraLen = readU16(buf, lp + 28);
        var dataOffset = lp + 30 + lfnLen + lExtraLen;
        var compSize = readU32(buf, pos + 20);
        var uncompSize = readU32(buf, pos + 24);
        var method = readU16(buf, pos + 10);

        var data;
        if (method === 0) {
          // Stored (no compression)
          data = buf.slice(dataOffset, dataOffset + uncompSize);
        } else if (method === 8) {
          // Deflate — use browser's DecompressionStream
          data = null; // Will handle inline
        } else {
          pos += 46 + fnLen + extraLen + commentLen;
          continue;
        }

        if (data) {
          var text = '';
          for (var k = 0; k < data.length && k < 500000; k++) text += String.fromCharCode(data[k]);
          files[name] = { text: text, format: contentMatch[1] };
        }
      }

      pos += 46 + fnLen + extraLen + commentLen;
    }

    return files;
  }

  /**
   * Use DecompressionStream for deflate-compressed entries.
   */
  async function unzipWithDecompress(buf) {
    var eocd = findEOCD(buf);
    if (eocd < 0) return null;

    var cdOffset = readU32(buf, eocd + 16);
    var cdSize = readU32(buf, eocd + 12);
    var cdEntries = readU16(buf, eocd + 10);

    var entries = [];
    var pos = cdOffset;

    for (var i = 0; i < cdEntries && pos + 46 < buf.length; i++) {
      var fnLen = readU16(buf, pos + 28);
      var extraLen = readU16(buf, pos + 30);
      var commentLen = readU16(buf, pos + 32);
      var localOffset = readU32(buf, pos + 42);

      var name = '';
      for (var j = 0; j < fnLen; j++) name += String.fromCharCode(buf[pos + 46 + j]);

      var contentMatch = name.match(/(?:^|\/)content\.(json|xml)$/i);
      if (contentMatch) {
        var lp = localOffset;
        var lfnLen = readU16(buf, lp + 26);
        var lExtraLen = readU16(buf, lp + 28);
        var dataOffset = lp + 30 + lfnLen + lExtraLen;
        var compSize = readU32(buf, pos + 20);
        var method = readU16(buf, pos + 10);

        entries.push({
          format: contentMatch[1],
          offset: dataOffset,
          size: compSize,
          method: method
        });
      }

      pos += 46 + fnLen + extraLen + commentLen;
    }

    var results = {};
    for (var ei = 0; ei < entries.length; ei++) {
      var e = entries[ei];
      var chunk = buf.slice(e.offset, e.offset + e.size);
      var decompressed;
      try {
        if (e.method === 0) {
          var text = '';
          for (var ci = 0; ci < chunk.length && ci < 500000; ci++) text += String.fromCharCode(chunk[ci]);
          decompressed = text;
        } else if (typeof DecompressionStream !== 'undefined') {
          var ds = new DecompressionStream('deflate');
          var writer = ds.writable.getWriter();
          writer.write(chunk);
          writer.close();
          var reader = ds.readable.getReader();
          var chunks = [];
          while (true) {
            var result = await reader.read();
            if (result.done) break;
            chunks.push(result.value);
          }
          var totalLen = 0;
          for (var ci2 = 0; ci2 < chunks.length; ci2++) totalLen += chunks[ci2].length;
          var merged = new Uint8Array(totalLen);
          var offset2 = 0;
          for (var ci3 = 0; ci3 < chunks.length; ci3++) {
            merged.set(chunks[ci3], offset2);
            offset2 += chunks[ci3].length;
          }
          var text2 = '';
          for (var ci4 = 0; ci4 < merged.length && ci4 < 500000; ci4++) text2 += String.fromCharCode(merged[ci4]);
          decompressed = text2;
        } else {
          continue;
        }
        if (decompressed) results[e.format] = decompressed;
      } catch (err) { /* skip failed entry */ }
    }
    return results;
  }

  /** Recursively walk JSON topic tree, returning a flat text outline */
  function flattenJSONTopic(topic, depth, lines) {
    if (!topic) return;
    var indent = '';
    for (var i = 0; i < depth; i++) indent += '  ';
    var title = topic.title || '';
    lines.push(indent + '• ' + title);
    var children = topic.children;
    if (children && children.attached) {
      for (var j = 0; j < children.attached.length; j++) {
        flattenJSONTopic(children.attached[j], depth + 1, lines);
      }
    }
  }

  /** Recursively walk XML topic tree */
  function flattenXMLTopic(el, depth, lines) {
    if (!el) return;
    var indent = '';
    for (var i = 0; i < depth; i++) indent += '  ';
    var title = '';
    var children = el.querySelector(':scope > title');
    if (children) title = (children.textContent || '').trim();
    lines.push(indent + '• ' + title);
    var attached = el.querySelector(':scope > children > topics[type="attached"]');
    if (attached) {
      var topicEls = attached.querySelectorAll(':scope > topic');
      for (var j = 0; j < topicEls.length; j++) {
        flattenXMLTopic(topicEls[j], depth + 1, lines);
      }
    }
  }

  /**
   * Main entry: parse an XMind ArrayBuffer and return { title, outline, html }.
   * @param {ArrayBuffer} buffer
   * @returns {Promise<{title:string, outline:string, html:string}|null>}
   */
  async function parse(buffer) {
    var buf = new Uint8Array(buffer);

    // Try stored (no compression) first
    var files = unzipSelected(buf);

    // If no content file found, try with decompression
    if (!files || Object.keys(files).length === 0) {
      var results = await unzipWithDecompress(buf);
      if (!results || Object.keys(results).length === 0) return null;
      files = {};
      var keys = Object.keys(results);
      for (var ki = 0; ki < keys.length; ki++) {
        files[keys[ki]] = { text: results[keys[ki]], format: keys[ki] };
      }
    }

    if (!files || Object.keys(files).length === 0) return null;

    var lines = [];
    var rootTitle = '思维导图';

    // Prefer JSON format
    var jsonFile = files['content.json'];
    if (jsonFile) {
      try {
        var root = JSON.parse(jsonFile.text);
        if (root && root.length > 0 && root[0].rootTopic) {
          rootTitle = root[0].rootTopic.title || rootTitle;
          flattenJSONTopic(root[0].rootTopic, 0, lines);
        } else if (root && root.rootTopic) {
          rootTitle = root.rootTopic.title || rootTitle;
          flattenJSONTopic(root.rootTopic, 0, lines);
        }
      } catch (e) { /* fall through to XML */ }
    }

    // Fall back to XML format
    if (lines.length === 0) {
      var xmlFile = files['content.xml'];
      if (xmlFile) {
        try {
          var parser = new DOMParser();
          var doc = parser.parseFromString(xmlFile.text, 'text/xml');
          var sheets = doc.querySelectorAll('sheet');
          for (var si = 0; si < sheets.length; si++) {
            var rootTopic = sheets[si].querySelector(':scope > topic');
            if (rootTopic) {
              rootTitle = (rootTopic.querySelector(':scope > title') || {}).textContent || rootTitle;
              flattenXMLTopic(rootTopic, 0, lines);
            }
          }
        } catch (e2) { /* ignore */ }
      }
    }

    if (lines.length === 0) return null;

    return {
      title: rootTitle,
      outline: lines.join('\n'),
      html: '<div class="xmind-tree">' +
        '<h3 style="margin:0 0 0.5rem">🧠 ' + esc(rootTitle) + '</h3>' +
        '<pre class="xmind-outline">' + esc(lines.join('\n')) + '</pre>' +
        '</div>'
    };
  }

  return { parse: parse };
})();
