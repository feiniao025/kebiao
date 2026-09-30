/* ============================================================
   app-shout.js —— 远程喊话
   子分类：班级管理 / 发通知 / 发送记录
   ============================================================ */

window.shoutSubTab = 'manage';           // manage | send | history
window.shoutRooms = [];
window.currentShoutRoomKey = '';
window.currentShoutClass = '';
window.shoutMsgMode = 'voice';           // voice | popup | record
window.shoutDisplay = 'marquee';         // marquee | card
window.shoutBroadcastCount = 1;
window.shoutHistoryFilter = 'all';
window.shoutHistoryList = [];

let shoutRoomsLoaded = false;

/* ---------- 工具 ---------- */

async function ensureShoutRooms(force) {
  if (shoutRoomsLoaded && !force) return;
  try {
    const resp = await API.listShoutRooms();
    shoutRooms = resp.rooms || [];
    shoutRoomsLoaded = true;
  } catch (e) {
    shoutRooms = [];
  }
}

function copyText(text) {
  if (!text) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(function () { showSaveStatus('已复制', false); })
      .catch(function () { fallbackCopy(text); });
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); showSaveStatus('已复制', false); }
  catch (e) { alert('复制失败，请手动选择复制'); }
  document.body.removeChild(ta);
}

function bindCopyButtons(root) {
  root.querySelectorAll('[data-copy]').forEach(function (b) {
    b.onclick = function (ev) {
      ev.stopPropagation();
      copyText(b.dataset.copy);
    };
  });
}

/* ---------- 主渲染 ---------- */

window.renderShout = async function () {
  const container = scheduleContainer;
  if (!container) return;
  container.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'me-page';

  const card = document.createElement('div');
  card.className = 'me-card shout-main-card';

  const tabs = [
    { key: 'manage',  label: '班级管理' },
    { key: 'send',    label: '发通知' },
    { key: 'history', label: '发送记录' }
  ];
  let tabsHtml = '<div class="shout-subtabs">';
  tabs.forEach(function (t) {
    tabsHtml += '<button class="shout-subtab' + (shoutSubTab === t.key ? ' active' : '') +
                '" data-shout-sub="' + t.key + '">' + t.label + '</button>';
  });
  tabsHtml += '</div><div id="shoutSubBody"></div>';

  card.innerHTML = tabsHtml;
  wrap.appendChild(card);
  container.appendChild(wrap);

  card.querySelectorAll('.shout-subtab').forEach(function (b) {
    b.onclick = function () {
      shoutSubTab = b.dataset.shoutSub;
      renderShout();
    };
  });

  if (shoutSubTab === 'manage') {
    await renderShoutManage();
  } else if (shoutSubTab === 'send') {
    await renderShoutSend();
  } else if (shoutSubTab === 'history') {
    await renderShoutHistory();
  }
};

/* ---------- ① 班级管理 ---------- */

