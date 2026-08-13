# JuYi 冒烟测试

全站自动化冒烟测试：14 个页面零错误加载 + 移动端布局 + 主题切换 + 错题本重做全流程 e2e + 五子棋引擎单测与 e2e。

## 为什么存在

JuYi 是零依赖纯前端项目（双击 HTML 直接跑），历史上多次出现「改 A 模块，B 模块报 `xxx is not defined`」「移动端划不动」「初始化失败」等回归问题，全靠用户在真机上发现。本测试用一次命令把这类问题挡在提交前。

## 一次安装（仅开发机，与产品零依赖原则无关）

```bash
pip install playwright
python -m playwright install chromium   # 可选：网络慢可跳过
```

**无需安装 Chromium 也能跑**：脚本会自动回退到系统自带的 Edge（同为 Chromium 内核）。

## 运行

```bash
python tests/smoke_test.py
```

- 全部通过 → 退出码 0
- 有失败 → 打印每条 `FAIL` 详情，退出码 1

## 覆盖范围

| 检查 | 内容 |
|------|------|
| 全页面加载 | 14 个页面（主页、实验室、7 模块、4 玩具、生日页）零 console error / pageerror / 请求失败 |
| 关键元素 | 每个页面初始化后主容器存在（能抓住 `xxx is not defined` 类初始化崩溃） |
| 移动端布局 | 375px 视口下做题本/错题本/错题图鉴无横向溢出 |
| 主题切换 | 点击切换后 `html[data-theme]` 与 `localStorage.jy_theme` 同步 |
| 重做算法单测 | `modules/error-notebook/test.html` 摘要必须为「全部通过」 |
| 重做流程 e2e | 错题本内建题 → 进重做 → 自评两题 → 结束页 → 列表徽章 |
| 五子棋引擎单测 | `lab/toys/gomoku/test.html` 摘要必须为「全部通过」 |
| 五子棋 e2e | 玩家落子 → AI 回应 → 悔棋 |

**数据安全**：Playwright 每次使用全新临时浏览器配置，IndexedDB/localStorage 为空，不会触碰你本机浏览器的真实数据。

## 添加新页面 / 新检查

- 新页面：往 `PAGES` 列表加一行 `(名称, 相对路径, 加载后必须存在的选择器)`
- 新模块要过移动端检查：往 `MOBILE_CHECK_PAGES` 加一行
- 更深的交互流程（建做题本 → 答题 → 核对）后续版本补充，见 `smoke_test.py` 顶部注释

## 已知限制

- 只测「空库首次加载」路径，不测有历史数据时的迁移/兼容
- 尚未覆盖其他模块的 CRUD 交互流程（错题本重做流程已有 e2e）
