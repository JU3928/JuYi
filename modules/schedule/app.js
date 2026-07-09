;(function () {
  'use strict';

  /* ================================================================
   * Constants
   * ================================================================ */
  const LS_THEME = 'jy_theme';
  const LS_CHECKIN_PREFIX = 'jy_sched_';

  function checkinKey(dateStr) { return LS_CHECKIN_PREFIX + dateStr; }

  /* ================================================================
   * Task definitions — only normal & niuke
   * Row: [time, content, type, note]
   * Types: fixed | elastic | competition
   * ================================================================ */
  const DATA = {
    normal: {
      note: '常规无比赛日，所有固定任务正常执行。新增英语阅读唤醒下午状态，剪辑+阅读利用碎片时间。',
      rows: [
        ['07:00-07:30','起床洗漱','fixed','可简单拉伸'],
        ['07:30-08:00','早餐','fixed','不刷手机'],
        ['08:00-09:30','英语（早）','fixed','单词+长难句/阅读'],
        ['09:30-09:40','休息','fixed','远眺'],
        ['09:40-12:00','数学','fixed','高数/线代/概率'],
        ['12:00-12:30','午餐','fixed','放松'],
        ['12:30-12:50','🎬 剪辑','elastic','碎片时间利用'],
        ['12:50-13:05','📖 阅读','elastic','短文/资讯'],
        ['13:05-13:30','午休','fixed','不超过30分钟'],
        ['13:40-15:30','408专业课','fixed','每天一科轮换'],
        ['15:30-16:00','英语阅读','fixed','唤醒下午大脑，衔接运动'],
        ['16:00-17:00','运动','fixed','1小时，不限项目'],
        ['17:00-17:30','洗澡放松','fixed',''],
        ['17:30-18:30','算法学习','elastic','刷题/模板/补弱'],
        ['18:30-19:30','晚餐','fixed',''],
        ['19:30-21:00','数学/408弱项突破','elastic','可依状态调整'],
        ['21:00-21:50','英语（晚）','elastic','真题/作文/翻译'],
        ['21:50-22:20','复盘+明日计划','fixed','记录易错点'],
        ['22:20-23:00','洗漱准备入睡','fixed','远离屏幕'],
        ['23:00','睡觉','fixed','约7.5小时睡眠'],
      ],
    },
    niuke: {
      note: '牛客周赛日 · 比赛 19:00-21:00。所有固定任务时段完全不变，英语阅读（固定）必须保留。晚间弹性时段被比赛替换。',
      rows: [
        ['07:00-07:30','起床洗漱','fixed',''],
        ['07:30-08:00','早餐','fixed',''],
        ['08:00-09:30','英语（早）','fixed','绝不压缩'],
        ['09:30-09:40','休息','fixed',''],
        ['09:40-12:00','数学','fixed','绝不压缩'],
        ['12:00-12:30','午餐','fixed',''],
        ['12:30-12:50','🎬 剪辑','elastic','建议今日暂停，保留精力备战比赛'],
        ['12:50-13:05','📖 阅读','elastic','建议今日暂停，保留精力备战比赛'],
        ['13:05-13:30','午休','fixed',''],
        ['13:40-15:30','408专业课','fixed','绝不压缩'],
        ['15:30-16:00','英语阅读','fixed','固定任务，必须保留'],
        ['16:00-17:00','运动','fixed','必须执行'],
        ['17:00-17:30','洗澡放松','fixed',''],
        ['17:30-18:30','算法热身','elastic','简单题找手感'],
        ['18:30-19:00','晚餐（提前）','fixed','吃早一些'],
        ['19:00-21:00','牛客周赛','competition','专心比赛'],
        ['21:00-21:30','赛后放松','elastic','不进行高强度学习'],
        ['21:30-22:00','洗漱/简单复盘','fixed','比赛替代晚间学习'],
        ['22:00-22:30','准备入睡','fixed',''],
        ['22:30','睡觉','fixed','保证睡眠'],
      ],
    },
  };

  /* ================================================================
   * Utilities
   * ================================================================ */
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }
  function fmtDateShort(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }
  function fmtChineseDate(dateStr) {
    var parts = dateStr.split('-');
    return parseInt(parts[0]) + '年' + parseInt(parts[1]) + '月' + parseInt(parts[2]) + '日';
  }

  /* ================================================================
   * Check-in data access
   * ================================================================ */
  function loadCheckin(dateStr) {
    var raw = localStorage.getItem(checkinKey(dateStr));
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }
  function saveCheckin(dateStr, data) {
    localStorage.setItem(checkinKey(dateStr), JSON.stringify(data));
  }
  function getOrCreateCheckin(dateStr, rows) {
    var existing = loadCheckin(dateStr);
    if (existing) return existing;
    // Initialize checks to false for all time slots
    var checks = {};
    rows.forEach(function (r) { checks[r[0]] = false; });
    return { date: dateStr, checks: checks };
  }

  /* ================================================================
   * Completion calculation
   * ================================================================ */
  function calcCompletion(rows, checks) {
    var fixedTotal = 0, fixedDone = 0;
    var elasticTotal = 0, elasticDone = 0;
    rows.forEach(function (r) {
      var slot = r[0], type = r[2];
      if (type === 'fixed') {
        fixedTotal++;
        if (checks[slot]) fixedDone++;
      } else if (type === 'elastic') {
        elasticTotal++;
        if (checks[slot]) elasticDone++;
      }
    });
    // Weighted: fixed 70%, elastic 30%
    var fixedRate = fixedTotal > 0 ? fixedDone / fixedTotal : 0;
    var elasticRate = elasticTotal > 0 ? elasticDone / elasticTotal : 0;
    var totalRate = (fixedRate * 0.7 + elasticRate * 0.3) * 100;
    return {
      fixedTotal: fixedTotal, fixedDone: fixedDone,
      elasticTotal: elasticTotal, elasticDone: elasticDone,
      totalRate: Math.round(totalRate),
      fixedRate: Math.round(fixedRate * 100)
    };
  }

  /* ================================================================
   * Calendar helpers
   * ================================================================ */
  function getDaysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
  }
  function getFirstDayOfMonth(year, month) {
    // Monday = 1, Sunday = 7 (ISO weekday: Mon=1)
    var day = new Date(year, month, 1).getDay();
    return day === 0 ? 7 : day; // Convert Sunday from 0 to 7
  }

  /* ================================================================
   * Main App
   * ================================================================ */
  class ScheduleApp {
    constructor() {
      this.current = 'normal';
      this.viewingDate = todayStr();   // date being displayed
      this.isReadOnly = false;         // true when viewing past dates
      this.checkinData = null;         // current day's checkin
    }

    /* ---- lifecycle ---- */
    init() {
      this._restoreTheme();
      this._cacheDom();
      this._bindEvents();
      this._loadToday();
      this._render();
    }

    _loadToday() {
      var today = todayStr();
      this.viewingDate = today;
      this.isReadOnly = false;
      var rows = DATA[this.current].rows;
      this.checkinData = getOrCreateCheckin(today, rows);
    }

    _cacheDom() {
      var d = document;
      this.$todayDate = d.getElementById('todayDate');
      this.$scenarioBtns = d.querySelectorAll('.scenario-btn');
      this.$scheduleBody = d.getElementById('scheduleBody');
      this.$scenarioNote = d.getElementById('scenarioNote');
      this.$timeline = d.getElementById('timeline');
      this.$statsBar = d.getElementById('statsBar');
      this.$fixedSub = d.getElementById('fixedSub');
      this.$motivation = d.getElementById('motivation');
      this.$btnCheckAll = d.getElementById('btnCheckAll');
      this.$btnBackToday = d.getElementById('btnBackToday');
      this.$readOnlyBadge = d.getElementById('readOnlyBadge');
      this.$calendarGrid = d.getElementById('calendarGrid');
      this.$calendarTitle = d.getElementById('calendarTitle');
      this.$btnPrevMonth = d.getElementById('btnPrevMonth');
      this.$btnNextMonth = d.getElementById('btnNextMonth');
      this.$streakBadge = d.getElementById('streakBadge');
      this.$diligence = d.getElementById('diligence');
      this.$viewDateLabel = d.getElementById('viewDateLabel');
      this.calYear = new Date().getFullYear();
      this.calMonth = new Date().getMonth(); // 0-based
    }

    _bindEvents() {
      var self = this;
      // Scenario buttons
      this.$scenarioBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          self.$scenarioBtns.forEach(function (b) { b.classList.remove('active'); });
          this.classList.add('active');
          self.current = this.dataset.scenario;
          // Reload checkin data for current viewing date with new rows
          if (self.viewingDate === todayStr() && !self.isReadOnly) {
            self.checkinData = getOrCreateCheckin(self.viewingDate, DATA[self.current].rows);
          }
          self._render();
        });
      });

      // Check all fixed
      this.$btnCheckAll.addEventListener('click', function () {
        if (self.isReadOnly) return;
        var rows = DATA[self.current].rows;
        rows.forEach(function (r) {
          if (r[2] === 'fixed') self.checkinData.checks[r[0]] = true;
        });
        self._persistAndRender();
      });

      // Back to today
      this.$btnBackToday.addEventListener('click', function () {
        self._loadToday();
        self._render();
      });

      // Calendar nav
      this.$btnPrevMonth.addEventListener('click', function () {
        self.calMonth--;
        if (self.calMonth < 0) { self.calMonth = 11; self.calYear--; }
        self._renderCalendar();
      });
      this.$btnNextMonth.addEventListener('click', function () {
        self.calMonth++;
        if (self.calMonth > 11) { self.calMonth = 0; self.calYear++; }
        self._renderCalendar();
      });

      // Theme toggle (inject button)
      var tb = document.createElement('button');
      tb.className = 'jy-btn jy-btn--ghost jy-btn--icon theme-btn';
      tb.setAttribute('aria-label', '切换暗色模式');
      var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      tb.textContent = isDark ? '☀️' : '🌙';
      tb.addEventListener('click', function () {
        var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem(LS_THEME, next);
        tb.textContent = next === 'dark' ? '☀️' : '🌙';
      });
      document.body.appendChild(tb);
    }

    /* ---- Persistence ---- */
    _persistAndRender() {
      saveCheckin(this.viewingDate, this.checkinData);
      this._render();
    }

    _toggleCheck(slot) {
      if (this.isReadOnly) return;
      this.checkinData.checks[slot] = !this.checkinData.checks[slot];
      this._persistAndRender();
    }

    /* ---- Theme ---- */
    _restoreTheme() {
      if (localStorage.getItem(LS_THEME) === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    }

    /* ================================================================
     * Render
     * ================================================================ */
    _render() {
      this._renderHeader();
      this._renderTable();
      this._renderTimeline();
      this._renderStats();
      this._renderMotivation();
      this._renderCalendar();
      this._renderStreak();
      this._renderDiligence();
      this._updateViewState();
    }

    _renderHeader() {
      var d = new Date();
      var week = ['日','一','二','三','四','五','六'];
      this.$todayDate.textContent = d.getFullYear() + '年' + (d.getMonth()+1) + '月' + d.getDate() + '日 星期' + week[d.getDay()];
    }

    _renderTable() {
      var self = this;
      var rows = DATA[this.current].rows;
      var checks = this._getEffectiveChecks();
      var scenarioNote = DATA[this.current].note;

      this.$scenarioNote.textContent = scenarioNote;

      var labels = { fixed: '固定', elastic: '弹性', competition: '比赛' };
      var html = '';
      rows.forEach(function (r) {
        var slot = r[0], content = r[1], type = r[2], note = r[3];
        var checked = checks[slot] || false;
        var isNiukeElastic = (self.current === 'niuke' && type === 'elastic' && (content.indexOf('剪辑') !== -1 || content.indexOf('阅读') !== -1));
        var rowClass = 'tr--' + type;
        if (checked) rowClass += ' is-checked';
        if (isNiukeElastic) rowClass += ' is-dimmed';

        var disabledAttr = (self.isReadOnly || isNiukeElastic) ? ' disabled' : '';
        var checkedAttr = checked ? ' checked' : '';

        html += '<tr class="' + rowClass + '">' +
          '<td class="td-check"><input type="checkbox" class="check-box" data-slot="' + slot + '"' + checkedAttr + disabledAttr + '></td>' +
          '<td class="td-time">' + slot + '</td>' +
          '<td class="td-content">' + content + (isNiukeElastic ? ' <span class="dim-hint">（建议今日暂停，保留精力备战比赛）</span>' : '') + '</td>' +
          '<td><span class="badge-type badge-type--' + type + '">' + (labels[type] || type) + '</span></td>' +
          '<td class="td-note">' + (note || '') + '</td>' +
        '</tr>';
      });
      this.$scheduleBody.innerHTML = html;

      // Bind checkbox clicks
      var checkboxes = this.$scheduleBody.querySelectorAll('.check-box');
      checkboxes.forEach(function (cb) {
        cb.addEventListener('change', function () {
          if (self.isReadOnly || this.disabled) return;
          self._toggleCheck(this.dataset.slot);
        });
      });
    }

    _renderTimeline() {
      var self = this;
      var rows = DATA[this.current].rows;
      var checks = this._getEffectiveChecks();
      var blocks = [];
      rows.forEach(function (r) {
        var t = r[0];
        if (!t.includes('-')) return;
        var parts = t.split('-');
        var startParts = parts[0].split(':').map(Number);
        var endParts = parts[1].split(':').map(Number);
        var start = startParts[0] * 60 + startParts[1];
        var end = endParts[0] * 60 + endParts[1];
        var checked = checks[t] || false;
        blocks.push({ start: start, end: end, label: r[1], type: r[2], checked: checked });
      });
      var dayStart = 7 * 60, dayEnd = 24 * 60 + 30, total = dayEnd - dayStart;
      var html = '';
      blocks.forEach(function (b) {
        var cls = 'timeline__block timeline__block--' + b.type;
        if (b.checked) cls += ' timeline__block--done';
        html += '<div class="' + cls + '" style="width:' + ((b.end-b.start)/total)*100 + '%;flex-shrink:0" title="' + b.label + '">' + (b.label.length > 4 ? b.label.slice(0,4) + '…' : b.label) + '</div>';
      });
      this.$timeline.innerHTML = html;
    }

    _getEffectiveChecks() {
      // For today with read/write: use checkinData
      // For past dates: load from localStorage
      if (!this.isReadOnly) return this.checkinData.checks;
      var stored = loadCheckin(this.viewingDate);
      if (stored) return stored.checks;
      // Fallback: empty checks
      var checks = {};
      DATA[this.current].rows.forEach(function (r) { checks[r[0]] = false; });
      return checks;
    }

    _renderStats() {
      var rows = DATA[this.current].rows;
      var checks = this._getEffectiveChecks();
      var stats = calcCompletion(rows, checks);
      this.$statsBar.textContent = stats.totalRate + '%';
      this.$fixedSub.textContent = stats.fixedDone + '/' + stats.fixedTotal;
      // Color based on rate
      this.$statsBar.style.color = this._rateColor(stats.totalRate);
      this.$statsBar.style.borderColor = this._rateColor(stats.totalRate);
    }

    _renderMotivation() {
      var rows = DATA[this.current].rows;
      var checks = this._getEffectiveChecks();
      var stats = calcCompletion(rows, checks);
      var msg = '';
      if (stats.totalRate >= 98) {
        msg = '🎉 完美日！超越 90% 的考研人 💪';
      } else if (stats.fixedDone >= stats.fixedTotal && stats.fixedTotal > 0) {
        msg = '✅ 今日固定任务已全部拿下，稳扎稳打！';
      } else if (stats.fixedTotal - stats.fixedDone <= 2 && stats.fixedTotal - stats.fixedDone > 0) {
        msg = '🔥 今日固定任务还剩 ' + (stats.fixedTotal - stats.fixedDone) + ' 项未完成，加油！';
      } else if (stats.fixedDone > 0) {
        msg = '📋 已打卡 ' + (stats.fixedDone + stats.elasticDone) + ' 项任务，继续加油！';
      } else {
        msg = '☀️ 新的一天，从第一项任务开始吧！';
      }
      this.$motivation.textContent = msg;
    }

    _updateViewState() {
      var isToday = this.viewingDate === todayStr();
      this.$btnBackToday.style.display = isToday ? 'none' : 'inline-flex';
      this.$readOnlyBadge.style.display = this.isReadOnly ? 'inline-block' : 'none';
      this.$btnCheckAll.style.display = this.isReadOnly ? 'none' : 'inline-block';
      this.$viewDateLabel.textContent = isToday ? '今日' : fmtChineseDate(this.viewingDate);
    }

    /* ================================================================
     * Calendar
     * ================================================================ */
    _renderCalendar() {
      var self = this;
      var year = this.calYear, month = this.calMonth;
      var today = todayStr();
      var daysInMonth = getDaysInMonth(year, month);
      var firstDay = getFirstDayOfMonth(year, month); // Mon=1

      // Title
      this.$calendarTitle.textContent = year + '年 ' + (month + 1) + '月';

      // Build grid
      var html = '';
      // Header row
      var dayHeaders = ['一','二','三','四','五','六','日'];
      dayHeaders.forEach(function (h) {
        html += '<div class="cal-cell cal-header">' + h + '</div>';
      });

      // Empty cells before first day
      for (var i = 1; i < firstDay; i++) {
        html += '<div class="cal-cell cal-empty"></div>';
      }

      // Day cells
      for (var d = 1; d <= daysInMonth; d++) {
        var dateStr = year + '-' + String(month+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
        var isToday = dateStr === today;
        var isSelected = dateStr === self.viewingDate;

        var rate = 0;
        var hasData = false;
        var stored = loadCheckin(dateStr);
        if (stored) {
          hasData = true;
          // Calculate rate using normal scenario rows (standard reference)
          var normalRows = DATA.normal.rows;
          var stats = calcCompletion(normalRows, stored.checks);
          rate = stats.totalRate;
        }

        var cls = 'cal-cell cal-day';
        if (isToday) cls += ' cal-today';
        if (isSelected) cls += ' cal-selected';
        if (!hasData) cls += ' cal-no-data';

        // Gradient background
        var bgColor = hasData ? self._rateGradient(rate) : 'transparent';
        var textColor = rate > 50 ? '#fff' : 'inherit';

        html += '<div class="' + cls + '" data-date="' + dateStr + '" style="background:' + bgColor + ';color:' + textColor + '">' +
          '<span class="cal-day-num">' + d + '</span>' +
          (hasData ? '<span class="cal-day-rate">' + rate + '%</span>' : '<span class="cal-day-rate">—</span>') +
        '</div>';
      }

      this.$calendarGrid.innerHTML = html;

      // Bind day clicks
      var cells = this.$calendarGrid.querySelectorAll('.cal-day');
      cells.forEach(function (cell) {
        cell.addEventListener('click', function () {
          var dateStr = this.dataset.date;
          self._viewDate(dateStr);
        });
      });
    }

    _viewDate(dateStr) {
      var today = todayStr();
      this.viewingDate = dateStr;
      if (dateStr === today) {
        this.isReadOnly = false;
        this._loadToday();
      } else {
        this.isReadOnly = true;
        // Load stored data for this date
        var stored = loadCheckin(dateStr);
        if (!stored) {
          // No data for this date, show empty
          stored = { date: dateStr, checks: {} };
          DATA[this.current].rows.forEach(function (r) { stored.checks[r[0]] = false; });
        }
        this.checkinData = stored;
      }
      this._render();
    }

    _renderStreak() {
      var streak = this._calcStreak();
      var html = '';
      if (streak >= 14) {
        html = '👑 连续打卡 <strong>' + streak + '</strong> 天';
      } else if (streak >= 7) {
        html = '⭐ 连续打卡 <strong>' + streak + '</strong> 天';
      } else if (streak >= 3) {
        html = '🔥 连续打卡 <strong>' + streak + '</strong> 天';
      } else if (streak > 0) {
        html = '📌 连续打卡 <strong>' + streak + '</strong> 天';
      } else {
        html = '📌 今天开始打卡吧';
      }
      this.$streakBadge.innerHTML = html;
    }

    _calcStreak() {
      var count = 0;
      var d = new Date();
      // For today, we check if there's any checkin data with at least 1 check
      // Actually, count today if we have at least 1 check marked
      var todayData = loadCheckin(todayStr());
      if (todayData) {
        var hasAny = false;
        var checks = todayData.checks;
        for (var k in checks) { if (checks[k]) { hasAny = true; break; } }
        if (!hasAny) return 0; // Today not started yet
      } else {
        return 0; // No data today
      }

      count = 1; // Today has at least 1 check
      d.setDate(d.getDate() - 1);
      while (true) {
        var ds = fmtDateShort(d);
        var data = loadCheckin(ds);
        if (!data) break;
        var any = false;
        for (var key in data.checks) { if (data.checks[key]) { any = true; break; } }
        if (!any) break;
        count++;
        d.setDate(d.getDate() - 1);
      }
      return count;
    }

    _renderDiligence() {
      var now = new Date();
      var year = now.getFullYear(), month = now.getMonth();
      var today = now.getDate();
      var highDays = 0;
      for (var d = 1; d <= today; d++) {
        var ds = year + '-' + String(month+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
        var data = loadCheckin(ds);
        if (data) {
          var stats = calcCompletion(DATA.normal.rows, data.checks);
          if (stats.totalRate >= 80) highDays++;
        }
      }
      var idx = today > 0 ? Math.round((highDays / today) * 100) : 0;
      this.$diligence.textContent = idx + '%';
    }

    /* ================================================================
     * Visual helpers
     * ================================================================ */
    _rateColor(rate) {
      if (rate >= 80) return '#10b981';
      if (rate >= 50) return '#f59e0b';
      if (rate > 0) return '#ef4444';
      return 'var(--jy-text-muted)';
    }

    _rateGradient(rate) {
      // Red (0°) → Orange (30°) → Yellow (60°) → Green (120°)
      // 0% → hsl(0, 70%, 45%), 100% → hsl(120, 60%, 40%)
      var hue = rate * 1.2; // 0 → 120
      var sat = 65;
      var light = rate > 40 ? 38 : 42;
      return 'hsl(' + hue.toFixed(0) + ', ' + sat + '%, ' + light + '%)';
    }
  }

  /* ================================================================
   * Bootstrap
   * ================================================================ */
  document.addEventListener('DOMContentLoaded', function () {
    new ScheduleApp().init();
  });

})();
