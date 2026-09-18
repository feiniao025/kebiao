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
window.preferences = { theme: 'light', schedule_filter: 'all', week_highlight: true, active_tab: 'schedule' };

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

/* ========== 5. 常量 ========== */
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
window.showSaveStatus = function (msg, isError) {
  const el = $('saveStatus');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('err', !!isError);
  el.classList.add('show');
  if (window.saveStatusTimer) clearTimeout(window.saveStatusTimer);
  window.saveStatusTimer = setTimeout(() => el.classList.remove('show'), 2200);
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
window.stripBadgePrefix = function (badge) {
  if (!badge) return '';
  return String(badge).replace(/^班主任\s*·\s*/, '').trim();
};
window.withBadgePrefix = function (name) {
  const t = (name || '').trim();
  return t ? ('班主任 · ' + t) : '';
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

window.setThemeBtn = function () {
  const isDark = window.html.hasAttribute('data-theme');
  const btn = $('themeToggle');
  if (!btn) return;
  btn.textContent = isDark ? '🌙' : '☀️';
  btn.title = isDark ? '切换到浅色' : '切换到深色';
  btn.classList.toggle('active', isDark);
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
    { key: 'schedule', label: '课表' },
    { key: 'seat',     label: '座位' },
    { key: 'duty',     label: '值日' },
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
      window.pageTitle.innerHTML = '📅 今天';
      window.todayContainer.style.display = 'block';
      if (typeof renderToday === 'function') renderToday();
      break;
    case 'students':
      window.pageTitle.innerHTML = '👥 学生';
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
      window.pageTitle.innerHTML = '🏫 班级';
      if (window.activeSubTab === 'schedule') {
        window.scheduleContainer.style.display = 'block';
        if (typeof renderSchedule === 'function') { renderSchedule(); renderWeekHighlight(); }
      } else if (window.activeSubTab === 'seat') {
        window.seatCard.style.display = 'block';
        if (typeof updateSeatCardTitle === 'function') updateSeatCardTitle();
        if (typeof renderSeats === 'function') renderSeats();
      } else if (window.activeSubTab === 'duty') {
        window.scheduleContainer.style.display = 'block';
        if (typeof renderDuty === 'function') renderDuty();
      }
      break;
    case 'me':
      window.pageTitle.innerHTML = '👤 我的';
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

/* ========== 10. 主题切换绑定 ========== */
window.setThemeBtn();
(function bindThemeToggle() {
  const themeToggle = $('themeToggle');
  if (!themeToggle) return;
  themeToggle.onclick = function () {
    if (window.html.hasAttribute('data-theme')) {
      window.html.removeAttribute('data-theme');
      window.preferences.theme = 'light';
    } else {
      window.html.setAttribute('data-theme', 'dark');
      window.preferences.theme = 'dark';
    }
    window.setThemeBtn();
    API.updatePreferences({ theme: window.preferences.theme }).catch(function () {});
  };
})();

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