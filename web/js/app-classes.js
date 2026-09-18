/* ============================================================
   app-classes.js —— 班级模块（课表 / 座位 / 值日 / 班级管理 / 导入导出）
   说明：函数体全部从原 app.js 直接搬移，无需修改。
   ============================================================ */

/* ---------- 课表 ---------- */
window.renderSchedule = function () { /* 从原 app.js 搬移 */ };
window.renderClassCard = function (container, cls) { /* 从原 app.js 搬移 */ };
window.renderLegendCard = function (container) { /* 从原 app.js 搬移 */ };
window.createBreakRow = function (cls) { /* 从原 app.js 搬移 */ };
window.refreshCellStyle = function (td) { /* 从原 app.js 搬移 */ };
window.updateClassLegend = function (classId) { /* 从原 app.js 搬移 */ };
window.updateAllLegends = function () { /* 从原 app.js 搬移 */ };
window.openCellPop = function (td) { /* 从原 app.js 搬移 */ };
window.renderFilterButtons = function () { /* 从原 app.js 搬移 */ };
window.applyFilter = function (fv) { /* 从原 app.js 搬移 */ };
window.updateSeatCardTitle = function () { /* 从原 app.js 搬移 */ };

/* ---------- 座位 ---------- */
window.displayToData = function (row, col) { /* 从原 app.js 搬移 */ };
window.renderSeats = function () { /* 从原 app.js 搬移 */ };
window.startSeatPress = function (el, idx, x, y) { /* 从原 app.js 搬移 */ };
window.cancelSeatPress = function () { /* 从原 app.js 搬移 */ };
window.activateSeatDrag = function (el, idx, x, y) { /* 从原 app.js 搬移 */ };
window.positionGhost = function (ghost, x, y) { /* 从原 app.js 搬移 */ };
window.onSeatMove = function (x, y) { /* 从原 app.js 搬移 */ };
window.onSeatEnd = function () { /* 从原 app.js 搬移 */ };
window.openSeatPop = function (idx, isNew) { /* 从原 app.js 搬移 */ };
window.resizeSeat = async function (dr, dc) { /* 从原 app.js 搬移 */ };
window.reloadSeatData = async function () { /* 从原 app.js 搬移 */ };
window.updateDialBtns = function () { /* 从原 app.js 搬移 */ };

/* ---------- 值日 ---------- */
window.getDutyClassId = function () { /* 从原 app.js 搬移 */ };
window.getDutyStorageId = function (classId) { /* 从原 app.js 搬移 */ };
window.getDutyRows = function (classId) { /* 从原 app.js 搬移 */ };
window.getDutyNote = function (classId) { /* 从原 app.js 搬移 */ };
window.setDutyConfig = async function (classId, rows, note) { /* 从原 app.js 搬移 */ };
window.renderDuty = function () { /* 从原 app.js 搬移 */ };
window.openDutyPop = function (td) { /* 从原 app.js 搬移 */ };
window.openDutyManagePop = function () { /* 从原 app.js 搬移 */ };
window.loadDutyConfigIntoPop = function (classId) { /* 从原 app.js 搬移 */ };

/* ---------- 班级 CRUD ---------- */
window.openCreateClassPop = async function () { /* 从原 app.js 搬移 */ };
window.openClassManagePop = function (cls) { /* 从原 app.js 搬移 */ };

/* ---------- 拖拽 ---------- */
window.setupClassDrag = function (card, cls) { /* 从原 app.js 搬移 */ };
window.activateClassDrag = function (el, cls, x, y) { /* 从原 app.js 搬移 */ };
window.updateClassDrag = function (x, y) { /* 从原 app.js 搬移 */ };
window.finishClassDrag = async function () { /* 从原 app.js 搬移 */ };

/* ---------- 导入导出 ---------- */
window.importScheduleExcel = async function (file, targetClass) { /* 从原 app.js 搬移 */ };
window.exportSeatExcel = async function () { /* 从原 app.js 搬移；首行加 await ensureXLSX(); */ };
window.importSeatExcel = async function (file) { /* 从原 app.js 搬移 */ };
window.openImportTargetPop = function (mode) { /* 从原 app.js 搬移 */ };
window.openExportSchedulePop = function () { /* 从原 app.js 搬移 */ };
window.doExportScheduleExcel = async function (list) { /* 从原 app.js 搬移；首行加 await ensureXLSX(); */ };

