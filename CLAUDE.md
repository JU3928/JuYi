# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

JuYi is a **zero-dependency, pure frontend** personal toolbox. Every module is a self-contained HTML/CSS/JS file set that runs by double-clicking its `index.html` — no server, no build step, no npm.

**Key constraint**: No third-party libraries, frameworks, CDN resources, or npm packages. All code is vanilla JS using browser-native APIs (Canvas, IndexedDB, DOM).

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

### Current modules

| Module | Directory | DB Name | Key features |
|--------|-----------|---------|-------------|
| 错题本 | `modules/error-notebook/` | `JuYiDB` | Rich-text error notes, review mode |
| 拾贝 | `modules/shell/` | `JuYiShell` | Knowledge cards, daily AI quotes |
| 健身 | `modules/fitness/` | `JuYiFitness` | Weight tracking, exercise log |
| 做题本 | `modules/question-book/` | `JuYiQuestionBook` | Structured Q&A with answer checking |
| 战报板 | `modules/battle-report/` | `JuYiBattleReport` | Rating charts, algorithm templates |
| 计划表 | `modules/schedule/` | localStorage only | Daily schedule, check-in, calendar |
| 抽奖器 | `lab/toys/moment-lottery/` | `JuYiLabLottery` | Avatar detection, lottery animations |

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
