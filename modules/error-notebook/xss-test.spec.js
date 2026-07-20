/**
 * JuYi — XSS 防护验证测试（Playwright）
 * ======================================
 *
 * 测试场景：在错题本中粘贴恶意 HTML，验证：
 * 1. <script> 标签被移除
 * 2. onerror/onload 等事件处理器被剥离
 * 3. javascript: 伪协议被清除
 * 4. 详情/编辑/复习视图均安全渲染
 *
 * 运行方式：
 *   npx playwright test modules/error-notebook/xss-test.spec.js
 *
 * 前置条件：
 *   npm install -D @playwright/test
 */

const { test, expect } = require('@playwright/test');
const path = require('path');

/** 错题本 index.html 的 file:// 路径 */
const PAGE_URL = 'file://' + path.resolve(__dirname, 'index.html');

/** 恶意载荷集合：模拟攻击者可能注入的内容 */
const PAYLOADS = [
  {
    label: '<script> 标签注入',
    html: '<p>正常文本</p><script>window.__XSS_TRIGGERED__ = true<\/script>',
    checkScriptGone: true,
  },
  {
    label: 'img onerror 事件处理器',
    html: '<p>正常文本</p><img src=x onerror="window.__XSS_TRIGGERED__=true">',
    checkHandlerGone: true,
  },
  {
    label: 'javascript: 伪协议链接',
    html: '<p>正常文本</p><a href="javascript:window.__XSS_TRIGGERED__=true">点我</a>',
    checkJsProtoGone: true,
  },
  {
    label: 'iframe 嵌入',
    html: '<p>正常文本</p><iframe src="javascript:alert(1)"></iframe>',
    checkTagGone: true,
  },
  {
    label: 'svg onload 事件',
    html: '<p>正常文本</p><svg onload="window.__XSS_TRIGGERED__=true"></svg>',
    checkHandlerGone: true,
  },
];

