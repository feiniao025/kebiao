
/* ============================================================
   app-shared.js —— 共享状态 / 常量 / 工具函数
   必须在其他 app-*.js 之前加载
   ============================================================ */

/* ========== 1. select.cell-pop-input 自动包一层 .select-wrap ========== */
function decorateSelects(root) {
  const scope = root || document;
  const list = scope.querySelectorAll('select.cell-pop-input');
  list.forEach(sel => {
    if (sel.parentElement && sel.parentElement.classList.contains('select-wrap')) return;
    const wrap = document.createElement('div');
    wrap.className = 'select-wrap';
    if (sel.style.flex) wrap.style.flex = sel.style.flex;
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);
  });
}

document.addEventListener('DOMContentLoaded', function () {
  decorateSelects(document);
  const mo = new MutationObserver(function (mutations) {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.tagName === 'SELECT' && node.classList.contains('cell-pop-input')) {
          decorateSelects(node.parentNode || document);
        } else {
          decorateSelects(node);
        }
      }
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
});

/* ========== 2. 全局错误捕获 ========== */
window.addEventListener('error', function (e) {
  console.error('[App Error]', e.message, e.filename, e.lineno + ':' + e.colno, e.error);
}, true);
window.addEventListener('unhandledrejection', function (e) {
  console.error('[Promise Rejection]', e.reason);
});

