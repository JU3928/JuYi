# 错题重做模式 设计规格（2026-08-13）

状态：已与用户逐项对齐并批准（"开干"）。实现于 `modules/error-notebook/`。

## 需求来源

用户从功能建议清单中选定「错题重做 / 抽题刷题」，经 brainstorming 四问对齐：

1. 数据来源：**只做错题本**
2. 位置：**错题本内新功能**（不新建模块）
3. 抽取规则：**智能优先抽弱题**（轻量艾宾浩斯）
4. 自评记录：**记掌握度 + 重做历史，卡片显示重做徽章**

## 数据模型

`errorNotebook` 表新增可选字段（`_migrateData` 补默认值，不升 DB 版本）：

| 字段 | 类型 | 默认 |
|---|---|---|
| `redoMastery` | `null` \| `'mastered'` \| `'fuzzy'` \| `'failed'` | `null` |
| `redoCount` | number | `0` |
| `lastRedoAt` | timestamp | `0` |

localStorage 断点键：`jy_error_notebook_redo_state`（匹配备份前缀 `jy_error_notebook_`）。

## 交互流程

```
侧边栏/工具栏「🎲 重做」按钮
  → 设置面板：抽题数 N（默认10）、科目多选（默认全部）、
     只抽弱题（默认开）、难题范围（不限/仅难题/仅普通）
     [有上次中断记录时先提示「继续上次重做？继续/重新开始」]
  → 智能抽取队列（redo-queue.js 纯函数）
  → 一次一题卡片：完整题目内容 + ✅掌握 / 🤔模糊 / ❌未掌握 / ⏭跳过 / 💡查看解析（复用 answerOverlay）
  → 结束页：本次统计（掌握 x · 模糊 y · 未掌握 z · 跳过 k）
     + 弱题清单（未掌握+模糊，点击打开详情弹窗）
```

自评写入：`redoMastery=level, redoCount+1, lastRedoAt=now`；跳过不写任何字段。
中途退出：剩余队列存 localStorage，下次进入可续做；「退出重做」按钮确认后丢弃进度。

## 抽取算法（redo-queue.js，纯函数可测试）

优先级分组：从未重做过 > 上次未掌握 > 上次模糊 > 上次掌握；同组按 `lastRedoAt` 升序（最久未做优先）。
`weakOnly=true`：排除「掌握」组（不足 N 不补位）；`weakOnly=false`：全池按优先级取前 N。
`redoCount>0` 但 `redoMastery` 为 null 的历史边缘数据归入「从未重做」组。

## 展示

- 卡片徽章（与 🔄 复习徽章并列）：`🎲 重2 · 未掌握` 等，仅在 `redoCount>0` 时显示
- 详情弹窗 meta 行补一条：最近重做结果

## 验证清单

- [ ] `error-notebook/test.html` 算法单测全绿（TDD：先红后绿）
- [ ] `tests/smoke_test.py` 新增：重做流程 e2e + 单测页检查
- [ ] 老数据迁移验证（无新字段记录正常显示）
- [ ] 手机竖屏过一遍流程
