/* ============================================================
   app-shout.js —— 远程喊话
   ① 班主任：创建教室、管理任课老师、发送播报
   ② 任课老师：凭教室码加入后，也能向教室大屏发通知
   ③ 大屏接收端：display.html 常驻运行，收到消息自动弹屏
   ============================================================ */

window.shoutRooms = [];
window.currentShoutRoomKey = '';

/* ---------------- 主渲染 ---------------- */

window.renderShout = async function () {
  const container = scheduleContainer;
  if (!container) return;
  container.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'me-page';

  const card = document.createElement('div');
  card.className = 'me-card';
  card.innerHTML =
    '<div class="roster-toolbar">' +
      '<button id="shoutCreateBtn" class="btn-primary" style="background:#16a085;">＋ 创建教室</button>' +
      '<button id="shoutJoinBtn" class="btn-primary" style="background:#7d5ba6;">🔑 加入教室</button>' +
      '<button id="shoutHelpBtn" class="btn-primary" style="background:#7f8c8d;">❓ 使用说明</button>' +
    '</div>' +
    '<div id="shoutRoomList" class="roster-list">加载中...</div>';
  wrap.appendChild(card);
  container.appendChild(wrap);

  $('shoutCreateBtn').onclick = openShoutCreatePop;
  $('shoutJoinBtn').onclick = openShoutJoinPop;
  $('shoutHelpBtn').onclick = openShoutHelpPop;

  await loadShoutRooms();
};

window.loadShoutRooms = async function () {
  const el = $('shoutRoomList');
  if (!el) return;
  try {
    const resp = await API.listShoutRooms();
    shoutRooms = resp.rooms || [];
  } catch (e) {
    el.innerHTML = '<div class="today-empty">加载失败：' + escapeHtml(e.message) + '</div>';
    return;
  }
  renderShoutRoomList();
};

window.renderShoutRoomList = function () {
  const el = $('shoutRoomList');
  if (!el) return;

  if (!shoutRooms.length) {
    el.innerHTML =
      '<div class="today-empty">' +
        '还没有教室<br><br>' +
        '点「＋ 创建教室」新建一个，把教室码发给任课老师；<br>' +
        '任课老师点「🔑 加入教室」输入教室码即可加入。<br><br>' +
        '大屏地址在教室详情里，复制到教室一体机浏览器打开即可常驻接收。' +
      '</div>';
    return;
  }

  let html = '<div class="shout-room-grid">';
  shoutRooms.forEach(function (r) {
    const roleCls = r.is_owner ? 'owner' : 'teacher';
    html +=
      '<div class="shout-room-card" data-key="' + escapeHtml(r.room_key) + '">' +
        '<div class="shout-room-name">' +
          escapeHtml(r.name) +
          '<span class="shout-role ' + roleCls + '">' + escapeHtml(r.role || '成员') + '</span>' +
        '</div>' +
        '<div class="shout-room-meta">' +
          '<span>教室码 <b>' + escapeHtml(r.room_key) + '</b></span>' +
          '<span>' + (r.member_count || 0) + ' 人</span>' +
        '</div>' +
        '<div class="shout-room-actions">' +
          '<button class="shout-btn-open" data-key="' + escapeHtml(r.room_key) + '">进入教室</button>' +
        '</div>' +
      '</div>';
  });
  html += '</div>';
  el.innerHTML = html;

  el.querySelectorAll('.shout-room-card').forEach(function (card) {
    card.onclick = function () { openShoutRoomPop(card.dataset.key); };
  });
};

/* ---------------- 使用说明 ---------------- */

window.openShoutHelpPop = function () {
  alert(
    '远程喊话 · 使用说明\n\n' +
    '① 班主任\n' +
    '   · 点「＋ 创建教室」，得到 6 位教室码\n' +
    '   · 把教室码给任课老师，他们即可加入\n' +
    '   · 可在教室详情里移除成员、复制大屏地址\n\n' +
    '② 任课老师\n' +
    '   · 点「🔑 加入教室」输入教室码\n' +
    '   · 加入后就能向该教室大屏发通知\n\n' +
    '③ 教室大屏（接收端）\n' +
    '   · 在教室一体机浏览器打开「大屏地址」\n' +
    '   · 页面常驻运行，收到消息自动弹屏显示\n' +
    '   · 建议全屏（F11）并设置开机自启'
  );
};

/* ---------------- 创建教室 ---------------- */

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

  // 默认名称跟随班级
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

/* ---------------- 加入教室 ---------------- */

window.openShoutJoinPop = function () {
  $('shoutJoinError').textContent = '';
  $('shoutJoinKey').value = '';
  $('shoutJoinSubject').value = '';
  $('shoutJoinPop').style.display = 'flex';
  setTimeout(function () { $('shoutJoinKey').focus(); }, 100);
};

/* ---------------- 教室详情弹窗 ---------------- */

