# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

JuYi is a **frontend-first** personal toolbox. Every module is a self-contained HTML/CSS/JS file set that runs by double-clicking its `index.html` — no server, no build step, no npm, fully offline-capable. An **optional cloud sync layer** (`sync/`, Cloudflare Worker + KV) provides multi-device sync; the core product never requires it.

**Key constraints**:
- **Frontend stays zero-framework**: no third-party libraries, frameworks, CDN resources, or npm packages in product frontend code. All UI logic is vanilla JS using browser-native APIs (Canvas, IndexedDB, DOM, fetch).
- **Backend is allowed but optional & minimal**: infrastructure may only be added under `sync/` (or clearly marked), must be optional for every module, and must keep the double-click/offline experience intact.
- Every module still works standalone with no network.

---

## How to Run

```
# Any module — just open its HTML file:
open modules/error-notebook/index.html

# Root homepage (module navigation):
open index.html

# Lab second homepage:
open lab/index.html
```

GitHub Pages deploys from `master` branch root: `https://ju3928.github.io/JuYi/`

---

## Architecture

### Shared layer (`shared/`)

- **`base.css`** — Design system. Defines all CSS custom properties (`--jy-*`) on `:root`: colors, spacing (8px-based), typography (6-level scale), shadows, radii. Also provides reusable component classes: `.jy-btn` (variants: `--primary`, `--danger`, `--ghost`, `--outline`, sizes `--sm`/`--lg`/`--icon`), `.jy-input`, `.jy-select`, `.jy-modal`/`.jy-overlay`, `.jy-empty`, `.jy-form-group`. **Every module must `<link>` this file.**
- **`db-core.js`** — Generic IndexedDB async wrapper (`JuYiDB` class). Despite existing, most modules inline their own minimal `DB` class (historical convention). Use whichever the module already uses; don't migrate unless the module is being rewritten.

### Module pattern (`modules/<name>/`)

Every module follows the same self-contained structure:

```
modules/<name>/
├── index.html    # Entry point, links ../../shared/base.css + local styles.css
├── styles.css    # Module-specific styles, must support [data-theme="dark"]
├── app.js        # All logic, wrapped in ;(function(){ 'use strict'; ... })();
└── (optional README.md, test.html)
```

**Module conventions:**
- Each module has its own **independent IndexedDB** (e.g., `JuYiDB`, `JuYiShell`, `JuYiQuestionBook`). No shared data across modules.
- CSS uses project variables exclusively (`var(--jy-*)`), never hardcoded colors.
- Dark mode: toggle `<html data-theme="dark">`, stored in `localStorage.jy_theme`. All styles must have `[data-theme="dark"]` overrides where needed.
- `<link rel="stylesheet" href="../../shared/base.css">` — path depth matters (3 levels from root modules, 4 from lab/toys/...).
- Export/import pattern: each module provides its own JSON backup with a format marker like `_format: 'JuYiXXX/1'`.

### Lab (`lab/`)

Experimental tools under `lab/toys/<name>/`. Same patterns as modules but linked from `lab/index.html` rather than root. References `shared/base.css` with depth-adjusted paths (e.g., `../../../shared/base.css` for `lab/toys/moment-lottery/`).

### New module / toy checklist (mandatory)

When creating `modules/<name>/` or `lab/toys/<name>/`, complete ALL of these:

- **Files**: `index.html` + `styles.css` + `app.js` (IIFE `;(function(){ 'use strict'; ... })();`). No npm/CDN/frameworks.
- **base.css depth**: `../../shared/base.css` for modules, `../../../shared/base.css` for lab toys. (错题图鉴 is the documented exception — own `--eb-*` theme.)
- **DB**: use `shared/db-core.js` `JuYiDB`; own IndexedDB name `JuYiXXX`; never use store count as DB version.
- **innerHTML**: always `sanitizeHtml()` from `shared/utils.js`; plain text via `textContent`. `fmtDate` is NOT in utils.js — define per module.
- **Dark mode**: `html[data-theme]` + `localStorage.jy_theme` toggle button; CSS uses `var(--jy-*)` only.
- **Export/import**: JSON backup with `_format: 'JuYiXXX/1'` marker.
- **Register EVERYWHERE** (most commonly forgotten):
  - [ ] Navigation card in root `index.html` (modules) or `lab/index.html` (toys) — copy must describe only implemented features
  - [ ] `SYS_DB_NAMES` in root `index.html`
  - [ ] `SYS_LS_PREFIXES` for any new localStorage keys
  - [ ] CLAUDE.md `Current modules` table
  - [ ] `tests/smoke_test.py` PAGES list
- **Verify**: `python tests/smoke_test.py` all green; manual dark-mode toggle; system export/import round-trip includes the new DB.

**Known pitfalls** (from history):
- Mobile scrolling needs `display:flex; flex-direction:column; flex:1; min-height:0` on scroll containers.
- `transitionend` is unreliable — use nested `setTimeout`.
- Storing images as base64 in IndexedDB bloats backups; downscale large images first.
- Chinese filenames are fine (`.nojekyll` blocks Jekyll), but avoid special characters.

### Current modules