async function renderShoutManage() {
  const body = $('shoutSubBody');
  body.innerHTML = '<div class="today-empty">加载中...</div>';
  await ensureShoutRooms(true);

  let html = '';

  html += '<div class="shout-manage-head">' +
    '<div class="shout-manage-title">' +
      '<div class="shout-manage-h1">我的班级</div>' +
      '<div class="shout-manage-h2">点击班级发送大屏通知</div>' +
    '</div>' +
    '<div class="shout-manage-actions">' +
      '<button id="shoutCreateBtn" class="shout-pill-btn primary">＋ 创建班级</button>' +
      '<button id="shoutJoinBtn" class="shout-pill-btn ghost">加入班级</button>' +
    '</div>' +
  '</div>';

  if (!shoutRooms.length) {
    html += '<div class="shout-empty-box">' +
      '<div class="shout-empty-title">暂无班级</div>' +
      '<div class="shout-empty-desc">点「＋ 创建班级」新建一个，把教室码发给任课老师即可加入</div>' +
    '</div>';
  } else {
    html += '<div class="shout-room-list">';
    shoutRooms.forEach(function (r) {
      const roleCls = r.is_owner ? 'owner' : 'teacher';
      const roleLabel = r.is_owner ? '班主任' : (r.role || '任课老师');
      html += '<div class="shout-room-item" data-key="' + escapeHtml(r.room_key) + '">' +
        '<div class="shout-room-info">' +
          '<div class="shout-room-name-row">' +
            '<span class="shout-room-name">' + escapeHtml(r.name) + '</span>' +
            '<span class="shout-role-pill ' + roleCls + '">' + escapeHtml(roleLabel) + '</span>' +
          '</div>' +
          '<div class="shout-room-sub">教室码 ' + escapeHtml(r.room_key) +
            ' · ' + (r.member_count || 0) + ' 位老师</div>' +
        '</div>' +
        '<button class="shout-room-more" data-more="' + escapeHtml(r.room_key) + '" title="班级设置">⋯</button>' +
      '</div>';
    });
    html += '</div>';
  }

  if (shoutRooms.length > 0) {
    const first = shoutRooms[0];
    const displayUrl = location.origin + '/display.html?token=' + encodeURIComponent(first.display_token);
    html += '<div class="shout-client-block">' +
      '<div class="shout-client-head">' +
        '<div class="shout-client-title">🖥️ 教室大屏客户端</div>' +
        '<button class="shout-copy-link" type="button" data-copy="' + escapeHtml(displayUrl) + '">📋 复制安装网址</button>' +
      '</div>' +
      '<div class="shout-client-desc">在教室大屏电脑（Windows 一体机）浏览器打开下方网址，免登录即可下载安装：</div>' +
      '<div class="shout-client-url" data-copy="' + escapeHtml(displayUrl) + '">' +
        '<span class="shout-client-url-text">' + escapeHtml(displayUrl) + '</span>' +
        '<span class="shout-client-url-hint">点击复制</span>' +
      '</div>' +
    '</div>';
  }

  body.innerHTML = html;

  const cb = $('shoutCreateBtn'); if (cb) cb.onclick = openShoutCreatePop;
  const jb = $('shoutJoinBtn');   if (jb) jb.onclick = openShoutJoinPop;

  // 点击卡片 → 进入「发通知」并选中该班级
  body.querySelectorAll('.shout-room-item').forEach(function (el) {
    el.onclick = function (e) {
      if (e.target.closest('.shout-room-more')) return;
      currentShoutClass = el.dataset.key;
      shoutSubTab = 'send';
      renderShout();
    };
  });

  // ⋯ → 打开详情（成员管理、大屏地址重置等）
  body.querySelectorAll('.shout-room-more').forEach(function (b) {
    b.onclick = function (e) {
      e.stopPropagation();
      openShoutRoomPop(b.dataset.more);
    };
  });

  bindCopyButtons(body);
  body.querySelectorAll('.shout-client-url').forEach(function (el) {
    el.onclick = function () { copyText(el.dataset.copy); };
  });
}

/* ---------- ② 发通知 ---------- */

