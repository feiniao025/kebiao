/* ============================================================
   app.js —— 入口 & 主流程
   必须在所有 app-*.js 之后加载
   ============================================================ */

(function () {
  'use strict';

  /* ========== 数据加载 ========== */
  async function reloadClasses() {
    try {
      const resp = await API.listClasses();
      window.classes = resp.classes || [];
    } catch (e) { window.classes = []; }
  }

  async function reloadCellData() {
    try {
      const cellResp = await API.getCells();
      window.cellData = {};
      (cellResp.cells || []).forEach(function (c) {
        const key = c.class_id + '_cell_' + c.cell_index;
        window.cellData[key] = c;
      });
    } catch (e) { /* ignore */ }
  }

  /* ========== 首屏并行加载 ========== */
  async function init() {
    try {
      if (!API.getToken()) { window.showLoginRegister(); return; }
      try {
        window.currentUser = await API.me();
      } catch (e) {
        API.clearToken();
        window.showLoginRegister();
        return;
      }

      // 4 个请求并行发出
      const [defaultsResp, prefsResp, classesResp, cellsResp, seatResp] = await Promise.all([
        API.getDefaults().catch(function () { return {}; }),
        API.getPreferences().catch(function () { return {}; }),
        API.listClasses().catch(function () { return { classes: [] }; }),
        API.getCells().catch(function () { return { cells: [] }; }),
        API.getSeat().catch(function () { return {}; }),
      ]);

      window.defaultPeriods = defaultsResp.periods || [];
      window.defaultLegend = defaultsResp.legend || [];

      window.preferences = Object.assign(window.preferences, prefsResp || {});
      if (window.preferences.theme === 'dark') window.html.setAttribute('data-theme', 'dark');
      window.setThemeBtn();

      window.classes = classesResp.classes || [];

      window.cellData = {};
      (cellsResp.cells || []).forEach(function (c) {
        const key = c.class_id + '_cell_' + c.cell_index;
        window.cellData[key] = c;
      });

      window.seat.rows = seatResp.rows || 7;
      window.seat.cols = seatResp.cols || 8;
      window.seat.order = seatResp.order || 'asc';
      window.seat.aisle = seatResp.aisle || '';
      window.seat.students = [];
      for (let i = 0; i < window.seat.rows * window.seat.cols; i++) {
        window.seat.students.push({ name: '', gender: '', id_card: '', tel1: '', tel2: '', address: '' });
      }
      (seatResp.students || []).forEach(function (s) {
        const idx = s.seat_row * window.seat.cols + s.seat_col;
        if (idx < window.seat.students.length) window.seat.students[idx] = s;
      });

      // 初始按钮状态
      const tw = $('toggleWeekHighlight');
      if (tw) tw.classList.toggle('active', window.preferences.week_highlight);
      const se = $('seatEditToggle');
      if (se) se.classList.toggle('active', window.seatEditOn);
      const so = $('seatOrderBtn');
      if (so) {
        so.textContent = window.seat.order === 'asc' ? '讲台上' : '讲台下';
        so.classList.toggle('active', window.seat.order === 'desc');
      }
      document.body.classList.toggle('person-mode', window.seatEditOn);
      window.updateAisleBtn();

      // 初始化选中班级
      if (window.classes.length > 0) {
        if (!window.currentGradesClassId) window.currentGradesClassId = window.classes[0].class_id;
        if (!window.currentAttendanceClassId) window.currentAttendanceClassId = window.classes[0].class_id;
        if (!window.currentDutyClassId) window.currentDutyClassId = window.classes[0].class_id;
      }

      // 首屏渲染
      if (typeof renderSchedule === 'function') renderSchedule();
      if (typeof renderSeats === 'function') renderSeats();
      if (typeof updateSeatCardTitle === 'function') updateSeatCardTitle();
      window.renderWeekHighlight();

      if (window.currentUser) window.switchTopTab('today');
      else window.switchTopTab('me');

      // 底部导航绑定
      if (window.bottomNav) {
        window.bottomNav.querySelectorAll('button[data-top]').forEach(function (b) {
          b.onclick = function () { window.switchTopTab(b.dataset.top); };
        });
      }
    } catch (err) {
      console.error('init 异常:', err);
      try { window.showLoginRegister(); } catch (e2) {}
    }
  }

  /* ========== DOM 就绪后启动 ========== */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();