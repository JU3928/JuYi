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
        ['09:30-09:40','休息','fixed','远眺'],
        ['09:40-12:00','数学','fixed','高数/线代/概率'],
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
      note: '牛客周赛日 · 比赛 19:00-21:00。所有固定任务时段完全不变，晚间弹性时段被比赛替换，赛后直接进入就寝准备。',
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
    cf: {
      note: 'CF 比赛日 · 比赛 22:35-24:00。全天固定任务正常执行，比赛利用就寝后时间。赛后立即入睡，次日07:00照常起床，午休可延长至35分钟。',
      rows: [
        ['07:00-07:30','起床洗漱','fixed',''],
        ['07:30-08:00','早餐','fixed',''],
        ['08:00-09:30','英语（早）','fixed','绝不压缩'],
        ['09:30-09:40','休息','fixed',''],
        ['09:40-12:00','数学','fixed','绝不压缩'],
        ['12:00-13:00','午餐','fixed',''],
        ['13:00-13:35','午休','fixed','可延长至35分'],
        ['13:40-15:40','408专业课','fixed','绝不压缩'],
        ['15:40-16:00','休息加餐','fixed',''],
        ['16:00-17:00','运动','fixed','必须执行'],
        ['17:00-17:30','洗澡放松','fixed',''],
        ['17:30-18:15','算法热身','elastic','中低难度题'],
        ['18:15-19:00','晚餐','fixed','清淡，不过饱'],
        ['19:00-19:30','自由休息','elastic','可背单词'],
        ['19:30-21:00','数学/408弱项突破','elastic','正常执行或自愿休息'],
        ['21:00-21:50','英语（晚）','elastic','正常执行'],
        ['21:50-22:20','复盘/赛前准备','fixed','登录、静坐'],
        ['22:35-24:00','CF比赛','competition','全力以赴'],
        ['00:00-00:30','赛后直接睡觉','fixed','不刷手机，不补题'],
        ['次日07:00','正常起床','fixed','照常英语早等所有固定任务'],
      ],
    },
    double: {
      note: '双比赛日 · 牛客 19:00-21:00 + CF 22:35-24:00。所有固定任务不变，晚间弹性时段被替换，两场之间安排恢复。赛后直接入睡，次日照常07:00起床。建议每月不超过1次。',
      rows: [
        ['07:00-07:30','起床洗漱','fixed',''],
        ['07:30-08:00','早餐','fixed',''],
        ['08:00-09:30','英语（早）','fixed','绝不压缩'],
        ['09:30-09:40','休息','fixed',''],
        ['09:40-12:00','数学','fixed','绝不压缩'],
        ['12:00-13:00','午餐','fixed',''],
        ['13:00-13:35','午休','fixed','可延长至35分钟，储备精力'],
        ['13:40-15:40','408专业课','fixed','绝不压缩'],
        ['15:40-16:00','休息加餐','fixed',''],
        ['16:00-17:00','运动','fixed','必须执行'],
        ['17:00-17:30','洗澡放松','fixed',''],
        ['17:30-18:15','算法热身','elastic','简单题保持手感'],
        ['18:15-18:50','晚餐（提前）','fixed','清淡，避免过饱'],
        ['18:50-19:00','准备牛客赛','fixed','登录、调整状态'],
        ['19:00-21:00','牛客周赛','competition','专心比赛'],
        ['21:00-21:40','赛后休息+加餐','fixed','快速补充能量，放松眼睛'],
        ['21:40-22:00','复盘/整理/静坐','fixed','切换至CF状态'],
        ['22:00-22:30','CF赛前准备','fixed','登录、静心'],
        ['22:35-24:00','CF比赛','competition','全力以赴'],
        ['00:00-00:30','赛后直接睡觉','fixed','不刷手机，不补题'],
        ['次日07:00','正常起床','fixed','照常英语早及所有固定任务'],
      ],
    },
  };

  class ScheduleApp {
    constructor() { this.current = 'normal'; }
    init() {
      if (localStorage.getItem(LS_THEME) === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
      this._cacheDom(); this._bindEvents(); this._render();
    }
    _cacheDom() {
      const $ = s => document.querySelector(s);
      this.els = {
        todayDate: $('#todayDate'), scheduleBody: $('#scheduleBody'),
        scenarioNote: $('#scenarioNote'), timeline: $('#timeline'),
        scenarioBtns: document.querySelectorAll('.scenario-btn'),
      };
    }
    _bindEvents() {
      this.els.scenarioBtns.forEach(btn => btn.addEventListener('click', () => {
        this.els.scenarioBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active'); this.current = btn.dataset.scenario; this._render();
      }));
      const tb = document.createElement('button');
      tb.className = 'jy-btn jy-btn--ghost jy-btn--icon theme-btn';
      tb.setAttribute('aria-label', '切换暗色模式');
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      tb.textContent = isDark ? '☀️' : '🌙';
      tb.addEventListener('click', () => {
        const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem(LS_THEME, next);
        tb.textContent = next === 'dark' ? '☀️' : '🌙';
      });
      document.body.appendChild(tb);
    }
    _render() {
      const d = new Date(), week = ['日','一','二','三','四','五','六'];
      this.els.todayDate.textContent = `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日 星期${week[d.getDay()]}`;
      const { rows, note } = DATA[this.current];
      this.els.scenarioNote.textContent = note;
      const labels = { fixed: '固定', elastic: '弹性', competition: '比赛' };
      this.els.scheduleBody.innerHTML = rows.map(r =>
        `<tr class="tr--${r[2]}"><td>${r[0]}</td><td>${r[1]}</td><td><span class="badge-type badge-type--${r[2]}">${labels[r[2]]}</span></td><td class="jy-text-muted jy-text-xs">${r[3]}</td></tr>`
      ).join('');
      this._drawTimeline(rows);
    }
    _drawTimeline(rows) {
      const tl = this.els.timeline, blocks = [];
      rows.forEach(r => { const t = r[0]; if (t.includes('-')) { const [sh, sm] = t.split('-')[0].split(':').map(Number); const [eh, em] = t.split('-')[1].split(':').map(Number); blocks.push({ start: sh*60+sm, end: eh*60+em, label: r[1], type: r[2] }); } });
      const dayStart = 7*60, dayEnd = 24*60+30, total = dayEnd - dayStart;
      tl.innerHTML = blocks.map(b => `<div class="timeline__block timeline__block--${b.type}" style="width:${((b.end-b.start)/total)*100}%;flex-shrink:0" title="${b.label}">${b.label.length>4?b.label.slice(0,4)+'…':b.label}</div>`).join('');
    }
  }
  document.addEventListener('DOMContentLoaded', () => new ScheduleApp().init());
})();