async function renderShoutSend() {
  const body = $('shoutSubBody');
  body.innerHTML = '<div class="today-empty">加载中...</div>';
  await ensureShoutRooms();

  if (!shoutRooms.length) {
    body.innerHTML = '<div class="shout-empty-box">' +
      '<div class="shout-empty-title">还没有班级</div>' +
      '<div class="shout-empty-desc">请先到「班级管理」创建一个班级，才能发送通知</div>' +
    '</div>';
    return;
  }

  if (!currentShoutClass || !shoutRooms.find(function (r) { return r.room_key === currentShoutClass; })) {
    currentShoutClass = shoutRooms[0].room_key;
  }
  const room = shoutRooms.find(function (r) { return r.room_key === currentShoutClass; });
  const roleLabel = room.is_owner ? '班主任' : (room.role || '任课老师');

  const classOptions = shoutRooms.map(function (r) {
    return '<option value="' + escapeHtml(r.room_key) + '">' + escapeHtml(r.name) + '</option>';
  }).join('');

  let html = '';

  // 顶部：班级选择 + 角色
  html += '<div class="shout-send-head">' +
    '<div class="select-wrap shout-send-class-wrap">' +
      '<select id="shoutSendClass" class="cell-pop-input">' + classOptions + '</select>' +
    '</div>' +
    '<span class="shout-role-pill ' + (room.is_owner ? 'owner' : 'teacher') + '">' + escapeHtml(roleLabel) + '</span>' +
  '</div>';

  // 状态行
  html += '<div class="shout-send-status">' +
    '<span class="shout-status-dot"></span>教室大屏离线' +
    '<span class="shout-send-by">由 ' + escapeHtml(currentUser ? currentUser.username : '') + ' 老师推送</span>' +
  '</div>';

  // 模式标签
  const modes = [
    { key: 'voice',  icon: '🔊', label: '语音广播' },
    { key: 'popup',  icon: '🖥️', label: '桌面弹窗' },
    { key: 'record', icon: '🎙️', label: '录音喊话' }
  ];
  html += '<div class="shout-mode-tabs">';
  modes.forEach(function (m) {
    html += '<button class="shout-mode-tab' + (shoutMsgMode === m.key ? ' active' : '') +
      '" data-mode="' + m.key + '">' +
      '<span class="shout-mode-icon">' + m.icon + '</span>' +
      '<span>' + m.label + '</span></button>';
  });
  html += '</div>';

  // 输入框
  let placeholder = '输入文字，教室音箱将以自然语音朗读播报…';
  if (shoutMsgMode === 'popup') placeholder = '输入要显示在大屏上的文字…';
  else if (shoutMsgMode === 'record') placeholder = '录音喊话功能即将上线，可先使用语音广播';

  html += '<div class="shout-input-wrap">' +
    '<textarea id="shoutSendContent" class="cell-pop-input shout-textarea" rows="6" maxlength="200" ' +
      'placeholder="' + escapeHtml(placeholder) + '"></textarea>' +
    '<div class="shout-input-meta">' +
      '<span class="shout-input-tag">智能 TTS 语音朗读</span>' +
      '<span class="shout-input-count" id="shoutSendCount">0/200</span>' +
    '</div>' +
  '</div>';

  // 大屏呈现形式
  html += '<div class="shout-opt-row">' +
    '<div class="shout-opt-label">大屏呈现形式</div>' +
    '<div class="shout-opt-btns" data-opt="display">' +
      '<button class="shout-opt-btn' + (shoutDisplay === 'marquee' ? ' active' : '') + '" data-display="marquee">跑马灯</button>' +
      '<button class="shout-opt-btn' + (shoutDisplay === 'card' ? ' active' : '') + '" data-display="card">完整卡片</button>' +
    '</div>' +
    '<div class="shout-opt-hint">顶部横幅平滑滚动，不遮挡课件</div>' +
  '</div>';

  // 播报次数
  html += '<div class="shout-opt-row">' +
    '<div class="shout-opt-label">播报次数</div>' +
    '<div class="shout-opt-btns" data-opt="count">' +
      '<button class="shout-opt-btn' + (shoutBroadcastCount === 1 ? ' active' : '') + '" data-count="1">1次</button>' +
      '<button class="shout-opt-btn' + (shoutBroadcastCount === 2 ? ' active' : '') + '" data-count="2">2次</button>' +
      '<button class="shout-opt-btn' + (shoutBroadcastCount === 3 ? ' active' : '') + '" data-count="3">3次</button>' +
    '</div>' +
    '<div class="shout-opt-hint">大屏将按所设次数连续播报，间隔 1.2 秒</div>' +
  '</div>';

  // 定时发送
  html += '<div class="shout-opt-row">' +
    '<div class="shout-opt-label">定时发送</div>' +
    '<div class="shout-opt-toggle">' +
      '<label class="tgl">' +
        '<input type="checkbox" id="shoutSendSchedule">' +
        '<span class="tgl-slider"></span>' +
      '</label>' +
    '</div>' +
    '<div class="shout-opt-hint">开启后可预约未来时间自动广播</div>' +
  '</div>';

  html += '<div class="me-error" id="shoutSendError" style="min-height:18px;"></div>';

  html += '<button id="shoutSendBtn" class="shout-send-main">' +
    '<span class="shout-send-icon">✈</span><span>发送至教室大屏</span></button>';

  body.innerHTML = html;

  // ---------- 绑定 ----------
  const clsSel = $('shoutSendClass');
  clsSel.value = currentShoutClass;
  clsSel.onchange = function () {
    currentShoutClass = clsSel.value;
    renderShoutSend();
  };

  body.querySelectorAll('.shout-mode-tab').forEach(function (b) {
    b.onclick = function () {
      shoutMsgMode = b.dataset.mode;
      renderShoutSend();
    };
  });

  const ta = $('shoutSendContent');
  const counter = $('shoutSendCount');
  ta.oninput = function () {
    counter.textContent = ta.value.length + '/200';
  };

  body.querySelectorAll('.shout-opt-btn[data-display]').forEach(function (b) {
    b.onclick = function () {
      shoutDisplay = b.dataset.display;
      body.querySelectorAll('.shout-opt-btn[data-display]').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
    };
  });

  body.querySelectorAll('.shout-opt-btn[data-count]').forEach(function (b) {
    b.onclick = function () {
      shoutBroadcastCount = parseInt(b.dataset.count, 10) || 1;
      body.querySelectorAll('.shout-opt-btn[data-count]').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
    };
  });

  const sch = $('shoutSendSchedule');
  if (sch) {
    sch.onchange = function () {
      if (sch.checked) {
        showSaveStatus('定时发送功能即将上线', true);
        sch.checked = false;
      }
    };
  }

  $('shoutSendBtn').onclick = async function () {
    const content = ta.value.trim();
    const errEl = $('shoutSendError');
    errEl.textContent = '';
    if (!content) { errEl.textContent = '请输入要发送的内容'; ta.focus(); return; }

    let msgType = 'text';
    if (shoutMsgMode === 'popup') msgType = 'notice';
    else if (shoutMsgMode === 'record') msgType = 'urgent';

    const duration = 20 * (shoutBroadcastCount || 1);

    const btn = $('shoutSendBtn');
    btn.disabled = true;
    btn.style.opacity = '.7';

    try {
      await API.sendShout(currentShoutClass, content, msgType, duration);
      ta.value = '';
      counter.textContent = '0/200';
      shoutHistoryList = []; // 下一次进入记录页强制刷新
      showSaveStatus('已发送至教室大屏', false);
    } catch (e) {
      errEl.textContent = e.message || '发送失败';
    } finally {
      btn.disabled = false;
      btn.style.opacity = '';
    }
  };
}