/* ========== 3. 本地库懒加载 ========== */
window._loadedScripts = {};
window.loadScript = function (src) {
  if (window._loadedScripts[src]) return window._loadedScripts[src];
  window._loadedScripts[src] = new Promise(function (resolve, reject) {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return window._loadedScripts[src];
};

window.ensureECharts = function () {
  if (typeof echarts !== 'undefined') return Promise.resolve();
  return window.loadScript('/js/lib/echarts.min.js');   // 本地
};

window.ensureXLSX = function () {
  if (typeof XLSX !== 'undefined') return Promise.resolve();
  return window.loadScript('/js/lib/xlsx.full.min.js'); // 本地
};

window.ensureHtml2Canvas = function () {
  if (typeof html2canvas !== 'undefined') return Promise.resolve();
  return window.loadScript('/js/lib/html2canvas.min.js'); // 本地
};

/* ========== 4. 全局状态 ========== */
window.currentUser = null;
window.defaultPeriods = [];
window.defaultLegend = [];
window.classes = [];
window.cellData = {};
window.seat = { rows: 7, cols: 8, order: 'asc', students: [], aisle: '' };
window.preferences = {
  theme: 'light',
  schedule_filter: 'all',
  week_highlight: true,
  active_tab: 'schedule',
  seat_show_committee: true
};

// 从 localStorage 恢复班委显示偏好（因为后端暂未持久化该字段）
(function loadSeatShowCommitteePref() {
  var stored = localStorage.getItem('kebiao_seat_show_committee');
  if (stored === '0') window.preferences.seat_show_committee = false;
  else if (stored === '1') window.preferences.seat_show_committee = true;
})();

window.meMode = 'login';
window.meView = 'profile';

window.currentCellIdx = null;
window.currentCellType = null;
window.currentBgColor = '0';
window.currentCellClassId = null;
window.currentPopIdx = null;
window.currentPopIsNew = false;
window.currentManageClassId = null;

window.editAllOn = false;
window.seatEditOn = false;
window.rosterEditOn = false;
window.dutyEditOn = false;

window.currentDutyClassId = '';
window.currentTodayClass = localStorage.getItem('kebiao_today_class') || 'all';
window.currentRosterClassId = '';
window.currentRosterKeyword = '';
window.rosterList = [];

window.currentGradesClassId = '';
window.currentGradesSubject = '语文';
window.examsList = [];
window.currentExamId = null;
window.currentExamDetail = null;

window.currentAttendanceClassId = '';
window.currentAttendanceDate = new Date().toISOString().slice(0, 10);
window.attendanceList = [];

window.importTargetMode = 'schedule';

window.autoSyncTimer = null;
window.saveStatusTimer = null;

window.classPressTimer = null;
window.classPressState = null;
window.classDrag = null;

window.suppressClickTime = 0;
window.pressTimer = null;
window.pressState = null;
window.activeDrag = null;

window.activeTopTab = 'today';
window.activeSubTab = null;

window.trendCtx = { studentName: '', gender: '', fullScore: 0, subject: '' };

/* ========== 5. 统一 SVG 图标库（Lucide 风格 · 跟随 currentColor） ========== */
/* 用法：icon('save') 返回带 .svg-icon 类的内联 SVG 字符串；
   icon('save', 'lg') 可附加额外类名。所有图标 viewBox=0 0 24 24。 */
window.ICONS = {
  book:        '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
  check:       '<polyline points="20 6 9 17 4 12"/>',
  checkCircle: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  calendar:    '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  calendarDay: '<rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M7 14h2"/>',
  users:       '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  user:        '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  school:      '<path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9v.01M9 12v.01M9 15v.01M9 18v.01"/>',
  key:         '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
  cloud:       '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  volume:      '<path d="M11 4.07 6 7H2v10h4l5 2.93a1 1 0 0 0 1-.85V4.92a1 1 0 0 0-1-.85z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
  megaphone:   '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  note:        '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  save:        '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
  pencil:      '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  settings:    '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  camera:      '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  import:      '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M12 12v6"/><path d="m9 15 3 3 3-3"/>',
  export:      '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M12 18v-6"/><path d="m9 15 3-3 3 3"/>',
  bulb:        '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  phone:       '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  trash:       '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  refresh:     '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/>',
  clock:       '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  monitor:     '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
  video:       '<path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/>',
  sliders:     '<line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/><line x1="18" x2="22" y1="16" y2="16"/>',
  folder:      '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  file:        '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  image:       '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  film:        '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18"/><path d="M3 7.5h4"/><path d="M3 12h18"/><path d="M3 16.5h4"/><path d="M17 3v18"/><path d="M17 7.5h4"/><path d="M17 16.5h4"/>',
  message:     '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  siren:       '<path d="M7 18v-6a5 5 0 0 1 10 0v6"/><path d="M5 21h14a1 1 0 0 0 1-1v-2H4v2a1 1 0 0 0 1 1z"/><path d="M12 2v2"/><path d="M4 8h2"/><path d="M18 8h2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 6.07 1.41-1.41"/>',
  chart:       '<line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/>',
  trophy:      '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 19.5 7 20 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 19.5 17 20 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  trending:    '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  send:        '<path d="M22 2 11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>',
  copy:        '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  flask:       '<path d="M9 3h6v4l5 9a3 3 0 0 1-2.6 4.5H6.6A3 3 0 0 1 4 16l5-9V3z"/><path d="M7.5 13h9"/>',
  upload:      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
  download:    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  listChecks:  '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M11 6h10"/><path d="M11 12h10"/><path d="M11 18h10"/>',
  chair:       '<path d="M3 18V13c0-2 1-3 3-3h12c2 0 3 1 3 3v5"/><path d="M5 18v3"/><path d="M19 18v3"/><path d="M3 18h18"/><path d="M7 13V8c0-2 1-3 3-3h4c2 0 3 1 3 3v5"/>',
  sun:         '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  arrowLeft:   '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  party:       '<polygon points="12 2 14 9 22 9 16 14 18 22 12 17 6 22 8 14 2 9 10 9"/>',
  inbox:       '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  warn:        '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/>',
  xCircle:     '<circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/>',
  mic:         '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>',
  info:        '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="16" y2="12"/><line x1="12" x2="12.01" y1="8" y2="8"/>',
  editCal:     '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M14.5 14.5 19 19"/><path d="M19 14.5 14.5 19"/>',
  x:           '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  power:       '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/>',
  alarmClock:  '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M5 3 2 6"/><path d="m22 6-3-3"/>'
};
window.icon = function (name, cls) {
  const body = window.ICONS[name];
  if (!body) return '';
  return '<svg class="svg-icon' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" ' +
         'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
         body + '</svg>';
};

/* ========== 5b. 常量 ========== */
window.AUTO_SYNC_DELAY = 2000;
window.CLASS_LONG_PRESS_MS = 500;
window.CLASS_MOVE_CANCEL_PX = 10;
window.LONG_PRESS_MS = 500;
window.MOVE_CANCEL_PX = 10;
window.BREAK_CELL_INDEX = 1000;
window.BREAK_AFTER_PERIOD = 4;
window.DUTY_DAYS = 5;
window.SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治'];
window.EXAM_NAMES = ['第一次月考', '第二次月考', '期中考试', '期末考试'];
window.CN_DIGITS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
window.COLOR_BG = ['#fff', '#f9d0d0', '#a9c9f0', '#a7e0b9', '#f0e08b', '#c9a8f0', '#f0b98a'];
window.COLOR_BD = ['#bbb', '#f0b8b8', '#a9c9f0', '#a7e0b9', '#f0e08b', '#c9a8f0', '#f0b98a'];
window.DEFAULT_DUTY_NOTE = `值日要求：
所有值日生值日当天7:20到校，晚放学后值完日立即离校。值日期间禁止打闹。禁止在校内和上下学途中逗留。所有扫除用具用完之后及时清洗干净，放回原处，摆放整齐。
1.擦黑板和讲桌：每节课下课用湿抹布将黑板和讲桌擦干净，无多余水渍。
2.扫地和拖地：每日三次打扫（早晨到校、午饭后、晚放学后）先扫地，再拖地。扫后地面无垃圾，拖后地面无多余水渍，保持地面干净整洁。
3.摆桌椅：全天保持桌椅摆放整齐，轻推轻放，放学后必须将桌椅再次摆整齐。
4.擦窗台：每日用湿抹布擦两遍，早晨到校擦一遍，午饭后擦一遍。拉窗帘：每日午休结束后立即将窗帘拉开，系上。禁止窗帘飘在窗外。关窗户：每日放学前关好窗户。
5.擦门镜：每日用卫生纸擦两遍，早晨到校擦一遍，午饭后擦一遍。里外都擦干净。
关风扇、关灯、关门：每日放学后关闭风扇、关灯、关门，关掉所有电源。`;

/* ========== 6. DOM 引用 & $ 快捷函数 ========== */
window.html = document.documentElement;
window.$ = function (id) { return document.getElementById(id); };
window.pageTitle = $('pageTitle');
window.pageSub = $('pageSub');
window.subNav = $('subNav');
window.bottomNav = $('bottomNav');
window.scheduleContainer = $('scheduleContainer');
window.seatCard = $('seatCard');
window.meContainer = $('meContainer');
window.meCard = $('meCard');
window.todayContainer = $('todayContainer');
window.gradesContainer = $('gradesContainer');
window.attendanceContainer = $('attendanceContainer');
window.rosterContainer = $('rosterContainer');

/* ========== 7. 通用工具函数 ========== */
window.showSaveStatus = function (msg, isError, isInfo) {
  const el = $('saveStatus');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('err', !!isError);
  el.classList.toggle('info', !!isInfo); // ★ 控制蓝色样式
  el.classList.add('show');
  if (window.saveStatusTimer) clearTimeout(window.saveStatusTimer);
  window.saveStatusTimer = setTimeout(() => el.classList.remove('show'), 2500); // 稍微延长到2.5秒方便阅读
};

window.escapeHtml = function (s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
};
window.dateStamp = function () { return new Date().toISOString().slice(0, 10); };
window.safeFilePart = function (s) { return String(s || '').replace(/[\\\/:*?"<>|]/g, '_'); };

window.apiCall = async function (fn) {
  var args = Array.prototype.slice.call(arguments, 1);
  try {
    return await fn.apply(null, args);
  } catch (err) {
    if (err.status === 401) {
      API.clearToken();
      window.currentUser = null;
      if (typeof showLoginRegister === 'function') showLoginRegister();
      showSaveStatus('登录已过期，请重新登录', true);
    } else {
      showSaveStatus(err.message || '操作失败', true);
    }
    throw err;
  }
};

/* ========== 通用确认弹窗 ========== */
window.showConfirm = function (message, options) {
  options = options || {};
  return new Promise(function (resolve) {
    const pop = document.getElementById('confirmPop');
    if (!pop) { console.warn('[showConfirm] #confirmPop 不存在'); resolve(false); return; }

    const title     = document.getElementById('confirmPopTitle');
    const msg       = document.getElementById('confirmPopMsg');
    const okBtn     = document.getElementById('confirmPopOk');
    const cancelBtn = document.getElementById('confirmPopCancel');

    title.textContent     = options.title      || '确认操作';
    msg.textContent       = message            || '';
    okBtn.textContent     = options.okText     || '确认';
    cancelBtn.textContent = options.cancelText || '取消';
    okBtn.style.background = (options.danger === false) ? '#3498db' : '#e74c3c';

    pop.style.display = 'flex';

    const cleanup = function () {
      pop.style.display = 'none';
      okBtn.onclick = null;
      cancelBtn.onclick = null;
      pop.onclick = null;
      document.removeEventListener('keydown', onKey);
    };
    const onKey = function (e) {
      if (e.key === 'Escape') { cleanup(); resolve(false); }
      else if (e.key === 'Enter') { cleanup(); resolve(true); }
    };

    okBtn.onclick     = function () { cleanup(); resolve(true); };
    cancelBtn.onclick = function () { cleanup(); resolve(false); };
    pop.onclick       = function (e) { if (e.target === pop) { cleanup(); resolve(false); } };
    document.addEventListener('keydown', onKey);
  });
};

window.scheduleAutoSync = function () {
  if (!window.currentUser) return;
  if (window.autoSyncTimer) clearTimeout(window.autoSyncTimer);
  window.autoSyncTimer = setTimeout(async function () {
    window.autoSyncTimer = null;
    try { await API.pushSync(); } catch (e) { /* 静默 */ }
  }, window.AUTO_SYNC_DELAY);
};

window.gradeLabel = function (g) {
  if (g >= 10) return '高' + (g - 9);
  if (g >= 1 && g <= 9) return window.CN_DIGITS[g];
  return String(g);
};
window.formatClassName = function (grade, classNum) {
  return window.gradeLabel(grade) + '.' + classNum + '班';
};
window.fillGradeSelect = function (sel, defaultGrade) {
  if (!sel) return;
  sel.innerHTML = '';
  for (let g = 1; g <= 12; g++) {
    const opt = document.createElement('option');
    opt.value = g;
    let text = (g >= 10) ? (window.gradeLabel(g) + '（' + g + '年级）')
                         : (window.gradeLabel(g) + '年级（' + g + '）');
    opt.textContent = text;
    if (g === defaultGrade) opt.selected = true;
    sel.appendChild(opt);
  }
};
window.fillClassNumSelect = function (sel, defaultNum, allowCustom) {
  if (!sel) return;
  sel.innerHTML = '';
  for (let c = 1; c <= 30; c++) {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c + ' 班';
    if (c === defaultNum) opt.selected = true;
    sel.appendChild(opt);
  }
  if (allowCustom) {
    const opt = document.createElement('option');
    opt.value = 'custom';
    opt.textContent = '自定义班级名称';
    if (defaultNum === 'custom' || defaultNum === 0) opt.selected = true;
    sel.appendChild(opt);
  }
};
window.fillPeriodCountSelect = function (sel, defaultVal) {
  if (!sel) return;
  sel.innerHTML = '';
  for (let n = 1; n <= 12; n++) {
    const opt = document.createElement('option');
    opt.value = n;
    opt.textContent = n + ' 节';
    if (n === defaultVal) opt.selected = true;
    sel.appendChild(opt);
  }
};
window.fillClassSelect = function (sel, defaultVal) {
  if (!sel) return;
  sel.innerHTML = '';
  window.classes.forEach(function (c) {
    const opt = document.createElement('option');
    opt.value = c.class_id;
    opt.textContent = c.name;
    if (c.class_id === defaultVal) opt.selected = true;
    sel.appendChild(opt);
  });
};

/* ========== 教师信息（姓名 · 角色） ========== */
window.TEACHER_ROLES = ['班主任', '任课教师'];

// 组装成 "好老师 · 班主任"（兼容旧调用签名，subject 不再写入徽章）
// 组装成 "姓名 · 角色 · 科目"（兼容旧调用签名）
window.formatTeacherInfo = function (role, subject, name) {
  const r = (role || '').trim();
  const s = (subject || '').trim();
  const n = (name || '').trim();
  const parts = [];
  if (n) parts.push(n);
  if (r) parts.push(r);
  if (s) parts.push(s);   // ★ 新增
  return parts.join(' · ');
};

window.parseTeacherInfo = function (badge) {
  const info = { role: '', subject: '', name: '' };
  const t = String(badge || '').trim();
  if (!t) return info;

  const parts = t.split(/\s*·\s*/).filter(Boolean);
  if (!parts.length) return info;

  const ROLE_SET = ['班主任', '任课教师'];

  if (parts.length >= 3) {
    if (ROLE_SET.indexOf(parts[0]) >= 0) {
      // 旧格式：角色 · 科目 · 姓名
      info.role    = parts[0];
      info.subject = parts[1];
      info.name    = parts.slice(2).join(' · ');
    } else {
      // ★ 新格式：姓名 · 角色 · 科目
      info.name    = parts[0];
      info.role    = parts[1];
      info.subject = parts.slice(2).join(' · ');
    }
  } else if (parts.length === 2) {
    if (ROLE_SET.indexOf(parts[0]) >= 0) {
      // 旧数据缺科目：角色 · 姓名
      info.role = parts[0];
      info.name = parts[1];
    } else {
      // 姓名 · 角色
      info.name = parts[0];
      info.role = parts[1];
    }
  } else {
    if (ROLE_SET.indexOf(parts[0]) >= 0) info.role = parts[0];
    else info.name = parts[0];
  }
  return info;
};

// 徽章展示：过滤掉科目，只显示 "姓名 · 角色"
window.formatTeacherBadgeDisplay = function (badge) {
  const info = window.parseTeacherInfo(badge);
  const parts = [];
  if (info.name) parts.push(info.name);
  if (info.role) parts.push(info.role);
  return parts.join(' · ');
};

// 向后兼容：不再自动加/去前缀，只做 trim
window.withBadgePrefix = function (name) {
  return String(name || '').trim();
};
window.stripBadgePrefix = function (badge) {
  return String(badge || '').trim();
};

window.getAisleSegments = function (aisle, cols) {
  if (!aisle) return [cols];
  const parts = String(aisle).split('+').map(function (s) { return parseInt(s.trim(), 10); });
  if (parts.length < 2) return [cols];
  if (parts.some(function (n) { return isNaN(n) || n < 1; })) return [cols];
  const sum = parts.reduce(function (a, b) { return a + b; }, 0);
  if (sum !== cols) return [cols];
  return parts;
};
window.getGridColumns = function (segments) {
  const parts = [];
  segments.forEach(function (len, i) {
    if (i > 0) parts.push('10px');
    parts.push('repeat(' + len + ', minmax(0, 1fr))');
  });
  return parts.join(' ');
};
window.getGridColIdx = function (visCol, segments) {
  let aisleCount = 0, cum = 0;
  for (let i = 0; i < segments.length - 1; i++) {
    cum += segments[i];
    if (visCol >= cum) aisleCount++; else break;
  }
  return visCol + aisleCount + 1;
};
window.getAisleGridCols = function (segments) {
  const cols = [];
  let cum = 0;
  for (let i = 0; i < segments.length - 1; i++) {
    cum += segments[i];
    cols.push(cum + i + 1);
  }
  return cols;
};
window.updateAisleBtn = function () {
  const btn = $('seatAisleBtn');
  if (!btn) return;
  btn.textContent = '过道';
  btn.classList.toggle('active', !!window.seat.aisle);
};
window.cssEscape = function (s) {
  if (window.CSS && CSS.escape) return CSS.escape(s);
  return String(s).replace(/[^a-zA-Z0-9_-]/g, function (ch) { return '\\' + ch; });
};


/* ========== 8. Excel 通用读取（依赖懒加载的 XLSX） ========== */
window.readExcelFile = async function (file) {
  await window.ensureXLSX();
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        resolve(wb);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

window.pickExcelFile = function (onFile) {
  const input = $('excelFileInput');
  if (!input) return;
  input.value = '';
  input.onchange = async function () {
    const file = input.files && input.files[0];
    if (!file) return;
    try { await onFile(file); }
    catch (err) { showSaveStatus('解析失败: ' + (err.message || ''), true); }
    finally { input.value = ''; }
  };
  input.click();
};

/* ========== 9. 导航相关 ========== */
window.SUB_TABS = {
  today:    [],
  students: [
    { key: 'grades',     label: '成绩' },
    { key: 'attendance', label: '考勤' },
    { key: 'roster',     label: '花名册' },
  ],
  classes: [
    { key: 'schedule',  label: '课表' },
    { key: 'seat',      label: '座位' },
    { key: 'committee', label: '班委' },
    { key: 'duty',      label: '值日' },
	{ key: 'shout',     label: '喊话' },
  ],
  me: [],
};

window.renderBottomNav = function () {
  if (!window.bottomNav) return;
  window.bottomNav.style.display = window.currentUser ? '' : 'none';
  window.bottomNav.querySelectorAll('button[data-top]').forEach(function (b) {
    b.classList.toggle('active', b.dataset.top === window.activeTopTab);
  });
};

window.renderSubNav = function () {
  if (!window.subNav) return;
  const subs = window.SUB_TABS[window.activeTopTab] || [];
  if (subs.length === 0) {
    window.subNav.style.display = 'none';
    window.subNav.innerHTML = '';
    return;
  }
  window.subNav.style.display = '';
  window.subNav.innerHTML = subs.map(function (s) {
    return '<button class="sub-tab' + (s.key === window.activeSubTab ? ' active' : '') +
           '" data-sub="' + s.key + '">' + s.label + '</button>';
  }).join('');
  window.subNav.querySelectorAll('button[data-sub]').forEach(function (b) {
    b.onclick = function () { window.switchSubTab(b.dataset.sub); };
  });
};

window.switchTopTab = function (top) {
  if (!window.currentUser && top !== 'me') { alert('请先登录'); return; }
  window.activeTopTab = top;
  const subs = window.SUB_TABS[top] || [];
  window.activeSubTab = subs.length > 0 ? subs[0].key : null;
  window.renderBottomNav();
  window.renderSubNav();
  window.renderContent();
};
window.switchSubTab = function (sub) {
  window.activeSubTab = sub;
  window.renderSubNav();
  window.renderContent();
};

window.hideAllContainers = function () {
  [window.todayContainer, window.gradesContainer, window.attendanceContainer,
   window.rosterContainer, window.scheduleContainer, window.seatCard,
   window.meContainer].forEach(function (el) { if (el) el.style.display = 'none'; });
};

/* 说明：renderContent 内引用各模块的 renderXxx，通过全局函数名访问 */
window.renderContent = function () {
  // ★ 切页 / 切子标签时先关闭所有弹窗，避免残留
  document.querySelectorAll('.seat-pop').forEach(function (el) { el.style.display = 'none'; });

  window.hideAllContainers();
  if (window.pageSub) window.pageSub.style.display = 'none';

  const isScheduleTab = (window.activeTopTab === 'classes' && window.activeSubTab === 'schedule');
  const isSeatTab = (window.activeTopTab === 'classes' && window.activeSubTab === 'seat');
  const isDutyTab = (window.activeTopTab === 'classes' && window.activeSubTab === 'duty');
  const isRosterTab = (window.activeTopTab === 'students' && window.activeSubTab === 'roster');

  const showClassCtrl = isScheduleTab || isSeatTab || isDutyTab;
  const classCtrl = $('classControlBar');
  if (classCtrl) classCtrl.style.display = showClassCtrl ? 'flex' : 'none';

  const rosterCtrl = $('rosterControlBar');
  if (rosterCtrl) rosterCtrl.style.display = isRosterTab ? 'flex' : 'none';

  switch (window.activeTopTab) {
    case 'today':
      window.pageTitle.innerHTML = icon('calendar') + ' 今天';
      window.todayContainer.style.display = 'block';
      if (typeof renderToday === 'function') renderToday();
      break;
    case 'students':
      window.pageTitle.innerHTML = icon('users') + ' 学生';
      if (window.activeSubTab === 'grades') {
        window.gradesContainer.style.display = 'block';
        if (typeof renderGrades === 'function') renderGrades();
      } else if (window.activeSubTab === 'attendance') {
        window.attendanceContainer.style.display = 'block';
        if (typeof renderAttendance === 'function') renderAttendance();
      } else if (window.activeSubTab === 'roster') {
        window.rosterContainer.style.display = 'block';
        if (typeof renderRoster === 'function') renderRoster();
      }
      break;
    case 'classes':
      window.pageTitle.innerHTML = icon('school') + ' 班级';
      if (window.activeSubTab === 'schedule') {
        window.scheduleContainer.style.display = 'block';
        if (typeof renderSchedule === 'function') { renderSchedule(); renderWeekHighlight(); }
      } else if (window.activeSubTab === 'seat') {
        window.seatCard.style.display = 'block';
        if (typeof updateSeatCardTitle === 'function') updateSeatCardTitle();
        if (typeof renderSeats === 'function') renderSeats();
      } else if (window.activeSubTab === 'committee') {
        window.scheduleContainer.style.display = 'block';
        if (typeof renderCommittee === 'function') renderCommittee();
      } else if (window.activeSubTab === 'duty') {
        window.scheduleContainer.style.display = 'block';
        if (typeof renderDuty === 'function') renderDuty();
      } else if (window.activeSubTab === 'shout') {
        window.scheduleContainer.style.display = 'block';
        if (typeof renderShout === 'function') renderShout();
      }
      break;
    case 'me':
      window.pageTitle.innerHTML = icon('user') + ' 我的';
      window.pageSub.innerHTML = window.currentUser ? ('欢迎回来，' + window.escapeHtml(window.currentUser.username)) : '';
      window.pageSub.style.display = window.currentUser ? '' : 'none';
      window.meContainer.style.display = 'block';
      if (typeof renderMePage === 'function') renderMePage();
      break;
  }

  if (showClassCtrl) {
    document.querySelectorAll('#classControlBar .schedule-only').forEach(function (b) {
      b.style.display = isScheduleTab ? '' : 'none';
    });
    document.querySelectorAll('#classControlBar .seat-only').forEach(function (b) {
      b.style.display = isSeatTab ? '' : 'none';
    });
    document.querySelectorAll('#classControlBar .duty-only').forEach(function (b) {
      b.style.display = isDutyTab ? '' : 'none';
    });
    const twBtn = $('toggleWeekHighlight');
    if (twBtn) twBtn.style.display = (isScheduleTab || isDutyTab) ? '' : 'none';
  }
};

window.switchTab = function (tab) {
  if (tab === 'schedule') { window.switchTopTab('classes'); window.switchSubTab('schedule'); }
  else if (tab === 'seat') { window.switchTopTab('classes'); window.switchSubTab('seat'); }
  else if (tab === 'me') window.switchTopTab('me');
};

/* ========== 10. 主题应用 ========== */

// 判断当前是否夜间（简化：18:00 ~ 次日 06:00 视为夜间）
window.isNightTime = function () {
  const h = new Date().getHours();
  return (h >= 18 || h < 6);
};

// 根据 preferences.theme 应用主题：
//   'light' → 浅色
//   'dark'  → 深色
//   'auto'  → 根据时间自动（夜间深色，白天浅色）
window.applyTheme = function () {
  const t = (window.preferences && window.preferences.theme) || 'light';
  let isDark = false;
  if (t === 'auto') isDark = window.isNightTime();
  else if (t === 'dark') isDark = true;
  if (isDark) window.html.setAttribute('data-theme', 'dark');
  else window.html.removeAttribute('data-theme');
};

// 启动时应用一次
window.applyTheme();

// 每分钟检查一次（自动模式可能在 18:00 / 06:00 跨过临界点）
setInterval(function () {
  if (window.preferences && window.preferences.theme === 'auto') {
    window.applyTheme();
  }
}, 60 * 1000);

// 兼容：其他代码可能还调用 setThemeBtn
window.setThemeBtn = function () { /* 已废弃，使用 applyTheme */ };

/* ========== 11. 周高亮 ========== */
window.renderWeekHighlight = function () {
  document.querySelectorAll('.today-col').forEach(function (el) { el.classList.remove('today-col'); });
  if (!window.preferences.week_highlight) return;
  const wd = new Date().getDay();
  if (wd >= 1 && wd <= 5) {
    document.querySelectorAll('.schedule-table').forEach(function (table) {
      table.querySelectorAll('thead tr th:nth-child(' + (wd + 1) + ')').forEach(function (el) { el.classList.add('today-col'); });
      table.querySelectorAll('tbody tr td:nth-child(' + (wd + 1) + ')').forEach(function (el) { el.classList.add('today-col'); });
    });
  }
};
(function bindWeekHighlight() {
  const tw = $('toggleWeekHighlight');
  if (!tw) return;
  tw.onclick = function () {
    window.preferences.week_highlight = !window.preferences.week_highlight;
    tw.classList.toggle('active', window.preferences.week_highlight);
    window.renderWeekHighlight();
    API.updatePreferences({ week_highlight: window.preferences.week_highlight }).catch(function () {});
  };
})();

/* ========== 12. 兼容旧版：学生成绩报告弹窗 ========== */
window.deleteExam = async function (examId) {
  if (!confirm('确认删除该考试及所有成绩记录？')) return;
  try {
    await API.deleteExam(examId);
    showSaveStatus('考试已删除', false);
    if (typeof loadExams === 'function') await loadExams();
  } catch (err) { alert(err.message); }
};

window.openStudentReportPop = async function (studentName) {
  if (!studentName) return;
  $('studentReportPop').style.display = 'flex';
  $('studentReportTitle').textContent = studentName + ' 的成绩报告';
  $('studentReportBody').innerHTML = '<div style="text-align:center;padding:20px;">加载中...</div>';
  try {
    const resp = await API.getStudentHistory(studentName, window.currentGradesSubject);
    const history = resp.history || [];
    if (history.length === 0) {
      $('studentReportBody').innerHTML = '<div class="today-empty">暂无该科目的历史成绩记录</div>';
      return;
    }
    let html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;">' +
               '<span style="font-weight:bold;font-size:16px;">' + escapeHtml(window.currentGradesSubject) + ' 历次成绩走势</span>' +
               '</div>' +
               '<div id="chartHistory" style="width:100%;height:250px;"></div>' +
               '<h4 style="margin-top:20px;font-size:15px;">考试成绩明细</h4>' +
               '<div style="max-height:40vh;overflow:auto;">' +
               '<table class="history-table"><thead><tr><th>考试名称</th><th>日期</th><th>分数</th></tr></thead><tbody>' +
               history.map(function (h) {
                 return '<tr><td>' + escapeHtml(h.exam_name) + '</td><td>' + escapeHtml(h.date) + '</td><td style="font-weight:700;color:#e74c3c;">' + h.score + '</td></tr>';
               }).join('') + '</tbody></table></div>';
    $('studentReportBody').innerHTML = html;
    await window.ensureECharts();
    setTimeout(function () {
      const chartDom = document.getElementById('chartHistory');
      if (chartDom && history.length > 0 && typeof echarts !== 'undefined') {
        const myChart = echarts.init(chartDom);
        myChart.setOption({
          tooltip: { trigger: 'axis' },
          xAxis: { type: 'category', data: history.map(function (h) { return h.exam_name; }), axisLabel: { interval: 0, rotate: 30, fontSize: 10 } },
          yAxis: { type: 'value', max: history[0].full_score || 100 },
          series: [{ data: history.map(function (h) { return h.score; }), type: 'line', smooth: true, itemStyle: { color: '#3498db' }, lineStyle: { width: 3 } }]
        });
      }
    }, 100);
  } catch (err) {
    $('studentReportBody').innerHTML = '加载失败: ' + err.message;
  }
};