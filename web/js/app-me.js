/* ============================================================
   app-me.js —— 我的模块（登录/注册/个人/管理员/Supabase）
   ============================================================ */

window.renderMePage = function () {
  if (!currentUser) { showLoginRegister(); return; }
  meCard.classList.remove('auth-card');
  if (meView === 'changePwd') { renderChangePwd(); return; }
  if (meView === 'adminList') { renderAdminList(); return; }
  if (meView === 'supabase') { renderSupabaseConfig(); return; }
  if (meView === 'loginNotice') { renderLoginNoticeEdit(); return; }
  renderProfile();
};

window.renderProfile = function () {
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
      if (el) el.textContent = '上次同步: ' + (st.last_sync_at ? new Date(st.last_sync_at).toLocaleString('zh-CN') : '从未') +
        (st.last_sync_ok ? ' (成功)' : (st.last_error ? ' (失败: ' + st.last_error + ')' : ''));
    }).catch(() => {});

    const regLockCb = $('syncRegLock');
    if (regLockCb) {
      API.getSupabaseConfig().then(cfg => { regLockCb.checked = !!cfg.registration_locked; }).catch(() => {});
      regLockCb.onchange = async () => {
        const locked = regLockCb.checked;
        regLockCb.disabled = true;
        try {
          const cfg = await API.getSupabaseConfig();
          await API.updateSupabaseConfig({ enabled: cfg.enabled, url: cfg.url, api_key: cfg.api_key, sync_interval: cfg.sync_interval, registration_locked: locked });
          showSaveStatus(locked ? '已锁定新用户注册' : '已开放新用户注册', false);
        } catch (err) { regLockCb.checked = !locked; alert(err.message || '设置失败'); }
        finally { regLockCb.disabled = false; }
      };
    }
  }
};

window.renderLoginNoticeEdit = async function () {
  meCard.innerHTML = '<div class="admin-title"><span>📝 登录提示</span><button class="back-btn" id="meBackBtn">← 返回</button></div><div class="me-warn">加载中...</div>';
  let cfg;
  try { cfg = await API.adminGetSystemConfig(); }
  catch (err) { meCard.innerHTML = '<div class="me-warn">加载失败: ' + escapeHtml(err.message) + '</div>'; return; }

  meCard.innerHTML =
    '<div class="admin-title"><span>📝 登录提示</span><button class="back-btn" id="meBackBtn">← 返回</button></div>' +
    '<div class="me-warn">这段文字会显示在登录/注册页面的顶部提示栏。留空则不显示。</div>' +
    '<div class="me-field"><label>提示内容</label>' +
    '<textarea id="lnText" class="cell-pop-input" rows="4" style="width:100%;resize:vertical;font-family:inherit;box-sizing:border-box;"></textarea></div>' +
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
};

window.renderChangePwd = function () {
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
};

window.renderAdminList = async function () {
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
};

window.renderSupabaseConfig = async function () {
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
};

window.showLoginRegister = function () {
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
};

window.submitMe = async function () {
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
};

window.handleAdminAction = async function (act, username) {
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
};

window.openUserDetailPop = async function (username) {
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
};