/* ---------- ③ 发送记录 ---------- */

async function renderShoutHistory() {
  const body = $('shoutSubBody');
  body.innerHTML = '<div class="today-empty">加载中...</div>';
  await ensureShoutRooms();

  try {
    const resp = await API.getMyShoutMessages(200);
    shoutHistoryList = resp.messages || [];
  } catch (e) {
    shoutHistoryList = [];
  }

  const classOptions = '<option value="all">全部班级</option>' +
    shoutRooms.map(function (r) {
      return '<option value="' + escapeHtml(r.room_key) + '">' + escapeHtml(r.name) + '</option>';
    }).join('');

  let html = '';
  html += '<div class="shout-history-filter">' +
    '<span class="shout-filter-label">班级筛选</span>' +
    '<div class="select-wrap shout-filter-wrap">' +
      '<select id="shoutHistoryClass" class="cell-pop-input">' + classOptions + '</select>' +
    '</div>' +
  '</div>';
  html += '<div id="shoutHistoryList"></div>';

  body.innerHTML = html;

  const sel = $('shoutHistoryClass');
  if (sel) {
    if (!shoutRooms.find(function (r) { return r.room_key === shoutHistoryFilter; }) && shoutHistoryFilter !== 'all') {
      shoutHistoryFilter = 'all';
    }
    sel.value = shoutHistoryFilter;
    sel.onchange = function () {
      shoutHistoryFilter = sel.value;
      renderShoutHistoryList();
    };
  }

  renderShoutHistoryList();
}

