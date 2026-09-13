(async function () {
  'use strict';

  // ============ State ============
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
  let activeTab = 'schedule';
  let meMode = 'login';
  let meView = 'profile';
  let currentCellIdx = null, currentCellType = null, currentBgColor = '0';
  let currentCellClassId = null;
  let currentPopIdx = null;
  let currentPopIsNew = false;
  let currentManageClassId = null;
  let editAllOn = false;
  let seatEditOn = false;

  // 自动云同步
  let autoSyncTimer = null;
  const AUTO_SYNC_DELAY = 2000;

  // 班级卡片拖拽排序
  let classPressTimer = null;
  let classPressState = null;
  let classDrag = null;
  const CLASS_LONG_PRESS_MS = 500;
  const CLASS_MOVE_CANCEL_PX = 10;

  // 午休行的固定 cell_index（不与节次/课程索引冲突）
  const BREAK_CELL_INDEX = 1000;
  const BREAK_AFTER_PERIOD = 4;   // 第 4 节之后、第 5 节之前插入午休

  // ============ DOM ============
  const $ = (id) => document.getElementById(id);
  const html = document.documentElement;
  const pageTitle = $('pageTitle');
  const pageSub = $('pageSub');
  const controlBar = document.querySelector('.control-bar');
  const scheduleContainer = $('scheduleContainer');
  const seatCard = $('seatCard');
  const meContainer = $('meContainer');
  const meCard = $('meCard');
  const tabBtns = document.querySelectorAll('.sidebar-nav button[data-tab]');

  // ============ Utilities ============
  let saveStatusTimer = null;
  function showSaveStatus(msg, isError) {
    const el = $('saveStatus');
    el.textContent = msg;
    el.classList.toggle('err', !!isError);
    el.classList.add('show');
    if (saveStatusTimer) clearTimeout(saveStatusTimer);
    saveStatusTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function validateIdCard(v) { return /^\d{17}[\dXx]$/.test(v); }
  function validatePhone(v) { return /^\d{11}$/.test(v); }
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
    sel.innerHTML = '';
    for (let c = 1; c <= 30; c++) {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c + ' 班';
      if (c === defaultNum) opt.selected = true;
      sel.appendChild(opt);
    }
  }
  // 课节数下拉
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

  // ---------- 过道工具函数 ----------
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
      if (i > 0) parts.push('10px');   // 过道列宽
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

  // ============ Init ============
  async function init() {
    if (!API.getToken()) { showLoginRegister(); return; }
    try {
      currentUser = await API.me();
    } catch {
      API.clearToken();
      showLoginRegister();
      return;
    }

    const defaults = await API.getDefaults();
    defaultPeriods = defaults.periods || [];
    defaultLegend = defaults.legend || [];

    try {
      const prefs = await API.getPreferences();
      preferences = Object.assign(preferences, prefs);
    } catch { /* ignore */ }

    if (preferences.theme === 'dark') html.setAttribute('data-theme', 'dark');
    setThemeBtn();

    activeTab = preferences.active_tab || 'schedule';

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
    } catch { /* ignore */ }

    $('toggleWeekHighlight').classList.toggle('active', preferences.week_highlight);
    $('seatEditToggle').classList.toggle('active', seatEditOn);
    $('seatOrderBtn').textContent = seat.order === 'asc' ? '讲台上' : '讲台下';
    $('seatOrderBtn').classList.toggle('active', seat.order === 'desc');
    document.body.classList.toggle('person-mode', seatEditOn);
    updateAisleBtn();

    renderSchedule();
    renderSeats();
    updateSeatCardTitle();
    renderWeekHighlight();
    switchTab(activeTab);
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

  // ============ Tab Switching ============
  function switchTab(tab) {
    if (!currentUser && tab !== 'me') { alert('请先登录后再使用此功能'); tab = 'me'; }
    activeTab = tab;
    const sidebarEl = document.querySelector('.sidebar');
    if (sidebarEl) sidebarEl.style.display = currentUser ? '' : 'none';
    if (currentUser) {
      preferences.active_tab = tab;
      API.updatePreferences({ active_tab: tab }).catch(() => {});
    }
    tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));

    if (tab === 'me') {
      meContainer.style.display = 'block';
      scheduleContainer.style.display = 'none';
      seatCard.style.display = 'none';
      pageTitle.innerHTML = '👤 我的';
      pageSub.innerHTML = currentUser ? ('欢迎回来，' + escapeHtml(currentUser.username)) : '登录后使用个性化数据';
      pageSub.style.display = '';
      controlBar.style.display = 'none';
      renderMePage();
    } else if (tab === 'schedule') {
      meContainer.style.display = 'none';
      scheduleContainer.style.display = 'block';
      seatCard.style.display = 'none';
      pageTitle.innerHTML = '📚 课程表';
      pageSub.innerHTML = '自定义班级 · 点击单元格编辑';
      pageSub.style.display = '';
      controlBar.style.display = 'flex';
      document.querySelectorAll('.schedule-only').forEach(b => { b.style.display = ''; });
      document.querySelectorAll('.seat-only').forEach(b => { b.style.display = 'none'; });
      renderWeekHighlight();
    } else if (tab === 'seat') {
      meContainer.style.display = 'none';
      scheduleContainer.style.display = 'none';
      seatCard.style.display = 'block';
      pageTitle.innerHTML = '🪑 座位表';
      pageSub.innerHTML = '';
      pageSub.style.display = 'none';
      controlBar.style.display = 'flex';
      document.querySelectorAll('.schedule-only').forEach(b => { b.style.display = 'none'; });
      document.querySelectorAll('.seat-only').forEach(b => { b.style.display = ''; });
      updateSeatCardTitle();
      renderSeats();
    }
  }
  tabBtns.forEach(btn => { btn.onclick = () => switchTab(btn.dataset.tab); });

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
    document.querySelectorAll('.control-bar button[data-filter]').forEach(b => b.classList.toggle('active', b.dataset.filter === fv));
    document.querySelectorAll('.class-card').forEach(card => {
      card.style.display = (fv === 'all' || card.dataset.class === fv) ? 'block' : 'none';
    });
  }

  document.querySelector('.control-bar').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-filter]');
    if (!btn) return;
    const fv = btn.dataset.filter;
    preferences.schedule_filter = fv;
    applyFilter(fv);
    API.updatePreferences({ schedule_filter: fv }).catch(() => {});
  });

  // ============ 全局编辑课表开关 ============
  $('editToggleBtn').onclick = (e) => {
    e.stopPropagation();
    editAllOn = !editAllOn;
    $('editToggleBtn').classList.toggle('active', editAllOn);
    showSaveStatus(editAllOn ? '已开启编辑：点击单元格改内容 · 长按标题栏拖动排序' : '已锁定', false);
  };

  // ============ 全局编辑座位开关 ============
  $('seatEditToggle').onclick = (e) => {
    e.stopPropagation();
    seatEditOn = !seatEditOn;
    $('seatEditToggle').classList.toggle('active', seatEditOn);
    document.body.classList.toggle('person-mode', seatEditOn);
    renderSeats();
    showSaveStatus(seatEditOn ? '已开启编辑：长按可拖动换座 · 点击空位可添加 · 点击学生可修改' : '已锁定', false);
  };

  // ============ 班级卡片拖拽排序 ============
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
  function openCreateClassPop() {
    const gradeSel = $('classPopGrade');
    const numSel = $('classPopNum');
    const errEl = $('classPopError');
    if (errEl) errEl.textContent = '';

    fillGradeSelect(gradeSel, 7);
    fillClassNumSelect(numSel, 1);

    $('classPopBadge').value = '';
    $('classPop').style.display = 'flex';
  }

  $('createClassBtn').onclick = () => {
    if (!currentUser) { alert('请先登录'); return; }
    openCreateClassPop();
  };

  $('classPopClose').onclick = () => { $('classPop').style.display = 'none'; };
  $('classPop').addEventListener('click', e => { if (e.target === $('classPop')) $('classPop').style.display = 'none'; });

  $('classPopSave').onclick = async () => {
    const grade = parseInt($('classPopGrade').value, 10);
    const classNum = parseInt($('classPopNum').value, 10);
    const badgeName = $('classPopBadge').value.trim();
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
      renderFilterButtons();
      renderSchedule();
      updateSeatCardTitle();
      showSaveStatus('班级已创建', false);
      scheduleAutoSync();
      $('classPop').style.display = 'none';
    } catch (err) {
      errEl.textContent = err.message || '创建失败';
    }
  };

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

  $('classManageClose').onclick = () => { $('classManagePop').style.display = 'none'; };
  $('classManagePop').addEventListener('click', e => { if (e.target === $('classManagePop')) $('classManagePop').style.display = 'none'; });

  $('classManageSave').onclick = async () => {
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

  $('classManageDelete').onclick = async () => {
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

  // ============ Schedule Rendering ============
  function renderSchedule() {
    const container = scheduleContainer;
    container.innerHTML = '';

    if (classes.length === 0) {
      const emptyCard = document.createElement('div');
      emptyCard.className = 'card';
      emptyCard.innerHTML =
        '<div style="text-align:center;padding:40px 20px;">' +
        '<p style="font-size:16px;color:var(--text-sub);margin-bottom:16px;">暂无班级</p>' +
        '<button id="emptyCreateClassBtn" style="padding:10px 24px;border-radius:10px;border:none;background:#16a085;color:#fff;font-size:14px;cursor:pointer;font-family:inherit;">＋ 新建班级</button>' +
        '<p style="font-size:13px;color:var(--text-sub);margin-top:16px;">或点击「⚙️ 更多 → 📥 导入 Excel」批量导入</p>' +
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

  // 生成午休行（横跨整行：节次 + 周一~周五）
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
      '<span class="break-name">' + escapeHtml(bName) + '</span>' +
      '<span class="break-time">' + escapeHtml(bTime) + '</span>';

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

      // 第 4 节之后、第 5 节之前插入午休行（且要有第 5 节）
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

  function cssEscape(s) {
    if (window.CSS && CSS.escape) return CSS.escape(s);
    return String(s).replace(/[^a-zA-Z0-9_-]/g, (ch) => '\\' + ch);
  }

  // ============ Cell Edit Popup ============
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
      const nameEl = td.querySelector(isBreak ? '.break-name' : '.cell-period-name');
      const timeEl = td.querySelector(isBreak ? '.break-time' : '.cell-time');
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
  $('cellPopSave').onclick = async function () {
    if (currentCellIdx === null) return;
    const td = document.querySelector('.schedule-table tbody td[data-idx="' + currentCellIdx + '"][data-class-id="' + cssEscape(currentCellClassId) + '"]');
    if (!td) return;
    const cls = currentCellClassId;
    const key = cls + '_cell_' + currentCellIdx;
    if (currentCellType === 'period' || currentCellType === 'break') {
      const name = $('cellPopPeriodName').value.trim();
      const time = $('cellPopPeriodTime').value.trim();
      const type = currentCellType; // 'period' or 'break'

      if (type === 'break') {
        const nameEl = td.querySelector('.break-name');
        const timeEl = td.querySelector('.break-time');
        if (nameEl) nameEl.textContent = name || '午休';
        if (timeEl) timeEl.textContent = time;
      } else {
        const nameEl = td.querySelector('.cell-period-name');
        const timeEl = td.querySelector('.cell-time');
        if (name && nameEl) nameEl.textContent = name;
        if (timeEl) timeEl.textContent = time;
      }

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
  $('cellPopClose').onclick = () => { $('cellPop').style.display = 'none'; };
  $('cellPop').addEventListener('click', e => { if (e.target === $('cellPop')) $('cellPop').style.display = 'none'; });
  $('cellPopSubject').addEventListener('keydown', e => { if (e.key === 'Enter') $('cellPopSave').click(); });
  $('cellPopTeacher').addEventListener('keydown', e => { if (e.key === 'Enter') $('cellPopSave').click(); });
  $('cellPopPeriodName').addEventListener('keydown', e => { if (e.key === 'Enter') $('cellPopPeriodTime').focus(); });
  $('cellPopPeriodTime').addEventListener('keydown', e => { if (e.key === 'Enter') $('cellPopSave').click(); });

  // ============ Theme ============
  function setThemeBtn() {
    const isDark = html.hasAttribute('data-theme');
    $('themeToggle').textContent = isDark ? '🌙 深色' : '☀️ 浅色';
    $('themeToggle').classList.toggle('active', isDark);
  }
  setThemeBtn();
  $('themeToggle').onclick = () => {
    if (html.hasAttribute('data-theme')) { html.removeAttribute('data-theme'); preferences.theme = 'light'; }
    else { html.setAttribute('data-theme', 'dark'); preferences.theme = 'dark'; }
    setThemeBtn();
    API.updatePreferences({ theme: preferences.theme }).catch(() => {});
  };

  // ============ Week Highlight ============
  $('toggleWeekHighlight').onclick = () => {
    preferences.week_highlight = !preferences.week_highlight;
    $('toggleWeekHighlight').classList.toggle('active', preferences.week_highlight);
    renderWeekHighlight();
    API.updatePreferences({ week_highlight: preferences.week_highlight }).catch(() => {});
  };
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

  // ============ More Panel ============
  $('moreToggle').onclick = (e) => {
    e.stopPropagation();
    const open = $('morePanel').classList.toggle('open');
    $('moreToggle').classList.toggle('open', open);
    $('moreToggle').textContent = open ? '⚙️ 收起' : '⚙️ 更多';
  };

  // ============ Excel Import / Export ============
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

  $('exportScheduleAll').onchange = () => {
    const checked = $('exportScheduleAll').checked;
    document.querySelectorAll('#exportScheduleList input[type="checkbox"]').forEach(cb => { cb.checked = checked; });
    $('exportScheduleError').textContent = '';
  };

  $('exportScheduleList').addEventListener('change', () => {
    const all = document.querySelectorAll('#exportScheduleList input[type="checkbox"]');
    const checked = document.querySelectorAll('#exportScheduleList input[type="checkbox"]:checked');
    $('exportScheduleAll').checked = (all.length > 0 && checked.length === all.length);
    $('exportScheduleError').textContent = '';
  });

  $('exportScheduleClose').onclick = () => { $('exportSchedulePop').style.display = 'none'; };
  $('exportSchedulePop').addEventListener('click', e => { if (e.target === $('exportSchedulePop')) $('exportSchedulePop').style.display = 'none'; });

  $('exportScheduleConfirm').onclick = () => {
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

  function doExportScheduleExcel(list) {
    const wb = XLSX.utils.book_new();
    list.forEach(cls => {
      const rows = [['节次', '时间段', '星期一', '星期二', '星期三', '星期四', '星期五']];
      const periodCount = (cls.period_count && cls.period_count > 0)
        ? cls.period_count
        : defaultPeriods.length;
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

        // 第 4 节之后插入午休行（用节次列名标示）
        if (pIdx === BREAK_AFTER_PERIOD - 1 && pIdx < periodCount - 1) {
          const bKey = cls.class_id + '_cell_' + BREAK_CELL_INDEX;
          let bName = '午休';
          let bTime = '12:00-13:00';
          if (cellData[bKey] && cellData[bKey].cell_type === 'break') {
            if (cellData[bKey].period_name) bName = cellData[bKey].period_name;
            if (cellData[bKey].period_time !== undefined) bTime = cellData[bKey].period_time;
          }
          const bRow = [bName, bTime, '', '', '', '', ''];
          rows.push(bRow);
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
    if (list.length === 1) {
      prefix = list[0].name || list[0].class_id;
    } else if (list.length === classes.length) {
      prefix = '全部' + list.length + '个班';
    } else {
      prefix = '多个班级(' + list.length + ')';
    }
    XLSX.writeFile(wb, safeFilePart(prefix) + '_课程表_' + dateStamp() + '.xlsx');
    showSaveStatus('已导出 ' + list.length + ' 个班级', false);
  }

  async function importScheduleExcel(file, targetClass) {
    if (!targetClass) { alert('未选择目标班级'); return; }
    const wb = await readExcelFile(file);
    const updates = [];
    const periodCount = (targetClass.period_count && targetClass.period_count > 0)
      ? targetClass.period_count
      : defaultPeriods.length;

    const sheetName = wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });

    let pIdx = 0;
    for (let i = 1; i < rows.length && pIdx < periodCount; i++) {
      const row = rows[i];

      const pName = String(row[0] !== undefined ? row[0] : '').trim();
      const pTime = String(row[1] !== undefined ? row[1] : '').trim();

      // 识别午休行：第 1 列名包含"午休"或与时段明显不匹配
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

  function exportSeatExcel() {
    const rows = [['行', '列', '姓名', '性别', '身份证号', '家长1电话', '家长2电话', '家庭地址']];
    for (let r = 0; r < seat.rows; r++) {
      for (let c = 0; c < seat.cols; c++) {
        const idx = r * seat.cols + c;
        const s = seat.students[idx];
        if (!s || !s.name) continue;
        rows.push([
          r + 1, c + 1,
          s.name, s.gender || '',
          s.id_card || '', s.tel1 || '', s.tel2 || '', s.address || '',
        ]);
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
        name,
        gender: g,
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
            if (s && s.name) {
              try { await apiCall(API.deleteStudent, r, c); } catch {}
            }
          }
        }
      }

      if (targetRows !== seat.rows || targetCols !== seat.cols) {
        try {
          await apiCall(API.resize, targetRows, targetCols);
        } catch (e) {
          showSaveStatus('扩展座位失败: ' + (e.message || ''), true);
          return;
        }
        await reloadSeatData();
      }

      for (const st of toImport) {
        try { await apiCall(API.updateStudent, st); } catch {}
      }

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

  function openImportTargetPop() {
    const gradeSel = $('importTargetGrade');
    const numSel = $('importTargetNum');
    const errEl = $('importTargetError');
    errEl.textContent = '';

    const first = classes[0] || { grade: 7, class_num: 1 };
    fillGradeSelect(gradeSel, first.grade || 7);
    fillClassNumSelect(numSel, first.class_num || 1);

    $('importTargetPop').style.display = 'flex';
  }

  $('importTargetClose').onclick = () => { $('importTargetPop').style.display = 'none'; };
  $('importTargetPop').addEventListener('click', e => { if (e.target === $('importTargetPop')) $('importTargetPop').style.display = 'none'; });

  $('importTargetConfirm').onclick = () => {
    const grade = parseInt($('importTargetGrade').value, 10);
    const classNum = parseInt($('importTargetNum').value, 10);
    const errEl = $('importTargetError');
    errEl.textContent = '';

    const cls = classes.find(c => c.grade === grade && c.class_num === classNum);
    if (!cls) { errEl.textContent = '该班级不存在，请先创建'; return; }

    $('importTargetPop').style.display = 'none';
    pickExcelFile((file) => importScheduleExcel(file, cls));
  };

  $('exportExcelBtn').onclick = () => {
    if (activeTab === 'seat') {
      exportSeatExcel();
    } else if (activeTab === 'schedule') {
      openExportSchedulePop();
    } else {
      showSaveStatus('请先切换到课程表或座位表', true);
    }
  };

  $('importExcelBtn').onclick = () => {
    if (activeTab !== 'schedule' && activeTab !== 'seat') {
      showSaveStatus('请先切换到课程表或座位表', true);
      return;
    }
    if (activeTab === 'seat') {
      pickExcelFile((file) => importSeatExcel(file));
    } else {
      if (!classes.length) { alert('请先创建至少一个班级'); return; }
      openImportTargetPop();
    }
  };

  // ============ Seat ============
  function displayToData(row, col) {
    if (seat.order === 'asc') return row * seat.cols + col;
    return (seat.rows - 1 - row) * seat.cols + (seat.cols - 1 - col);
  }

  function renderSeats() {
    const grid = $('seatGrid');
    const stage = $('seatStage');
    if (!grid) return;

    const segments = getAisleSegments(seat.aisle || '', seat.cols);
    const hasAisle = segments.length > 1;
    grid.style.gridTemplateColumns = getGridColumns(segments);

    let maleCount = 0, femaleCount = 0;
    seat.students.forEach(s => { if (!s || !s.name) return; if (s.gender === '男') maleCount++; else if (s.gender === '女') femaleCount++; });
    $('seatSizeInfo').textContent = seat.rows + '行×' + seat.cols + '列 · 男' + maleCount + ' 女' + femaleCount;
    if (seat.order === 'asc') stage.parentNode.insertBefore(stage, grid);
    else stage.parentNode.insertBefore(stage, grid.nextSibling);
    grid.innerHTML = '';

    const aisleCols = hasAisle ? getAisleGridCols(segments) : [];

    // 过道竖条：跨越所有行（一次画完，避免行间距断开）
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

  let suppressClickTime = 0;
  const LONG_PRESS_MS = 500, MOVE_CANCEL_PX = 10;
  let pressTimer = null, pressState = null, activeDrag = null;
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

  $('seatOrderBtn').onclick = async () => {
    seat.order = seat.order === 'asc' ? 'desc' : 'asc';
    $('seatOrderBtn').textContent = seat.order === 'asc' ? '讲台上' : '讲台下';
    $('seatOrderBtn').classList.toggle('active', seat.order === 'desc');
    try { await apiCall(API.setOrder, seat.order); } catch { return; }
    renderSeats();
    scheduleAutoSync();
  };

  // ============ 过道设置 ============
  $('seatAisleBtn').onclick = () => {
    $('aisleInput').value = seat.aisle || '';
    const hint = $('aisleHint');
    if (hint) hint.textContent = '当前座位表：' + seat.cols + ' 列';
    $('aisleError').textContent = '';
    $('aislePop').style.display = 'flex';
    setTimeout(() => $('aisleInput').focus(), 100);
  };
  $('aislePopClose').onclick = () => { $('aislePop').style.display = 'none'; };
  $('aislePop').addEventListener('click', e => { if (e.target === $('aislePop')) $('aislePop').style.display = 'none'; });

  $('aisleSave').onclick = async () => {
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
    } catch (err) {
      errEl.textContent = err.message;
    }
  };

  $('seatResizeToggle').onclick = () => {
    const open = $('seatResizePanel').classList.toggle('open');
    $('seatResizeToggle').textContent = open ? '行列 收起' : '行列 展开';
    $('seatResizeToggle').classList.toggle('active', open);
  };
  $('seatAddRow').onclick = () => resizeSeat(1, 0);
  $('seatDelRow').onclick = () => resizeSeat(-1, 0);
  $('seatAddCol').onclick = () => resizeSeat(0, 1);
  $('seatDelCol').onclick = () => resizeSeat(0, -1);
  async function resizeSeat(dr, dc) {
    const nr = Math.min(12, Math.max(2, seat.rows + dr));
    const nc = Math.min(10, Math.max(2, seat.cols + dc));
    if (nr === seat.rows && nc === seat.cols) return;
    try {
      await apiCall(API.resize, nr, nc);
      await reloadSeatData();
      showSaveStatus('座位已调整', false);
      scheduleAutoSync();
    } catch (err) {
      showSaveStatus(err.message || '调整失败', true);
    }
  }

  $('popTel1Input').addEventListener('input', updateDialBtns);
  $('popTel2Input').addEventListener('input', updateDialBtns);
  $('popTel1Dial').onclick = () => { const v = $('popTel1Input').value.trim(); if (v) window.location.href = 'tel:' + v; };
  $('popTel2Dial').onclick = () => { const v = $('popTel2Input').value.trim(); if (v) window.location.href = 'tel:' + v; };
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

  $('popSaveBtn').onclick = async () => {
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
        const len = idCard.length;
        let hint;
        if (len < 18) hint = '当前 ' + len + ' 位，太短（需 18 位）';
        else if (len > 18) hint = '当前 ' + len + ' 位，太长（需 18 位）';
        else hint = '含非法字符，前 17 位必须为数字，最后一位为数字或 X';
        alert('❌ 「身份证号」格式错误\n' + hint + '\n当前输入：' + idCardRaw);
        $('popIdCardInput').focus();
        return;
      }
    }

    let tel1 = '';
    if (tel1Raw) {
      tel1 = tel1Raw.replace(/[\s-]+/g, '');
      if (!/^\d{11}$/.test(tel1)) {
        const len = tel1.length;
        const hint = (len !== 11) ? ('当前 ' + len + ' 位，需为 11 位数字') : '需为 11 位数字';
        alert('❌ 「家长1电话」格式错误\n' + hint + '\n当前输入：' + tel1Raw);
        $('popTel1Input').focus();
        return;
      }
    }

    let tel2 = '';
    if (tel2Raw) {
      tel2 = tel2Raw.replace(/[\s-]+/g, '');
      if (!/^\d{11}$/.test(tel2)) {
        const len = tel2.length;
        const hint = (len !== 11) ? ('当前 ' + len + ' 位，需为 11 位数字') : '需为 11 位数字';
        alert('❌ 「家长2电话」格式错误\n' + hint + '\n当前输入：' + tel2Raw);
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

  $('popDeleteBtn').onclick = async () => {
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
  $('popCloseBtn').onclick = () => { $('seatPop').style.display = 'none'; };
  $('seatPop').addEventListener('click', e => { if (e.target === $('seatPop')) $('seatPop').style.display = 'none'; });

  ['popNameInput', 'popIdCardInput', 'popTel1Input', 'popTel2Input', 'popAddrInput'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') $('popSaveBtn').click(); });
  });

  // ============ Export Image ============
  $('exportBtn').onclick = async () => {
    const isSeat = (activeTab === 'seat');
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

  // ============ Cloud Sync（手动） ============
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
  $('diagBtn').onclick = async () => {
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
    const rows = seatConfig.rows || 7;
    const cols = seatConfig.cols || 8;
    const order = seatConfig.order || 'asc';
    const aisle = seatConfig.aisle || '';

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
    html += '<div class="admin-seat-stage">讲 台</div>';

    const segs = getAisleSegments(aisle, cols);
    const aisleCols = segs.length > 1 ? getAisleGridCols(segs) : [];
    html += '<div class="admin-seat-grid" style="grid-template-columns:' + getGridColumns(segs) + ';--admin-cols:' + cols + ';">';
    for (const ac of aisleCols) {
      html += '<div class="admin-seat-aisle" style="grid-column:' + ac + ';grid-row:1 / span ' + rows + ';"></div>';
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const dataIdx = (order === 'asc')
          ? r * cols + c
          : (rows - 1 - r) * cols + (cols - 1 - c);
        const s = seatMatrix[dataIdx] || { name: '', gender: '' };
        let cls = 'empty';
        if (s.name) {
          if (s.gender === '女') cls = 'female';
          else if (s.gender === '男') cls = 'male';
          else cls = '';
        }
        const colPos = getGridColIdx(c, segs);
        html += '<div class="admin-seat-cell ' + cls + '" style="grid-column:' + colPos + ';grid-row:' + (r + 1) + ';">' + (s.name ? escapeHtml(s.name) : '空') + '</div>';
      }
    }
    html += '</div>';
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
        const periodCount = (cls.period_count && cls.period_count > 0)
          ? cls.period_count
          : (defaultPeriods.length || 8);
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

          // 午休行
          if (pIdx === BREAK_AFTER_PERIOD - 1 && pIdx < periodCount - 1) {
            const bc = clsCells[BREAK_CELL_INDEX];
            const bName = (bc && bc.period_name) ? bc.period_name : '午休';
            const bTime = (bc && bc.period_time !== undefined) ? bc.period_time : '12:00-13:00';
            html += '<tr class="admin-break-row"><td colspan="6">' +
                    escapeHtml(bName) + ' ' + escapeHtml(bTime) + '</td></tr>';
          }
        }
        html += '</tbody></table>';
        html += '</div>';
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
              enabled: cfg.enabled,
              url: cfg.url,
              api_key: cfg.api_key,
              sync_interval: cfg.sync_interval,
              registration_locked: locked,
            });
            showSaveStatus(locked ? '已锁定新用户注册' : '已开放新用户注册', false);
          } catch (err) {
            regLockCb.checked = !locked;
            alert(err.message || '设置失败');
          } finally {
            regLockCb.disabled = false;
          }
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
      try {
        await API.adminUpdateSystemConfig($('lnText').value);
        showSaveStatus('已保存', false);
      } catch (err) { errEl.textContent = err.message; }
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
            '</div>' +
            '</div>';
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
    if (act === 'view') {
      openUserDetailPop(username);
    } else if (act === 'editUser') {
      const newUsername = prompt('新用户名（留空表示不修改，3-20位字母/数字/下划线）：', username);
      if (newUsername === null) return;
      const trimmedUsername = newUsername.trim();
      const newPassword = prompt('新密码（留空表示不修改，6-32字符）：', '');
      if (newPassword === null) return;
      const trimmedPassword = newPassword.trim();
      const finalUsername = (trimmedUsername && trimmedUsername !== username) ? trimmedUsername : '';
      if (!finalUsername && !trimmedPassword) { alert('未做任何修改'); return; }
      try {
        await API.adminUpdateUser(username, finalUsername, trimmedPassword);
        showSaveStatus('已更新', false);
        renderMePage();
      } catch (err) { alert(err.message); }
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
    controlBar.style.display = 'none';
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
    } catch (err) {
      errEl.textContent = err.message;
    }
  }

  // ============ Start ============
  init();
})();