window.renderUserDetailHtml = function (detail) {
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
    if (parts.length < 2 || parts.some(n => isNaN(n) || n < 1) || sum !== cols) aisle = '';
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
  html += '<div class="user-data-section"><div class="user-data-title">📋 基本信息</div>';
  html += '<div class="user-data-row">用户名：' + escapeHtml(user.username || '') + '</div>';
  html += '<div class="user-data-row">注册时间：' + (user.created_at ? new Date(user.created_at).toLocaleString('zh-CN') : '—') + '</div>';
  html += '<div class="user-data-row">上次登录：' + (user.last_login_at ? new Date(user.last_login_at).toLocaleString('zh-CN') : '—') + '</div>';
  html += '<div class="user-data-row">角色：' + (user.is_admin ? '管理员' : '普通用户') + '</div>';
  html += '<div class="user-data-row">座位人数：' + (detail.seat_count || 0) + '（男 ' + (detail.male_count || 0) + ' / 女 ' + (detail.female_count || 0) + '）</div>';
  html += '<div class="user-data-row">班级数量：' + classes.length + '</div></div>';

  html += '<div class="user-data-section"><div class="user-data-title">🪑 座位表（' + rows + '行×' + cols + '列 · ' + (order === 'asc' ? '正序' : '倒序') + (aisle ? ' · 过道 ' + escapeHtml(aisle) : '') + '）</div>';
  const segs = getAisleSegments(aisle, cols);
  const aisleCols = segs.length > 1 ? getAisleGridCols(segs) : [];
  const stageHtml = '<div class="admin-seat-stage">讲 台</div>';
  let gridHtml = '<div class="admin-seat-grid" style="grid-template-columns:' + getGridColumns(segs) + ';--admin-cols:' + cols + ';">';
  for (const ac of aisleCols) gridHtml += '<div class="admin-seat-aisle" style="grid-column:' + ac + ';grid-row:1 / span ' + rows + ';"></div>';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const dataIdx = (order === 'asc') ? r * cols + c : (rows - 1 - r) * cols + (cols - 1 - c);
      const s = seatMatrix[dataIdx] || { name: '', gender: '' };
      let cls = 'empty';
      if (s.name) { if (s.gender === '女') cls = 'female'; else if (s.gender === '男') cls = 'male'; else cls = ''; }
      const colPos = getGridColIdx(c, segs);
      gridHtml += '<div class="admin-seat-cell ' + cls + '" style="grid-column:' + colPos + ';grid-row:' + (r + 1) + ';">' + (s.name ? escapeHtml(s.name) : '空') + '</div>';
    }
  }
  gridHtml += '</div>';
  if (order === 'asc') { html += stageHtml; html += gridHtml; } else { html += gridHtml; html += stageHtml; }
  html += '</div>';

  html += '<div class="user-data-section"><div class="user-data-title">📚 课程表</div>';
  if (classes.length === 0) html += '<div class="user-data-row" style="color:var(--empty-text);">暂无班级</div>';
  else {
    classes.forEach(cls => {
      const clsCells = cellsByClass[cls.class_id] || {};
      html += '<div style="margin-bottom:16px;">';
      html += '<div style="font-weight:600;font-size:13px;color:var(--text-main);margin:8px 0 4px;">' + escapeHtml(cls.name) + (cls.badge ? ' <span style="font-weight:400;color:var(--text-sub);font-size:12px;">· ' + escapeHtml(cls.badge) + '</span>' : '') + '</div>';
      html += '<table class="admin-schedule-table"><thead><tr><th>节次</th><th>周一</th><th>周二</th><th>周三</th><th>周四</th><th>周五</th></tr></thead><tbody>';
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
          } else html += '<td style="color:var(--empty-text);">—</td>';
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
};

window.doSyncPush = async function () {
  try { await apiCall(API.pushSync); showSaveStatus('数据已推送到云端', false); } catch {}
};
window.doSyncPull = async function () {
  if (!confirm('拉取云端数据将覆盖本地修改，确认？')) return;
  try { await apiCall(API.pullSync); showSaveStatus('云端数据已拉取', false); setTimeout(() => location.reload(), 800); } catch {}
};

/* ---------- 事件绑定 ---------- */
(function bindMeEvents() {
  const udClose = $('userDetailClose');
  if (udClose) udClose.onclick = () => { $('userDetailPop').style.display = 'none'; };
  const udPop = $('userDetailPop');
  if (udPop) udPop.addEventListener('click', e => { if (e.target === udPop) udPop.style.display = 'none'; });

  const diagBtn = $('diagBtn');
  if (diagBtn) diagBtn.onclick = async () => {
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
})();