function renderShoutHistoryList() {
  const el = $('shoutHistoryList');
  if (!el) return;

  let list = shoutHistoryList;
  if (shoutHistoryFilter !== 'all') {
    list = list.filter(function (m) { return m.room_key === shoutHistoryFilter; });
  }

  if (!list.length) {
    el.innerHTML = '<div class="shout-empty-box">' +
      '<div class="shout-empty-title">暂无通知记录</div>' +
      '<div class="shout-empty-desc">您在此班级发出的广播与通知将在此展示送达状态</div>' +
    '</div>';
    return;
  }

  let html = '<div class="shout-history-ul">';
  list.forEach(function (m) {
    const room = shoutRooms.find(function (r) { return r.room_key === m.room_key; });
    const roomName = room ? room.name : m.room_key;

    let typeLabel = '消息', typeCls = 'text';
    if (m.msg_type === 'urgent') { typeLabel = '紧急'; typeCls = 'urgent'; }
    else if (m.msg_type === 'notice') { typeLabel = '通知'; typeCls = 'notice'; }

    let time = m.created_at;
    try { time = new Date(m.created_at).toLocaleString('zh-CN'); } catch (e) {}

    html += '<div class="shout-history-item">' +
      '<div class="shout-history-top">' +
        '<span class="shout-history-room">' + escapeHtml(roomName) + '</span>' +
        '<span class="shout-history-type ' + typeCls + '">' + typeLabel + '</span>' +
        '<span class="shout-history-time">' + escapeHtml(time) + '</span>' +
      '</div>' +
      '<div class="shout-history-content">' + escapeHtml(m.content) + '</div>' +
      '<div class="shout-history-foot"><span class="shout-history-status">✓ 已送达</span></div>' +
    '</div>';
  });
  html += '</div>';
  el.innerHTML = html;
}

/* ---------- 创建教室弹窗 ---------- */

window.openShoutCreatePop = function () {
  const errEl = $('shoutCreateError');
  errEl.textContent = '';
  $('shoutCreateName').value = '';

  const sel = $('shoutCreateClass');
  sel.innerHTML = '<option value="">（不关联）</option>' +
    (classes || []).map(function (c) {
      return '<option value="' + escapeHtml(c.class_id) + '">' + escapeHtml(c.name) + '</option>';
    }).join('');
  if (classes && classes.length > 0) sel.value = classes[0].class_id;

  const syncDefaultName = function () {
    if ($('shoutCreateName').value.trim()) return;
    const cid = sel.value;
    const cls = (classes || []).find(function (c) { return c.class_id === cid; });
    if (cls) $('shoutCreateName').value = cls.name + ' 教室';
  };
  sel.onchange = syncDefaultName;
  syncDefaultName();

  $('shoutCreatePop').style.display = 'flex';
  setTimeout(function () { $('shoutCreateName').focus(); }, 100);
};

/* ---------- 加入教室弹窗 ---------- */

window.openShoutJoinPop = function () {
  $('shoutJoinError').textContent = '';
  $('shoutJoinKey').value = '';
  $('shoutJoinSubject').value = '';
  $('shoutJoinPop').style.display = 'flex';
  setTimeout(function () { $('shoutJoinKey').focus(); }, 100);
};

