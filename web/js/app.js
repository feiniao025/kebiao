// ============ 给所有 select.cell-pop-input 外包一层 .select-wrap，方便用 CSS ::after 画箭头 ============
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

// ============ 全局错误捕获 ============
window.addEventListener('error', function (e) {
  console.error('[App Error]', e.message, e.filename, e.lineno + ':' + e.colno, e.error);
}, true);
window.addEventListener('unhandledrejection', function (e) {
  console.error('[Promise Rejection]', e.reason);
});

// 全局函数，供 HTML onclick 调用
window.openStudentReportPop = async function(studentName) {
  if (!studentName) return;
  $('studentReportPop').style.display = 'flex';
  $('studentReportTitle').textContent = studentName + ' 的成绩报告';
  $('studentReportBody').innerHTML = '<div style="text-align:center;padding:20px;">加载中...</div>';

  try {
    const resp = await API.getStudentHistory(studentName, currentGradesSubject);
    const history = resp.history || [];

    if (history.length === 0) {
      $('studentReportBody').innerHTML = '<div class="today-empty">暂无该科目的历史成绩记录</div>';
      return;
    }

    let html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;">
        <span style="font-weight:bold;font-size:16px;">${currentGradesSubject} 历次成绩走势</span>
      </div>
      <div id="chartHistory" style="width:100%;height:250px;"></div>
      <h4 style="margin-top:20px;font-size:15px;">考试成绩明细</h4>
      <div style="max-height:40vh;overflow:auto;">
        <table class="history-table">
          <thead><tr><th>考试名称</th><th>日期</th><th>分数</th></tr></thead>
          <tbody>
            ${history.map(h => `<tr><td>${escapeHtml(h.exam_name)}</td><td>${escapeHtml(h.date)}</td><td style="font-weight:700;color:#e74c3c;">${h.score}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
    $('studentReportBody').innerHTML = html;

    // 绘制折线图
    setTimeout(() => {
      const chartDom = document.getElementById('chartHistory');
      if (chartDom && history.length > 0) {
        const myChart = echarts.init(chartDom);
        myChart.setOption({
          tooltip: { trigger: 'axis' },
          xAxis: { 
            type: 'category', 
            data: history.map(h => h.exam_name),
            axisLabel: { interval: 0, rotate: 30, fontSize: 10 }
          },
          yAxis: { type: 'value', max: history[0].full_score || 100 },
          series: [{
            data: history.map(h => h.score),
            type: 'line',
            smooth: true,
            itemStyle: { color: '#3498db' },
            lineStyle: { width: 3 }
          }]
        });
      }
    }, 100);
  } catch (err) {
    $('studentReportBody').innerHTML = '加载失败: ' + err.message;
  }
};

window.deleteExam = async function(examId) {
  if (!confirm('确认删除该考试及所有成绩记录？')) return;
  try {
    await API.deleteExam(examId);
    showSaveStatus('考试已删除', false);
    await loadExams();
  } catch (err) {
    alert(err.message);
  }
};

(async function () {
  'use strict';

  // ============ 主/子标签状态 ============
  let activeTopTab = 'today';
  let activeSubTab = null;

  // ============ 原有状态 ============
  let currentUser = null;
  let defaultPeriods = [];
  let defaultLegend = [];
  let classes = [];
  let cellData = {};
  let seat = { rows: 7, cols: 8, order: 'asc', students: [], aisle: '' };
  let preferences = {
    theme: 'light', schedule_filter: 'all', week_highlight: true,
    active_tab: 'schedule',
  };
  let meMode = 'login';
  let meView = 'profile';
  let currentCellIdx = null, currentCellType = null, currentBgColor = '0';
  let currentCellClassId = null;
  let currentPopIdx = null;
  let currentPopIsNew = false;
  let currentManageClassId = null;
  let editAllOn = false;
  let seatEditOn = false;
  let rosterEditOn = false;

  // ============ 学生模块状态 ============
  let currentRosterClassId = '';
  let currentRosterKeyword = '';
  let rosterList = [];

  let currentGradesClassId = '';
  let currentGradesSubject = '语文';
  let examsList = [];
  let currentExamId = null;
  let currentExamDetail = null;

  let currentAttendanceClassId = '';
  let currentAttendanceDate = new Date().toISOString().slice(0, 10);
  let attendanceList = [];

  let importTargetMode = 'schedule';

  let autoSyncTimer = null;
  const AUTO_SYNC_DELAY = 2000;

  let classPressTimer = null;
  let classPressState = null;
  let classDrag = null;
  const CLASS_LONG_PRESS_MS = 500;
  const CLASS_MOVE_CANCEL_PX = 10;

  let suppressClickTime = 0;
  const LONG_PRESS_MS = 500, MOVE_CANCEL_PX = 10;
  let pressTimer = null, pressState = null, activeDrag = null;

  const BREAK_CELL_INDEX = 1000;
  const BREAK_AFTER_PERIOD = 4;

  const SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治'];
  const EXAM_NAMES = ['第一次月考', '第二次月考', '期中考试', '期末考试'];

  // ============ DOM ============
  const $ = (id) => document.getElementById(id);
  const html = document.documentElement;
  const pageTitle = $('pageTitle');
  const pageSub = $('pageSub');
  const subNav = $('subNav');
  const bottomNav = $('bottomNav');
  const scheduleContainer = $('scheduleContainer');
  const seatCard = $('seatCard');
  const meContainer = $('meContainer');
  const meCard = $('meCard');
  const todayContainer = $('todayContainer');
  const gradesContainer = $('gradesContainer');
  const attendanceContainer = $('attendanceContainer');
  const rosterContainer = $('rosterContainer');

  // ============ Utilities ============
  let saveStatusTimer = null;
  function showSaveStatus(msg, isError) {
    const el = $('saveStatus');
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('err', !!isError);
    el.classList.add('show');
    if (saveStatusTimer) clearTimeout(saveStatusTimer);
    saveStatusTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function dateStamp() { return new Date().toISOString().slice(0, 10); }
  function safeFilePart(s) { return String(s || '').replace(/[\\\/:*?"<>|]/g, '_'); }

  async function apiCall(fn, ...args) {
    try {
      return await fn(...args);
    } catch (err) {
      if (err.status === 401) {
        API.clearToken();
        currentUser = null;
        showLoginRegister();
        showSaveStatus('登录已过期，请重新登录', true);
      } else {
        showSaveStatus(err.message || '操作失败', true);
      }
      throw err;
    }
  }

  function scheduleAutoSync() {
    if (!currentUser) return;
    if (autoSyncTimer) clearTimeout(autoSyncTimer);
    autoSyncTimer = setTimeout(async () => {
      autoSyncTimer = null;
      try { await API.pushSync(); } catch (e) { /* 静默 */ }
    }, AUTO_SYNC_DELAY);
  }

  // ---------- 年级/班级工具 ----------
  const CN_DIGITS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  function gradeLabel(g) {
    if (g >= 10) return '高' + (g - 9);
    if (g >= 1 && g <= 9) return CN_DIGITS[g];
    return String(g);
  }
  function formatClassName(grade, classNum) {
    return gradeLabel(grade) + '.' + classNum + '班';
  }
  function fillGradeSelect(sel, defaultGrade) {
    if (!sel) return;
    sel.innerHTML = '';
    for (let g = 1; g <= 12; g++) {
      const opt = document.createElement('option');
      opt.value = g;
      let text;
      if (g >= 10) text = gradeLabel(g) + '（' + g + '年级）';
      else text = gradeLabel(g) + '年级（' + g + '）';
      opt.textContent = text;
      if (g === defaultGrade) opt.selected = true;
      sel.appendChild(opt);
    }
  }
  function fillClassNumSelect(sel, defaultNum) {
    if (!sel) return;
    sel.innerHTML = '';
    for (let c = 1; c <= 30; c++) {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c + ' 班';
      if (c === defaultNum) opt.selected = true;
      sel.appendChild(opt);
    }
  }
  function fillPeriodCountSelect(sel, defaultVal) {
    if (!sel) return;
    sel.innerHTML = '';
    for (let n = 1; n <= 12; n++) {
      const opt = document.createElement('option');
      opt.value = n;
      opt.textContent = n + ' 节';
      if (n === defaultVal) opt.selected = true;
      sel.appendChild(opt);
    }
  }
  function stripBadgePrefix(badge) {
    if (!badge) return '';
    return String(badge).replace(/^班主任\s*·\s*/, '').trim();
  }
  function withBadgePrefix(name) {
    const t = (name || '').trim();
    return t ? ('班主任 · ' + t) : '';
  }
  function fillClassSelect(sel, defaultVal) {
    if (!sel) return;
    sel.innerHTML = '';
    classes.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.class_id;
      opt.textContent = c.name;
      if (c.class_id === defaultVal) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  // ---------- 过道工具 ----------
  function getAisleSegments(aisle, cols) {
    if (!aisle) return [cols];
    const parts = String(aisle).split('+').map(s => parseInt(s.trim(), 10));
    if (parts.length < 2) return [cols];
    if (parts.some(n => isNaN(n) || n < 1)) return [cols];
    const sum = parts.reduce((a, b) => a + b, 0);
    if (sum !== cols) return [cols];
    return parts;
  }
  function getGridColumns(segments) {
    const parts = [];
    segments.forEach((len, i) => {
      if (i > 0) parts.push('10px');
      parts.push('repeat(' + len + ', minmax(0, 1fr))');
    });
    return parts.join(' ');
  }
  function getGridColIdx(visCol, segments) {
    let aisleCount = 0;
    let cum = 0;
    for (let i = 0; i < segments.length - 1; i++) {
      cum += segments[i];
      if (visCol >= cum) aisleCount++;
      else break;
    }
    return visCol + aisleCount + 1;
  }
  function getAisleGridCols(segments) {
    const cols = [];
    let cum = 0;
    for (let i = 0; i < segments.length - 1; i++) {
      cum += segments[i];
      cols.push(cum + i + 1);
    }
    return cols;
  }
  function updateAisleBtn() {
    const btn = $('seatAisleBtn');
    if (!btn) return;
    btn.textContent = '过道';
    btn.classList.toggle('active', !!seat.aisle);
  }
  function cssEscape(s) {
    if (window.CSS && CSS.escape) return CSS.escape(s);
    return String(s).replace(/[^a-zA-Z0-9_-]/g, (ch) => '\\' + ch);
  }

  // ============ Init ============
  async function init() {
    try {
      if (!API.getToken()) { showLoginRegister(); return; }
      try {
        currentUser = await API.me();
      } catch (e) {
        API.clearToken();
        showLoginRegister();
        return;
      }

      try {
        const defaults = await API.getDefaults();
        defaultPeriods = defaults.periods || [];
        defaultLegend = defaults.legend || [];
      } catch (e) {
        console.error('加载默认课表失败:', e);
      }

      try {
        const prefs = await API.getPreferences();
        preferences = Object.assign(preferences, prefs);
      } catch (e) { /* ignore */ }

      if (preferences.theme === 'dark') html.setAttribute('data-theme', 'dark');
      setThemeBtn();

      await reloadClasses();
      await reloadCellData();

      try {
        const seatResp = await API.getSeat();
        seat.rows = seatResp.rows || 7;
        seat.cols = seatResp.cols || 8;
        seat.order = seatResp.order || 'asc';
        seat.aisle = seatResp.aisle || '';
        seat.students = [];
        for (let i = 0; i < seat.rows * seat.cols; i++) {
          seat.students.push({ name: '', gender: '', id_card: '', tel1: '', tel2: '', address: '' });
        }
        (seatResp.students || []).forEach(s => {
          const idx = s.seat_row * seat.cols + s.seat_col;
          if (idx < seat.students.length) seat.students[idx] = s;
        });
      } catch (e) { /* ignore */ }

      const tw = $('toggleWeekHighlight');
      if (tw) tw.classList.toggle('active', preferences.week_highlight);
      const se = $('seatEditToggle');
      if (se) se.classList.toggle('active', seatEditOn);
      const so = $('seatOrderBtn');
      if (so) {
        so.textContent = seat.order === 'asc' ? '讲台上' : '讲台下';
        so.classList.toggle('active', seat.order === 'desc');
      }
      document.body.classList.toggle('person-mode', seatEditOn);
      updateAisleBtn();

      if (classes.length > 0) {
        if (!currentRosterClassId) currentRosterClassId = '';
        if (!currentGradesClassId) currentGradesClassId = classes[0].class_id;
        if (!currentAttendanceClassId) currentAttendanceClassId = classes[0].class_id;
      }

      renderSchedule();
      renderSeats();
      updateSeatCardTitle();
      renderWeekHighlight();

      if (currentUser) switchTopTab('today');
      else switchTopTab('me');
    } catch (err) {
      console.error('init 异常:', err);
      try { showLoginRegister(); } catch (e2) {}
    }
  }

  async function reloadClasses() {
    try {
      const resp = await API.listClasses();
      classes = resp.classes || [];
    } catch { classes = []; }
  }

  async function reloadCellData() {
    try {
      const cellResp = await API.getCells();
      cellData = {};
      (cellResp.cells || []).forEach(c => {
        const key = c.class_id + '_cell_' + c.cell_index;
        cellData[key] = c;
      });
    } catch { /* ignore */ }
  }

  // ============ 主/子标签 ============
  const SUB_TABS = {
    today:    [],
    students: [
      { key: 'grades',     label: '成绩' },
      { key: 'attendance', label: '考勤' },
      { key: 'roster',     label: '花名册' },
    ],
    classes: [
      { key: 'schedule', label: '课表' },
      { key: 'seat',     label: '座位' },
    ],
    me: [],
  };

  function renderBottomNav() {
    if (!bottomNav) return;
    bottomNav.style.display = currentUser ? '' : 'none';
    bottomNav.querySelectorAll('button[data-top]').forEach(b => {
      b.classList.toggle('active', b.dataset.top === activeTopTab);
    });
  }

  function renderSubNav() {
    if (!subNav) return;
    const subs = SUB_TABS[activeTopTab] || [];
    if (subs.length === 0) {
      subNav.style.display = 'none';
      subNav.innerHTML = '';
      return;
    }
    subNav.style.display = '';
    subNav.innerHTML = subs.map(s =>
      '<button class="sub-tab' + (s.key === activeSubTab ? ' active' : '') + '" data-sub="' + s.key + '">' + s.label + '</button>'
    ).join('');
    subNav.querySelectorAll('button[data-sub]').forEach(b => {
      b.onclick = () => switchSubTab(b.dataset.sub);
    });
  }

  function switchTopTab(top) {
    if (!currentUser && top !== 'me') { alert('请先登录'); return; }
    activeTopTab = top;
    const subs = SUB_TABS[top] || [];
    activeSubTab = subs.length > 0 ? subs[0].key : null;
    renderBottomNav();
    renderSubNav();
    renderContent();
  }

  function switchSubTab(sub) {
    activeSubTab = sub;
    renderSubNav();
    renderContent();
  }

  function hideAllContainers() {
    [todayContainer, gradesContainer, attendanceContainer, rosterContainer,
     scheduleContainer, seatCard, meContainer].forEach(el => {
      if (el) el.style.display = 'none';
    });
  }

  function renderContent() {
    hideAllContainers();
    if (pageSub) pageSub.style.display = 'none';

    const isScheduleTab = (activeTopTab === 'classes' && activeSubTab === 'schedule');
    const isSeatTab = (activeTopTab === 'classes' && activeSubTab === 'seat');
    const isRosterTab = (activeTopTab === 'students' && activeSubTab === 'roster');

    const showClassCtrl = isScheduleTab || isSeatTab;
    const classCtrl = $('classControlBar');
    if (classCtrl) classCtrl.style.display = showClassCtrl ? 'flex' : 'none';

    const rosterCtrl = $('rosterControlBar');
    if (rosterCtrl) rosterCtrl.style.display = isRosterTab ? 'flex' : 'none';

    switch (activeTopTab) {
      case 'today':
        pageTitle.innerHTML = '📅 今天';
        todayContainer.style.display = 'block';
        renderToday();
        break;
      case 'students':
        pageTitle.innerHTML = '👥 学生';
        if (activeSubTab === 'grades') {
          gradesContainer.style.display = 'block';
          renderGrades();
        } else if (activeSubTab === 'attendance') {
          attendanceContainer.style.display = 'block';
          renderAttendance();
        } else if (activeSubTab === 'roster') {
          rosterContainer.style.display = 'block';
          renderRoster();
        }
        break;
      case 'classes':
        pageTitle.innerHTML = '🏫 班级';
        if (activeSubTab === 'schedule') {
          scheduleContainer.style.display = 'block';
          renderSchedule();
          renderWeekHighlight();
        } else if (activeSubTab === 'seat') {
          seatCard.style.display = 'block';
          updateSeatCardTitle();
          renderSeats();
        }
        break;
      case 'me':
        pageTitle.innerHTML = '👤 我的';
        pageSub.innerHTML = currentUser ? ('欢迎回来，' + escapeHtml(currentUser.username)) : '';
        pageSub.style.display = currentUser ? '' : 'none';
        meContainer.style.display = 'block';
        renderMePage();
        break;
    }

    if (showClassCtrl) {
      document.querySelectorAll('#classControlBar .schedule-only').forEach(b => {
        b.style.display = isScheduleTab ? '' : 'none';
      });
      document.querySelectorAll('#classControlBar .seat-only').forEach(b => {
        b.style.display = isSeatTab ? '' : 'none';
      });
    }
  }

  function switchTab(tab) {
    if (tab === 'schedule') { switchTopTab('classes'); switchSubTab('schedule'); }
    else if (tab === 'seat') { switchTopTab('classes'); switchSubTab('seat'); }
    else if (tab === 'me') switchTopTab('me');
  }

  if (bottomNav) {
    bottomNav.querySelectorAll('button[data-top]').forEach(b => {
      b.onclick = () => switchTopTab(b.dataset.top);
    });
  }

  // ============ 花名册工具条（一次性绑定） ============
  (function bindRosterToolbar() {
    const editBtn = $('rosterEditBtn');
    if (editBtn) {
      editBtn.onclick = (e) => {
        e.stopPropagation();
        rosterEditOn = !rosterEditOn;
        editBtn.classList.toggle('active', rosterEditOn);
        renderRosterList();
        showSaveStatus(rosterEditOn ? '已开启编辑：点击行可修改学生信息' : '已锁定', false);
      };
    }

    const moreBtn = $('rosterMoreToggle');
    const morePanel = $('rosterMorePanel');
    if (moreBtn && morePanel) {
      moreBtn.onclick = (e) => {
        e.stopPropagation();
        const open = morePanel.classList.toggle('open');
        moreBtn.classList.toggle('open', open);
        moreBtn.textContent = open ? '⚙️ 收起' : '⚙️ 更多';
      };
    }

    const importBtn = $('rosterImportBtn');
    if (importBtn) {
      importBtn.onclick = () => {
        if (classes.length === 0) { alert('请先在「班级 → 课表」中创建班级'); return; }
        openImportTargetPop('roster');
      };
    }

    const expExcel = $('rosterExportBtn');
    if (expExcel) expExcel.onclick = () => openExportRosterPop();

    const expImg = $('rosterExportImgBtn');
    if (expImg) expImg.onclick = () => exportRosterImage();
  })();

  // ============ 座位表标题 ============
  function updateSeatCardTitle() {
    const el = $('seatCardTitle');
    if (!el) return;
    if (classes.length > 0) {
      const first = classes[0].name || formatClassName(classes[0].grade || 7, classes[0].class_num || 1);
      el.textContent = first;
    } else {
      el.textContent = '';
    }
  }

  // ============ 班级筛选按钮 ============
  function renderFilterButtons() {
    const container = $('classFilterButtons');
    if (!container) return;
    container.innerHTML = '';
    classes.forEach(cls => {
      const btn = document.createElement('button');
      btn.className = 'schedule-only';
      btn.dataset.filter = cls.class_id;
      btn.textContent = '仅' + (cls.name || cls.class_id);
      container.appendChild(btn);
    });
    applyFilter(preferences.schedule_filter || 'all');
  }

  function applyFilter(fv) {
    document.querySelectorAll('#classControlBar button[data-filter]').forEach(b => b.classList.toggle('active', b.dataset.filter === fv));
    document.querySelectorAll('.class-card').forEach(card => {
      card.style.display = (fv === 'all' || card.dataset.class === fv) ? 'block' : 'none';
    });
  }

  const classCtrlBar = $('classControlBar');
  if (classCtrlBar) {
    classCtrlBar.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-filter]');
      if (!btn) return;
      const fv = btn.dataset.filter;
      preferences.schedule_filter = fv;
      applyFilter(fv);
      API.updatePreferences({ schedule_filter: fv }).catch(() => {});
    });
  }

  // ============ 编辑课表开关 ============
  const editToggleBtn = $('editToggleBtn');
  if (editToggleBtn) {
    editToggleBtn.onclick = (e) => {
      e.stopPropagation();
      editAllOn = !editAllOn;
      editToggleBtn.classList.toggle('active', editAllOn);
      showSaveStatus(editAllOn ? '已开启编辑' : '已锁定', false);
    };
  }

  // ============ 编辑座位开关 ============
  const seatEditToggle = $('seatEditToggle');
  if (seatEditToggle) {
    seatEditToggle.onclick = (e) => {
      e.stopPropagation();
      seatEditOn = !seatEditOn;
      seatEditToggle.classList.toggle('active', seatEditOn);
      document.body.classList.toggle('person-mode', seatEditOn);
      renderSeats();
      showSaveStatus(seatEditOn ? '已开启编辑座位' : '已锁定', false);
    };
  }

  // ============ 班级卡片拖拽 ============
  function setupClassDrag(card, cls) {
    const header = card.querySelector('.card-header');
    if (!header) return;

    const onPressStart = (x, y) => {
      if (!editAllOn) return;
      classPressState = { el: card, cls, x, y };
      if (classPressTimer) clearTimeout(classPressTimer);
      classPressTimer = setTimeout(() => {
        classPressTimer = null;
        const ps = classPressState;
        classPressState = null;
        if (ps && editAllOn) activateClassDrag(ps.el, ps.cls, ps.x, ps.y);
      }, CLASS_LONG_PRESS_MS);
    };

    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      onPressStart(e.clientX, e.clientY);
    });
    header.addEventListener('touchstart', (e) => {
      if (e.target.closest('button')) return;
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      onPressStart(t.clientX, t.clientY);
    }, { passive: true });
  }

  function activateClassDrag(el, cls, x, y) {
    const rect = el.getBoundingClientRect();
    const ghost = el.cloneNode(true);
    ghost.classList.add('class-drag-ghost');
    ghost.style.position = 'fixed';
    ghost.style.left = rect.left + 'px';
    ghost.style.top = rect.top + 'px';
    ghost.style.width = rect.width + 'px';
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '99999';
    ghost.style.opacity = '0.9';
    document.body.appendChild(ghost);
    el.classList.add('dragging-class');
    classDrag = { el, cls, ghost, offsetX: x - rect.left, offsetY: y - rect.top, target: null };
    document.body.style.userSelect = 'none';
  }

  function updateClassDrag(x, y) {
    if (!classDrag) return;
    classDrag.ghost.style.left = (x - classDrag.offsetX) + 'px';
    classDrag.ghost.style.top = (y - classDrag.offsetY) + 'px';

    classDrag.ghost.style.display = 'none';
    const el = document.elementFromPoint(x, y);
    classDrag.ghost.style.display = '';
    const target = el && el.closest ? el.closest('.class-card') : null;

    if (classDrag.target && classDrag.target !== target) {
      classDrag.target.classList.remove('drag-over-class');
    }
    if (target && target !== classDrag.el) {
      target.classList.add('drag-over-class');
      classDrag.target = target;
    } else {
      classDrag.target = null;
    }
  }

  async function finishClassDrag() {
    if (!classDrag) return;
    const drag = classDrag;
    classDrag = null;
    document.body.style.userSelect = '';
    try { drag.ghost.remove(); } catch (e) {}
    drag.el.classList.remove('dragging-class');
    if (drag.target) drag.target.classList.remove('drag-over-class');

    suppressClickTime = Date.now();

    if (!drag.target) return;
    const fromId = drag.cls.class_id;
    const toId = drag.target.dataset.class;
    if (!fromId || !toId || fromId === toId) return;

    const fromIdx = classes.findIndex(c => c.class_id === fromId);
    const toIdx = classes.findIndex(c => c.class_id === toId);
    if (fromIdx < 0 || toIdx < 0) return;

    const tmp = classes[fromIdx];
    classes[fromIdx] = classes[toIdx];
    classes[toIdx] = tmp;
    classes.forEach((c, i) => { c.sort_order = i; });

    renderSchedule();
    try {
      await apiCall(API.updateClassOrder, classes.map(c => c.class_id));
      showSaveStatus('顺序已更新', false);
      scheduleAutoSync();
    } catch (e) { /* 已提示 */ }
  }

  document.addEventListener('mousemove', (e) => {
    if (classPressState) {
      const dx = e.clientX - classPressState.x;
      const dy = e.clientY - classPressState.y;
      if (Math.sqrt(dx * dx + dy * dy) > CLASS_MOVE_CANCEL_PX) {
        if (classPressTimer) { clearTimeout(classPressTimer); classPressTimer = null; }
        classPressState = null;
      }
      return;
    }
    if (classDrag) updateClassDrag(e.clientX, e.clientY);
  });
  document.addEventListener('mouseup', () => {
    if (classPressState) {
      if (classPressTimer) { clearTimeout(classPressTimer); classPressTimer = null; }
      classPressState = null;
    }
    if (classDrag) finishClassDrag();
  });
  document.addEventListener('touchmove', (e) => {
    if (classPressState && e.touches.length === 1) {
      const t = e.touches[0];
      const dx = t.clientX - classPressState.x;
      const dy = t.clientY - classPressState.y;
      if (Math.sqrt(dx * dx + dy * dy) > CLASS_MOVE_CANCEL_PX) {
        if (classPressTimer) { clearTimeout(classPressTimer); classPressTimer = null; }
        classPressState = null;
      }
      return;
    }
    if (classDrag && e.touches.length === 1) {
      e.preventDefault();
      const t = e.touches[0];
      updateClassDrag(t.clientX, t.clientY);
    }
  }, { passive: false });
  document.addEventListener('touchend', () => {
    if (classPressState) {
      if (classPressTimer) { clearTimeout(classPressTimer); classPressTimer = null; }
      classPressState = null;
    }
    if (classDrag) finishClassDrag();
  });
  document.addEventListener('touchcancel', () => {
    if (classPressState) {
      if (classPressTimer) { clearTimeout(classPressTimer); classPressTimer = null; }
      classPressState = null;
    }
    if (classDrag) finishClassDrag();
  });

  // ============ 新建班级 ============
  async function openCreateClassPop() {
    const gradeSel = $('classPopGrade');
    const numSel = $('classPopNum');
    const errEl = $('classPopError');
    if (errEl) errEl.textContent = '';

    fillGradeSelect(gradeSel, 7);
    fillClassNumSelect(numSel, 1);
    $('classPopBadge').value = '';

    const rosterRow = $('classPopRosterRow');
    const rosterSel = $('classPopRoster');
    if (rosterRow && rosterSel) {
      rosterRow.style.display = 'none';
      rosterSel.innerHTML = '';
      try {
        const resp = await API.listRoster('');
        const all = resp.students || [];
        const classIds = new Set(classes.map(c => c.class_id));
        const pending = new Set();
        all.forEach(s => {
          if (s.class_id && !classIds.has(s.class_id)) pending.add(s.class_id);
        });
        if (pending.size > 0) {
          rosterSel.innerHTML = '<option value="">（不关联）</option>' +
            Array.from(pending).sort().map(n =>
              '<option value="' + escapeHtml(n) + '">' + escapeHtml(n) + '（可导入）</option>'
            ).join('');
          rosterRow.style.display = 'flex';
        }
      } catch (e) { /* ignore */ }
    }

    $('classPop').style.display = 'flex';
  }

  const createClassBtn = $('createClassBtn');
  if (createClassBtn) {
    createClassBtn.onclick = () => {
      if (!currentUser) { alert('请先登录'); return; }
      openCreateClassPop();
    };
  }

  const classPopClose = $('classPopClose');
  if (classPopClose) classPopClose.onclick = () => { $('classPop').style.display = 'none'; };
  const classPopEl = $('classPop');
  if (classPopEl) classPopEl.addEventListener('click', e => { if (e.target === classPopEl) classPopEl.style.display = 'none'; });

  const classPopSave = $('classPopSave');
  if (classPopSave) {
    classPopSave.onclick = async () => {
      const grade = parseInt($('classPopGrade').value, 10);
      const classNum = parseInt($('classPopNum').value, 10);
      const badgeName = $('classPopBadge').value.trim();
      const pendingName = ($('classPopRoster') || {}).value || '';
      const errEl = $('classPopError');
      errEl.textContent = '';

      if (!grade || grade < 1 || grade > 12) { errEl.textContent = '请选择年级'; return; }
      if (!classNum || classNum < 1 || classNum > 30) { errEl.textContent = '请选择班级'; return; }
      if (classes.some(c => c.grade === grade && c.class_num === classNum)) {
        errEl.textContent = '该班级已存在';
        return;
      }

      try {
        const resp = await apiCall(API.createClass, grade, classNum, withBadgePrefix(badgeName));
        classes.push(resp.class);
        classes.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

        if (pendingName && resp.class) {
          try {
            await API.moveRoster(pendingName, resp.class.class_id);
            showSaveStatus('班级已创建，花名册已导入', false);
            loadRoster().catch(() => {});
          } catch (e) {
            showSaveStatus('班级已创建，但花名册关联失败', true);
          }
        } else {
          showSaveStatus('班级已创建', false);
        }

        renderFilterButtons();
        renderSchedule();
        updateSeatCardTitle();
        scheduleAutoSync();
        $('classPop').style.display = 'none';
      } catch (err) {
        errEl.textContent = err.message || '创建失败';
      }
    };
  }

  // ============ 班级管理弹窗 ============
  function openClassManagePop(cls) {
    currentManageClassId = cls.class_id;
    $('classManageTitle').textContent = '班级管理 · ' + cls.name;
    fillGradeSelect($('classManageGrade'), cls.grade || 7);
    fillClassNumSelect($('classManageNum'), cls.class_num || 1);
    fillPeriodCountSelect($('classManagePeriods'), cls.period_count || 8);
    $('classManageBadge').value = stripBadgePrefix(cls.badge);
    const errEl = $('classManageError');
    errEl.textContent = '';
    $('classManagePop').style.display = 'flex';
  }

  const classManageClose = $('classManageClose');
  if (classManageClose) classManageClose.onclick = () => { $('classManagePop').style.display = 'none'; };
  const classManagePopEl = $('classManagePop');
  if (classManagePopEl) classManagePopEl.addEventListener('click', e => { if (e.target === classManagePopEl) classManagePopEl.style.display = 'none'; });

  const classManageSave = $('classManageSave');
  if (classManageSave) {
    classManageSave.onclick = async () => {
      if (!currentManageClassId) return;
      const cls = classes.find(c => c.class_id === currentManageClassId);
      if (!cls) return;
      const grade = parseInt($('classManageGrade').value, 10);
      const classNum = parseInt($('classManageNum').value, 10);
      const periodCount = parseInt(($('classManagePeriods') || {}).value, 10) || 8;
      const badgeName = $('classManageBadge').value.trim();
      const errEl = $('classManageError');
      errEl.textContent = '';

      if (!grade || !classNum) { errEl.textContent = '请选择年级和班级'; return; }
      if (classes.some(c => c.class_id !== cls.class_id && c.grade === grade && c.class_num === classNum)) {
        errEl.textContent = '该班级已存在';
        return;
      }

      try {
        const newName = formatClassName(grade, classNum);
        await apiCall(API.updateClass, cls.class_id, {
          name: newName,
          badge: withBadgePrefix(badgeName),
          grade: grade,
          class_num: classNum,
          period_count: periodCount,
        });
        cls.name = newName;
        cls.badge = withBadgePrefix(badgeName);
        cls.grade = grade;
        cls.class_num = classNum;
        cls.period_count = periodCount;
        renderSchedule();
        updateSeatCardTitle();
        showSaveStatus('班级已更新', false);
        scheduleAutoSync();
        $('classManagePop').style.display = 'none';
      } catch (err) {
        errEl.textContent = err.message || '保存失败';
      }
    };
  }

  const classManageDelete = $('classManageDelete');
  if (classManageDelete) {
    classManageDelete.onclick = async () => {
      if (!currentManageClassId) return;
      const cls = classes.find(c => c.class_id === currentManageClassId);
      if (!cls) return;
      if (!confirm('确认删除班级「' + cls.name + '」及其所有课程数据？此操作不可恢复。')) return;
      try {
        await apiCall(API.deleteClass, cls.class_id);
        classes = classes.filter(c => c.class_id !== cls.class_id);
        Object.keys(cellData).forEach(k => { if (k.startsWith(cls.class_id + '_cell_')) delete cellData[k]; });
        renderSchedule();
        updateSeatCardTitle();
        showSaveStatus('班级已删除', false);
        scheduleAutoSync();
        $('classManagePop').style.display = 'none';
      } catch {}
    };
  }

  // ============ Schedule Rendering ============
  function renderSchedule() {
    const container = scheduleContainer;
    if (!container) return;
    container.innerHTML = '';

    if (classes.length === 0) {
      const emptyCard = document.createElement('div');
      emptyCard.className = 'card';
      emptyCard.innerHTML =
        '<div style="text-align:center;padding:40px 20px;">' +
        '<p style="font-size:16px;color:var(--text-sub);margin-bottom:16px;">暂无班级</p>' +
        '<button id="emptyCreateClassBtn" style="padding:10px 24px;border-radius:10px;border:none;background:#16a085;color:#fff;font-size:14px;cursor:pointer;font-family:inherit;">＋ 新建班级</button>' +
        '<p style="font-size:13px;color:var(--text-sub);margin-top:16px;">或点击「⚙️ 更多 → 📗 导入」批量导入</p>' +
        '</div>';
      container.appendChild(emptyCard);
      const b = $('emptyCreateClassBtn');
      if (b) b.onclick = () => openCreateClassPop();
      renderLegendCard(container);
      renderFilterButtons();
      return;
    }

    classes.forEach(cls => renderClassCard(container, cls));
    renderLegendCard(container);
    updateAllLegends();
    renderFilterButtons();
    renderWeekHighlight();
  }

  function createBreakRow(cls) {
    const tr = document.createElement('tr');
    tr.className = 'break-row';

    const td = document.createElement('td');
    td.colSpan = 6;
    td.dataset.type = 'break';
    td.dataset.idx = String(BREAK_CELL_INDEX);
    td.dataset.classId = cls.class_id;

    let bName = '午休';
    let bTime = '12:00-13:00';
    const key = cls.class_id + '_cell_' + BREAK_CELL_INDEX;
    if (cellData[key] && cellData[key].cell_type === 'break') {
      if (cellData[key].period_name) bName = cellData[key].period_name;
      if (cellData[key].period_time !== undefined) bTime = cellData[key].period_time;
    }

    td.innerHTML =
      '<span class="cell-period-name">' + escapeHtml(bName) + '</span>' +
      '<span class="cell-time">' + escapeHtml(bTime) + '</span>';

    tr.appendChild(td);
    return tr;
  }

  function renderClassCard(container, cls) {
    const card = document.createElement('div');
    card.className = 'card class-card';
    card.dataset.class = cls.class_id;

    const header = document.createElement('div');
    header.className = 'card-header';
    header.innerHTML =
      '<h2>' + escapeHtml(cls.name) +
      (cls.badge ? '<span class="badge">' + escapeHtml(cls.badge) + '</span>' : '') +
      '</h2>' +
      '<div class="legend">' +
      '<span class="legend-items" data-legend-items="' + escapeHtml(cls.class_id) + '"></span>' +
      '<button class="mini-toggle" data-class-menu="' + escapeHtml(cls.class_id) + '">菜单</button>' +
      '</div>';
    card.appendChild(header);

    const table = document.createElement('table');
    table.className = 'schedule-table';
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>节次</th><th>星期一</th><th>星期二</th><th>星期三</th><th>星期四</th><th>星期五</th></tr>';
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const periodCount = (cls.period_count && cls.period_count > 0)
      ? cls.period_count
      : defaultPeriods.length;

    for (let pIdx = 0; pIdx < periodCount; pIdx++) {
      const tr = document.createElement('tr');

      const tdP = document.createElement('td');
      const pIdxGlobal = pIdx * 6;
      tdP.dataset.type = 'period';
      tdP.dataset.idx = pIdxGlobal.toString();
      tdP.dataset.classId = cls.class_id;

      let pName = (defaultPeriods[pIdx] && defaultPeriods[pIdx].name) || ('第' + (pIdx + 1) + '节');
      let pTime = (defaultPeriods[pIdx] && defaultPeriods[pIdx].time) || '';
      const pKey = cls.class_id + '_cell_' + pIdxGlobal;
      if (cellData[pKey] && cellData[pKey].cell_type === 'period') {
        if (cellData[pKey].period_name) pName = cellData[pKey].period_name;
        if (cellData[pKey].period_time !== undefined) pTime = cellData[pKey].period_time;
      }
      tdP.innerHTML = '<span class="cell-period-name">' + escapeHtml(pName) + '</span><span class="cell-time">' + escapeHtml(pTime) + '</span>';
      tr.appendChild(tdP);

      for (let d = 0; d < 5; d++) {
        const td = document.createElement('td');
        const idx = pIdx * 6 + d + 1;
        td.dataset.type = 'lesson';
        td.dataset.idx = idx.toString();
        td.dataset.classId = cls.class_id;

        let subj = '', teacher = '';
        const cKey = cls.class_id + '_cell_' + idx;
        if (cellData[cKey] && cellData[cKey].cell_type === 'lesson') {
          subj = cellData[cKey].subject || '';
          teacher = cellData[cKey].teacher || '';
        }
        td.innerHTML = '<span class="cell-subject">' + escapeHtml(subj) + '</span><span class="cell-teacher">' + escapeHtml(teacher) + '</span>';
        refreshCellStyle(td);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);

      if (pIdx === BREAK_AFTER_PERIOD - 1 && pIdx < periodCount - 1) {
        tbody.appendChild(createBreakRow(cls));
      }
    }

    table.appendChild(tbody);
    card.appendChild(table);
    container.appendChild(card);

    table.querySelectorAll('tbody td').forEach(td => {
      td.onclick = () => {
        if (Date.now() - suppressClickTime < 400) return;
        if (!editAllOn) { showSaveStatus('已锁定，请点击顶部「✏️ 编辑课表」开启编辑', true); return; }
        openCellPop(td);
      };
    });

    const menuBtn = header.querySelector('.mini-toggle[data-class-menu]');
    if (menuBtn) {
      menuBtn.onclick = (e) => {
        if (Date.now() - suppressClickTime < 400) return;
        e.stopPropagation();
        openClassManagePop(cls);
      };
    }

    setupClassDrag(card, cls);
  }

  function renderLegendCard(container) {
    if (!defaultLegend || !defaultLegend.length) return;
    const legendCard = document.createElement('div');
    legendCard.className = 'card legend-card';
    legendCard.id = 'legendCard';
    legendCard.innerHTML =
      '<div class="card-header"><h2>📖 课程简称说明</h2><div class="legend" style="font-size:13px;color:var(--text-sub);">共 <strong style="color:var(--text-main);">' + defaultLegend.length + '</strong> 项</div></div>' +
      '<div class="legend-grid">' + defaultLegend.map(item =>
        '<div class="legend-item"><span class="abbr' + (item.special ? ' special' : '') + '">' + escapeHtml(item.abbr) + '</span><span class="full">' + escapeHtml(item.full) + '</span></div>'
      ).join('') + '</div>';
    container.appendChild(legendCard);
  }

  function refreshCellStyle(td) {
    td.classList.remove('empty');
    td.removeAttribute('data-bg-color');
    if (td.dataset.type !== 'lesson') return;
    const subjEl = td.querySelector('.cell-subject');
    if (!subjEl) return;
    const t = subjEl.textContent.trim();
    if (!t) { td.classList.add('empty'); return; }
    if (t === '—') { td.classList.add('empty'); return; }
    const cls = td.dataset.classId;
    const key = cls + '_cell_' + td.dataset.idx;
    const data = cellData[key] || {};
    if (data.bg_color && data.bg_color !== '0') td.setAttribute('data-bg-color', data.bg_color);
  }

  const COLOR_BG = ['#fff', '#f9d0d0', '#a9c9f0', '#a7e0b9', '#f0e08b', '#c9a8f0', '#f0b98a'];
  const COLOR_BD = ['#bbb', '#f0b8b8', '#a9c9f0', '#a7e0b9', '#f0e08b', '#c9a8f0', '#f0b98a'];

  function updateClassLegend(classId) {
    const card = document.querySelector('.class-card[data-class="' + cssEscape(classId) + '"]');
    if (!card) return;
    const container = card.querySelector('.legend-items');
    if (!container) return;
    const colorMap = {}, seen = {};
    card.querySelectorAll('.schedule-table tbody td[data-type="lesson"]').forEach(td => {
      const subjEl = td.querySelector('.cell-subject');
      if (!subjEl) return;
      const subj = subjEl.textContent.trim();
      if (!subj || subj === '—') return;
      const bg = td.getAttribute('data-bg-color');
      if (bg && bg !== '0' && !seen[subj]) {
        seen[subj] = true;
        if (!colorMap[bg]) colorMap[bg] = [];
        colorMap[bg].push(subj);
      }
    });
    const colorOrder = ['1', '2', '3', '4', '5', '6'];
    const groups = [];
    colorOrder.forEach(c => { if (colorMap[c] && colorMap[c].length > 0) groups.push({ color: c, subjects: colorMap[c] }); });
    if (groups.length === 0) { container.innerHTML = '<span class="legend-text">未设置高亮</span>'; return; }
    container.innerHTML = groups.map(g => {
      const idx = parseInt(g.color, 10);
      const bg = (idx > 0 && idx < COLOR_BG.length) ? COLOR_BG[idx] : '#f9d0d0';
      const bd = (idx > 0 && idx < COLOR_BD.length) ? COLOR_BD[idx] : '#f0b8b8';
      return '<span class="dot" style="background:' + bg + ';border-color:' + bd + '"></span><span class="legend-text">含「' + g.subjects.join('、') + '」的科目</span>';
    }).join('<span class="sep">·</span>');
  }
  function updateAllLegends() { classes.forEach(c => updateClassLegend(c.class_id)); }

  // ============ Cell 编辑弹窗 ============
  function openCellPop(td) {
    currentCellIdx = +td.dataset.idx;
    currentCellType = td.dataset.type;
    currentCellClassId = td.dataset.classId;
    const isBreak = currentCellType === 'break';
    const isPeriod = currentCellType === 'period';
    const showPeriod = isPeriod || isBreak;

    $('cellPopPeriodRow1').style.display = showPeriod ? 'flex' : 'none';
    $('cellPopPeriodRow2').style.display = showPeriod ? 'flex' : 'none';
    $('cellPopSubjectRow').style.display = showPeriod ? 'none' : 'flex';
    $('cellPopTeacherRow').style.display = showPeriod ? 'none' : 'flex';
    $('cellPopColorRow').style.display = showPeriod ? 'none' : 'flex';

    if (showPeriod) {
      $('cellPopTitle').textContent = isBreak ? '编辑午休' : '编辑节次';
      const nameEl = td.querySelector('.cell-period-name');
      const timeEl = td.querySelector('.cell-time');
      $('cellPopPeriodName').value = nameEl ? nameEl.textContent : '';
      $('cellPopPeriodTime').value = timeEl ? timeEl.textContent : '';
    } else {
      $('cellPopTitle').textContent = '编辑课程';
      $('cellPopSubject').value = td.querySelector('.cell-subject').textContent;
      $('cellPopTeacher').value = td.querySelector('.cell-teacher').textContent || '';
      const key = currentCellClassId + '_cell_' + currentCellIdx;
      const data = cellData[key] || {};
      currentBgColor = data.bg_color || '0';
      document.querySelectorAll('#cellPopColors button').forEach(b => b.classList.toggle('selected', b.dataset.color === currentBgColor));
    }
    $('cellPop').style.display = 'flex';
    setTimeout(() => { (showPeriod ? $('cellPopPeriodName') : $('cellPopSubject')).focus(); }, 100);
  }
  document.querySelectorAll('#cellPopColors button').forEach(b => {
    b.onclick = () => {
      currentBgColor = b.dataset.color;
      document.querySelectorAll('#cellPopColors button').forEach(x => x.classList.remove('selected'));
      b.classList.add('selected');
    };
  });
  const cellPopSave = $('cellPopSave');
  if (cellPopSave) {
    cellPopSave.onclick = async function () {
      if (currentCellIdx === null) return;
      const td = document.querySelector('.schedule-table tbody td[data-idx="' + currentCellIdx + '"][data-class-id="' + cssEscape(currentCellClassId) + '"]');
      if (!td) return;
      const cls = currentCellClassId;
      const key = cls + '_cell_' + currentCellIdx;
      if (currentCellType === 'period' || currentCellType === 'break') {
        const name = $('cellPopPeriodName').value.trim();
        const time = $('cellPopPeriodTime').value.trim();
        const type = currentCellType;

        const nameEl = td.querySelector('.cell-period-name');
        const timeEl = td.querySelector('.cell-time');
        if (nameEl) nameEl.textContent = name || (type === 'break' ? '午休' : '');
        if (timeEl) timeEl.textContent = time;

        cellData[key] = {
          class_id: cls, cell_index: currentCellIdx, cell_type: type,
          period_name: name, period_time: time, bg_color: '0',
        };
        try {
          await apiCall(API.upsertCell, {
            class_id: cls, cell_index: currentCellIdx, cell_type: type,
            period_name: name, period_time: time,
            subject: '', teacher: '', bg_color: '0',
          });
        } catch { return; }
      } else {
        const subject = $('cellPopSubject').value.trim();
        const teacher = $('cellPopTeacher').value.trim();
        td.querySelector('.cell-subject').textContent = subject;
        td.querySelector('.cell-teacher').textContent = teacher;
        cellData[key] = { class_id: cls, cell_index: currentCellIdx, cell_type: 'lesson', subject, teacher, bg_color: currentBgColor };
        try { await apiCall(API.upsertCell, { class_id: cls, cell_index: currentCellIdx, cell_type: 'lesson', subject, teacher, bg_color: currentBgColor, period_name: '', period_time: '' }); } catch { return; }
        refreshCellStyle(td);
        updateAllLegends();
      }
      renderWeekHighlight();
      showSaveStatus('已保存', false);
      scheduleAutoSync();
      $('cellPop').style.display = 'none';
    };
  }
  const cellPopClose = $('cellPopClose');
  if (cellPopClose) cellPopClose.onclick = () => { $('cellPop').style.display = 'none'; };
  const cellPopEl = $('cellPop');
  if (cellPopEl) cellPopEl.addEventListener('click', e => { if (e.target === cellPopEl) cellPopEl.style.display = 'none'; });
  const cellPopSubject = $('cellPopSubject');
  if (cellPopSubject) cellPopSubject.addEventListener('keydown', e => { if (e.key === 'Enter') $('cellPopSave').click(); });
  const cellPopTeacher = $('cellPopTeacher');
  if (cellPopTeacher) cellPopTeacher.addEventListener('keydown', e => { if (e.key === 'Enter') $('cellPopSave').click(); });
  const cellPopPeriodName = $('cellPopPeriodName');
  if (cellPopPeriodName) cellPopPeriodName.addEventListener('keydown', e => { if (e.key === 'Enter') $('cellPopPeriodTime').focus(); });
  const cellPopPeriodTime = $('cellPopPeriodTime');
  if (cellPopPeriodTime) cellPopPeriodTime.addEventListener('keydown', e => { if (e.key === 'Enter') $('cellPopSave').click(); });

  // ============ Theme ============
  function setThemeBtn() {
    const isDark = html.hasAttribute('data-theme');
    const btn = $('themeToggle');
    if (!btn) return;
    btn.textContent = isDark ? '🌙' : '☀️';
    btn.title = isDark ? '切换到浅色' : '切换到深色';
    btn.classList.toggle('active', isDark);
  }
  setThemeBtn();
  const themeToggle = $('themeToggle');
  if (themeToggle) {
    themeToggle.onclick = () => {
      if (html.hasAttribute('data-theme')) { html.removeAttribute('data-theme'); preferences.theme = 'light'; }
      else { html.setAttribute('data-theme', 'dark'); preferences.theme = 'dark'; }
      setThemeBtn();
      API.updatePreferences({ theme: preferences.theme }).catch(() => {});
    };
  }

  // ============ Week Highlight ============
  const toggleWeekHighlight = $('toggleWeekHighlight');
  if (toggleWeekHighlight) {
    toggleWeekHighlight.onclick = () => {
      preferences.week_highlight = !preferences.week_highlight;
      toggleWeekHighlight.classList.toggle('active', preferences.week_highlight);
      renderWeekHighlight();
      API.updatePreferences({ week_highlight: preferences.week_highlight }).catch(() => {});
    };
  }
  function renderWeekHighlight() {
    document.querySelectorAll('.today-col').forEach(el => el.classList.remove('today-col'));
    if (!preferences.week_highlight) return;
    const wd = new Date().getDay();
    if (wd >= 1 && wd <= 5) {
      document.querySelectorAll('.schedule-table').forEach(table => {
        table.querySelectorAll('thead tr th:nth-child(' + (wd + 1) + ')').forEach(el => el.classList.add('today-col'));
        table.querySelectorAll('tbody tr td:nth-child(' + (wd + 1) + ')').forEach(el => el.classList.add('today-col'));
      });
    }
  }

  // ============ More Panel (class) ============
  const moreToggle = $('moreToggle');
  if (moreToggle) {
    moreToggle.onclick = (e) => {
      e.stopPropagation();
      const panel = $('morePanel');
      if (!panel) return;
      const open = panel.classList.toggle('open');
      moreToggle.classList.toggle('open', open);
      moreToggle.textContent = open ? '⚙️ 收起' : '⚙️ 更多';
    };
  }

  // ============ Excel 基础工具 ============
  function readExcelFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const wb = XLSX.read(data, { type: 'array' });
          resolve(wb);
        } catch (err) { reject(err); }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  function pickExcelFile(onFile) {
    const input = $('excelFileInput');
    if (!input) return;
    input.value = '';
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      try {
        await onFile(file);
      } catch (err) {
        showSaveStatus('解析失败: ' + (err.message || ''), true);
      } finally {
        input.value = '';
      }
    };
    input.click();
  }

  // ============ 课表导出 ============
  function openExportSchedulePop() {
    if (!classes.length) { alert('暂无班级可导出'); return; }
    const listEl = $('exportScheduleList');
    const errEl = $('exportScheduleError');
    listEl.innerHTML = '';
    errEl.textContent = '';

    classes.forEach(cls => {
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 6px;cursor:pointer;border-radius:6px;font-size:14px;color:var(--text-main);';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.dataset.classId = cls.class_id;
      cb.checked = true;
      cb.style.cssText = 'width:16px;height:16px;cursor:pointer;';
      const text = document.createElement('span');
      text.innerHTML = escapeHtml(cls.name) + (cls.badge ? ' <span style="color:var(--text-sub);font-size:12px;">· ' + escapeHtml(cls.badge) + '</span>' : '');
      row.appendChild(cb);
      row.appendChild(text);
      listEl.appendChild(row);
    });

    $('exportScheduleAll').checked = true;
    $('exportSchedulePop').style.display = 'flex';
  }

  const exportScheduleAll = $('exportScheduleAll');
  if (exportScheduleAll) {
    exportScheduleAll.onchange = () => {
      const checked = exportScheduleAll.checked;
      document.querySelectorAll('#exportScheduleList input[type="checkbox"]').forEach(cb => { cb.checked = checked; });
      $('exportScheduleError').textContent = '';
    };
  }

  const exportScheduleList = $('exportScheduleList');
  if (exportScheduleList) {
    exportScheduleList.addEventListener('change', () => {
      const all = document.querySelectorAll('#exportScheduleList input[type="checkbox"]');
      const checked = document.querySelectorAll('#exportScheduleList input[type="checkbox"]:checked');
      $('exportScheduleAll').checked = (all.length > 0 && checked.length === all.length);
      $('exportScheduleError').textContent = '';
    });
  }

  const exportScheduleClose = $('exportScheduleClose');
  if (exportScheduleClose) exportScheduleClose.onclick = () => { $('exportSchedulePop').style.display = 'none'; };
  const exportSchedulePopEl = $('exportSchedulePop');
  if (exportSchedulePopEl) exportSchedulePopEl.addEventListener('click', e => { if (e.target === exportSchedulePopEl) exportSchedulePopEl.style.display = 'none'; });

  const exportScheduleConfirm = $('exportScheduleConfirm');
  if (exportScheduleConfirm) {
    exportScheduleConfirm.onclick = () => {
      const selected = [];
      document.querySelectorAll('#exportScheduleList input[type="checkbox"]:checked').forEach(cb => {
        const id = cb.dataset.classId;
        const cls = classes.find(c => c.class_id === id);
        if (cls) selected.push(cls);
      });
      if (!selected.length) {
        $('exportScheduleError').textContent = '请至少选择一个班级';
        return;
      }
      doExportScheduleExcel(selected);
      $('exportSchedulePop').style.display = 'none';
    };
  }

  function doExportScheduleExcel(list) {
    const wb = XLSX.utils.book_new();
    list.forEach(cls => {
      const rows = [['节次', '时间段', '星期一', '星期二', '星期三', '星期四', '星期五']];
      const periodCount = (cls.period_count && cls.period_count > 0) ? cls.period_count : defaultPeriods.length;
      for (let pIdx = 0; pIdx < periodCount; pIdx++) {
        let pName = (defaultPeriods[pIdx] && defaultPeriods[pIdx].name) || ('第' + (pIdx + 1) + '节');
        let pTime = (defaultPeriods[pIdx] && defaultPeriods[pIdx].time) || '';
        const pKey = cls.class_id + '_cell_' + (pIdx * 6);
        if (cellData[pKey] && cellData[pKey].cell_type === 'period') {
          if (cellData[pKey].period_name) pName = cellData[pKey].period_name;
          if (cellData[pKey].period_time !== undefined) pTime = cellData[pKey].period_time;
        }
        const row = [pName, pTime];
        for (let d = 0; d < 5; d++) {
          const idx = pIdx * 6 + d + 1;
          const key = cls.class_id + '_cell_' + idx;
          let subj = '', teacher = '';
          if (cellData[key] && cellData[key].cell_type === 'lesson') {
            subj = cellData[key].subject || '';
            teacher = cellData[key].teacher || '';
          }
          let cell = subj || '';
          if (teacher) cell = subj ? (subj + '/' + teacher) : teacher;
          row.push(cell);
        }
        rows.push(row);

        if (pIdx === BREAK_AFTER_PERIOD - 1 && pIdx < periodCount - 1) {
          const bKey = cls.class_id + '_cell_' + BREAK_CELL_INDEX;
          let bName = '午休';
          let bTime = '12:00-13:00';
          if (cellData[bKey] && cellData[bKey].cell_type === 'break') {
            if (cellData[bKey].period_name) bName = cellData[bKey].period_name;
            if (cellData[bKey].period_time !== undefined) bTime = cellData[bKey].period_time;
          }
          rows.push([bName, bTime, '', '', '', '', '']);
        }
      }
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [{ wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
      let sheetName = (cls.name || cls.class_id).replace(/[\\\/\?\*\[\]:]/g, '_').slice(0, 31);
      if (!sheetName) sheetName = cls.class_id;
      let finalName = sheetName, n = 1;
      while (wb.SheetNames.indexOf(finalName) >= 0) { finalName = sheetName.slice(0, 28) + '_' + n; n++; }
      XLSX.utils.book_append_sheet(wb, ws, finalName);
    });

    let prefix;
    if (list.length === 1) prefix = list[0].name || list[0].class_id;
    else if (list.length === classes.length) prefix = '全部' + list.length + '个班';
    else prefix = '多个班级(' + list.length + ')';
    XLSX.writeFile(wb, safeFilePart(prefix) + '_课程表_' + dateStamp() + '.xlsx');
    showSaveStatus('已导出 ' + list.length + ' 个班级', false);
  }

  // ============ 课表导入 ============
  async function importScheduleExcel(file, targetClass) {
    if (!targetClass) { alert('未选择目标班级'); return; }
    const wb = await readExcelFile(file);
    const updates = [];
    const periodCount = (targetClass.period_count && targetClass.period_count > 0)
      ? targetClass.period_count : defaultPeriods.length;

    const sheetName = wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });

    let pIdx = 0;
    for (let i = 1; i < rows.length && pIdx < periodCount; i++) {
      const row = rows[i];
      const pName = String(row[0] !== undefined ? row[0] : '').trim();
      const pTime = String(row[1] !== undefined ? row[1] : '').trim();

      const isBreakRow = /午休|休息|午餐/.test(pName);
      if (isBreakRow) {
        if (pName || pTime) {
          updates.push({
            class_id: targetClass.class_id,
            cell_index: BREAK_CELL_INDEX,
            cell_type: 'break',
            period_name: pName || '午休',
            period_time: pTime,
            subject: '', teacher: '', bg_color: '0',
          });
        }
        continue;
      }

      if (pName) {
        updates.push({
          class_id: targetClass.class_id,
          cell_index: pIdx * 6,
          cell_type: 'period',
          period_name: pName,
          period_time: pTime,
          subject: '', teacher: '', bg_color: '0',
        });
      }

      for (let d = 0; d < 5; d++) {
        const raw = row[d + 2];
        if (raw === undefined || raw === null) continue;
        const cellStr = String(raw).trim();
        let subj = cellStr, teacher = '';
        const slashIdx = cellStr.indexOf('/');
        if (slashIdx >= 0) {
          subj = cellStr.slice(0, slashIdx).trim();
          teacher = cellStr.slice(slashIdx + 1).trim();
        }
        const idxGlobal = pIdx * 6 + d + 1;
        const key = targetClass.class_id + '_cell_' + idxGlobal;
        const oldBg = (cellData[key] && cellData[key].bg_color) || '0';
        updates.push({
          class_id: targetClass.class_id,
          cell_index: idxGlobal,
          cell_type: 'lesson',
          subject: subj,
          teacher,
          period_name: '', period_time: '',
          bg_color: oldBg,
        });
      }
      pIdx++;
    }

    if (!updates.length) { alert('未从 Excel 中解析到有效的课程数据'); return; }
    if (!confirm('即将把「' + sheetName + '」中的 ' + updates.length + ' 个单元格导入到「' + targetClass.name + '」，确认？')) return;

    showSaveStatus('正在导入...', false);
    try {
      await apiCall(API.batchUpsert, updates);
      await reloadCellData();
      renderSchedule();
      showSaveStatus('课表已导入到「' + targetClass.name + '」', false);
      scheduleAutoSync();
    } catch (err) {
      showSaveStatus('导入失败: ' + (err.message || ''), true);
    }
  }

  // ============ 花名册 Excel 导入 ============
  function matchRosterHeaderCell(cell) {
    const t = String(cell || '').trim();
    if (!t) return '';
    const low = t.toLowerCase();
    const aliases = {
      name:     ['姓名', '名字', '学生姓名', '学生', 'name'],
      gender:   ['性别', 'sex'],
      idCard:   ['身份证号', '身份证', '证件号', 'idcard', 'id_card'],
      tel1:     ['家长电话1', '家长1电话', '家长电话一', '电话1', '联系电话1', '联系电话', '家长电话', '父/母电话', 'tel1'],
      tel2:     ['家长电话2', '家长2电话', '家长电话二', '电话2', '联系电话2', '备用电话', 'tel2'],
      address:  ['家庭地址', '家庭住址', '住址', '地址', 'address'],
      classCol: ['班级', '班级名称', '所在班级', '班别', 'class', '行政班'],
    };
    for (const k of Object.keys(aliases)) {
      for (const a of aliases[k]) {
        if (t === a || t.indexOf(a) >= 0 || low === a || low.indexOf(a) >= 0) return k;
      }
    }
    return '';
  }

  async function importRosterExcel(file, targetClass, gradeHint) {
    const isAllMode = !targetClass;
    gradeHint = gradeHint || 0;

    const wb = await readExcelFile(file);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (rows.length < 1) { alert('Excel 内容为空'); return; }

    let headerRowIdx = -1;
    let headerMap = {};
    let bestScore = 0;
    for (let r = 0; r < Math.min(10, rows.length); r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;
      const map = {};
      let score = 0;
      row.forEach((cell, ci) => {
        const k = matchRosterHeaderCell(cell);
        if (k && map[k] === undefined) { map[k] = ci; score++; }
      });
      if (map.name !== undefined && score > bestScore) {
        bestScore = score;
        headerRowIdx = r;
        headerMap = map;
      }
    }

    let dataStartIdx;
    let colIdx;
    if (headerRowIdx >= 0) {
      dataStartIdx = headerRowIdx + 1;
      colIdx = {
        name:     headerMap.name     !== undefined ? headerMap.name     : -1,
        gender:   headerMap.gender   !== undefined ? headerMap.gender   : -1,
        idCard:   headerMap.idCard   !== undefined ? headerMap.idCard   : -1,
        tel1:     headerMap.tel1     !== undefined ? headerMap.tel1     : -1,
        tel2:     headerMap.tel2     !== undefined ? headerMap.tel2     : -1,
        address:  headerMap.address  !== undefined ? headerMap.address  : -1,
        classCol: headerMap.classCol !== undefined ? headerMap.classCol : -1,
      };
    } else {
      const yes = confirm(
        '未在 Excel 前 10 行中找到「姓名」表头。\n\n' +
        '是否按常见列顺序解析？（默认：序号 | 姓名 | 性别 | 身份证 | 班级 | 家长电话1 | 家长电话2 | 家庭地址）'
      );
      if (!yes) return;
      dataStartIdx = 0;
      colIdx = { name: 1, gender: 2, idCard: 3, classCol: 4, tel1: 5, tel2: 6, address: 7 };
    }

    if (isAllMode && colIdx.classCol < 0) {
      alert('「全部班级」模式需要能识别出「班级」列。\n请检查 Excel 中是否有班级列，或改用「指定班级」导入。');
      return;
    }

    const classByName = {};
    classes.forEach(c => { classByName[c.name] = c.class_id; });

    const CN_NUM_MAP = { '一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,
                         '十一':11,'十二':12,'十三':13,'十四':14,'十五':15,'十六':16,'十七':17,
                         '十八':18,'十九':19,'二十':20,'二十一':21,'二十二':22,'二十三':23,'二十四':24,
                         '二十五':25,'二十六':26,'二十七':27,'二十八':28,'二十九':29,'三十':30 };

    function findClassByGradeAndNum(grade, num) {
      for (const c of classes) {
        if (c.grade === grade && c.class_num === num) return c.class_id;
      }
      return '';
    }

    function matchClassId(text) {
      if (!text) return '';
      const t = String(text).trim();
      if (!t) return '';

      if (classByName[t]) return classByName[t];

      const mNum = t.match(/^(\d+)\s*班?$/);
      if (mNum && gradeHint) {
        const n = parseInt(mNum[1], 10);
        const hit = findClassByGradeAndNum(gradeHint, n);
        if (hit) return hit;
      }

      const mCN = t.match(/^([一二三四五六七八九十]+)\s*班?$/);
      if (mCN && gradeHint) {
        const n = CN_NUM_MAP[mCN[1]];
        if (n) {
          const hit = findClassByGradeAndNum(gradeHint, n);
          if (hit) return hit;
        }
      }

      for (const c of classes) {
        const zh = c.name.replace(/^(.+?)\.(\d+)班$/, '$1年级$2班');
        if (zh === t) return c.class_id;
        if (t === c.grade + '-' + c.class_num) return c.class_id;
        if (t === c.grade + '.' + c.class_num) return c.class_id;
        if (t === c.grade + '_' + c.class_num) return c.class_id;
        if (t === c.grade + '年' + c.class_num + '班') return c.class_id;
        if (t === c.grade + '年级' + c.class_num + '班') return c.class_id;
        if (t === c.grade + '年级' + c.class_num) return c.class_id;
        if (t === gradeLabel(c.grade) + '年级' + c.class_num + '班') return c.class_id;
        if (t === gradeLabel(c.grade) + '.' + c.class_num + '班') return c.class_id;
        if (t === gradeLabel(c.grade) + c.class_num + '班') return c.class_id;
      }

      const mGrade = t.match(/^([一二三四五六七八九十\d]+)\s*年级\s*(\d+)\s*班?$/);
      if (mGrade) {
        let g;
        if (/^\d+$/.test(mGrade[1])) g = parseInt(mGrade[1], 10);
        else g = CN_NUM_MAP[mGrade[1]] || 0;
        const n = parseInt(mGrade[2], 10);
        if (g && n) {
          const hit = findClassByGradeAndNum(g, n);
          if (hit) return hit;
        }
      }

      return '';
    }

    const toImport = [];
    let skipped = 0;
    let emptyName = 0;
    let pending = 0;

    for (let i = dataStartIdx; i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      if (colIdx.name >= 0 && matchRosterHeaderCell(r[colIdx.name]) === 'name') continue;

      const name = colIdx.name >= 0 ? String(r[colIdx.name] || '').trim() : '';
      if (!name) { emptyName++; continue; }

      let classId = '';
      if (isAllMode) {
        const clsText = colIdx.classCol >= 0 ? String(r[colIdx.classCol] || '').trim() : '';
        if (!clsText) { emptyName++; continue; }
        const matched = matchClassId(clsText);
        classId = matched || clsText;
        if (!matched) pending++;
      } else {
        classId = targetClass.class_id;
      }

      let g = colIdx.gender >= 0 ? String(r[colIdx.gender] || '').trim() : '';
      if (g.indexOf('女') >= 0) g = '女';
      else if (g.indexOf('男') >= 0) g = '男';
      else g = '男';

      let idCard = colIdx.idCard >= 0 ? String(r[colIdx.idCard] || '').trim().replace(/\s+/g, '') : '';
      if (idCard && !/^\d{17}[\dXx]$/.test(idCard)) { skipped++; idCard = ''; }

      let tel1 = colIdx.tel1 >= 0 ? String(r[colIdx.tel1] || '').trim().replace(/[\s-]+/g, '') : '';
      if (tel1 && !/^\d{11}$/.test(tel1)) { skipped++; tel1 = ''; }

      let tel2 = colIdx.tel2 >= 0 ? String(r[colIdx.tel2] || '').trim().replace(/[\s-]+/g, '') : '';
      if (tel2 && !/^\d{11}$/.test(tel2)) { skipped++; tel2 = ''; }

      const address = colIdx.address >= 0 ? String(r[colIdx.address] || '').trim() : '';

      toImport.push({
        class_id: classId,
        name, gender: g,
        id_card: idCard, tel1, tel2, address,
      });
    }

    if (!toImport.length) {
      let msg = '未从 Excel 中解析到有效的学生数据\n\n';
      msg += '空姓名行数：' + emptyName + '\n';
      alert(msg);
      return;
    }

    let msg = isAllMode
      ? '即将把 ' + toImport.length + ' 名学生按 Excel 中的「班级」列分别导入花名册'
      : '即将把 ' + toImport.length + ' 名学生导入到「' + targetClass.name + '」';
    msg += '\n（同班同名学生将覆盖原记录）';
    if (skipped > 0) msg += '\n有 ' + skipped + ' 条格式错误（身份证/电话）已被清空';
    if (pending > 0) msg += '\n有 ' + pending + ' 条所在班级尚未创建，将以「待关联」状态保存\n（之后新建班级时可以从花名册导入）';
    if (!confirm(msg + '\n\n确认导入？')) return;

    showSaveStatus('正在导入...', false);
    let ok = 0, fail = 0;
    for (const item of toImport) {
      try {
        await API.upsertRoster(item);
        ok++;
      } catch (e) {
        fail++;
      }
    }

    await loadRoster();
    showSaveStatus('导入完成：成功 ' + ok + ' 条' + (fail ? '，失败 ' + fail + ' 条' : ''), fail > 0);
  }

  // ============ 座位表导入 / 导出 ============
  function exportSeatExcel() {
    const rows = [['行', '列', '姓名', '性别', '身份证号', '家长1电话', '家长2电话', '家庭地址']];
    for (let r = 0; r < seat.rows; r++) {
      for (let c = 0; c < seat.cols; c++) {
        const idx = r * seat.cols + c;
        const s = seat.students[idx];
        if (!s || !s.name) continue;
        rows.push([r + 1, c + 1, s.name, s.gender || '', s.id_card || '', s.tel1 || '', s.tel2 || '', s.address || '']);
      }
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 5 }, { wch: 5 }, { wch: 10 }, { wch: 6 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '座位表');
    const prefix = (classes.length > 0 && classes[0].name) ? classes[0].name : '座位表';
    XLSX.writeFile(wb, safeFilePart(prefix) + '_座位表_' + dateStamp() + '.xlsx');
  }

  async function importSeatExcel(file) {
    const wb = await readExcelFile(file);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const toImport = [];
    let maxRow = 0, maxCol = 0;
    let skipped = 0;

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const rowNum = parseInt(r[0], 10);
      const colNum = parseInt(r[1], 10);
      const name = String(r[2] || '').trim();
      if (!name) continue;
      if (isNaN(rowNum) || isNaN(colNum)) continue;
      if (rowNum < 1 || colNum < 1) continue;
      if (rowNum > 12 || colNum > 10) { skipped++; continue; }

      let g = String(r[3] || '').trim();
      if (g.indexOf('女') >= 0) g = '女';
      else if (g.indexOf('男') >= 0) g = '男';
      else g = '男';

      toImport.push({
        seat_row: rowNum - 1,
        seat_col: colNum - 1,
        name, gender: g,
        id_card: String(r[4] || '').trim(),
        tel1: String(r[5] || '').trim(),
        tel2: String(r[6] || '').trim(),
        address: String(r[7] || '').trim(),
      });
      if (rowNum > maxRow) maxRow = rowNum;
      if (colNum > maxCol) maxCol = colNum;
    }

    if (!toImport.length) { alert('未从 Excel 中解析到有效的学生数据'); return; }
    if (skipped > 0) {
      if (!confirm('有 ' + skipped + ' 条记录超出最大座位范围（12行 × 10列），将被跳过。继续导入？')) return;
    }

    const clearFirst = confirm(
      '即将导入 ' + toImport.length + ' 名学生。\n\n' +
      '「确定」= 清空现有座位表后再导入（完全替换）\n' +
      '「取消」= 仅覆盖 Excel 中出现的座位（保留其他）'
    );

    const MAX_ROWS = 12, MAX_COLS = 10;
    let targetCols = Math.max(8, seat.cols, maxCol);
    if (targetCols > MAX_COLS) targetCols = MAX_COLS;
    let targetRows = Math.max(seat.rows, maxRow, Math.ceil(toImport.length / targetCols));
    if (targetRows > MAX_ROWS) targetRows = MAX_ROWS;

    if (targetRows * targetCols < toImport.length) {
      alert('学生数过多，超过最大容量（' + MAX_ROWS + ' 行 × ' + MAX_COLS + ' 列 = ' + (MAX_ROWS * MAX_COLS) + ' 人）\n本次需导入 ' + toImport.length + ' 人');
      return;
    }

    showSaveStatus('正在导入...', false);
    try {
      if (clearFirst) {
        for (let r = 0; r < seat.rows; r++) {
          for (let c = 0; c < seat.cols; c++) {
            const idx = r * seat.cols + c;
            const s = seat.students[idx];
            if (s && s.name) { try { await apiCall(API.deleteStudent, r, c); } catch {} }
          }
        }
      }
      if (targetRows !== seat.rows || targetCols !== seat.cols) {
        try { await apiCall(API.resize, targetRows, targetCols); }
        catch (e) { showSaveStatus('扩展座位失败: ' + (e.message || ''), true); return; }
        await reloadSeatData();
      }
      for (const st of toImport) { try { await apiCall(API.updateStudent, st); } catch {} }
      await reloadSeatData();
      showSaveStatus('座位表已导入', false);
      scheduleAutoSync();
    } catch (err) {
      showSaveStatus('导入失败: ' + (err.message || ''), true);
    }
  }

  async function reloadSeatData() {
    try {
      const seatResp = await API.getSeat();
      seat.rows = seatResp.rows || 7;
      seat.cols = seatResp.cols || 8;
      seat.order = seatResp.order || 'asc';
      seat.aisle = seatResp.aisle || '';
      seat.students = [];
      for (let i = 0; i < seat.rows * seat.cols; i++) {
        seat.students.push({ name: '', gender: '', id_card: '', tel1: '', tel2: '', address: '' });
      }
      (seatResp.students || []).forEach(s => {
        const idx = s.seat_row * seat.cols + s.seat_col;
        if (idx < seat.students.length) seat.students[idx] = s;
      });
      const btn = $('seatOrderBtn');
      if (btn) {
        btn.textContent = seat.order === 'asc' ? '讲台上' : '讲台下';
        btn.classList.toggle('active', seat.order === 'desc');
      }
      updateAisleBtn();
      renderSeats();
    } catch { /* ignore */ }
  }

  // ============ 导入目标选择弹窗 ============
  function openImportTargetPop(mode) {
    importTargetMode = mode || 'schedule';
    const gradeSel = $('importTargetGrade');
    const numSel = $('importTargetNum');
    const errEl = $('importTargetError');
    errEl.textContent = '';

    const first = classes[0] || { grade: 7, class_num: 1 };
    fillGradeSelect(gradeSel, first.grade || 7);
    fillClassNumSelect(numSel, first.class_num || 1);

    const h3 = document.querySelector('#importTargetPop h3');
    if (h3) {
      h3.textContent = (importTargetMode === 'roster')
        ? '选择花名册导入目标班级'
        : '选择课程表导入目标班级';
    }
    const hint = $('importTargetHint');
    if (hint) {
      hint.textContent = (importTargetMode === 'roster')
        ? '默认导入到所选班级；勾选下方「全部班级」则按 Excel 里的「班级」列自动分班'
        : 'Excel 文件第一个工作表的课程将导入到所选班级';
    }

    const allRow = $('importRosterAllRow');
    const allCb = $('importRosterAll');
    const gradeHint = $('importRosterGradeHint');
    const isRoster = (importTargetMode === 'roster');

    if (allRow) allRow.style.display = isRoster ? 'flex' : 'none';
    if (gradeHint) gradeHint.style.display = 'none';

    gradeSel.disabled = false;
    numSel.disabled = false;

    if (allCb) {
      allCb.checked = false;
      allCb.onchange = () => {
        const checked = allCb.checked;
        numSel.disabled = checked;
        if (gradeHint) gradeHint.style.display = (checked && isRoster) ? '' : 'none';
        errEl.textContent = '';
      };
    }

    $('importTargetPop').style.display = 'flex';
  }

  const importTargetClose = $('importTargetClose');
  if (importTargetClose) importTargetClose.onclick = () => { $('importTargetPop').style.display = 'none'; };
  const importTargetPopEl = $('importTargetPop');
  if (importTargetPopEl) importTargetPopEl.addEventListener('click', e => { if (e.target === importTargetPopEl) importTargetPopEl.style.display = 'none'; });

  const importTargetConfirm = $('importTargetConfirm');
  if (importTargetConfirm) {
    importTargetConfirm.onclick = () => {
      const errEl = $('importTargetError');
      errEl.textContent = '';

      const allCb = $('importRosterAll');
      if (importTargetMode === 'roster' && allCb && allCb.checked) {
        const gradeForAll = parseInt($('importTargetGrade').value, 10) || 0;
        $('importTargetPop').style.display = 'none';
        pickExcelFile((file) => importRosterExcel(file, null, gradeForAll));
        return;
      }

      const grade = parseInt($('importTargetGrade').value, 10);
      const classNum = parseInt($('importTargetNum').value, 10);
      const cls = classes.find(c => c.grade === grade && c.class_num === classNum);
      if (!cls) { errEl.textContent = '该班级不存在，请先创建'; return; }
      $('importTargetPop').style.display = 'none';

      if (importTargetMode === 'roster') {
        pickExcelFile((file) => importRosterExcel(file, cls, 0));
      } else {
        pickExcelFile((file) => importScheduleExcel(file, cls));
      }
    };
  }

  const exportExcelBtn = $('exportExcelBtn');
  if (exportExcelBtn) {
    exportExcelBtn.onclick = () => {
      if (activeSubTab === 'seat') exportSeatExcel();
      else if (activeSubTab === 'schedule') openExportSchedulePop();
      else showSaveStatus('请先切换到课程表或座位表', true);
    };
  }

  const importExcelBtn = $('importExcelBtn');
  if (importExcelBtn) {
    importExcelBtn.onclick = () => {
      if (activeSubTab !== 'schedule' && activeSubTab !== 'seat') {
        showSaveStatus('请先切换到课程表或座位表', true);
        return;
      }
      if (activeSubTab === 'seat') pickExcelFile((file) => importSeatExcel(file));
      else {
        if (!classes.length) { alert('请先创建至少一个班级'); return; }
        openImportTargetPop('schedule');
      }
    };
  }

  // ============ Seat ============
  function displayToData(row, col) {
    if (seat.order === 'asc') return row * seat.cols + col;
    return (seat.rows - 1 - row) * seat.cols + (seat.cols - 1 - col);
  }

  function renderSeats() {
    const grid = $('seatGrid');
    const stage = $('seatStage');
    if (!grid || !stage) return;

    const segments = getAisleSegments(seat.aisle || '', seat.cols);
    const hasAisle = segments.length > 1;
    grid.style.gridTemplateColumns = getGridColumns(segments);

    let maleCount = 0, femaleCount = 0;
    seat.students.forEach(s => { if (!s || !s.name) return; if (s.gender === '男') maleCount++; else if (s.gender === '女') femaleCount++; });
    const sizeEl = $('seatSizeInfo');
    if (sizeEl) sizeEl.textContent = seat.rows + '行×' + seat.cols + '列 · 男' + maleCount + ' 女' + femaleCount;
    if (seat.order === 'asc') stage.parentNode.insertBefore(stage, grid);
    else stage.parentNode.insertBefore(stage, grid.nextSibling);
    grid.innerHTML = '';

    const aisleCols = hasAisle ? getAisleGridCols(segments) : [];
    for (const ac of aisleCols) {
      const aisleDiv = document.createElement('div');
      aisleDiv.className = 'seat-aisle';
      aisleDiv.style.gridColumn = ac;
      aisleDiv.style.gridRow = '1 / span ' + seat.rows;
      grid.appendChild(aisleDiv);
    }

    for (let r = 0; r < seat.rows; r++) {
      for (let c = 0; c < seat.cols; c++) {
        const di = displayToData(r, c);
        const stu = seat.students[di] || { name: '', gender: '', id_card: '', tel1: '', tel2: '', address: '' };
        const hasName = !!(stu.name && String(stu.name).trim());

        const div = document.createElement('div');
        div.className = 'seat-item' + (hasName ? '' : ' seat-empty');
        if (hasName) {
          if (stu.gender === '女') div.classList.add('female');
          else if (stu.gender === '男') div.classList.add('male');
        } else if (seatEditOn) {
          div.classList.add('add-mode');
        }
        div.dataset.idx = di;
        const actualRow = Math.floor(di / seat.cols);
        const actualCol = di % seat.cols;
        div.dataset.actualRow = actualRow;
        div.dataset.actualCol = actualCol;

        div.style.gridColumn = getGridColIdx(c, segments);
        div.style.gridRow = (r + 1);

        if (hasName) {
          div.textContent = String(stu.name);
        } else {
          div.textContent = seatEditOn ? '＋' : '空';
          div.style.color = 'var(--empty-text)';
        }

        div.addEventListener('click', () => {
          if (Date.now() - suppressClickTime < 400) return;
          if (activeDrag !== null) return;
          const idx = +div.dataset.idx;
          const s = seat.students[idx];
          if (!s || !s.name) {
            if (!seatEditOn) return;
            openSeatPop(idx, true);
            return;
          }
          openSeatPop(idx);
        });
        if (hasName && seatEditOn) {
          div.addEventListener('mousedown', e => { if (e.button !== 0) return; startSeatPress(div, di, e.clientX, e.clientY); });
          div.addEventListener('touchstart', e => { if (e.touches.length !== 1) return; const t = e.touches[0]; startSeatPress(div, di, t.clientX, t.clientY); }, { passive: true });
        }
        grid.appendChild(div);
      }
    }
  }

  function startSeatPress(el, idx, x, y) {
    cancelSeatPress();
    pressState = { el, idx, x, y };
    pressTimer = setTimeout(() => { pressTimer = null; const ps = pressState; pressState = null; if (ps) activateSeatDrag(ps.el, ps.idx, ps.x, ps.y); }, LONG_PRESS_MS);
  }
  function cancelSeatPress() { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } pressState = null; }
  function activateSeatDrag(el, idx, x, y) {
    const rect = el.getBoundingClientRect();
    const ghost = document.createElement('div');
    ghost.className = 'touch-ghost';
    ghost.textContent = el.textContent || '';
    ghost.style.width = rect.width + 'px';
    ghost.style.height = rect.height + 'px';
    document.body.appendChild(ghost);
    positionGhost(ghost, x, y);
    el.classList.add('dragging');
    activeDrag = { el, idx, ghost, target: null };
  }
  function positionGhost(ghost, x, y) { ghost.style.left = (x - ghost.offsetWidth / 2) + 'px'; ghost.style.top = (y - ghost.offsetHeight / 2) + 'px'; }
  function onSeatMove(x, y) {
    if (pressState) { const dx = x - pressState.x, dy = y - pressState.y; if (Math.sqrt(dx * dx + dy * dy) > MOVE_CANCEL_PX) cancelSeatPress(); return; }
    if (activeDrag) {
      positionGhost(activeDrag.ghost, x, y);
      const el = document.elementFromPoint(x, y);
      const target = el && el.closest ? el.closest('.seat-item') : null;
      if (activeDrag.target && activeDrag.target !== target) activeDrag.target.classList.remove('drag-over');
      if (target && target !== activeDrag.el) { target.classList.add('drag-over'); activeDrag.target = target; } else { activeDrag.target = null; }
    }
  }
  function onSeatEnd() {
    if (pressState) { cancelSeatPress(); return; }
    if (activeDrag) {
      const fromIdx = activeDrag.idx;
      const target = activeDrag.target;
      const dragEl = activeDrag.el;
      if (activeDrag.ghost) activeDrag.ghost.remove();
      if (target) target.classList.remove('drag-over');
      if (dragEl) dragEl.classList.remove('dragging');
      activeDrag = null;
      if (target && dragEl) {
        const toIdx = +target.dataset.idx;
        if (toIdx !== fromIdx) {
          const r1 = +dragEl.dataset.actualRow;
          const c1 = +dragEl.dataset.actualCol;
          const r2 = +target.dataset.actualRow;
          const c2 = +target.dataset.actualCol;
          apiCall(API.swap, r1, c1, r2, c2).then(() => {
            const tmp = seat.students[fromIdx]; seat.students[fromIdx] = seat.students[toIdx]; seat.students[toIdx] = tmp;
            renderSeats();
            showSaveStatus('座位已交换', false);
            scheduleAutoSync();
          }).catch(() => { renderSeats(); });
        }
      }
      suppressClickTime = Date.now();
    }
  }
  document.addEventListener('mousemove', e => onSeatMove(e.clientX, e.clientY));
  document.addEventListener('mouseup', onSeatEnd);
  window.addEventListener('blur', onSeatEnd);
  document.addEventListener('touchmove', e => {
    if (activeDrag) { e.preventDefault(); if (e.touches.length === 1) onSeatMove(e.touches[0].clientX, e.touches[0].clientY); }
    else if (pressState) { if (e.touches.length === 1) { const t = e.touches[0]; const dx = t.clientX - pressState.x, dy = t.clientY - pressState.y; if (Math.sqrt(dx * dx + dy * dy) > MOVE_CANCEL_PX) cancelSeatPress(); } }
  }, { passive: false });
  document.addEventListener('touchend', onSeatEnd);
  document.addEventListener('touchcancel', onSeatEnd);
  document.addEventListener('contextmenu', e => { const t = e.target; if (t && t.closest && t.closest('.seat-item')) { e.preventDefault(); return false; } });

  const seatOrderBtn = $('seatOrderBtn');
  if (seatOrderBtn) {
    seatOrderBtn.onclick = async () => {
      seat.order = seat.order === 'asc' ? 'desc' : 'asc';
      seatOrderBtn.textContent = seat.order === 'asc' ? '讲台上' : '讲台下';
      seatOrderBtn.classList.toggle('active', seat.order === 'desc');
      try { await apiCall(API.setOrder, seat.order); } catch { return; }
      renderSeats();
      scheduleAutoSync();
    };
  }

  // ============ 过道设置 ============
  const seatAisleBtn = $('seatAisleBtn');
  if (seatAisleBtn) {
    seatAisleBtn.onclick = () => {
      $('aisleInput').value = seat.aisle || '';
      const hint = $('aisleHint');
      if (hint) hint.textContent = '当前座位表：' + seat.cols + ' 列';
      $('aisleError').textContent = '';
      $('aislePop').style.display = 'flex';
      setTimeout(() => $('aisleInput').focus(), 100);
    };
  }
  const aislePopClose = $('aislePopClose');
  if (aislePopClose) aislePopClose.onclick = () => { $('aislePop').style.display = 'none'; };
  const aislePopEl = $('aislePop');
  if (aislePopEl) aislePopEl.addEventListener('click', e => { if (e.target === aislePopEl) aislePopEl.style.display = 'none'; });

  const aisleSave = $('aisleSave');
  if (aisleSave) {
    aisleSave.onclick = async () => {
      const raw = $('aisleInput').value.trim();
      const errEl = $('aisleError');
      errEl.textContent = '';

      if (raw) {
        const parts = raw.split('+').map(s => parseInt(s.trim(), 10));
        if (parts.length < 2) { errEl.textContent = '至少需要 2 段，如 3+5'; return; }
        if (parts.some(n => isNaN(n) || n < 1)) { errEl.textContent = '格式错误，每段应为数字'; return; }
        const sum = parts.reduce((a, b) => a + b, 0);
        if (sum !== seat.cols) { errEl.textContent = '段数之和 ' + sum + ' 需等于列数 ' + seat.cols; return; }
      }

      try {
        await apiCall(API.setAisle, raw);
        seat.aisle = raw ? raw.split('+').map(s => parseInt(s.trim(), 10)).join('+') : '';
        updateAisleBtn();
        renderSeats();
        showSaveStatus(raw ? '过道已设置' : '已取消过道', false);
        scheduleAutoSync();
        $('aislePop').style.display = 'none';
      } catch (err) { errEl.textContent = err.message; }
    };
  }

  const seatResizeToggle = $('seatResizeToggle');
  if (seatResizeToggle) {
    seatResizeToggle.onclick = () => {
      const panel = $('seatResizePanel');
      if (!panel) return;
      const open = panel.classList.toggle('open');
      seatResizeToggle.textContent = open ? '行列 收起' : '行列 展开';
      seatResizeToggle.classList.toggle('active', open);
    };
  }
  const seatAddRow = $('seatAddRow'); if (seatAddRow) seatAddRow.onclick = () => resizeSeat(1, 0);
  const seatDelRow = $('seatDelRow'); if (seatDelRow) seatDelRow.onclick = () => resizeSeat(-1, 0);
  const seatAddCol = $('seatAddCol'); if (seatAddCol) seatAddCol.onclick = () => resizeSeat(0, 1);
  const seatDelCol = $('seatDelCol'); if (seatDelCol) seatDelCol.onclick = () => resizeSeat(0, -1);
  async function resizeSeat(dr, dc) {
    const nr = Math.min(12, Math.max(2, seat.rows + dr));
    const nc = Math.min(10, Math.max(2, seat.cols + dc));
    if (nr === seat.rows && nc === seat.cols) return;
    try {
      await apiCall(API.resize, nr, nc);
      await reloadSeatData();
      showSaveStatus('座位已调整', false);
      scheduleAutoSync();
    } catch (err) { showSaveStatus(err.message || '调整失败', true); }
  }

  const popTel1Input = $('popTel1Input');
  if (popTel1Input) popTel1Input.addEventListener('input', updateDialBtns);
  const popTel2Input = $('popTel2Input');
  if (popTel2Input) popTel2Input.addEventListener('input', updateDialBtns);
  const popTel1Dial = $('popTel1Dial');
  if (popTel1Dial) popTel1Dial.onclick = () => { const v = $('popTel1Input').value.trim(); if (v) window.location.href = 'tel:' + v; };
  const popTel2Dial = $('popTel2Dial');
  if (popTel2Dial) popTel2Dial.onclick = () => { const v = $('popTel2Input').value.trim(); if (v) window.location.href = 'tel:' + v; };
  function updateDialBtns() {
    const t1 = $('popTel1Input').value.trim();
    const t2 = $('popTel2Input').value.trim();
    $('popTel1Dial').disabled = !t1;
    $('popTel2Dial').disabled = !t2;
  }

  function openSeatPop(idx, isNew) {
    const s = seat.students[idx] || { name: '', gender: '', id_card: '', tel1: '', tel2: '', address: '' };
    currentPopIdx = idx;
    currentPopIsNew = !!isNew;

    $('popNameInput').value = s.name || '';
    $('popGenderInput').value = (s.gender === '女') ? '女' : '男';
    $('popIdCardInput').value = s.id_card || '';
    $('popTel1Input').value = s.tel1 || '';
    $('popTel2Input').value = s.tel2 || '';
    $('popAddrInput').value = s.address || '';

    const titleEl = document.querySelector('#seatPop .seat-pop-inner h3');
    if (titleEl) titleEl.textContent = currentPopIsNew ? '添加学生' : '学生信息';

    const delBtn = $('popDeleteBtn');
    if (delBtn) delBtn.style.display = (currentPopIsNew || !s.name) ? 'none' : '';

    ['popNameInput', 'popGenderInput', 'popIdCardInput', 'popTel1Input', 'popTel2Input', 'popAddrInput'].forEach(id => {
      const el = $(id);
      if (!el) return;
      if (el.tagName === 'SELECT') el.disabled = !seatEditOn;
      else el.readOnly = !seatEditOn;
    });
    updateDialBtns();
    $('seatPop').style.display = 'flex';
    if (seatEditOn) setTimeout(() => $('popNameInput').focus(), 100);
  }

  const popSaveBtn = $('popSaveBtn');
  if (popSaveBtn) {
    popSaveBtn.onclick = async () => {
      if (!seatEditOn) { alert('请先开启「✏️ 编辑座位」开关'); return; }
      if (currentPopIdx === null) return;
      const s = seat.students[currentPopIdx];
      if (!s) return;

      const name = $('popNameInput').value.trim();
      const gender = $('popGenderInput').value;
      const idCardRaw = $('popIdCardInput').value.trim();
      const tel1Raw = $('popTel1Input').value.trim();
      const tel2Raw = $('popTel2Input').value.trim();
      const addr = $('popAddrInput').value.trim();

      if (!name) { alert('❌ 请填写「姓名」'); $('popNameInput').focus(); return; }
      if (!gender) { alert('❌ 请选择「性别」（男 / 女）'); $('popGenderInput').focus(); return; }

      let idCard = '';
      if (idCardRaw) {
        idCard = idCardRaw.replace(/\s+/g, '');
        if (!/^\d{17}[\dXx]$/.test(idCard)) {
          alert('❌ 「身份证号」格式错误（需 18 位）\n当前输入：' + idCardRaw);
          $('popIdCardInput').focus();
          return;
        }
      }

      let tel1 = '';
      if (tel1Raw) {
        tel1 = tel1Raw.replace(/[\s-]+/g, '');
        if (!/^\d{11}$/.test(tel1)) {
          alert('❌ 「家长1电话」需为 11 位数字\n当前输入：' + tel1Raw);
          $('popTel1Input').focus();
          return;
        }
      }

      let tel2 = '';
      if (tel2Raw) {
        tel2 = tel2Raw.replace(/[\s-]+/g, '');
        if (!/^\d{11}$/.test(tel2)) {
          alert('❌ 「家长2电话」需为 11 位数字\n当前输入：' + tel2Raw);
          $('popTel2Input').focus();
          return;
        }
      }

      if (!addr) { alert('❌ 请填写「家庭地址」'); $('popAddrInput').focus(); return; }

      const aRow = Math.floor(currentPopIdx / seat.cols);
      const aCol = currentPopIdx % seat.cols;
      try {
        await apiCall(API.updateStudent, { seat_row: aRow, seat_col: aCol, name, gender, id_card: idCard, tel1, tel2, address: addr });
        seat.students[currentPopIdx] = { name, gender, id_card: idCard, tel1, tel2, address: addr, seat_row: aRow, seat_col: aCol };
        renderSeats();
        showSaveStatus(currentPopIsNew ? '已添加学生' : '已保存', false);
        scheduleAutoSync();
        $('seatPop').style.display = 'none';
      } catch {}
    };
  }

  const popDeleteBtn = $('popDeleteBtn');
  if (popDeleteBtn) {
    popDeleteBtn.onclick = async () => {
      if (!seatEditOn) { alert('请先开启「✏️ 编辑座位」开关'); return; }
      if (currentPopIdx === null) return;
      const s = seat.students[currentPopIdx];
      if (!s || !s.name) return;
      if (!confirm('确认删除「' + s.name + '」的座位信息？')) return;
      const aRow = Math.floor(currentPopIdx / seat.cols);
      const aCol = currentPopIdx % seat.cols;
      try {
        await apiCall(API.deleteStudent, aRow, aCol);
        seat.students[currentPopIdx] = { name: '', gender: '', id_card: '', tel1: '', tel2: '', address: '' };
        renderSeats();
        showSaveStatus('已删除', false);
        scheduleAutoSync();
        $('seatPop').style.display = 'none';
      } catch {}
    };
  }
  const popCloseBtn = $('popCloseBtn');
  if (popCloseBtn) popCloseBtn.onclick = () => { $('seatPop').style.display = 'none'; };
  const seatPopEl = $('seatPop');
  if (seatPopEl) seatPopEl.addEventListener('click', e => { if (e.target === seatPopEl) seatPopEl.style.display = 'none'; });

  ['popNameInput', 'popIdCardInput', 'popTel1Input', 'popTel2Input', 'popAddrInput'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') $('popSaveBtn').click(); });
  });

  // ============ Export Image (class) ============
  const exportBtn = $('exportBtn');
  if (exportBtn) {
    exportBtn.onclick = async () => {
      const isSeat = (activeSubTab === 'seat');
      let wrap;
      if (isSeat) {
        wrap = seatCard.cloneNode(true);
        wrap.style.display = 'block';
        wrap.querySelectorAll('.seat-tools').forEach(el => el.remove());
        wrap.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
      } else {
        const legendCard = $('legendCard');
        const cards = document.querySelectorAll('.class-card');
        const visible = Array.from(cards).filter(c => c.style.display !== 'none');
        if (!visible.length) return alert('没有选中班级卡片');
        wrap = document.createElement('div');
        wrap.style.padding = '20px';
        wrap.style.background = getComputedStyle(document.body).background;
        visible.forEach(c => wrap.appendChild(c.cloneNode(true)));
        if (legendCard) wrap.appendChild(legendCard.cloneNode(true));
      }
      document.body.appendChild(wrap);
      try {
        const canvas = await html2canvas(wrap, { useCORS: true, scale: 2, backgroundColor: null });
        const link = document.createElement('a');
        link.download = (isSeat ? '座位表' : '课程表') + '_' + new Date().toLocaleDateString() + '.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
      } catch (e) { alert('导出失败：' + e.message); }
      finally { wrap.remove(); }
    };
  }

  // ============ Cloud Sync ============
  async function doSyncPush() {
    try { await apiCall(API.pushSync); showSaveStatus('数据已推送到云端', false); } catch {}
  }
  async function doSyncPull() {
    if (!confirm('拉取云端数据将覆盖本地修改，确认？')) return;
    try {
      await apiCall(API.pullSync);
      showSaveStatus('云端数据已拉取', false);
      setTimeout(() => location.reload(), 800);
    } catch {}
  }

  // ============ Diagnostics ============
  const diagBtn = $('diagBtn');
  if (diagBtn) {
    diagBtn.onclick = async () => {
      const lines = ['=== 存储诊断 ==='];
      lines.push('URL: ' + location.href);
      lines.push('当前用户: ' + (currentUser ? currentUser.username : '未登录'));
      lines.push('班级数量: ' + classes.length);
      lines.push('存储方式: SQLite (服务端) + Supabase (云端同步)');
      try {
        const st = await API.getSyncStatus();
        lines.push('上次同步: ' + (st.last_sync_at ? new Date(st.last_sync_at).toLocaleString('zh-CN') : '从未'));
        lines.push('同步状态: ' + (st.last_sync_ok ? '成功' : (st.last_error || '未知')));
      } catch (e) { lines.push('同步状态: 获取失败'); }
      const panel = $('diagPanel');
      panel.textContent = lines.join('\n');
      const btn = document.createElement('button');
      btn.className = 'close'; btn.textContent = '关闭';
      btn.onclick = () => { panel.style.display = 'none'; };
      panel.appendChild(btn);
      panel.style.display = 'block';
    };
  }

  // ============ 用户详情弹窗 ============
  const udClose = $('userDetailClose');
  if (udClose) udClose.onclick = () => { $('userDetailPop').style.display = 'none'; };
  const udPop = $('userDetailPop');
  if (udPop) udPop.addEventListener('click', e => { if (e.target === udPop) udPop.style.display = 'none'; });

  async function openUserDetailPop(username) {
    const titleEl = $('userDetailTitle');
    const bodyEl = $('userDetailBody');
    titleEl.textContent = '用户数据 · ' + username;
    bodyEl.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-sub);">加载中...</div>';
    $('userDetailPop').style.display = 'flex';
    try {
      const detail = await API.getUserDetail(username);
      bodyEl.innerHTML = renderUserDetailHtml(detail);
    } catch (err) {
      bodyEl.innerHTML = '<div style="color:#e74c3c;padding:20px;text-align:center;">加载失败: ' + escapeHtml(err.message) + '</div>';
    }
  }

  function renderUserDetailHtml(detail) {
    const user = detail.user || {};
    const students = detail.students || [];
    const cells = detail.cells || [];
    const classes = detail.classes || [];
    const seatConfig = detail.seat_config || { rows: 7, cols: 8 };
    let rows = seatConfig.rows || 7;
    let cols = seatConfig.cols || 8;
    const order = seatConfig.order || 'asc';
    let aisle = seatConfig.aisle || '';

    students.forEach(s => {
      if (typeof s.seat_col === 'number' && s.seat_col + 1 > cols) cols = s.seat_col + 1;
      if (typeof s.seat_row === 'number' && s.seat_row + 1 > rows) rows = s.seat_row + 1;
    });

    if (aisle) {
      const parts = String(aisle).split('+').map(v => parseInt(v.trim(), 10));
      const sum = parts.reduce((a, b) => a + (isNaN(b) ? 0 : b), 0);
      if (parts.length < 2 || parts.some(n => isNaN(n) || n < 1) || sum !== cols) {
        aisle = '';
      }
    }

    const seatMatrix = [];
    for (let i = 0; i < rows * cols; i++) seatMatrix.push({ name: '', gender: '' });
    students.forEach(s => {
      const idx = s.seat_row * cols + s.seat_col;
      if (idx >= 0 && idx < seatMatrix.length) seatMatrix[idx] = s;
    });

    const cellsByClass = {};
    cells.forEach(c => {
      if (!cellsByClass[c.class_id]) cellsByClass[c.class_id] = {};
      cellsByClass[c.class_id][c.cell_index] = c;
    });

    let html = '';

    html += '<div class="user-data-section">';
    html += '<div class="user-data-title">📋 基本信息</div>';
    html += '<div class="user-data-row">用户名：' + escapeHtml(user.username || '') + '</div>';
    html += '<div class="user-data-row">注册时间：' + (user.created_at ? new Date(user.created_at).toLocaleString('zh-CN') : '—') + '</div>';
    html += '<div class="user-data-row">上次登录：' + (user.last_login_at ? new Date(user.last_login_at).toLocaleString('zh-CN') : '—') + '</div>';
    html += '<div class="user-data-row">角色：' + (user.is_admin ? '管理员' : '普通用户') + '</div>';
    html += '<div class="user-data-row">座位人数：' + (detail.seat_count || 0) + '（男 ' + (detail.male_count || 0) + ' / 女 ' + (detail.female_count || 0) + '）</div>';
    html += '<div class="user-data-row">班级数量：' + classes.length + '</div>';
    html += '</div>';

    html += '<div class="user-data-section">';
    html += '<div class="user-data-title">🪑 座位表（' + rows + '行×' + cols + '列 · ' + (order === 'asc' ? '正序' : '倒序') + (aisle ? ' · 过道 ' + escapeHtml(aisle) : '') + '）</div>';

    const segs = getAisleSegments(aisle, cols);
    const aisleCols = segs.length > 1 ? getAisleGridCols(segs) : [];

    const stageHtml = '<div class="admin-seat-stage">讲 台</div>';
    let gridHtml = '<div class="admin-seat-grid" style="grid-template-columns:' + getGridColumns(segs) + ';--admin-cols:' + cols + ';">';
    for (const ac of aisleCols) {
      gridHtml += '<div class="admin-seat-aisle" style="grid-column:' + ac + ';grid-row:1 / span ' + rows + ';"></div>';
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const dataIdx = (order === 'asc') ? r * cols + c : (rows - 1 - r) * cols + (cols - 1 - c);
        const s = seatMatrix[dataIdx] || { name: '', gender: '' };
        let cls = 'empty';
        if (s.name) {
          if (s.gender === '女') cls = 'female';
          else if (s.gender === '男') cls = 'male';
          else cls = '';
        }
        const colPos = getGridColIdx(c, segs);
        gridHtml += '<div class="admin-seat-cell ' + cls + '" style="grid-column:' + colPos + ';grid-row:' + (r + 1) + ';">' + (s.name ? escapeHtml(s.name) : '空') + '</div>';
      }
    }
    gridHtml += '</div>';

    if (order === 'asc') {
      html += stageHtml;
      html += gridHtml;
    } else {
      html += gridHtml;
      html += stageHtml;
    }

    html += '</div>';

    html += '<div class="user-data-section">';
    html += '<div class="user-data-title">📚 课程表</div>';
    if (classes.length === 0) {
      html += '<div class="user-data-row" style="color:var(--empty-text);">暂无班级</div>';
    } else {
      classes.forEach(cls => {
        const clsCells = cellsByClass[cls.class_id] || {};
        html += '<div style="margin-bottom:16px;">';
        html += '<div style="font-weight:600;font-size:13px;color:var(--text-main);margin:8px 0 4px;">' + escapeHtml(cls.name) + (cls.badge ? ' <span style="font-weight:400;color:var(--text-sub);font-size:12px;">· ' + escapeHtml(cls.badge) + '</span>' : '') + '</div>';
        html += '<table class="admin-schedule-table">';
        html += '<thead><tr><th>节次</th><th>周一</th><th>周二</th><th>周三</th><th>周四</th><th>周五</th></tr></thead><tbody>';
        const periodCount = (cls.period_count && cls.period_count > 0) ? cls.period_count : (defaultPeriods.length || 8);
        for (let pIdx = 0; pIdx < periodCount; pIdx++) {
          const periodKey = pIdx * 6;
          const periodCell = clsCells[periodKey];
          let pName = '第' + (pIdx + 1) + '节';
          if (periodCell && periodCell.period_name) pName = periodCell.period_name;
          html += '<tr><td>' + escapeHtml(pName) + '</td>';
          for (let d = 0; d < 5; d++) {
            const idx = pIdx * 6 + d + 1;
            const cell = clsCells[idx];
            if (cell && (cell.subject || cell.teacher)) {
              let content = escapeHtml(cell.subject || '');
              if (cell.teacher) content += '<br><span style="font-size:11px;color:var(--text-sub);">' + escapeHtml(cell.teacher) + '</span>';
              const bg = cell.bg_color || '0';
              const attr = (bg && bg !== '0') ? (' data-bg-color="' + bg + '"') : '';
              html += '<td' + attr + '>' + content + '</td>';
            } else {
              html += '<td style="color:var(--empty-text);">—</td>';
            }
          }
          html += '</tr>';
          if (pIdx === BREAK_AFTER_PERIOD - 1 && pIdx < periodCount - 1) {
            const bc = clsCells[BREAK_CELL_INDEX];
            const bName = (bc && bc.period_name) ? bc.period_name : '午休';
            const bTime = (bc && bc.period_time !== undefined) ? bc.period_time : '12:00-13:00';
            html += '<tr class="admin-break-row"><td colspan="6">' + escapeHtml(bName) + ' ' + escapeHtml(bTime) + '</td></tr>';
          }
        }
        html += '</tbody></table></div>';
      });
    }
    html += '</div>';

    return html;
  }

  // ============ Me Page ============
  function renderMePage() {
    if (!currentUser) { showLoginRegister(); return; }
    meCard.classList.remove('auth-card');
    if (meView === 'changePwd') { renderChangePwd(); return; }
    if (meView === 'adminList') { renderAdminList(); return; }
    if (meView === 'supabase') { renderSupabaseConfig(); return; }
    if (meView === 'loginNotice') { renderLoginNoticeEdit(); return; }
    renderProfile();
  }

  function renderProfile() {
    const adminBadge = currentUser.is_admin ? '<span class="me-badge-admin">管理员</span>' : '';
    const created = currentUser.created_at ? new Date(currentUser.created_at).toLocaleString('zh-CN') : '—';
    const lastLogin = currentUser.last_login_at ? new Date(currentUser.last_login_at).toLocaleString('zh-CN') : '—';

    const syncBlock = currentUser.is_admin
      ? ('<div class="sync-section"><h4>☁️ 云同步</h4>' +
         '<div class="sync-row">' +
         '<button id="syncPushBtn2">⬆️ 推送</button>' +
         '<button id="syncPullBtn2">⬇️ 拉取</button>' +
         '<label class="reg-lock-toggle" title="开启后，除管理员外的用户将无法注册"><input type="checkbox" id="syncRegLock"><span>锁定注册</span></label>' +
         '</div>' +
         '<div class="sync-status" id="syncStatusText">点击推送/拉取同步数据</div>' +
         '</div>')
      : '';

    meCard.innerHTML =
      '<div class="me-avatar">' + escapeHtml(currentUser.username.charAt(0).toUpperCase()) + '</div>' +
      '<div class="me-username-big">' + escapeHtml(currentUser.username) + adminBadge + '</div>' +
      '<div class="me-hint">当前账户</div>' +
      '<div class="me-info">' +
        '<div class="me-info-row"><span class="label">用户名</span><span class="value">' + escapeHtml(currentUser.username) + '</span></div>' +
        '<div class="me-info-row"><span class="label">注册时间</span><span class="value">' + created + '</span></div>' +
        '<div class="me-info-row"><span class="label">上次登录</span><span class="value">' + lastLogin + '</span></div>' +
      '</div>' +
      '<button class="me-btn-gray" id="meChangePwdBtn">🔑 修改密码</button>' +
      (currentUser.is_admin ? '<button class="me-admin-btn" id="meAdminBtn">👥 用户管理</button>' : '') +
      (currentUser.is_admin ? '<button class="me-admin-btn" id="meSupabaseBtn" style="background:#16a085;">☁️ Supabase配置</button>' : '') +
      (currentUser.is_admin ? '<button class="me-admin-btn" id="meLoginNoticeBtn" style="background:#9b59b6;">📝 登录提示</button>' : '') +
      syncBlock +
      '<button class="me-logout" id="meLogoutBtn">退出登录</button>';

    $('meChangePwdBtn').onclick = () => { meView = 'changePwd'; renderMePage(); };
    const adminBtn = $('meAdminBtn'); if (adminBtn) adminBtn.onclick = () => { meView = 'adminList'; renderMePage(); };
    const sbBtn = $('meSupabaseBtn'); if (sbBtn) sbBtn.onclick = () => { meView = 'supabase'; renderMePage(); };
    const lnBtn = $('meLoginNoticeBtn'); if (lnBtn) lnBtn.onclick = () => { meView = 'loginNotice'; renderMePage(); };
    $('meLogoutBtn').onclick = () => { if (!confirm('确认退出登录？')) return; API.clearToken(); location.reload(); };

    const sp = $('syncPushBtn2'); if (sp) sp.onclick = doSyncPush;
    const sl = $('syncPullBtn2'); if (sl) sl.onclick = doSyncPull;

    if (currentUser.is_admin) {
      API.getSyncStatus().then(st => {
        const el = $('syncStatusText');
        if (el) {
          el.textContent = '上次同步: ' +
            (st.last_sync_at ? new Date(st.last_sync_at).toLocaleString('zh-CN') : '从未') +
            (st.last_sync_ok ? ' (成功)' : (st.last_error ? ' (失败: ' + st.last_error + ')' : ''));
        }
      }).catch(() => {});

      const regLockCb = $('syncRegLock');
      if (regLockCb) {
        API.getSupabaseConfig().then(cfg => {
          regLockCb.checked = !!cfg.registration_locked;
        }).catch(() => {});

        regLockCb.onchange = async () => {
          const locked = regLockCb.checked;
          regLockCb.disabled = true;
          try {
            const cfg = await API.getSupabaseConfig();
            await API.updateSupabaseConfig({
              enabled: cfg.enabled, url: cfg.url, api_key: cfg.api_key,
              sync_interval: cfg.sync_interval, registration_locked: locked,
            });
            showSaveStatus(locked ? '已锁定新用户注册' : '已开放新用户注册', false);
          } catch (err) {
            regLockCb.checked = !locked;
            alert(err.message || '设置失败');
          } finally { regLockCb.disabled = false; }
        };
      }
    }
  }

  async function renderLoginNoticeEdit() {
    meCard.innerHTML = '<div class="admin-title"><span>📝 登录提示</span><button class="back-btn" id="meBackBtn">← 返回</button></div><div class="me-warn">加载中...</div>';
    let cfg;
    try { cfg = await API.adminGetSystemConfig(); }
    catch (err) { meCard.innerHTML = '<div class="me-warn">加载失败: ' + escapeHtml(err.message) + '</div>'; return; }

    meCard.innerHTML =
      '<div class="admin-title"><span>📝 登录提示</span><button class="back-btn" id="meBackBtn">← 返回</button></div>' +
      '<div class="me-warn">这段文字会显示在登录/注册页面的顶部提示栏。留空则不显示。</div>' +
      '<div class="me-field"><label>提示内容</label>' +
      '<textarea id="lnText" class="cell-pop-input" rows="4" style="width:100%;resize:vertical;font-family:inherit;box-sizing:border-box;"></textarea>' +
      '</div>' +
      '<button class="me-submit" id="lnSave" style="background:#9b59b6;">💾 保存</button>' +
      '<div class="me-error" id="lnError"></div>';

    $('lnText').value = cfg.login_notice || '';
    $('meBackBtn').onclick = () => { meView = 'profile'; renderMePage(); };
    $('lnSave').onclick = async () => {
      const errEl = $('lnError');
      errEl.textContent = '';
      try { await API.adminUpdateSystemConfig($('lnText').value); showSaveStatus('已保存', false); }
      catch (err) { errEl.textContent = err.message; }
    };
  }

  function renderChangePwd() {
    meCard.innerHTML =
      '<div class="admin-title"><span>🔑 修改密码</span><button class="back-btn" id="meBackBtn">← 返回</button></div>' +
      '<div class="me-warn">修改密码后下次登录需要使用新密码。</div>' +
      '<div class="me-field"><label>当前密码</label><input type="password" id="pwdOld" autocomplete="current-password"></div>' +
      '<div class="me-field"><label>新密码</label><input type="password" id="pwdNew" placeholder="6-32字符" autocomplete="new-password"></div>' +
      '<div class="me-field"><label>确认新密码</label><input type="password" id="pwdNew2" placeholder="再次输入新密码" autocomplete="new-password"></div>' +
      '<button class="me-submit" id="meSubmitPwd">确认修改</button>' +
      '<div class="me-error" id="mePwdError"></div>';
    $('meBackBtn').onclick = () => { meView = 'profile'; renderMePage(); };
    $('meSubmitPwd').onclick = async () => {
      const errEl = $('mePwdError');
      const oldPwd = $('pwdOld').value, newPwd = $('pwdNew').value, newPwd2 = $('pwdNew2').value;
      if (!oldPwd) { errEl.textContent = '请输入当前密码'; return; }
      if (newPwd.length < 6 || newPwd.length > 32) { errEl.textContent = '新密码需 6-32 字符'; return; }
      if (newPwd !== newPwd2) { errEl.textContent = '两次输入的新密码不一致'; return; }
      try { await apiCall(API.changePassword, oldPwd, newPwd); showSaveStatus('密码已修改', false); meView = 'profile'; renderMePage(); }
      catch (err) { errEl.textContent = err.message; }
    };
    ['pwdOld', 'pwdNew', 'pwdNew2'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') $('meSubmitPwd').click(); }));
    setTimeout(() => $('pwdOld').focus(), 100);
  }

  async function renderAdminList() {
    if (!currentUser.is_admin) { meView = 'profile'; renderMePage(); return; }
    meCard.innerHTML = '<div class="admin-title"><span>👥 用户管理</span><button class="back-btn" id="meBackBtn">← 返回</button></div><div class="me-warn">加载中...</div>';
    try {
      const resp = await API.listUsers();
      const list = resp.users || [];
      let rowsHtml = '';
      if (list.length === 0) {
        rowsHtml = '<div style="text-align:center;color:var(--text-sub);padding:20px;">暂无用户</div>';
      } else {
        for (const u of list) {
          const adminBadge = u.is_admin ? '<span class="me-badge-admin">管理员</span>' : '';
          const isSelf = (u.username === currentUser.username);
          rowsHtml +=
            '<div class="user-row" data-user="' + escapeHtml(u.username) + '">' +
            '<div class="user-row-head"><div class="user-row-name">👤 ' + escapeHtml(u.username) + adminBadge + (isSelf ? ' <span style="color:#3498db;font-size:12px;">(当前)</span>' : '') + '</div></div>' +
            '<div class="user-row-meta">注册：' + escapeHtml(u.created_at) + ' · 班级 ' + (u.class_count || 0) + ' · 座位 ' + (u.seat_count || 0) + '</div>' +
            '<div class="user-row-actions">' +
              '<button class="btn-data" data-act="view" data-user="' + escapeHtml(u.username) + '">📊 查看数据</button>' +
              '<button class="btn-edit" data-act="editUser" data-user="' + escapeHtml(u.username) + '">✏️ 编辑用户名/密码</button>' +
              '<button class="btn-reset" data-act="resetPwd" data-user="' + escapeHtml(u.username) + '">🔑 重置密码</button>' +
              '<button class="btn-clear" data-act="clear" data-user="' + escapeHtml(u.username) + '">🧹 清空数据</button>' +
              '<button class="btn-del" data-act="del" data-user="' + escapeHtml(u.username) + '"' + (isSelf ? ' disabled title="不能删除自己"' : '') + '>🗑️ 删除用户</button>' +
            '</div></div>';
        }
      }
      meCard.innerHTML =
        '<div class="admin-title"><span>👥 用户管理</span><button class="back-btn" id="meBackBtn">← 返回</button></div>' +
        '<div class="me-warn">共 ' + list.length + ' 个用户。删除用户会同时删除其所有数据，无法恢复。</div>' +
        '<div class="user-list">' + rowsHtml + '</div>';
      $('meBackBtn').onclick = () => { meView = 'profile'; renderMePage(); };
      meCard.querySelectorAll('.user-row-actions button').forEach(b => {
        b.onclick = () => handleAdminAction(b.dataset.act, b.dataset.user);
      });
    } catch (err) {
      meCard.innerHTML = '<div class="admin-title"><span>👥 用户管理</span><button class="back-btn" id="meBackBtn">← 返回</button></div><div class="me-warn">加载失败: ' + escapeHtml(err.message) + '</div>';
      $('meBackBtn').onclick = () => { meView = 'profile'; renderMePage(); };
    }
  }

  async function handleAdminAction(act, username) {
    if (act === 'view') { openUserDetailPop(username); }
    else if (act === 'editUser') {
      const newUsername = prompt('新用户名（留空表示不修改，3-20位字母/数字/下划线）：', username);
      if (newUsername === null) return;
      const trimmedUsername = newUsername.trim();
      const newPassword = prompt('新密码（留空表示不修改，6-32字符）：', '');
      if (newPassword === null) return;
      const trimmedPassword = newPassword.trim();
      const finalUsername = (trimmedUsername && trimmedUsername !== username) ? trimmedUsername : '';
      if (!finalUsername && !trimmedPassword) { alert('未做任何修改'); return; }
      try { await API.adminUpdateUser(username, finalUsername, trimmedPassword); showSaveStatus('已更新', false); renderMePage(); }
      catch (err) { alert(err.message); }
    } else if (act === 'resetPwd') {
      const newPwd = prompt('为「' + username + '」设置新密码（6-32字符）：', '');
      if (newPwd === null) return;
      if (newPwd.length < 6 || newPwd.length > 32) { alert('密码需 6-32 字符'); return; }
      try { await API.resetUserPassword(username, newPwd); showSaveStatus('已重置密码', false); }
      catch (err) { alert(err.message); }
    } else if (act === 'clear') {
      if (!confirm('确认清空「' + username + '」的所有数据？')) return;
      try { await API.clearUserData(username); showSaveStatus('已清空数据', false); }
      catch (err) { alert(err.message); }
    } else if (act === 'del') {
      if (username === currentUser.username) { alert('不能删除当前登录的账户'); return; }
      if (!confirm('确认删除用户「' + username + '」？')) return;
      if (!confirm('再次确认：删除后无法恢复，确定吗？')) return;
      try { await API.deleteUser(username); showSaveStatus('已删除用户', false); renderMePage(); }
      catch (err) { alert(err.message); }
    }
  }

  async function renderSupabaseConfig() {
    if (!currentUser.is_admin) { meView = 'profile'; renderMePage(); return; }
    meCard.innerHTML = '<div class="admin-title"><span>☁️ Supabase 云同步配置</span><button class="back-btn" id="meBackBtn">← 返回</button></div><div class="me-warn">加载中...</div>';
    let cfg;
    try { cfg = await API.getSupabaseConfig(); }
    catch (err) { meCard.innerHTML = '<div class="me-warn">加载失败: ' + escapeHtml(err.message) + '</div>'; return; }
    meCard.innerHTML =
      '<div class="admin-title"><span>☁️ Supabase 云同步配置</span><button class="back-btn" id="meBackBtn">← 返回</button></div>' +
      '<div class="me-warn">配置 Supabase 后，所有用户数据将在本地 SQLite 和 Supabase 云端之间双向同步，实现多端数据同步。数据有变化时会自动同步到云端（2 秒防抖）。</div>' +
      '<div class="supabase-toggle"><input type="checkbox" id="sbEnabled" ' + (cfg.enabled ? 'checked' : '') + '><label>启用云同步</label></div>' +
      '<div class="supabase-field"><label>Supabase URL</label><input type="text" id="sbUrl" placeholder="https://xxx.supabase.co" value="' + escapeHtml(cfg.url || '') + '"></div>' +
      '<div class="supabase-field"><label>API Key (anon/service_role)</label><input type="text" id="sbApiKey" placeholder="eyJ..." value="' + escapeHtml(cfg.api_key || '') + '"></div>' +
      '<div class="supabase-field"><label>同步间隔 (秒)</label><input type="number" id="sbInterval" value="' + (cfg.sync_interval || 300) + '"></div>' +
      '<button class="me-submit" id="sbSave" style="background:#16a085;">💾 保存配置</button>' +
      '<button class="me-btn-gray" id="sbTest" style="margin-top:10px;">🧪 测试连接</button>' +
      '<button class="me-btn-gray" id="sbSchema" style="margin-top:10px;">📋 获取建表SQL</button>' +
      '<div class="me-error" id="sbError"></div>';
    $('meBackBtn').onclick = () => { meView = 'profile'; renderMePage(); };
    $('sbSave').onclick = async () => {
      const config = {
        enabled: $('sbEnabled').checked,
        url: $('sbUrl').value.trim(),
        api_key: $('sbApiKey').value.trim(),
        sync_interval: parseInt($('sbInterval').value) || 300,
      };
      try { await API.updateSupabaseConfig(config); showSaveStatus('Supabase 配置已保存', false); }
      catch (err) { $('sbError').textContent = err.message; }
    };
    $('sbTest').onclick = async () => {
      $('sbError').textContent = '';
      try { await API.testSupabase(); showSaveStatus('Supabase 连接成功', false); }
      catch (err) { $('sbError').textContent = err.message; }
    };
    $('sbSchema').onclick = async () => {
      try {
        const resp = await API.getSchemaSQL();
        const blob = new Blob([resp.sql], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'supabase_schema.sql'; a.click();
        URL.revokeObjectURL(url);
        showSaveStatus('SQL 已下载', false);
      } catch (err) { $('sbError').textContent = err.message; }
    };
  }

  function showLoginRegister() {
    const sidebarEl = document.querySelector('.sidebar');
    if (sidebarEl) sidebarEl.style.display = 'none';
    meCard.classList.add('auth-card');
    meContainer.style.display = 'block';
    scheduleContainer.style.display = 'none';
    seatCard.style.display = 'none';
    const classCtrl = $('classControlBar');
    if (classCtrl) classCtrl.style.display = 'none';
    const rosterCtrl = $('rosterControlBar');
    if (rosterCtrl) rosterCtrl.style.display = 'none';
    if (bottomNav) bottomNav.style.display = 'none';
    if (subNav) subNav.style.display = 'none';
    pageTitle.innerHTML = '📚 教师工作台';
    pageSub.innerHTML = '登录后使用个性化数据';
    pageSub.style.display = '';
    meCard.innerHTML =
      '<div class="me-warn" id="loginNotice" style="display:none;"></div>' +
      '<div class="me-tabs">' +
        '<button class="me-tab ' + (meMode === 'login' ? 'active' : '') + '" data-me="login">登录</button>' +
        '<button class="me-tab ' + (meMode === 'register' ? 'active' : '') + '" data-me="register">注册</button>' +
      '</div>' +
      '<div class="me-field"><label>用户名</label><input type="text" id="meUsername" placeholder="字母/数字/下划线，3-20字符" autocomplete="username"></div>' +
      '<div class="me-field"><label>密码</label><input type="password" id="mePassword" placeholder="6-32字符" autocomplete="current-password"></div>' +
      (meMode === 'register' ? '<div class="me-field"><label>确认密码</label><input type="password" id="mePassword2" placeholder="再次输入密码" autocomplete="new-password"></div>' : '') +
      '<button class="me-submit" id="meSubmit">' + (meMode === 'login' ? '登 录' : '注 册') + '</button>' +
      '<div class="me-error" id="meError"></div>';
    document.querySelectorAll('.me-tab').forEach(b => { b.onclick = () => { meMode = b.dataset.me; showLoginRegister(); }; });
    $('meSubmit').onclick = submitMe;
    ['meUsername', 'mePassword', 'mePassword2'].forEach(id => { const el = $(id); if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') submitMe(); }); });

    API.getPublicConfig().then(cfg => {
      if (cfg && cfg.login_notice) {
        const el = $('loginNotice');
        if (el) { el.textContent = cfg.login_notice; el.style.display = ''; }
      }
    }).catch(() => {});

    setTimeout(() => { const el = $('meUsername'); if (el) el.focus(); }, 100);
  }

  async function submitMe() {
    const errEl = $('meError');
    const username = $('meUsername').value.trim();
    const password = $('mePassword').value;
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) { errEl.textContent = '用户名需为 3-20 位的字母/数字/下划线'; return; }
    if (password.length < 6 || password.length > 32) { errEl.textContent = '密码需为 6-32 字符'; return; }
    try {
      let resp;
      if (meMode === 'register') {
        const pwd2 = $('mePassword2').value;
        if (password !== pwd2) { errEl.textContent = '两次密码不一致'; return; }
        resp = await API.register(username, password);
      } else {
        resp = await API.login(username, password);
      }
      API.setToken(resp.token);
      showSaveStatus(meMode === 'register' ? '注册成功' : '登录成功', false);
      setTimeout(() => location.reload(), 500);
    } catch (err) { errEl.textContent = err.message; }
  }

  // ========================================================================
  // 今天
  // ========================================================================
  function renderToday() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const dateStr = yyyy + '-' + mm + '-' + dd;
    const wd = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];

    const classOptions = classes.map(c =>
      '<option value="' + escapeHtml(c.class_id) + '">' + escapeHtml(c.name) + '</option>'
    ).join('');

    todayContainer.innerHTML =
      '<div class="me-page">' +
        '<div class="me-card">' +
          '<div class="today-date">' + yyyy + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日 星期' + wd + '</div>' +
          '<div class="today-section">' +
            '<h4>📚 今日课程</h4>' +
            '<div id="todayClasses" class="today-course-list">' + renderTodayCourses(now.getDay()) + '</div>' +
          '</div>' +
          '<div class="today-section">' +
            '<h4>✅ 今日考勤</h4>' +
            '<div class="cell-pop-row" style="margin:8px 0;">' +
              '<label>班级：</label>' +
              '<select id="todayAttendanceClass" class="cell-pop-input">' +
                (classOptions || '<option value="">（暂无班级）</option>') +
              '</select>' +
            '</div>' +
            '<div id="todayAttendanceSummary" class="today-summary">选择班级后查看今日考勤</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    const sel = $('todayAttendanceClass');
    if (sel && classes.length > 0) {
      sel.onchange = () => loadTodayAttendanceSummary(sel.value, dateStr);
      loadTodayAttendanceSummary(classes[0].class_id, dateStr);
    }
  }

  function renderTodayCourses(wd) {
    if (wd === 0 || wd === 6) return '<div class="today-empty">周末无课程安排 🎉</div>';
    if (classes.length === 0) return '<div class="today-empty">暂无班级</div>';

    let html = '';
    classes.forEach(cls => {
      const lessons = [];
      const periodCount = (cls.period_count && cls.period_count > 0) ? cls.period_count : defaultPeriods.length;
      for (let pIdx = 0; pIdx < periodCount; pIdx++) {
        const idx = pIdx * 6 + (wd - 1) + 1;
        const key = cls.class_id + '_cell_' + idx;
        const cell = cellData[key];
        const pKey = cls.class_id + '_cell_' + (pIdx * 6);
        const pCell = cellData[pKey];
        const pName = (pCell && pCell.period_name) || (defaultPeriods[pIdx] && defaultPeriods[pIdx].name) || ('第' + (pIdx + 1) + '节');
        const pTime = (pCell && pCell.period_time) || (defaultPeriods[pIdx] && defaultPeriods[pIdx].time) || '';
        if (cell && cell.cell_type === 'lesson' && cell.subject) {
          lessons.push({ pName, pTime, subject: cell.subject, teacher: cell.teacher || '' });
        }
      }
      html += '<div class="today-class-block">';
      html += '<div class="today-class-name">' + escapeHtml(cls.name) + '</div>';
      if (lessons.length === 0) {
        html += '<div class="today-empty">今日无课程</div>';
      } else {
        html += '<ul class="today-course-ul">';
        lessons.forEach(l => {
          html += '<li><span class="tc-time">' + escapeHtml(l.pName) + ' ' + escapeHtml(l.pTime) + '</span>' +
                  '<span class="tc-subj">' + escapeHtml(l.subject) + '</span>' +
                  (l.teacher ? '<span class="tc-tchr">' + escapeHtml(l.teacher) + '</span>' : '') +
                  '</li>';
        });
        html += '</ul>';
      }
      html += '</div>';
    });
    return html;
  }

  async function loadTodayAttendanceSummary(classId, date) {
    const el = $('todayAttendanceSummary');
    if (!el) return;
    if (!classId) { el.textContent = '请选择班级'; return; }
    el.textContent = '加载中...';
    try {
      const sum = await API.attendanceSummary(classId, date);
      if (!sum || sum.total === 0) {
        el.innerHTML = '<span class="today-empty">今日暂无考勤记录</span>';
        return;
      }
      el.innerHTML =
        '<div class="today-summary-grid">' +
          '<div><span class="num">' + sum.total + '</span><span class="lbl">应到</span></div>' +
          '<div class="ok"><span class="num">' + sum.present + '</span><span class="lbl">出勤</span></div>' +
          '<div class="warn"><span class="num">' + sum.late + '</span><span class="lbl">迟到</span></div>' +
          '<div class="info"><span class="num">' + sum.leave + '</span><span class="lbl">请假</span></div>' +
          '<div class="bad"><span class="num">' + sum.absent + '</span><span class="lbl">缺勤</span></div>' +
        '</div>';
    } catch (e) { el.textContent = '加载失败'; }
  }

  // ========================================================================
  // 学生 - 花名册
  // ========================================================================
  async function renderRoster() {
    const classOptions = ['<option value="">全部班级</option>'].concat(
      classes.map(c => '<option value="' + escapeHtml(c.class_id) + '">' + escapeHtml(c.name) + '</option>')
    ).join('');

    rosterContainer.innerHTML =
      '<div class="me-page">' +
        '<div class="me-card">' +
          '<div class="roster-toolbar">' +
            '<select id="rosterFilterClass" class="cell-pop-input" style="flex:1;">' + classOptions + '</select>' +
            '<input type="text" id="rosterSearch" class="cell-pop-input" placeholder="按姓名搜索…" style="flex:1;">' +
            '<button id="rosterAddBtn" class="btn-primary">＋ 添加</button>' +
          '</div>' +
          '<div id="rosterList" class="roster-list">加载中...</div>' +
        '</div>' +
      '</div>';

    const clsSel = $('rosterFilterClass');
    clsSel.value = currentRosterClassId;
    clsSel.onchange = () => { currentRosterClassId = clsSel.value; loadRoster(); };

    const search = $('rosterSearch');
    search.value = currentRosterKeyword;
    search.oninput = () => { currentRosterKeyword = search.value.trim(); renderRosterList(); };

    $('rosterAddBtn').onclick = () => openRosterPop(null);

    await loadRoster();
  }

  async function loadRoster() {
    try {
      const resp = await API.listRoster(currentRosterClassId);
      rosterList = resp.students || [];
    } catch { rosterList = []; }
    renderRosterList();
  }

  function renderRosterList() {
    const el = $('rosterList');
    if (!el) return;
    const kw = currentRosterKeyword.toLowerCase();
    let list = rosterList;
    if (kw) list = list.filter(s => (s.name || '').toLowerCase().includes(kw));

    if (list.length === 0) {
      el.innerHTML = '<div class="today-empty">暂无学生，点击右上角「＋ 添加」开始录入</div>';
      return;
    }

    const classOrder = {};
    classes.forEach((c, i) => { classOrder[c.class_id] = i; });
    list = list.slice().sort((a, b) => {
      const aMatched = a.class_id in classOrder;
      const bMatched = b.class_id in classOrder;
      if (aMatched !== bMatched) return aMatched ? -1 : 1;
      if (aMatched) {
        if (classOrder[a.class_id] !== classOrder[b.class_id]) {
          return classOrder[a.class_id] - classOrder[b.class_id];
        }
      } else {
        if (a.class_id !== b.class_id) {
          return (a.class_id || '').localeCompare(b.class_id || '', 'zh-CN');
        }
      }
      return (a.name || '').localeCompare(b.name || '', 'zh-CN');
    });

    let html = '<table class="roster-table">' +
      '<thead><tr>' +
        '<th style="width:52px;">序号</th>' +
        '<th>姓名</th>' +
        '<th style="width:52px;">性别</th>' +
        '<th>身份证</th>' +
        '<th>班级</th>' +
        '<th>家长电话1</th>' +
        '<th>家长电话2</th>' +
        '<th>家庭地址</th>' +
      '</tr></thead><tbody>';

    list.forEach((s, i) => {
      const cls = classes.find(c => c.class_id === s.class_id);
      const isPending = !cls;
      const clsDisplay = isPending
        ? escapeHtml(s.class_id) + ' <span class="pending-tag">待关联</span>'
        : escapeHtml(cls.name);

      const genderCls = s.gender === '女' ? 'gender-f' : (s.gender === '男' ? 'gender-m' : '');
      html += '<tr class="roster-tr' + (isPending ? ' pending-class' : '') + '" data-class="' + escapeHtml(s.class_id) + '" data-name="' + escapeHtml(s.name) + '">' +
                '<td class="idx">' + (i + 1) + '</td>' +
                '<td class="name">' + escapeHtml(s.name) + '</td>' +
                '<td class="' + genderCls + '">' + escapeHtml(s.gender || '') + '</td>' +
                '<td>' + escapeHtml(s.id_card || '') + '</td>' +
                '<td>' + clsDisplay + '</td>' +
                '<td>' + escapeHtml(s.tel1 || '') + '</td>' +
                '<td>' + escapeHtml(s.tel2 || '') + '</td>' +
                '<td class="addr">' + escapeHtml(s.address || '') + '</td>' +
              '</tr>';
    });

    html += '</tbody></table>';
    el.innerHTML = html;

    el.querySelectorAll('.roster-tr').forEach(tr => {
      tr.onclick = () => {
        const cid = tr.dataset.class;
        const name = tr.dataset.name;
        const s = rosterList.find(x => x.class_id === cid && x.name === name);
        if (s) openRosterPop(s);
      };
    });
  }

  function openRosterPop(student) {
    if (classes.length === 0) { alert('请先在「班级 → 课表」中创建班级'); return; }
    const isNew = !student;
    const editable = isNew || rosterEditOn;

    $('rosterPopTitle').textContent = isNew ? '添加学生' : (editable ? '编辑学生' : '查看学生');

    fillClassSelect($('rosterPopClass'), student ? student.class_id : currentRosterClassId);
    $('rosterPopName').value = student ? student.name : '';
    $('rosterPopGender').value = student ? (student.gender || '男') : '男';
    $('rosterPopIdCard').value = student ? (student.id_card || '') : '';
    $('rosterPopTel1').value = student ? (student.tel1 || '') : '';
    $('rosterPopTel2').value = student ? (student.tel2 || '') : '';
    $('rosterPopAddress').value = student ? (student.address || '') : '';

    $('rosterPopError').textContent = '';
    $('rosterPopName').readOnly = !editable;
    $('rosterPopClass').disabled = !editable;
    $('rosterPopGender').disabled = !editable;
    $('rosterPopIdCard').readOnly = !editable;
    $('rosterPopTel1').readOnly = !editable;
    $('rosterPopTel2').readOnly = !editable;
    $('rosterPopAddress').readOnly = !editable;

    const saveBtn = $('rosterPopSave');
    if (saveBtn) saveBtn.style.display = editable ? '' : 'none';

    $('rosterPop').style.display = 'flex';
    $('rosterPop').dataset.editing = isNew ? '0' : '1';
    $('rosterPop').dataset.oldClass = student ? student.class_id : '';
    $('rosterPop').dataset.oldName = student ? student.name : '';
    setTimeout(() => { if (isNew) $('rosterPopName').focus(); }, 100);
  }

  const rosterPopClose = $('rosterPopClose');
  if (rosterPopClose) rosterPopClose.onclick = () => { $('rosterPop').style.display = 'none'; };
  const rosterPopEl = $('rosterPop');
  if (rosterPopEl) rosterPopEl.addEventListener('click', e => { if (e.target === rosterPopEl) rosterPopEl.style.display = 'none'; });

  const rosterPopSave = $('rosterPopSave');
  if (rosterPopSave) {
    rosterPopSave.onclick = async () => {
      const errEl = $('rosterPopError');
      errEl.textContent = '';
      const isNew = $('rosterPop').dataset.editing === '0';

      const idCardRaw = $('rosterPopIdCard').value.trim().replace(/\s+/g, '');
      if (idCardRaw && !/^\d{17}[\dXx]$/.test(idCardRaw)) {
        errEl.textContent = '身份证号需为 18 位（前 17 位数字，最后一位数字或 X）';
        return;
      }
      const tel1Raw = $('rosterPopTel1').value.trim().replace(/[\s-]+/g, '');
      if (tel1Raw && !/^\d{11}$/.test(tel1Raw)) {
        errEl.textContent = '家长电话1 需为 11 位数字';
        return;
      }
      const tel2Raw = $('rosterPopTel2').value.trim().replace(/[\s-]+/g, '');
      if (tel2Raw && !/^\d{11}$/.test(tel2Raw)) {
        errEl.textContent = '家长电话2 需为 11 位数字';
        return;
      }

      const data = {
        class_id: $('rosterPopClass').value,
        name: $('rosterPopName').value.trim(),
        gender: $('rosterPopGender').value,
        id_card: idCardRaw,
        tel1: tel1Raw,
        tel2: tel2Raw,
        address: $('rosterPopAddress').value.trim(),
      };
      if (!data.class_id) { errEl.textContent = '请选择班级'; return; }
      if (!data.name) { errEl.textContent = '请输入姓名'; return; }

      const oldClassId = $('rosterPop').dataset.oldClass || '';
      const oldName = $('rosterPop').dataset.oldName || '';

      try {
        await apiCall(API.upsertRoster, data);
        if (!isNew && (oldClassId !== data.class_id || oldName !== data.name)) {
          try { await API.deleteRoster(oldClassId, oldName); } catch (e) { /* ignore */ }
        }
        showSaveStatus(isNew ? '已添加' : '已更新', false);
        $('rosterPop').style.display = 'none';
        await loadRoster();
      } catch (err) {
        errEl.textContent = err.message || '保存失败';
      }
    };
  }

  document.addEventListener('contextmenu', e => {
    const item = e.target.closest && e.target.closest('.roster-tr');
    if (item) {
      e.preventDefault();
      if (!rosterEditOn) {
        showSaveStatus('已锁定，请先点击「✏️ 编辑名册」', true);
        return;
      }
      const cid = item.dataset.class, name = item.dataset.name;
      if (confirm('删除学生「' + name + '」？')) {
        API.deleteRoster(cid, name).then(() => loadRoster()).catch(() => {});
      }
    }
  });

  // ============ 花名册 - 导出图片 ============
  async function exportRosterImage() {
    const card = rosterContainer.querySelector('.me-card');
    if (!card) { alert('无法获取花名册内容'); return; }

    const wrap = document.createElement('div');
    wrap.style.padding = '20px';
    wrap.style.background = getComputedStyle(document.body).background;
    const cloned = card.cloneNode(true);
    cloned.querySelectorAll('.roster-toolbar').forEach(el => el.remove());
    wrap.appendChild(cloned);
    document.body.appendChild(wrap);

    try {
      const canvas = await html2canvas(wrap, { useCORS: true, scale: 2, backgroundColor: null });
      const link = document.createElement('a');
      link.download = '花名册_' + new Date().toLocaleDateString('zh-CN').replace(/\//g, '-') + '.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
      showSaveStatus('已导出图片', false);
    } catch (e) {
      alert('导出失败：' + e.message);
    } finally {
      wrap.remove();
    }
  }

  // ============ 花名册 - 打开导出弹窗 ============
  function openExportRosterPop() {
    const gradeSel = $('exportRosterGrade');
    const numSel = $('exportRosterNum');
    const errEl = $('exportRosterError');
    const allCb = $('exportRosterAll');
    errEl.textContent = '';

    let defaultCls = null;
    if (currentRosterClassId) {
      defaultCls = classes.find(c => c.class_id === currentRosterClassId);
    }
    if (!defaultCls && classes.length > 0) defaultCls = classes[0];

    if (defaultCls) {
      fillGradeSelect(gradeSel, defaultCls.grade || 7);
      fillClassNumSelect(numSel, defaultCls.class_num || 1);
    } else {
      fillGradeSelect(gradeSel, 7);
      fillClassNumSelect(numSel, 1);
    }

    allCb.checked = false;
    gradeSel.disabled = false;
    numSel.disabled = false;
    allCb.onchange = () => {
      const checked = allCb.checked;
      gradeSel.disabled = checked;
      numSel.disabled = checked;
      errEl.textContent = '';
    };

    $('exportRosterPop').style.display = 'flex';
  }

  // ============ 花名册 - 按班级导出 Excel（classId 为空 → 全部） ============
  async function exportRosterExcelByClass(classId) {
    let list = [];
    try {
      const resp = await apiCall(API.listRoster, classId || '');
      list = resp.students || [];
    } catch (e) {
      return;
    }

    if (list.length === 0) {
      alert(classId ? '该班级暂无学生' : '暂无学生数据');
      return;
    }

    const classOrder = {};
    classes.forEach((c, i) => { classOrder[c.class_id] = i; });
    list = list.slice().sort((a, b) => {
      const aMatched = a.class_id in classOrder;
      const bMatched = b.class_id in classOrder;
      if (aMatched !== bMatched) return aMatched ? -1 : 1;
      if (aMatched) {
        if (classOrder[a.class_id] !== classOrder[b.class_id]) {
          return classOrder[a.class_id] - classOrder[b.class_id];
        }
      } else {
        if (a.class_id !== b.class_id) {
          return (a.class_id || '').localeCompare(b.class_id || '', 'zh-CN');
        }
      }
      return (a.name || '').localeCompare(b.name || '', 'zh-CN');
    });

    const rows = [['序号', '姓名', '性别', '身份证', '班级', '家长电话1', '家长电话2', '家庭地址']];
    list.forEach((s, i) => {
      const cls = classes.find(c => c.class_id === s.class_id);
      const clsName = cls ? cls.name : (s.class_id + '（待关联）');
      rows.push([
        i + 1,
        s.name || '',
        s.gender || '',
        s.id_card || '',
        clsName,
        s.tel1 || '',
        s.tel2 || '',
        s.address || '',
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 5 }, { wch: 10 }, { wch: 6 }, { wch: 22 },
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 30 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '花名册');

    let prefix = '全部花名册';
    if (classId) {
      const cls = classes.find(c => c.class_id === classId);
      prefix = cls ? cls.name + '_花名册' : '花名册';
    }
    XLSX.writeFile(wb, safeFilePart(prefix) + '_' + dateStamp() + '.xlsx');
    showSaveStatus('已导出 ' + list.length + ' 条', false);
  }

  // ============ 花名册 - 导出弹窗事件（一次性绑定） ============
  (function bindExportRosterPop() {
    const closeBtn = $('exportRosterClose');
    if (closeBtn) closeBtn.onclick = () => { $('exportRosterPop').style.display = 'none'; };

    const popEl = $('exportRosterPop');
    if (popEl) popEl.addEventListener('click', e => { if (e.target === popEl) popEl.style.display = 'none'; });

    const confirmBtn = $('exportRosterConfirm');
    if (confirmBtn) {
      confirmBtn.onclick = () => {
        const errEl = $('exportRosterError');
        errEl.textContent = '';

        const allCb = $('exportRosterAll');
        if (allCb && allCb.checked) {
          $('exportRosterPop').style.display = 'none';
          exportRosterExcelByClass('');
          return;
        }

        const grade = parseInt($('exportRosterGrade').value, 10);
        const classNum = parseInt($('exportRosterNum').value, 10);
        const cls = classes.find(c => c.grade === grade && c.class_num === classNum);
        if (!cls) { errEl.textContent = '该班级不存在'; return; }

        $('exportRosterPop').style.display = 'none';
        exportRosterExcelByClass(cls.class_id);
      };
    }
  })();

  // ========================================================================
  // 学生 - 成绩
  // ========================================================================
  async function renderGrades() {
    const classOptions = classes.map(c =>
      '<option value="' + escapeHtml(c.class_id) + '">' + escapeHtml(c.name) + '</option>'
    ).join('');
    const subjectOptions = SUBJECTS.map(s =>
      '<option value="' + s + '">' + s + '</option>'
    ).join('');

    gradesContainer.innerHTML =
      '<div class="me-page">' +
        '<div class="me-card">' +
          '<div class="roster-toolbar">' +
            '<select id="gradesClass" class="cell-pop-input" style="flex:1;">' + (classOptions || '<option value="">（暂无班级）</option>') + '</select>' +
            '<select id="gradesSubject" class="cell-pop-input" style="flex:1;">' + subjectOptions + '</select>' +
            '<button id="gradesAddExam" class="btn-primary">＋ 新建考试</button>' +
          '</div>' +
          '<div id="examsList" class="exams-list">加载中...</div>' +
        '</div>' +
      '</div>';

    if (classes.length === 0) {
      $('examsList').innerHTML = '<div class="today-empty">请先在「班级 → 课表」中创建班级</div>';
      return;
    }

    if (!currentGradesClassId) currentGradesClassId = classes[0].class_id;
    const clsSel = $('gradesClass');
    clsSel.value = currentGradesClassId;
    clsSel.onchange = () => { currentGradesClassId = clsSel.value; loadExams(); };

    const subSel = $('gradesSubject');
    subSel.value = currentGradesSubject;
    subSel.onchange = () => { currentGradesSubject = subSel.value; loadExams(); };

    $('gradesAddExam').onclick = () => openExamPop(null);

    await loadExams();
  }

  async function loadExams() {
    const el = $('examsList');
    if (!el) return;
    el.textContent = '加载中...';
    try {
      const resp = await API.listExams(currentGradesClassId);
      examsList = (resp.exams || []).filter(e => e.subject === currentGradesSubject);
    } catch { examsList = []; }

    if (examsList.length === 0) {
      el.innerHTML = '<div class="today-empty">暂无「' + escapeHtml(currentGradesSubject) + '」考试记录，点击「＋ 新建考试」开始</div>';
      return;
    }

    let html = '';
    for (const e of examsList) {
      html += '<div class="exam-row" data-id="' + e.id + '">' +
                '<div class="exam-row-head">' +
                  '<span class="exam-name">' + escapeHtml(e.name) + ' · ' + escapeHtml(e.subject) + '</span>' +
                  '<div class="exam-actions">' +
                    '<button class="btn-sm btn-edit-exam" data-exam=\'' + JSON.stringify(e).replace(/'/g, "\\'") + '\'>✏️ 修改</button>' +
                    '<button class="btn-sm btn-del-exam" data-id="' + e.id + '">🗑️ 删除</button>' +
                  '</div>' +
                '</div>' +
                '<div class="exam-meta">满分 ' + e.full_score + ' · 及格 ' + e.pass_score + ' · 优秀 ' + e.excellent_score + '</div>' +
                '<div class="exam-stats" data-stats-for="' + e.id + '">加载中...</div>' +
              '</div>';
    }
    el.innerHTML = html;

    // 绑定修改和删除事件
    el.querySelectorAll('.btn-edit-exam').forEach(btn => {
      btn.onclick = (ev) => {
        ev.stopPropagation();
        const examData = JSON.parse(btn.dataset.exam);
        openExamPop(examData);
      };
    });
    el.querySelectorAll('.btn-del-exam').forEach(btn => {
      btn.onclick = (ev) => {
        ev.stopPropagation();
        window.deleteExam(parseInt(btn.dataset.id, 10));
      };
    });

    el.querySelectorAll('.exam-row').forEach(row => {
      row.onclick = (ev) => {
        if (ev.target.closest('.exam-actions')) return;
        openScoresPop(parseInt(row.dataset.id, 10));
      };
    });

    for (const e of examsList) { loadExamStats(e.id); }
  }

  async function loadExamStats(examId) {
    const el = document.querySelector('[data-stats-for="' + examId + '"]');
    if (!el) return;
    try {
      const resp = await API.getExamDetail(examId);
      const st = resp.stats || {};
      el.innerHTML =
        '<div class="stat-cell"><span class="k">平均分</span><span class="v">' + (st.average ? st.average.toFixed(1) : '—') + ' / ' + (st.full_score || 0) + '</span></div>' +
        '<div class="stat-cell"><span class="k">及格率</span><span class="v">' + (st.pass_rate ? st.pass_rate.toFixed(1) : '0.0') + '% (' + (st.pass_count || 0) + '人 ≥' + (st.pass_line || 0) + ')</span></div>' +
        '<div class="stat-cell"><span class="k">优秀率</span><span class="v">' + (st.excellent_rate ? st.excellent_rate.toFixed(1) : '0.0') + '% (' + (st.excellent_count || 0) + '人 ≥' + (st.excellent_line || 0) + ')</span></div>' +
        '<div class="stat-cell"><span class="k">最高/最低</span><span class="v">' + (st.max_score || 0) + ' / ' + (st.min_score || 0) + '</span></div>' +
        '<div class="stat-cell"><span class="k">已录人数</span><span class="v">' + (st.count || 0) + '</span></div>';
    } catch { el.textContent = '加载失败'; }
  }

  function fillSubjectSelect(sel, defaultVal) {
    if (!sel) return;
    sel.innerHTML = '';
    SUBJECTS.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      if (s === defaultVal) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function fillExamNameSelect(sel, defaultVal) {
    if (!sel) return;
    sel.innerHTML = '';
    EXAM_NAMES.forEach(n => {
      const opt = document.createElement('option');
      opt.value = n;
      opt.textContent = n;
      if (n === defaultVal) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function openExamPop(exam) {
    if (classes.length === 0) { alert('请先创建班级'); return; }
    const isNew = !exam;
    $('examPopTitle').textContent = isNew ? '新建考试' : '编辑考试';
    fillClassSelect($('examPopClass'), exam ? exam.class_id : currentGradesClassId);
    fillSubjectSelect($('examPopSubject'), exam ? exam.subject : currentGradesSubject);
    fillExamNameSelect($('examPopName'), exam ? exam.name : EXAM_NAMES[0]);
    $('examPopFull').value = exam ? exam.full_score : 100;
    $('examPopPass').value = exam ? exam.pass_score : 75;
    $('examPopExcellent').value = exam ? exam.excellent_score : 100;
    $('examPopError').textContent = '';
    $('examPopClass').disabled = !isNew;
    $('examPopSubject').disabled = !isNew;
    $('examPopName').disabled = !isNew;
    $('examPop').dataset.id = isNew ? '' : exam.id;
    $('examPop').style.display = 'flex';
  }

  const examPopClose = $('examPopClose');
  if (examPopClose) examPopClose.onclick = () => { $('examPop').style.display = 'none'; };
  const examPopEl = $('examPop');
  if (examPopEl) examPopEl.addEventListener('click', e => { if (e.target === examPopEl) examPopEl.style.display = 'none'; });

  const examPopSave = $('examPopSave');
  if (examPopSave) {
    examPopSave.onclick = async () => {
      const errEl = $('examPopError');
      errEl.textContent = '';
      const data = {
        class_id: $('examPopClass').value,
        subject: $('examPopSubject').value,
        name: $('examPopName').value,
        full_score: parseInt($('examPopFull').value, 10) || 100,
        pass_score: parseInt($('examPopPass').value, 10) || 75,
        excellent_score: parseInt($('examPopExcellent').value, 10) || 100,
      };
      if (!data.class_id || !data.subject || !data.name) { errEl.textContent = '请填写完整'; return; }
      try {
        const id = $('examPop').dataset.id;
        if (id) await API.updateExam(id, data);
        else await API.createExam(data);
        showSaveStatus('已保存', false);
        $('examPop').style.display = 'none';
        await loadExams();
      } catch (err) { errEl.textContent = err.message || '保存失败'; }
    };
  }

  async function openScoresPop(examId) {
    $('scoresPop').style.display = 'flex';
    $('scoresPopBody').innerHTML = '<div style="text-align:center;padding:20px;">加载中...</div>';
    $('scoresPop').dataset.id = examId;

    try {
      const [detail, rosterResp] = await Promise.all([
        API.getExamDetail(examId),
        API.listRoster(currentGradesClassId),
      ]);
      currentExamDetail = detail;
      const exam = detail.exam;
      const stats = detail.stats || {};
      const scores = detail.scores || [];
      const roster = rosterResp.students || [];

      const clsName = (classes.find(c => c.class_id === exam.class_id) || {}).name || '';
      $('scoresPopTitle').textContent = exam.name + ' · ' + exam.subject + ' （' + clsName + '）';

      // 构建 Tab 结构
      let html = `
        <div class="tab-header">
          <button class="tab-btn active" data-tab="input">📝 成绩录入</button>
          <button class="tab-btn" data-tab="analysis">📊 分数段分析</button>
          <button class="tab-btn" data-tab="rank">🏆 名次表</button>
        </div>
        <div id="tab-content-input" class="tab-pane active">
          <div class="scores-stats" id="scoresPopStats"></div>
          <div id="scoresInputBody" style="margin-top:12px;max-height:50vh;overflow:auto;"></div>
        </div>
        <div id="tab-content-analysis" class="tab-pane" style="display:none;">
          <div id="chartDistribution" style="width:100%;height:300px;"></div>
        </div>
        <div id="tab-content-rank" class="tab-pane" style="display:none;">
          <div id="rankTableBody" style="max-height:50vh;overflow:auto;"></div>
        </div>
      `;
      $('scoresPopBody').innerHTML = html;

      // 填充统计信息
      $('scoresPopStats').innerHTML =
        '<div class="stat-cell"><span class="k">平均分</span><span class="v">' + (stats.average ? stats.average.toFixed(1) : '—') + ' / ' + exam.full_score + '</span></div>' +
        '<div class="stat-cell"><span class="k">及格率</span><span class="v">' + (stats.pass_rate ? stats.pass_rate.toFixed(1) : '0.0') + '% (' + (stats.pass_count || 0) + '人 ≥' + exam.pass_score + ')</span></div>' +
        '<div class="stat-cell"><span class="k">优秀率</span><span class="v">' + (stats.excellent_rate ? stats.excellent_rate.toFixed(1) : '0.0') + '% (' + (stats.excellent_count || 0) + '人 ≥' + exam.excellent_score + ')</span></div>' +
        '<div class="stat-cell"><span class="k">最高/最低</span><span class="v">' + (stats.max_score || 0) + ' / ' + (stats.min_score || 0) + '</span></div>' +
        '<div class="stat-cell"><span class="k">已录人数</span><span class="v">' + (stats.count || 0) + ' / ' + roster.length + '</span></div>';

      // 渲染成绩录入区
      if (roster.length === 0) {
        $('scoresInputBody').innerHTML = '<div class="today-empty">该班级暂无花名册学生<br>请先到「学生 → 花名册」添加学生</div>';
      } else {
        const scoreMap = {};
        scores.forEach(s => { scoreMap[s.student_name] = s.score; });
        let inputHtml = '<table class="scores-table"><thead><tr><th>姓名</th><th>分数</th></tr></thead><tbody>';
        roster.forEach(stu => {
          const val = scoreMap[stu.name];
          inputHtml += '<tr>' +
                    '<td>' + escapeHtml(stu.name) + (stu.gender ? ' <span class="r-gender">' + escapeHtml(stu.gender) + '</span>' : '') + '</td>' +
                    '<td><input type="number" class="score-input" data-name="' + escapeHtml(stu.name) + '" value="' + (val !== undefined ? val : '') + '" min="0" max="' + exam.full_score + '" step="0.5"></td>' +
                  '</tr>';
        });
        inputHtml += '</tbody></table>';
        $('scoresInputBody').innerHTML = inputHtml;
      }

      // 渲染名次表
      const rankList = roster.map(stu => {
        const scoreObj = scores.find(s => s.student_name === stu.name);
        return {
          name: stu.name,
          gender: stu.gender || '',
          score: scoreObj ? scoreObj.score : null
        };
      }).sort((a, b) => {
        if (a.score === null && b.score === null) return 0;
        if (a.score === null) return 1;
        if (b.score === null) return -1;
        return b.score - a.score;
      });

      let rankHtml = '<table class="rank-table">' +
        '<thead><tr><th>名次</th><th>姓名</th><th>性别</th><th>分数</th><th>总分</th><th>层次</th></tr></thead><tbody>';
      let rank = 1;
      rankList.forEach((item, idx) => {
        if (item.score === null) {
          rankHtml += `<tr><td class="rank-num">-</td><td class="student-name">${escapeHtml(item.name)}</td><td>${escapeHtml(item.gender)}</td><td colspan="3" style="color:var(--empty-text);">未录入</td></tr>`;
          return;
        }
        const level = item.score >= exam.excellent_score ? '优秀' : (item.score >= exam.pass_score ? '及格' : '不及格');
        const levelColor = level === '优秀' ? '#27ae60' : (level === '及格' ? '#f39c12' : '#e74c3c');
        rankHtml += `<tr>
          <td class="rank-num">${rank++}</td>
          <td class="student-name"><a href="javascript:void(0)" onclick="openStudentReportPop('${escapeHtml(item.name)}')">${escapeHtml(item.name)}</a></td>
          <td>${escapeHtml(item.gender)}</td>
          <td class="score-val">${item.score}</td>
          <td>${exam.full_score}</td>
          <td><span style="color:${levelColor};font-weight:600;">${level}</span></td>
        </tr>`;
      });
      rankHtml += '</tbody></table>';
      $('rankTableBody').innerHTML = rankHtml;

      // 绑定 Tab 切换事件
      $('scoresPopBody').querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
          $('scoresPopBody').querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
          $('scoresPopBody').querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
          btn.classList.add('active');
          $('tab-content-' + btn.dataset.tab).classList.add('active');
          
          // 切换到分析 Tab 时初始化图表
          if (btn.dataset.tab === 'analysis') {
            setTimeout(() => {
              const chartDom = document.getElementById('chartDistribution');
              if (chartDom) {
                const myChart = echarts.init(chartDom);
                const bands = ['<60', '60-69', '70-79', '80-89', '90-99', '100+'];
                const data = bands.map(b => stats.distribution ? stats.distribution[b] || 0 : 0);
                myChart.setOption({
                  title: { text: exam.subject + ' 分数段分布', left: 'center', textStyle: { fontSize: 14 } },
                  tooltip: { trigger: 'axis' },
                  grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
                  xAxis: { type: 'category', data: bands },
                  yAxis: { type: 'value' },
                  series: [{
                    data: data,
                    type: 'bar',
                    barWidth: '50%',
                    itemStyle: {
                      color: function(params) {
                        const colors = ['#f28b82', '#fbbc04', '#fdd663', '#8ab4f8', '#a8dab5'];
                        return colors[params.dataIndex] || '#8ab4f8';
                      },
                      borderRadius: [4, 4, 0, 0]
                    },
                    label: { show: true, position: 'top' }
                  }]
                });
              }
            }, 100);
          }
        };
      });

    } catch (err) {
      $('scoresPopBody').innerHTML = '<div class="today-empty">加载失败：' + escapeHtml(err.message) + '</div>';
    }
  }

  const scoresPopClose = $('scoresPopClose');
  if (scoresPopClose) scoresPopClose.onclick = () => { $('scoresPop').style.display = 'none'; };
  const scoresPopEl = $('scoresPop');
  if (scoresPopEl) scoresPopEl.addEventListener('click', e => { if (e.target === scoresPopEl) scoresPopEl.style.display = 'none'; });

  const scoresPopSave = $('scoresPopSave');
  if (scoresPopSave) {
    scoresPopSave.onclick = async () => {
      const examId = parseInt($('scoresPop').dataset.id, 10);
      if (!examId) return;
      // 如果当前不在录入 Tab，则不能保存
      const inputPane = document.getElementById('tab-content-input');
      if (!inputPane || !inputPane.classList.contains('active')) {
        alert('请先切换到「成绩录入」标签页进行修改');
        return;
      }
      const inputs = $('scoresInputBody').querySelectorAll('.score-input');
      const scores = [];
      inputs.forEach(inp => {
        const name = inp.dataset.name;
        const v = inp.value.trim();
        if (v === '') return;
        scores.push({ student_name: name, score: parseFloat(v) });
      });
      if (scores.length === 0) { alert('请至少录入一个成绩'); return; }
      try {
        await apiCall(API.saveScores, examId, scores);
        showSaveStatus('已保存 ' + scores.length + ' 条成绩', false);
        await openScoresPop(examId); // 重新加载数据以刷新统计和排名
        loadExamStats(examId);
      } catch {}
    };
  }

  // 绑定学生成绩报告弹窗关闭事件
  const studentReportClose = $('studentReportClose');
  if (studentReportClose) studentReportClose.onclick = () => { $('studentReportPop').style.display = 'none'; };
  const studentReportPopEl = $('studentReportPop');
  if (studentReportPopEl) studentReportPopEl.addEventListener('click', e => { if (e.target === studentReportPopEl) studentReportPopEl.style.display = 'none'; });

  // ========================================================================
  // 学生 - 考勤
  // ========================================================================
  async function renderAttendance() {
    const classOptions = classes.map(c =>
      '<option value="' + escapeHtml(c.class_id) + '">' + escapeHtml(c.name) + '</option>'
    ).join('');

    attendanceContainer.innerHTML =
      '<div class="me-page">' +
        '<div class="me-card">' +
          '<div class="roster-toolbar">' +
            '<select id="attClass" class="cell-pop-input" style="flex:1;">' + (classOptions || '<option value="">（暂无班级）</option>') + '</select>' +
            '<input type="date" id="attDate" class="cell-pop-input" style="flex:1;">' +
            '<button id="attSaveBtn" class="btn-primary">💾 保存</button>' +
          '</div>' +
          '<div id="attSummary" class="att-summary"></div>' +
          '<div id="attList" class="att-list">加载中...</div>' +
        '</div>' +
      '</div>';

    if (classes.length === 0) {
      $('attList').innerHTML = '<div class="today-empty">请先在「班级 → 课表」中创建班级</div>';
      return;
    }

    if (!currentAttendanceClassId) currentAttendanceClassId = classes[0].class_id;
    const clsSel = $('attClass');
    clsSel.value = currentAttendanceClassId;
    clsSel.onchange = () => { currentAttendanceClassId = clsSel.value; loadAttendance(); };

    const dateInput = $('attDate');
    dateInput.value = currentAttendanceDate;
    dateInput.onchange = () => { currentAttendanceDate = dateInput.value; loadAttendance(); };

    $('attSaveBtn').onclick = saveAttendance;

    await loadAttendance();
  }

  async function loadAttendance() {
    const el = $('attList');
    const sumEl = $('attSummary');
    if (!el) return;
    el.textContent = '加载中...';
    sumEl.innerHTML = '';

    try {
      const [rosterResp, attResp] = await Promise.all([
        API.listRoster(currentAttendanceClassId),
        API.listAttendance(currentAttendanceClassId, currentAttendanceDate),
      ]);
      const roster = rosterResp.students || [];
      const records = attResp.records || [];
      attendanceList = roster;

      if (roster.length === 0) {
        el.innerHTML = '<div class="today-empty">该班级暂无花名册学生</div>';
        return;
      }

      const statusMap = {};
      records.forEach(r => { statusMap[r.student_name] = r; });

      const STATUSES = ['出勤', '迟到', '请假', '缺勤'];

      el.innerHTML = roster.map(stu => {
        const cur = statusMap[stu.name] || { status: '', remark: '' };
        const safeName = String(stu.name || '');
        // 获取姓名首字母，若为空则显示问号
        const initial = safeName ? escapeHtml(safeName.charAt(0)) : '?';
        // 根据性别赋予不同的CSS类
        const genderClass = stu.gender === '女' ? 'female' : 'male';

        return '<div class="att-row">' +
                  '<div class="att-student-info">' +
                    '<div class="att-avatar ' + genderClass + '">' + initial + '</div>' +
                    '<span class="att-name">' + escapeHtml(safeName) + '</span>' +
                  '</div>' +
                  '<div class="att-status-group">' +
                    STATUSES.map(s =>
                      '<button class="att-status-btn status-' + s + (cur.status === s ? ' active' : '') + '" data-name="' + escapeHtml(safeName) + '" data-status="' + s + '">' + s + '</button>'
                    ).join('') +
                    '<input type="text" class="att-remark" data-name="' + escapeHtml(safeName) + '" placeholder="备注" value="' + escapeHtml(cur.remark || '') + '">' +
                  '</div>' +
                '</div>';
      }).join('');

      el.querySelectorAll('.att-status-btn').forEach(b => {
        b.onclick = () => {
          const name = b.dataset.name;
          el.querySelectorAll('.att-status-btn[data-name="' + cssEscape(name) + '"]').forEach(x => x.classList.remove('active'));
          b.classList.add('active');
          updateAttSummary();
        };
      });

      updateAttSummary();
    } catch (err) {
      el.innerHTML = '<div class="today-empty">加载失败：' + escapeHtml(err.message) + '</div>';
    }
  }

  function updateAttSummary() {
    const el = $('attList');
    const sumEl = $('attSummary');
    if (!el || !sumEl) return;
    const counts = { 出勤: 0, 迟到: 0, 请假: 0, 缺勤: 0 };
    el.querySelectorAll('.att-status-btn.active').forEach(b => {
      if (counts[b.dataset.status] !== undefined) counts[b.dataset.status]++;
    });
    const total = attendanceList.length;
    sumEl.innerHTML =
      '<div class="today-summary-grid">' +
        '<div><span class="num">' + total + '</span><span class="lbl">应到</span></div>' +
        '<div class="ok"><span class="num">' + counts['出勤'] + '</span><span class="lbl">出勤</span></div>' +
        '<div class="warn"><span class="num">' + counts['迟到'] + '</span><span class="lbl">迟到</span></div>' +
        '<div class="info"><span class="num">' + counts['请假'] + '</span><span class="lbl">请假</span></div>' +
        '<div class="bad"><span class="num">' + counts['缺勤'] + '</span><span class="lbl">缺勤</span></div>' +
      '</div>';
  }

  async function saveAttendance() {
    const el = $('attList');
    if (!el) return;
    const items = [];
    el.querySelectorAll('.att-row').forEach(row => {
      const activeBtn = row.querySelector('.att-status-btn.active');
      const remarkEl = row.querySelector('.att-remark');
      const name = activeBtn ? activeBtn.dataset.name : (remarkEl ? remarkEl.dataset.name : '');
      if (!name) return;
      items.push({
        student_name: name,
        status: activeBtn ? activeBtn.dataset.status : '出勤',
        remark: remarkEl ? remarkEl.value.trim() : '',
      });
    });
    if (items.length === 0) { alert('没有可保存的记录'); return; }
    try {
      await apiCall(API.saveAttendance, currentAttendanceClassId, currentAttendanceDate, items);
      showSaveStatus('已保存 ' + items.length + ' 条', false);
    } catch {}
  }

  // ============ Start ============
  init();
})();
