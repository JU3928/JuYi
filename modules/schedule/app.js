;(function () {
  'use strict';

  const LS_THEME = 'jy_theme';

  const DATA = {
    normal: {
      note: '常规无比赛日，所有固定任务正常执行，弹性晚间可自由安排重点突破方向。',
      rows: [
        ['07:00-07:30','起床洗漱','fixed','可简单拉伸'],
        ['07:30-08:00','早餐','fixed','不刷手机'],
        ['08:00-09:30','英语（早）','fixed','单词+长难句/阅读'],
        ['09:30-09:40','休息','fixed','远眺，不刷手机'],
        ['09:40-12:00','数学','fixed','高数/线代/概率，听课或刷题'],
        ['12:00-13:00','午餐','fixed','放松'],
        ['13:00-13:30','午休','fixed','不超过30分钟'],
        ['13:40-15:40','408专业课','fixed','每天一科轮换'],
        ['15:40-16:00','休息加餐','fixed','准备运动'],
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
      note: '牛客周赛日 · 比赛 19:00-21:00。所有固定任务时段完全不变，晚间弹性时段及英语晚被比赛替换。赛后直接进入就寝准备。',
      rows: [
        ['07:00-07:30','起床洗漱','fixed',''],
        ['07:30-08:00','早餐','fixed',''],
        ['08:00-09:30','英语（早）','fixed','绝不压缩'],
        ['09:30-09:40','休息','fixed',''],
        ['09:40-12:00','数学','fixed','绝不压缩'],
        ['12:00-13:00','午餐','fixed',''],
        ['13:00-13:30','午休','fixed',''],
        ['13:40-15:40','408专业课','fixed','绝不压缩'],
        ['15:40-16:00','休息加餐','fixed',''],
        ['16:00-17:00','运动','fixed','1小时，必须执行'],
        ['17:00-17:30','洗澡放松','fixed',''],
        ['17:30-18:30','算法热身','elastic','做简单题找手感'],
        ['18:30-19:00','晚餐（提前）','fixed','吃早一些'],
        ['19:00-21:00','牛客周赛','competition','专心比赛'],
        ['21:00-21:30','赛后放松','elastic','不进行高强度学习'],
        ['21:30-22:00','洗漱/简单复盘','fixed','比赛替代晚间学习'],
        ['22:00-22:30','准备入睡','fixed',''],
        ['22:30','睡觉','fixed','保证睡眠'],
      ],
    },
    cf: {
      note: 'CF 比赛日 · 比赛 22:35-24:00。全天固定任务正常执行，比赛利用就寝后时间。赛后立即入睡，次日07:00照常起床执行所有固定任务，绝不推迟。',
      rows: [
        ['07:00-07:30','起床洗漱','fixed',''],
        ['07:30-08:00','早餐','fixed',''],
        ['08:00-09:30','英语（早）','fixed','绝不压缩'],
        ['09:30-09:40','休息','fixed',''],
        ['09:40-12:00','数学','fixed','绝不压缩'],
        ['12:00-13:00','午餐','fixed',''],
        ['13:00-13:35','午休','fixed','可延长至35分，为晚间储备'],
        ['13:40-15:40','408专业课','fixed','绝不压缩'],
        ['15:40-16:00','休息加餐','fixed',''],
        ['16:00-17:00','运动','fixed','1小时，必须执行'],
        ['17:00-17:30','洗澡放松','fixed',''],
        ['17:30-18:15','算法热身','elastic','中低难度题'],
        ['18:15-19:00','晚餐','fixed','清淡，不过饱'],
        ['19:00-19:30','自由休息','elastic','可背单词（不耗脑）'],
        ['19:30-21:00','数学/408弱项突破','elastic','正常执行或自愿休息'],
        ['21:00-21:50','英语（晚）','elastic','正常执行'],
        ['21:50-22:20','复盘/赛前准备','fixed','登录、静坐'],
        ['22:35-24:00','CF比赛','competition','全力以赴'],
        ['00:00-00:30','赛后直接睡觉','fixed','不刷手机，不补题'],
        ['次日07:00','正常起床','fixed','照常英语早等所有固定任务'],
      ],
    },
  };

  class ScheduleApp {
    constructor() {
      this.current = 'normal';
    }

    init() {
      if (localStorage.getItem(LS_THEME) === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
      this._cacheDom();
      this._bindEvents();
      this._render();
    }

    _cacheDom() {
      const $ = s => document.querySelector(s);
      this.els = {
        todayDate: $('#todayDate'),
        scheduleBody: $('#scheduleBody'),
        scenarioNote: $('#scenarioNote'),
        timeline: $('#timeline'),
        scenarioBtns: document.querySelectorAll('.scenario-btn'),
      };
    }

    _bindEvents() {
      this.els.scenarioBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          this.els.scenarioBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.current = btn.dataset.scenario;
          this._render();
        });
      });
      // Theme toggle
      const tb = document.createElement('button');
      tb.className = 'jy-btn jy-btn--ghost jy-btn--icon theme-btn';
      tb.textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙';
      tb.addEventListener('click', () => {
        const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem(LS_THEME, next);
        tb.textContent = next === 'dark' ? '☀️' : '🌙';
      });
      document.body.appendChild(tb);
    }

    _render() {
      const d = new Date();
      const week = ['日','一','二','三','四','五','六'];
      this.els.todayDate.textContent = `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日 星期${week[d.getDay()]}`;

      const { rows, note } = DATA[this.current];
      this.els.scenarioNote.textContent = note;

      // Table
      const typeLabel = { fixed: '固定', elastic: '弹性', competition: '比赛' };
      this.els.scheduleBody.innerHTML = rows.map(r =>
        `<tr class="tr--${r[2]}">
          <td>${r[0]}</td>
          <td>${r[1]}</td>
          <td><span class="badge-type badge-type--${r[2]}">${typeLabel[r[2]]}</span></td>
          <td class="jy-text-muted jy-text-xs">${r[3]}</td>
        </tr>`
      ).join('');

      // Timeline
      this._drawTimeline(rows);
    }

    _drawTimeline(rows) {
      const tl = this.els.timeline;
      // Parse time blocks into spans
      const blocks = [];
      rows.forEach(r => {
        const time = r[0];
        const label = r[1];
        const type = r[2];
        if (time.includes('-')) {
          const [sh, sm] = time.split('-')[0].split(':').map(Number);
          const [eh, em] = time.split('-')[1].split(':').map(Number);
          blocks.push({ start: sh * 60 + sm, end: eh * 60 + em, label, type });
        }
      });

      const dayStart = 7 * 60; // 07:00
      const dayEnd = 24 * 60 + 30; // 00:30 next day (accounts for CF)
      const total = dayEnd - dayStart;

      // Find max end
      const maxEnd = Math.max(...blocks.map(b => b.end), dayEnd);

      tl.innerHTML = blocks.map(b => {
        const left = ((b.start - dayStart) / total) * 100;
        const width = ((b.end - b.start) / total) * 100;
        const shortLabel = b.label.length > 4 ? b.label.slice(0, 4) + '…' : b.label;
        return `<div class="timeline__block timeline__block--${b.type}"
          style="width:${width}%;flex-shrink:0;"
          title="${b.label} (${b.start >= 24*60 ? '次日' : ''}${b.type === 'competition' ? '比赛' : b.type === 'elastic' ? '弹性' : '固定'})">${shortLabel}</div>`;
      }).join('');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    new ScheduleApp().init();
  });
})();