window.openShoutRoomPop = async function (roomKey) {
  if (!roomKey) return;
  currentShoutRoomKey = roomKey;

  $('shoutRoomPop').style.display = 'flex';
  $('shoutRoomTitle').textContent = '教室';
  $('shoutRoomBody').innerHTML = '<div class="today-empty">加载中...</div>';

  let room, members;
  try {
    const results = await Promise.all([
      API.getShoutRoom(roomKey),
      API.listShoutMembers(roomKey),
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

  // ---- 基本信息 ----
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

  // ---- 成员 ----
  html += '<div class="shout-section-title">👥 教室成员（' + members.length + '）</div>';
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

  // ---- 发送区 ----
  html += '<div class="shout-section-title">📣 发送通知到大屏</div>';
  html += '<div class="shout-send-box">';
  html += '<textarea id="shoutMsgContent" class="cell-pop-input shout-textarea" rows="3" maxlength="500" ' +
          'placeholder="输入要在大屏上显示的内容…（最多 500 字）"></textarea>';
  html += '<div class="shout-send-opts">' +
            '<select id="shoutMsgType" class="cell-pop-input">' +
              '<option value="text">💬 普通消息</option>' +
              '<option value="notice">📢 通知</option>' +
              '<option value="urgent">🚨 紧急</option>' +
            '</select>' +
            '<select id="shoutMsgDuration" class="cell-pop-input">' +
              '<option value="10">停留 10 秒</option>' +
              '<option value="20" selected>停留 20 秒</option>' +
              '<option value="30">停留 30 秒</option>' +
              '<option value="60">停留 60 秒</option>' +
            '</select>' +
          '</div>';
  html += '<div class="me-error" id="shoutMsgError" style="min-height:18px;"></div>';
  html += '<button id="shoutMsgSend" type="button" class="shout-send-btn">📣 发送到大屏</button>';
  html += '</div>';

  // ---- 危险区（仅班主任） ----
  if (room.is_owner) {
    html += '<div class="shout-section-title">⚙️ 教室管理</div>';
    html += '<div class="shout-danger-row">' +
      '<button id="shoutResetTokenBtn" type="button" class="shout-btn-ghost">🔄 重置大屏地址</button>' +
      '<button id="shoutDeleteRoomBtn" type="button" class="shout-btn-danger">🗑️ 删除教室</button>' +
    '</div>';
  }

  $('shoutRoomBody').innerHTML = html;

  // ---- 复制按钮（事件委托） ----
  $('shoutRoomBody').querySelectorAll('.shout-copy').forEach(function (b) {
    b.onclick = function (ev) {
      ev.stopPropagation();
      copyText(b.dataset.copy);
    };
  });

  // ---- 移除成员 ----
  $('shoutRoomBody').querySelectorAll('.shout-member-del').forEach(function (b) {
    b.onclick = async function (ev) {
      ev.stopPropagation();
      if (!confirm('确认将「' + b.dataset.user + '」移出教室？')) return;
      try {
        await API.removeShoutMember(roomKey, b.dataset.user);
        showSaveStatus('已移除', false);
        openShoutRoomPop(roomKey);
      } catch (e) {
        alert(e.message || '移除失败');
      }
    };
  });

  // ---- 发送 ----
  const sendBtn = $('shoutMsgSend');
  if (sendBtn) {
    sendBtn.onclick = async function () {
      const content = $('shoutMsgContent').value.trim();
      const msgType = $('shoutMsgType').value;
      const duration = parseInt($('shoutMsgDuration').value, 10) || 20;
      const errEl = $('shoutMsgError');
      errEl.textContent = '';
      if (!content) { errEl.textContent = '请输入要发送的内容'; return; }
      sendBtn.disabled = true;
      sendBtn.style.opacity = '.7';
      try {
        await API.sendShout(roomKey, content, msgType, duration);
        $('shoutMsgContent').value = '';
        showSaveStatus('已发送到大屏', false);
      } catch (e) {
        errEl.textContent = e.message || '发送失败';
      } finally {
        sendBtn.disabled = false;
        sendBtn.style.opacity = '';
      }
    };
    $('shoutMsgContent').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendBtn.click();
    });
  }

  // ---- 重置 token ----
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

  // ---- 删除教室 ----
  const delBtn = $('shoutDeleteRoomBtn');
  if (delBtn) {
    delBtn.onclick = async function () {
      if (!confirm('确认删除教室「' + room.name + '」？所有成员和消息记录将一并删除。')) return;
      try {
        await API.deleteShoutRoom(roomKey);
        $('shoutRoomPop').style.display = 'none';
        showSaveStatus('已删除', false);
        loadShoutRooms();
      } catch (e) { alert(e.message); }
    };
  }
};

/* ---------------- 工具 ---------------- */

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

/* ---------------- 事件绑定 ---------------- */

(function bindShoutEvents() {
  // 创建弹窗
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
    if (!name) { errEl.textContent = '请填写教室名称'; return; }
    cs.disabled = true; cs.style.opacity = '.7';
    try {
      const resp = await API.createShoutRoom(name, classId);
      $('shoutCreatePop').style.display = 'none';
      showSaveStatus('教室已创建，教室码 ' + resp.room.room_key, false);
      await loadShoutRooms();
      openShoutRoomPop(resp.room.room_key);
    } catch (e) {
      errEl.textContent = e.message || '创建失败';
    } finally {
      cs.disabled = false; cs.style.opacity = '';
    }
  };

  // 加入弹窗
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
      await loadShoutRooms();
      openShoutRoomPop(key);
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

  // 详情弹窗关闭
  const rc = $('shoutRoomClose');
  if (rc) rc.onclick = function () { $('shoutRoomPop').style.display = 'none'; };
  const rp = $('shoutRoomPop');
  if (rp) rp.addEventListener('click', function (e) {
    if (e.target === rp) rp.style.display = 'none';
  });
})();