| Module | Directory | DB Name | Key features |
|--------|-----------|---------|-------------|
| 错题本 | `modules/error-notebook/` | `JuYiDB` | Rich-text error notes, review mode |
| 错题图鉴 | `modules/error-book/` | reads `JuYiDB` | Shelf view, page-flip animation, cross-module jump |
| 拾贝 | `modules/shell/` | `JuYiShell` | Knowledge cards, daily AI quotes |
| 健身 | `modules/fitness/` | `JuYiFitness` | Weight tracking, exercise log |
| 做题本 | `modules/question-book/` | `JuYiQuestionBook` | Structured Q&A with answer checking |
| 战报板 | `modules/battle-report/` | `JuYiBattleReport` | Rating charts, algorithm templates |
| 数据中心 | `modules/dashboard/` | reads all (read-only) | Cross-module aggregate: charts, heatmap, timeline |
| 计划表 | `modules/schedule/` | localStorage only | Daily schedule, check-in, calendar |
| 抽奖器 | `lab/toys/moment-lottery/` | `JuYiLabLottery` | Avatar detection, lottery animations |
| 万能图片 | `lab/toys/image-tools/` | `JuYiLabImageTools` | Clipboard paste → download |
| 网页助手 | `lab/toys/web-assistant/` | `JuYiWebAssist` | Firecrawl web clippings, local full-text search |
| 五子棋 | `lab/toys/gomoku/` | `JuYiGomoku` | 3-level AI (random/heuristic/minimax+αβ), undo, per-difficulty records |
| 贪吃蛇 | `lab/toys/snake/` | `JuYiSnake` | Speed levels, keyboard/touch/dpad controls, pause, per-speed high scores |

Notes:
- 错题图鉴 is a documented exception: it does **not** link `shared/base.css` — it uses its own `--eb-*` book theme.
- 数据中心 is read-only: it aggregates every module DB and localStorage but writes nothing; no new DB/localStorage keys.
- `birthday/` is a standalone personal birthday-card page (countdown + flip wishes), intentionally not linked from the hub.

---

## Testing

`tests/smoke_test.py` is the automated smoke test (Python + Playwright, dev-side tooling — the zero-dependency constraint applies to product code only). It loads all 16 pages headlessly checking for console errors, verifies key DOM elements, mobile overflow, and theme toggle. Falls back to system Edge when Playwright's Chromium isn't installed. **Run `python tests/smoke_test.py` after any change that touches shared files or page structure; all checks must pass before committing.** See `tests/README.md` for install and extension instructions.

---

## Common Patterns

### IndexedDB (inline wrapper)

Every module defines its own minimal DB class. Example pattern:

```js
class DB {
  constructor() { this.db = null; }
  open(name, version, stores) { /* Promise-returning indexedDB.open with onupgradeneeded */ }
  _tx(sn, mode, cb) { /* Transaction helper */ }
  _p(req) { /* IDBRequest → Promise */ }
  add(sn, item) { ... }
  getAll(sn) { ... }
  delete(sn, id) { ... }
  clear(sn) { ... }
}
```

### Image paste

Modules supporting rich text (错题本, 拾贝) use `contenteditable` divs with a `paste` event handler that reads `clipboardData.items`, filters for images, converts to base64 via `FileReader`, and inserts `<img>` into the editable region.

### System backup

Root `index.html` provides a system-level export/import that packages **all** IndexedDB databases and module-related localStorage keys into one JSON file (`_format: 'JuYiSysBackup/1'`). This is in addition to per-module export/import.

### Cloud sync (optional)

The root homepage's 「⛅ 云同步」 panel supports two backends:

- **GitHub private Gist（默认，无需任何新账号/服务器）** — the page talks to `api.github.com/gists` directly with a scoped Personal Access Token (`jy_sync_gist_token` + `jy_sync_gist_id`); a one-click 「✨ 一键创建云端文件」 button creates the private gist. Gist file size limit is ~10MB — keep backups under it (downscale images / incremental export).
- **Cloudflare Worker + KV（自建，`sync/`）** — `GET/PUT /api/sync`, `X-Sync-Key` auth; deploy instructions in `sync/README.md`.

Rules:

- Sync localStorage keys: `jy_sync_mode`, `jy_sync_gist_token`, `jy_sync_gist_id`, `jy_sync_url`, `jy_sync_key`, `jy_sync_snapshot`. They are **excluded from backups** via `SYS_LS_EXCLUDE` (along with `wa_api_key`).
- Sync uses the same `JuYiSysBackup/1` JSON format; pull takes a local snapshot first (`jy_sync_snapshot`) so a wrong pull is reversible.
- No module may depend on sync being configured.

### Auto-detection (Canvas image processing)

The 抽奖器 module implements a pure Canvas algorithm pipeline for detecting rounded-square avatar grids in screenshots: grayscale → Gaussian blur → Sobel edge detection → binary threshold → flood-fill blob detection → aspect-ratio/size/rounded-corner filtering → grid clustering → IoU dedup. No external CV library required in default mode.

---

## CSS Variable Reference (key tokens from base.css)

| Variable | Purpose |
|----------|---------|
| `--jy-primary: #4f5de4` | Primary brand color |
| `--jy-bg: #f5f6f8` | Page background |
| `--jy-surface: #ffffff` | Card/panel background |
| `--jy-border: #e2e5ea` | Default border |
| `--jy-text-primary: #1a1a2e` | Main text |
| `--jy-text-secondary: #5f6b7a` | Secondary text |
| `--jy-text-muted: #949dab` | Muted/placeholder text |
| `--jy-success/danger/warning/info` | Semantic colors |
| `--jy-space-1..8` | 0.25rem increments (0.25rem–2rem) |
| `--jy-radius / --jy-radius-lg` | Border radii |
| `--jy-shadow-sm / --jy-shadow-md` | Box shadows |
| `--jy-font-size-xs..2xl` | Typography scale |
