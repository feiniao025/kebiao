/* ============================================================
   app-me.js —— 我的模块（登录/注册/个人/管理员/Supabase）
   ============================================================ */

window.renderMePage = function () { /* 从原 app.js 搬移 */ };
window.renderProfile = function () { /* 从原 app.js 搬移 */ };
window.renderLoginNoticeEdit = async function () { /* 从原 app.js 搬移 */ };
window.renderChangePwd = function () { /* 从原 app.js 搬移 */ };
window.renderAdminList = async function () { /* 从原 app.js 搬移 */ };
window.renderSupabaseConfig = async function () { /* 从原 app.js 搬移 */ };
window.showLoginRegister = function () { /* 从原 app.js 搬移 */ };
window.submitMe = async function () { /* 从原 app.js 搬移 */ };
window.handleAdminAction = async function (act, username) { /* 从原 app.js 搬移 */ };
window.openUserDetailPop = async function (username) { /* 从原 app.js 搬移 */ };
window.renderUserDetailHtml = function (detail) { /* 从原 app.js 搬移 */ };
window.doSyncPush = async function () { /* 从原 app.js 搬移 */ };
window.doSyncPull = async function () { /* 从原 app.js 搬移 */ };

(function bindMeEvents() {
  const udClose = $('userDetailClose');
  if (udClose) udClose.onclick = function () { $('userDetailPop').style.display = 'none'; };
  const udPop = $('userDetailPop');
  if (udPop) udPop.addEventListener('click', function (e) { if (e.target === udPop) udPop.style.display = 'none'; });

  const diagBtn = $('diagBtn');
  if (diagBtn) diagBtn.onclick = async function () { /* 从原 app.js 搬移 */ };
})();