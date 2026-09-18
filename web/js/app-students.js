/* ============================================================
   app-students.js —— 学生模块（花名册 / 成绩 / 考勤）
   说明：本文件内所有函数均从原 app.js 直接搬移，
        函数体不需要修改，因为它们引用的状态变量（classes /
        cellData / seat / preferences 等）现在都是 window 上的
        全局变量，作用域完全一致。
   ============================================================ */

/* ---------- 花名册 ---------- */
window.renderRoster = async function () { /* 从原 app.js 搬移 */ };
window.loadRoster = async function () { /* 从原 app.js 搬移 */ };
window.renderRosterList = function () { /* 从原 app.js 搬移 */ };
window.openRosterPop = function (student) { /* 从原 app.js 搬移 */ };
window.exportRosterImage = async function () { /* 从原 app.js 搬移 */ };
window.openExportRosterPop = function () { /* 从原 app.js 搬移 */ };
window.exportRosterExcelByClass = async function (classId) { /* 从原 app.js 搬移 */ };
window.importRosterExcel = async function (file, targetClass, gradeHint) { /* 从原 app.js 搬移 */ };
window.matchRosterHeaderCell = function (cell) { /* 从原 app.js 搬移 */ };

/* ---------- 成绩 ---------- */
window.renderGrades = async function () { /* 从原 app.js 搬移 */ };
window.loadExams = async function () { /* 从原 app.js 搬移 */ };
window.loadExamStats = async function (examId) { /* 从原 app.js 搬移 */ };
window.fillSubjectSelect = function (sel, defaultVal) { /* 从原 app.js 搬移 */ };
window.fillExamNameSelect = function (sel, defaultVal) { /* 从原 app.js 搬移 */ };
window.openExamPop = function (exam) { /* 从原 app.js 搬移 */ };
window.openScoresPop = async function (examId) { /* 从原 app.js 搬移（含图表改为 await ensureECharts） */ };
window.applyScoreLevel = function (input, exam) { /* 从原 app.js 搬移 */ };
window.importScoresFromExcel = async function (exam, onSaved) { /* 从原 app.js 搬移 */ };

/* ---------- 成绩走势 ---------- */
window.showStudentReportInline = async function (studentName, subject, fullScore, gender) { /* 从原 app.js 搬移 */ };
window.bindSubjectTabs = function (panel) { /* 从原 app.js 搬移 */ };
window.renderTrendPanel = async function (panel) { /* 从原 app.js 搬移（图表前加 await ensureECharts） */ };

/* ---------- 考勤 ---------- */
window.renderAttendance = async function () { /* 从原 app.js 搬移 */ };
window.loadAttendance = async function () { /* 从原 app.js 搬移 */ };
window.updateAttSummary = function () { /* 从原 app.js 搬移 */ };
window.saveAttendance = async function () { /* 从原 app.js 搬移 */ };

/* ---------- 学生模块内事件绑定（弹窗关闭等） ---------- */
(function bindStudentsEvents() {
  const rosterPopClose = $('rosterPopClose');
  if (rosterPopClose) rosterPopClose.onclick = function () { $('rosterPop').style.display = 'none'; };
  const rosterPopEl = $('rosterPop');
  if (rosterPopEl) rosterPopEl.addEventListener('click', function (e) { if (e.target === rosterPopEl) rosterPopEl.style.display = 'none'; });

  const rosterPopSave = $('rosterPopSave');
  if (rosterPopSave) rosterPopSave.onclick = async function () {
    /* 从原 app.js 搬移 */
  };

  const examPopClose = $('examPopClose');
  if (examPopClose) examPopClose.onclick = function () { $('examPop').style.display = 'none'; };
  const examPopEl = $('examPop');
  if (examPopEl) examPopEl.addEventListener('click', function (e) { if (e.target === examPopEl) examPopEl.style.display = 'none'; });

  const examPopSave = $('examPopSave');
  if (examPopSave) examPopSave.onclick = async function () { /* 从原 app.js 搬移 */ };

  const scoresPopClose = $('scoresPopClose');
  if (scoresPopClose) scoresPopClose.onclick = function () { $('scoresPop').style.display = 'none'; };
  const scoresPopEl = $('scoresPop');
  if (scoresPopEl) scoresPopEl.addEventListener('click', function (e) { if (e.target === scoresPopEl) scoresPopEl.style.display = 'none'; });

  const studentReportClose = $('studentReportClose');
  if (studentReportClose) studentReportClose.onclick = function () { $('studentReportPop').style.display = 'none'; };
  const studentReportPopEl = $('studentReportPop');
  if (studentReportPopEl) studentReportPopEl.addEventListener('click', function (e) { if (e.target === studentReportPopEl) studentReportPopEl.style.display = 'none'; });

  const rosterEditBtn = $('rosterEditBtn');
  if (rosterEditBtn) rosterEditBtn.onclick = function (e) { /* 从原 app.js 搬移 */ };
  const rosterMoreToggle = $('rosterMoreToggle');
  const rosterMorePanel = $('rosterMorePanel');
  if (rosterMoreToggle && rosterMorePanel) rosterMoreToggle.onclick = function (e) { /* 从原 app.js 搬移 */ };
  const rosterImportBtn = $('rosterImportBtn');
  if (rosterImportBtn) rosterImportBtn.onclick = function () { /* 从原 app.js 搬移 */ };
  const rosterExportBtn = $('rosterExportBtn');
  if (rosterExportBtn) rosterExportBtn.onclick = function () { /* 从原 app.js 搬移 */ };
  const rosterExportImgBtn = $('rosterExportImgBtn');
  if (rosterExportImgBtn) rosterExportImgBtn.onclick = function () { /* 从原 app.js 搬移 */ };
})();