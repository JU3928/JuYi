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


def main():
    with sync_playwright() as p:
        browser = launch_browser(p)
        context = browser.new_context(viewport={"width": 1280, "height": 800})

        for name, path, must_have in PAGES:
            test_load(context, name, path, must_have)

        mobile_context = browser.new_context(viewport={"width": 375, "height": 667})
        for name, path in MOBILE_CHECK_PAGES:
            test_mobile_overflow(mobile_context, name, path)
        mobile_context.close()

        test_theme_toggle(context)
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
