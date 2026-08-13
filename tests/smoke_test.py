#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
JuYi 冒烟测试 — 全部页面零错误加载 + 基础交互验证

用法:
    pip install playwright
    python -m playwright install chromium
    python tests/smoke_test.py

说明:
    零依赖原则只约束产品代码；本测试是开发侧基础设施（Python + Playwright）。
    每次测试使用全新的浏览器临时配置，IndexedDB/localStorage 均为空，
    不会触碰你本机浏览器里的真实数据。
"""

import os
import sys

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (名称, 相对路径, 加载后必须存在的元素)
PAGES = [
    ("主页",         "index.html",                          "h1.hub__title"),
    ("实验室",       "lab/index.html",                      ".lab-hub__title"),
    ("错题本",       "modules/error-notebook/index.html",   "#app"),
    ("错题图鉴",     "modules/error-book/index.html",       ".eb-app"),
    ("拾贝",         "modules/shell/index.html",            ".app-layout"),
    ("健身",         "modules/fitness/index.html",          "#app"),
    ("做题本",       "modules/question-book/index.html",    "#app"),
    ("战报板",       "modules/battle-report/index.html",    "#br-app"),
    ("计划表",       "modules/schedule/index.html",         ".app-layout"),
    ("万能图片",     "lab/toys/image-tools/index.html",     "body"),
    ("网页助手",     "lab/toys/web-assistant/index.html",   "body"),
    ("抽奖器",       "lab/toys/moment-lottery/index.html",  "body"),
    ("生日页",       "birthday/index.html",                 "#hero"),
]

# 移动端布局检查的页面（窄视口下不允许横向溢出）
MOBILE_CHECK_PAGES = [
    ("做题本",   "modules/question-book/index.html"),
    ("错题本",   "modules/error-notebook/index.html"),
    ("错题图鉴", "modules/error-book/index.html"),
]

FAILURES = []
PASSES = []


def file_url(path):
    return "file:///" + os.path.join(ROOT, path).replace("\\", "/")


def collect_errors(page):
    """挂上错误监听器，返回 (errors, failed_requests) 列表。"""
    errors, failed = [], []
    page.on("console", lambda m: errors.append("[console.%s] %s" % (m.type, m.text))
            if m.type in ("error",) else None)
    page.on("pageerror", lambda e: errors.append("[pageerror] %s" % e))
    page.on("requestfailed", lambda r: failed.append("[requestfailed] %s (%s)" % (r.url, r.failure)))
    return errors, failed


def test_load(context, name, path, must_have):
    page = context.new_page()
    errors, failed = collect_errors(page)
    page.goto(file_url(path))
    page.wait_for_load_state("load")
    page.wait_for_timeout(2500)  # 等 IndexedDB 等异步初始化完成
    ok = True
    if page.query_selector(must_have) is None:
        FAILURES.append("[%s] 关键元素不存在: %s" % (name, must_have))
        ok = False
    for e in errors:
        FAILURES.append("[%s] %s" % (name, e))
        ok = False
    for f in failed:
        FAILURES.append("[%s] %s" % (name, f))
        ok = False
    if ok:
        PASSES.append("%s 加载零错误" % name)
    page.close()


def test_mobile_overflow(context, name, path):
    page = context.new_page()
    errors, failed = collect_errors(page)
    page.goto(file_url(path))
    page.wait_for_load_state("load")
    page.wait_for_timeout(2000)
    overflow = page.evaluate(
        "document.scrollingElement.scrollWidth - window.innerWidth"
    )
    if overflow > 0:
        FAILURES.append("[%s] 移动端横向溢出 %dpx" % (name, overflow))
    else:
        PASSES.append("%s 移动端无横向溢出" % name)
    for e in errors:
        FAILURES.append("[%s] %s" % (name, e))
    for f in failed:
        FAILURES.append("[%s] %s" % (name, f))
    page.close()


def test_theme_toggle(context):
    page = context.new_page()
    collect_errors(page)
    page.goto(file_url("index.html"))
    page.wait_for_load_state("load")
    page.click("#themeToggle")
    theme = page.evaluate("document.documentElement.getAttribute('data-theme')")
    stored = page.evaluate("localStorage.getItem('jy_theme')")
    if theme == "dark" and stored == "dark":
        PASSES.append("主题切换正常 (dark 已写入 localStorage)")
    else:
        FAILURES.append("主题切换异常: data-theme=%r, jy_theme=%r" % (theme, stored))
    page.close()


def launch_browser(p):
    """优先用 Playwright 自带 Chromium，缺失时回退到系统 Edge（同为 Chromium 内核）。"""
    try:
        return p.chromium.launch(headless=True)
    except Exception as e:
        print("  [info] 自带 Chromium 不可用 (%s)，回退到系统 Edge" % type(e).__name__)
        return p.chromium.launch(channel="msedge", headless=True)


def test_redo_unit(context):
    """错题本重做队列算法单测页（test.html）必须全绿。"""
    page = context.new_page()
    errors, failed = collect_errors(page)
    page.goto(file_url("modules/error-notebook/test.html"))
    page.wait_for_load_state("load")
    page.wait_for_timeout(500)
    summary = page.locator("#summary").inner_text()
    if "全部通过" not in summary:
        FAILURES.append("[重做算法单测] " + summary)
    else:
        PASSES.append("重做算法单测全部通过")
    for e in errors:
        FAILURES.append("[重做算法单测] " + e)
    page.close()


def test_redo_flow(context):
    """重做模式 e2e：建题 → 进重做 → 自评两题 → 结束页 → 列表徽章。"""
    page = context.new_page()
    errors, failed = collect_errors(page)
    page.goto(file_url("modules/error-notebook/index.html"))
    page.wait_for_load_state("load")
    page.wait_for_timeout(2000)

    for text in ["测试题一：1+1=?", "测试题二：2+2=?"]:
        page.click("#btnAdd")
        page.wait_for_timeout(300)
        page.locator('.rich-editor[data-editor="question"] .rich-editor__content').fill(text)
        page.click("#btnSave")
        page.wait_for_timeout(600)

    page.click("#btnStartRedo")
    page.wait_for_timeout(300)
    if not page.locator("#redoSetupOverlay").is_visible():
        FAILURES.append("[重做流程] 设置弹窗未打开")
        page.close()
        return
    page.click("#btnRedoStart")
    page.wait_for_timeout(500)
    if not page.locator("#redoMode").is_visible():
        FAILURES.append("[重做流程] 重做模式未进入")
        page.close()
        return

    page.click("#btnRedoMastered")  # 第 1 题：掌握
    page.wait_for_timeout(400)
    page.click("#btnRedoFailed")    # 第 2 题：未掌握
    page.wait_for_timeout(400)

    if not page.locator("#redoEndScreen").is_visible():
        FAILURES.append("[重做流程] 结束页未显示")
    if "未掌握" not in page.locator("#redoEndScreen").inner_text():
        FAILURES.append("[重做流程] 结束页缺少弱题统计")
    page.click("#btnRedoFinish")
    page.wait_for_timeout(800)

    body = page.inner_text("body")
    if "🎲" not in body:
        FAILURES.append("[重做流程] 列表未显示重做徽章")
    else:
        PASSES.append("重做流程 e2e 通过（建题→重做→自评→结束页→徽章）")
    for e in errors:
        FAILURES.append("[重做流程] " + e)
    page.close()


def test_redo_migration(context):
    """老数据迁移：无 redo 字段的旧题 → 加载补字段 → 能进重做队列。"""
    page = context.new_page()
    errors, failed = collect_errors(page)
    page.goto(file_url("modules/error-notebook/index.html"))
    page.wait_for_load_state("load")
    page.wait_for_timeout(2000)

    page.click("#btnAdd")
    page.wait_for_timeout(300)
    page.locator('.rich-editor[data-editor="question"] .rich-editor__content').fill("老数据迁移测试题")
    page.click("#btnSave")
    page.wait_for_timeout(600)

    # 直接在 IndexedDB 里删掉重做字段，模拟升级前的旧数据
    page.evaluate("""async () => {
        const req = indexedDB.open('JuYiDB');
        const db = await new Promise((res, rej) => {
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
        });
        const tx = db.transaction('errorNotebook', 'readwrite');
        const store = tx.objectStore('errorNotebook');
        const all = await new Promise((res, rej) => {
            const r = store.getAll();
            r.onsuccess = () => res(r.result);
            r.onerror = () => rej(r.error);
        });
        for (const item of all) {
            delete item.redoMastery;
            delete item.redoCount;
            delete item.lastRedoAt;
            store.put(item);
        }
        await new Promise(res => { tx.oncomplete = res; });
    }""")

    page.reload()
    page.wait_for_load_state("load")
    page.wait_for_timeout(2000)
    if "老数据迁移测试题" not in page.inner_text("body"):
        FAILURES.append("[重做迁移] 老数据未正常加载")
        page.close()
        return

    page.click("#btnStartRedo")
    page.wait_for_timeout(300)
    page.click("#btnRedoStart")
    page.wait_for_timeout(500)
    if not page.locator("#redoMode").is_visible():
        FAILURES.append("[重做迁移] 老数据未能进入重做")
    else:
        PASSES.append("重做老数据迁移正常（补字段 + 可入队）")
    for e in errors:
        FAILURES.append("[重做迁移] " + e)
    page.close()


def test_redo_mobile(context):
    """手机竖屏（375px）过一遍重做全流程。"""
    page = context.new_page()
    errors, failed = collect_errors(page)
    try:
        page.goto(file_url("modules/error-notebook/index.html"))
        page.wait_for_load_state("load")
        page.wait_for_timeout(2000)
        page.click("#btnAdd")
        page.wait_for_timeout(300)
        page.locator('.rich-editor[data-editor="question"] .rich-editor__content').fill("手机竖屏重做测试题")
        page.click("#btnSave")
        page.wait_for_timeout(600)
        page.click("#btnStartRedo")
        page.wait_for_timeout(300)
        page.click("#btnRedoStart")
        page.wait_for_timeout(500)
        page.click("#btnRedoMastered")
        page.wait_for_timeout(400)
        if not page.locator("#redoEndScreen").is_visible():
            FAILURES.append("[重做移动端] 结束页未显示")
        else:
            PASSES.append("重做流程手机竖屏（375px）通过")
    except Exception as e:
        FAILURES.append("[重做移动端] 流程中断: %s" % e)
    for e in errors:
        FAILURES.append("[重做移动端] " + e)
    page.close()


def main():
    with sync_playwright() as p:
        browser = launch_browser(p)
        context = browser.new_context(viewport={"width": 1280, "height": 800})

        for name, path, must_have in PAGES:
            test_load(context, name, path, must_have)

        mobile_context = browser.new_context(viewport={"width": 375, "height": 667})
        for name, path in MOBILE_CHECK_PAGES:
            test_mobile_overflow(mobile_context, name, path)
        test_redo_mobile(mobile_context)
        mobile_context.close()

        test_theme_toggle(context)
        test_redo_unit(context)
        test_redo_flow(context)
        test_redo_migration(context)
        browser.close()

    print("=" * 60)
    for s in PASSES:
        print("  PASS  " + s)
    if FAILURES:
        print("-" * 60)
        for s in FAILURES:
            print("  FAIL  " + s)
        print("=" * 60)
        print("%d 个失败" % len(FAILURES))
        sys.exit(1)
    print("=" * 60)
    print("全部通过：%d 项检查" % len(PASSES))


if __name__ == "__main__":
    if sys.platform == "win32":
        sys.stdout.reconfigure(encoding="utf-8")
    main()