/* ---------- 教室详情弹窗（成员管理 / 发送 / 大屏地址） ---------- */

window.openShoutRoomPop = async function (roomKey) {
  if (!roomKey) return;
  currentShoutRoomKey = roomKey;

  $('shoutRoomPop').style.display = 'flex';
  $('shoutRoomTitle').textContent = '班级详情';
  $('shoutRoomBody').innerHTML = '<div class="today-empty">加载中...</div>';

  let room, members;
  try {
    const results = await Promise.all([
      API.getShoutRoom(roomKey),
      API.listShoutMembers(roomKey)
    ]);
    room = results[0].room;
    members = results[1].members || [];
  } catch (e) {
    $('shoutRoomBody').innerHTML = '<div class="today-empty">加载失败：' + escapeHtml(e.message) + '</div>';
    return;
  }

  $('shoutRoomTitle').textContent = room.name;

  const displayUrl = location.origin + '/display.html?token=' + encodeURIComponent(room.display_token);

  let html = '';

  html += '<div class="shout-info-box">';
  html += '<div class="shout-info-row"><span class="k">教室码</span><span class="v">' +
    '<b class="shout-code">' + escapeHtml(room.room_key) + '</b>' +
    '<button class="shout-copy" data-copy="' + escapeHtml(room.room_key) + '" type="button">复制</button>' +
    '</span></div>';
  html += '<div class="shout-info-row" style="align-items:flex-start;">' +
    '<span class="k" style="padding-top:8px;">大屏地址</span>' +
    '<span class="v" style="flex:1;">' +
      '<input readonly class="cell-pop-input shout-url" value="' + escapeHtml(displayUrl) + '" onclick="this.select()">' +
      '<button class="shout-copy" data-copy="' + escapeHtml(displayUrl) + '" type="button">复制</button>' +
    '</span></div>';
  html += '</div>';

  html += '<div class="shout-section-title">👥 班级成员（' + members.length + '）</div>';
  html += '<div class="shout-member-list">';
  if (!members.length) {
    html += '<div class="shout-member-empty">暂无成员</div>';
  } else {
    members.forEach(function (m) {
      const canRemove = room.is_owner && m.role !== '班主任';
      html += '<div class="shout-member-row">' +
        '<span class="shout-member-name">' + escapeHtml(m.username) + '</span>' +
        '<span class="shout-member-role">' + escapeHtml(m.role || '任课老师') +
          (m.subject ? ' · ' + escapeHtml(m.subject) : '') + '</span>' +
        (canRemove
          ? '<button class="shout-member-del" type="button" data-user="' + escapeHtml(m.username) + '">移除</button>'
          : '') +
      '</div>';
    });
  }
  html += '</div>';

  if (room.is_owner) {
    html += '<div class="shout-section-title">⚙️ 班级管理</div>';
    html += '<div class="shout-danger-row">' +
      '<button id="shoutResetTokenBtn" type="button" class="shout-btn-ghost">🔄 重置大屏地址</button>' +
      '<button id="shoutDeleteRoomBtn" type="button" class="shout-btn-danger">🗑️ 删除班级</button>' +
    '</div>';
  }

  $('shoutRoomBody').innerHTML = html;

  bindCopyButtons($('shoutRoomBody'));

  $('shoutRoomBody').querySelectorAll('.shout-member-del').forEach(function (b) {
    b.onclick = async function (ev) {
      ev.stopPropagation();
      if (!confirm('确认将「' + b.dataset.user + '」移出班级？')) return;
      try {
        await API.removeShoutMember(roomKey, b.dataset.user);
        showSaveStatus('已移除', false);
        openShoutRoomPop(roomKey);
      } catch (e) {
        alert(e.message || '移除失败');
      }
    };
  });

  const resetBtn = $('shoutResetTokenBtn');
  if (resetBtn) {
    resetBtn.onclick = async function () {
      if (!confirm('重置后原大屏地址立即失效，需要在大屏上重新打开新地址。确认？')) return;
      try {
        await API.regenerateShoutToken(roomKey);
        showSaveStatus('大屏地址已重置', false);
        openShoutRoomPop(roomKey);
      } catch (e) { alert(e.message); }
    };
  }

  const delBtn = $('shoutDeleteRoomBtn');
  if (delBtn) {
    delBtn.onclick = async function () {
      if (!confirm('确认删除班级「' + room.name + '」？所有成员和消息记录将一并删除。')) return;
      try {
        await API.deleteShoutRoom(roomKey);
        $('shoutRoomPop').style.display = 'none';
        showSaveStatus('已删除', false);
        await ensureShoutRooms(true);
        renderShout();
      } catch (e) { alert(e.message); }
    };
  }
};