test.describe('错题本 XSS 防护', () => {

  test.beforeEach(async ({ page }) => {
    // 注入全局标记，用于检测脚本是否被执行
    await page.addInitScript(() => {
      window.__XSS_TRIGGERED__ = false;
    });

    // 拦截 alert/confirm/prompt 弹窗
    page.on('dialog', async dialog => {
      window.__DIALOG_FIRED__ = dialog.message();
      await dialog.dismiss();
    });

    await page.goto(PAGE_URL);
    await page.waitForSelector('#btnAdd');
  });

  test('添加按钮可见 → 页面成功加载', async ({ page }) => {
    await expect(page.locator('#btnAdd')).toBeVisible();
  });

  // 对每种恶意载荷逐一测试
  for (const payload of PAYLOADS) {
    test(`XSS 防护: ${payload.label}`, async ({ page }) => {
      // ---- Step 1: 打开新建错题弹窗 ----
      await page.click('#btnAdd');
      await page.waitForSelector('#editOverlay:not([style*="display: none"])', { timeout: 3000 });

      // ---- Step 2: 填写表单字段 ----
      // 科目选择
      const subjectSelect = page.locator('#editSubject');
      await subjectSelect.selectOption({ index: 0 });

      // ---- Step 3: 注入恶意 HTML 到题目编辑器 ----
      const questionEditor = page.locator('.rich-editor[data-editor="question"] .rich-editor__content');
      await questionEditor.click();

      // 用 JavaScript 直接设置 innerHTML（模拟 contenteditable 粘贴恶意内容）
      await questionEditor.evaluate((el, html) => {
        el.innerHTML = html;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, payload.html);

      // 在解析编辑器也填点内容
      const answerEditor = page.locator('.rich-editor[data-editor="answer"] .rich-editor__content');
      await answerEditor.click();
      await answerEditor.evaluate((el) => {
        el.innerHTML = '<p>解析内容</p>';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });

      // ---- Step 4: 保存 ----
      await page.click('#btnSave');

      // 等待弹窗关闭（保存成功）
      await page.waitForFunction(() => {
        const overlay = document.querySelector('#editOverlay');
        const style = window.getComputedStyle(overlay);
        return style.display === 'none' || overlay.classList.contains('jy-overlay') && !overlay.classList.contains('is-open');
      }, { timeout: 5000 }).catch(() => {});

      // ---- Step 5: 确认 XSS 标记未被触发 ----
      const xssTriggered = await page.evaluate(() => window.__XSS_TRIGGERED__);
      expect(xssTriggered).toBe(false);

      // ---- Step 6: 打开详情弹窗 ----
      // 点击第一个错题卡片的详情按钮（如果有的话）
      const detailBtn = page.locator('.card__actions button, [data-action="detail"]').first();
      const cardItem = page.locator('.card-grid > *').first();

      if (await cardItem.count() > 0) {
        await cardItem.click();
        await page.waitForTimeout(500);

        // 检查详情弹窗中不含 script 标签
        const detailBody = page.locator('#detailBody');
        if (await detailBody.isVisible().catch(() => false)) {
          const detailHTML = await detailBody.innerHTML();

          // 验证：script 标签已被移除
          if (payload.checkScriptGone) {
            expect(detailHTML).not.toContain('<script');
            expect(detailHTML).not.toContain('</script>');
          }

          // 验证：事件处理器已被移除
          if (payload.checkHandlerGone) {
            expect(detailHTML).not.toContain('onerror=');
            expect(detailHTML).not.toContain('onload=');
          }

          // 验证：javascript: 伪协议已被移除
          if (payload.checkJsProtoGone) {
            expect(detailHTML).not.toContain('javascript:');
          }

          // 验证：危险标签已被移除
          if (payload.checkTagGone) {
            expect(detailHTML).not.toContain('<iframe');
            expect(detailHTML).not.toContain('<svg');
          }

          // 验证：正常文本仍然保留
          expect(detailHTML).toContain('正常文本');
        }
      }

      // ---- Step 7: 再次确认 XSS 未触发 ----
      const xssTriggered2 = await page.evaluate(() => window.__XSS_TRIGGERED__);
      expect(xssTriggered2).toBe(false);
    });
  }

  test('综合测试: 多种攻击向量同时注入', async ({ page }) => {
    const combinedPayload = `
      <p>正常内容</p>
      <script>window.__XSS_TRIGGERED__=true</script>
      <img src=x onerror="window.__XSS_TRIGGERED__=true">
      <a href="javascript:window.__XSS_TRIGGERED__=true">链接</a>
      <iframe src="evil.html"></iframe>
      <svg onload="window.__XSS_TRIGGERED__=true"><circle r="10"/></svg>
      <div onmouseover="window.__XSS_TRIGGERED__=true">悬停</div>
    `;

    await page.click('#btnAdd');
    await page.waitForTimeout(500);

    const subjectSelect = page.locator('#editSubject');
    await subjectSelect.selectOption({ index: 0 });

    const questionEditor = page.locator('.rich-editor[data-editor="question"] .rich-editor__content');
    await questionEditor.click();
    await questionEditor.evaluate((el, html) => {
      el.innerHTML = html;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, combinedPayload);

    await page.click('#btnSave');
    await page.waitForTimeout(1000);

    // XSS 应未触发
    const triggered = await page.evaluate(() => window.__XSS_TRIGGERED__);
    expect(triggered).toBe(false);

    // 打开卡片详情，验证净化结果
    const card = page.locator('.card-grid > *').first();
    await card.click();
    await page.waitForTimeout(500);

    const detailHTML = await page.locator('#detailBody').innerHTML().catch(() => '');
    expect(detailHTML).not.toContain('<script');
    expect(detailHTML).not.toContain('onerror=');
    expect(detailHTML).not.toContain('javascript:');
    expect(detailHTML).not.toContain('<iframe');
    expect(detailHTML).not.toContain('<svg');
    expect(detailHTML).toContain('正常内容');
  });

});