/* ---------- 事件绑定 ---------- */
(function bindClassEvents() {
  /* 下面这些绑定块都从原 app.js 中「顶层」的事件绑定段整体搬移过来 */

  // 编辑课表开关
  const editToggleBtn = $('editToggleBtn');
  if (editToggleBtn) editToggleBtn.onclick = function (e) { /* 从原 app.js 搬移 */ };

  // 编辑座位开关
  const seatEditToggle = $('seatEditToggle');
  if (seatEditToggle) seatEditToggle.onclick = function (e) { /* 从原 app.js 搬移 */ };

  // 编辑值日开关
  const dutyEditToggle = $('dutyEditToggle');
  if (dutyEditToggle) dutyEditToggle.onclick = function (e) { /* 从原 app.js 搬移 */ };

  // 班级工具条过滤按钮
  const classCtrlBar = $('classControlBar');
  if (classCtrlBar) classCtrlBar.addEventListener('click', function (e) { /* 从原 app.js 搬移 */ });

  // 更多面板
  const moreToggle = $('moreToggle');
  if (moreToggle) moreToggle.onclick = function (e) { /* 从原 app.js 搬移 */ };

  // 新建班级
  const createClassBtn = $('createClassBtn');
  if (createClassBtn) createClassBtn.onclick = function () { /* 从原 app.js 搬移 */ };

  // 座位相关
  const seatOrderBtn = $('seatOrderBtn');
  if (seatOrderBtn) seatOrderBtn.onclick = async function () { /* 从原 app.js 搬移 */ };
  const seatAisleBtn = $('seatAisleBtn');
  if (seatAisleBtn) seatAisleBtn.onclick = function () { /* 从原 app.js 搬移 */ };
  const seatResizeToggle = $('seatResizeToggle');
  if (seatResizeToggle) seatResizeToggle.onclick = function () { /* 从原 app.js 搬移 */ };
  const seatAddRow = $('seatAddRow'); if (seatAddRow) seatAddRow.onclick = function () { resizeSeat(1, 0); };
  const seatDelRow = $('seatDelRow'); if (seatDelRow) seatDelRow.onclick = function () { resizeSeat(-1, 0); };
  const seatAddCol = $('seatAddCol'); if (seatAddCol) seatAddCol.onclick = function () { resizeSeat(0, 1); };
  const seatDelCol = $('seatDelCol'); if (seatDelCol) seatDelCol.onclick = function () { resizeSeat(0, -1); };

  // 各种弹窗关闭
  const classPopClose = $('classPopClose');
  if (classPopClose) classPopClose.onclick = function () { $('classPop').style.display = 'none'; };
  const classPopEl = $('classPop');
  if (classPopEl) classPopEl.addEventListener('click', function (e) { if (e.target === classPopEl) classPopEl.style.display = 'none'; });
  const classPopSave = $('classPopSave');
  if (classPopSave) classPopSave.onclick = async function () { /* 从原 app.js 搬移 */ };

  const classManageClose = $('classManageClose');
  if (classManageClose) classManageClose.onclick = function () { $('classManagePop').style.display = 'none'; };
  const classManagePopEl = $('classManagePop');
  if (classManagePopEl) classManagePopEl.addEventListener('click', function (e) { if (e.target === classManagePopEl) classManagePopEl.style.display = 'none'; });
  const classManageSave = $('classManageSave');
  if (classManageSave) classManageSave.onclick = async function () { /* 从原 app.js 搬移 */ };
  const classManageDelete = $('classManageDelete');
  if (classManageDelete) classManageDelete.onclick = async function () { /* 从原 app.js 搬移 */ };

  // cellPop 关闭 / 保存
  const cellPopClose = $('cellPopClose');
  if (cellPopClose) cellPopClose.onclick = function () { $('cellPop').style.display = 'none'; };
  const cellPopEl = $('cellPop');
  if (cellPopEl) cellPopEl.addEventListener('click', function (e) { if (e.target === cellPopEl) cellPopEl.style.display = 'none'; });
  document.querySelectorAll('#cellPopColors button').forEach(function (b) { /* 从原 app.js 搬移 */ });
  const cellPopSave = $('cellPopSave');
  if (cellPopSave) cellPopSave.onclick = async function () { /* 从原 app.js 搬移 */ };
  const cellPopSubject = $('cellPopSubject');
  if (cellPopSubject) cellPopSubject.addEventListener('keydown', function (e) { if (e.key === 'Enter') $('cellPopSave').click(); });
  const cellPopTeacher = $('cellPopTeacher');
  if (cellPopTeacher) cellPopTeacher.addEventListener('keydown', function (e) { if (e.key === 'Enter') $('cellPopSave').click(); });
  const cellPopPeriodName = $('cellPopPeriodName');
  if (cellPopPeriodName) cellPopPeriodName.addEventListener('keydown', function (e) { if (e.key === 'Enter') $('cellPopPeriodTime').focus(); });
  const cellPopPeriodTime = $('cellPopPeriodTime');
  if (cellPopPeriodTime) cellPopPeriodTime.addEventListener('keydown', function (e) { if (e.key === 'Enter') $('cellPopSave').click(); });

  // seatPop
  const popSaveBtn = $('popSaveBtn');
  if (popSaveBtn) popSaveBtn.onclick = async function () { /* 从原 app.js 搬移 */ };
  const popDeleteBtn = $('popDeleteBtn');
  if (popDeleteBtn) popDeleteBtn.onclick = async function () { /* 从原 app.js 搬移 */ };
  const popCloseBtn = $('popCloseBtn');
  if (popCloseBtn) popCloseBtn.onclick = function () { $('seatPop').style.display = 'none'; };
  const seatPopEl = $('seatPop');
  if (seatPopEl) seatPopEl.addEventListener('click', function (e) { if (e.target === seatPopEl) seatPopEl.style.display = 'none'; });
  const popTel1Input = $('popTel1Input');
  if (popTel1Input) popTel1Input.addEventListener('input', updateDialBtns);
  const popTel2Input = $('popTel2Input');
  if (popTel2Input) popTel2Input.addEventListener('input', updateDialBtns);
  const popTel1Dial = $('popTel1Dial');
  if (popTel1Dial) popTel1Dial.onclick = function () { const v = $('popTel1Input').value.trim(); if (v) window.location.href = 'tel:' + v; };
  const popTel2Dial = $('popTel2Dial');
  if (popTel2Dial) popTel2Dial.onclick = function () { const v = $('popTel2Input').value.trim(); if (v) window.location.href = 'tel:' + v; };
  ['popNameInput', 'popIdCardInput', 'popTel1Input', 'popTel2Input', 'popAddrInput'].forEach(function (id) {
    const el = $(id);
    if (el) el.addEventListener('keydown', function (e) { if (e.key === 'Enter') $('popSaveBtn').click(); });
  });

  // aislePop
  const aislePopClose = $('aislePopClose');
  if (aislePopClose) aislePopClose.onclick = function () { $('aislePop').style.display = 'none'; };
  const aislePopEl = $('aislePop');
  if (aislePopEl) aislePopEl.addEventListener('click', function (e) { if (e.target === aislePopEl) aislePopEl.style.display = 'none'; });
  const aisleSave = $('aisleSave');
  if (aisleSave) aisleSave.onclick = async function () { /* 从原 app.js 搬移 */ };

  // 值日
  const dutyPopClose = $('dutyPopClose');
  if (dutyPopClose) dutyPopClose.onclick = function () { $('dutyPop').style.display = 'none'; };
  const dutyPopEl = $('dutyPop');
  if (dutyPopEl) dutyPopEl.addEventListener('click', function (e) { if (e.target === dutyPopEl) dutyPopEl.style.display = 'none'; });
  const dutyPopSave = $('dutyPopSave');
  if (dutyPopSave) dutyPopSave.onclick = async function () { /* 从原 app.js 搬移 */ };

  const dutyManageClose = $('dutyManageClose');
  if (dutyManageClose) dutyManageClose.onclick = function () { $('dutyManagePop').style.display = 'none'; };
  const dutyManagePopEl = $('dutyManagePop');
  if (dutyManagePopEl) dutyManagePopEl.addEventListener('click', function (e) { if (e.target === dutyManagePopEl) dutyManagePopEl.style.display = 'none'; });
  const dutyManageSave = $('dutyManageSave');
  if (dutyManageSave) dutyManageSave.onclick = async function () { /* 从原 app.js 搬移 */ };
  const dutyManageClear = $('dutyManageClear');
  if (dutyManageClear) dutyManageClear.onclick = async function () { /* 从原 app.js 搬移 */ };

  // 导出课程表
  const exportScheduleAll = $('exportScheduleAll');
  if (exportScheduleAll) exportScheduleAll.onchange = function () { /* 从原 app.js 搬移 */ };
  const exportScheduleList = $('exportScheduleList');
  if (exportScheduleList) exportScheduleList.addEventListener('change', function () { /* 从原 app.js 搬移 */ });
  const exportScheduleClose = $('exportScheduleClose');
  if (exportScheduleClose) exportScheduleClose.onclick = function () { $('exportSchedulePop').style.display = 'none'; };
  const exportSchedulePopEl = $('exportSchedulePop');
  if (exportSchedulePopEl) exportSchedulePopEl.addEventListener('click', function (e) { if (e.target === exportSchedulePopEl) exportSchedulePopEl.style.display = 'none'; });
  const exportScheduleConfirm = $('exportScheduleConfirm');
  if (exportScheduleConfirm) exportScheduleConfirm.onclick = function () { /* 从原 app.js 搬移 */ };

  // 导入目标选择
  const importTargetClose = $('importTargetClose');
  if (importTargetClose) importTargetClose.onclick = function () { $('importTargetPop').style.display = 'none'; };
  const importTargetPopEl = $('importTargetPop');
  if (importTargetPopEl) importTargetPopEl.addEventListener('click', function (e) { if (e.target === importTargetPopEl) importTargetPopEl.style.display = 'none'; });
  const importTargetConfirm = $('importTargetConfirm');
  if (importTargetConfirm) importTargetConfirm.onclick = function () { /* 从原 app.js 搬移 */ };

  // 底部导出按钮（依赖当前 subTab）
  const exportExcelBtn = $('exportExcelBtn');
  if (exportExcelBtn) exportExcelBtn.onclick = function () { /* 从原 app.js 搬移 */ };
  const importExcelBtn = $('importExcelBtn');
  if (importExcelBtn) importExcelBtn.onclick = function () { /* 从原 app.js 搬移 */ };
  const exportBtn = $('exportBtn');
  if (exportBtn) exportBtn.onclick = async function () { /* 从原 app.js 搬移；首行加 await ensureHtml2Canvas(); */ };

  // 拖拽相关（document 级）
  document.addEventListener('mousemove', function (e) { /* 从原 app.js 搬移 */ });
  document.addEventListener('mouseup', function () { /* 从原 app.js 搬移 */ });
  document.addEventListener('touchmove', function (e) { /* 从原 app.js 搬移 */ }, { passive: false });
  document.addEventListener('touchend', function () { /* 从原 app.js 搬移 */ });
  document.addEventListener('touchcancel', function () { /* 从原 app.js 搬移 */ });

  // 座位拖拽（document 级）
  document.addEventListener('mousemove', function (e) { onSeatMove(e.clientX, e.clientY); });
  document.addEventListener('mouseup', onSeatEnd);
  window.addEventListener('blur', onSeatEnd);
  document.addEventListener('touchmove', function (e) { /* 从原 app.js 搬移 */ }, { passive: false });
  document.addEventListener('touchend', onSeatEnd);
  document.addEventListener('touchcancel', onSeatEnd);
  document.addEventListener('contextmenu', function (e) { /* 从原 app.js 搬移 */ });
})();