/* ---------- 弹窗事件绑定 ---------- */

(function bindShoutEvents() {
  const cc = $('shoutCreateClose');
  if (cc) cc.onclick = function () { $('shoutCreatePop').style.display = 'none'; };
  const cp = $('shoutCreatePop');
  if (cp) cp.addEventListener('click', function (e) {
    if (e.target === cp) cp.style.display = 'none';
  });

  const cs = $('shoutCreateSubmit');
  if (cs) cs.onclick = async function () {
    const errEl = $('shoutCreateError');
    errEl.textContent = '';
    const name = $('shoutCreateName').value.trim();
    const classId = $('shoutCreateClass').value;
    if (!name) { errEl.textContent = '请填写班级名称'; return; }
    cs.disabled = true; cs.style.opacity = '.7';
    try {
      const resp = await API.createShoutRoom(name, classId);
      $('shoutCreatePop').style.display = 'none';
      showSaveStatus('班级已创建，教室码 ' + resp.room.room_key, false);
      await ensureShoutRooms(true);
      currentShoutClass = resp.room.room_key;
      renderShout();
    } catch (e) {
      errEl.textContent = e.message || '创建失败';
    } finally {
      cs.disabled = false; cs.style.opacity = '';
    }
  };

  const jc = $('shoutJoinClose');
  if (jc) jc.onclick = function () { $('shoutJoinPop').style.display = 'none'; };
  const jp = $('shoutJoinPop');
  if (jp) jp.addEventListener('click', function (e) {
    if (e.target === jp) jp.style.display = 'none';
  });

  const js = $('shoutJoinSubmit');
  if (js) js.onclick = async function () {
    const errEl = $('shoutJoinError');
    errEl.textContent = '';
    const key = ($('shoutJoinKey').value || '').trim().toUpperCase();
    const subject = ($('shoutJoinSubject').value || '').trim();
    if (!key) { errEl.textContent = '请输入教室码'; return; }
    if (key.length !== 6) { errEl.textContent = '教室码为 6 位'; return; }
    js.disabled = true; js.style.opacity = '.7';
    try {
      const resp = await API.joinShoutRoom(key, subject);
      $('shoutJoinPop').style.display = 'none';
      showSaveStatus('已加入「' + (resp.room ? resp.room.name : key) + '」', false);
      await ensureShoutRooms(true);
      currentShoutClass = key;
      renderShout();
    } catch (e) {
      errEl.textContent = e.message || '加入失败';
    } finally {
      js.disabled = false; js.style.opacity = '';
    }
  };

  const jk = $('shoutJoinKey');
  if (jk) {
    jk.addEventListener('input', function () {
      jk.value = jk.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
    jk.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') $('shoutJoinSubmit').click();
    });
  }

  const rc = $('shoutRoomClose');
  if (rc) rc.onclick = function () { $('shoutRoomPop').style.display = 'none'; };
  const rp = $('shoutRoomPop');
  if (rp) rp.addEventListener('click', function (e) {
    if (e.target === rp) rp.style.display = 'none';
  });
})();