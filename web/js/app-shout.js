/* ============================================================
   app-shout.js —— 远程喊话
   子分类：班级管理 / 发通知 / 发送记录

   本版本：
   - 三种模式：🖥️ 桌面弹窗 / 🔊 语音广播 / 🖼️ 发送图片
   - 图片模式支持上传、自动压缩、预览、清除
   - 图片以 dataURL 形式作为 content 发送，msg_type='image'
   - 大屏端识别 msg_type='image' 直接渲染 <img>
   - 定时发送走服务端（关闭页面也会到点自动发送）
   ============================================================ */

window.shoutSubTab = 'manage';           // manage | send | history
window.shoutRooms = [];
window.currentShoutRoomKey = '';
window.currentShoutClass = '';
window.shoutMsgMode = 'popup';           // ★ popup | voice | image
window.shoutMsgType = 'text';            // text | notice | urgent
window.shoutDisplay = 'marquee';         // marquee | card
window.shoutBroadcastCount = 1;
window.shoutHistoryFilter = 'all';
window.shoutHistoryList = [];
window.shoutImageData = '';              // ★ 当前已选图片 dataURL

let shoutRoomsLoaded = false;
let shoutStatusTimer = null;
let shoutListStatusTimer = null;

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

function stopListStatusPolling() {
  if (shoutListStatusTimer) {
    clearInterval(shoutListStatusTimer);
    shoutListStatusTimer = null;
  }
}

/* ---------- 图片压缩工具 ---------- */

function compressShoutImage(file, maxSize, quality) {
  return new Promise(function (resolve, reject) {
    if (!file) { reject(new Error('未选择文件')); return; }
    if (!/^image\//.test(file.type)) { reject(new Error('请选择图片文件')); return; }
    if (file.size > 8 * 1024 * 1024) { reject(new Error('图片超过 8MB，请先压缩')); return; }

    const reader = new FileReader();
    reader.onload = function () {
      const img = new Image();
      img.onload = function () {
        let w = img.width, h = img.height;
        if (w > maxSize || h > maxSize) {
          const ratio = Math.min(maxSize / w, maxSize / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        const isPng = file.type === 'image/png';
        const out = canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', quality);
        resolve(out);
      };
      img.onerror = function () { reject(new Error('图片加载失败')); };
      img.src = reader.result;
    };
    reader.onerror = function () { reject(new Error('图片读取失败')); };
    reader.readAsDataURL(file);
  });
}

/* ---------- 主渲染 ---------- */

window.renderShout = async function () {
  const container = scheduleContainer;
  if (!container) return;
  container.innerHTML = '';

  if (shoutStatusTimer) {
    clearInterval(shoutStatusTimer);
    shoutStatusTimer = null;
  }
  stopListStatusPolling();

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
        '<span class="shout-online-status" data-status-key="' + escapeHtml(r.room_key) + '">' +
          '<span class="shout-status-dot"></span>' +
          '<span>检测中…</span>' +
        '</span>' +
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

  body.querySelectorAll('.shout-room-item').forEach(function (el) {
    el.onclick = function (e) {
      if (e.target.closest('.shout-room-more')) return;
      currentShoutClass = el.dataset.key;
      shoutSubTab = 'send';
      renderShout();
    };
  });

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

  stopListStatusPolling();
  refreshRoomListStatus();
  shoutListStatusTimer = setInterval(refreshRoomListStatus, 5000);
}

async function refreshRoomListStatus() {
  const items = document.querySelectorAll('.shout-room-item[data-key]');
  if (!items.length) return;

  await Promise.all(Array.from(items).map(async function (el) {
    const key = el.dataset.key;
    const box = el.querySelector('.shout-online-status');
    if (!box) return;

    const dot = box.querySelector('.shout-status-dot');
    const txt = box.querySelector('span:last-child');

    try {
      const resp = await API.getShoutRoomStatus(key);
      const on = !!resp.online;
      if (dot) dot.classList.toggle('online', on);
      if (txt) txt.textContent = on ? '在线' : '离线';
    } catch (e) {
      if (dot) dot.classList.remove('online');
      if (txt) txt.textContent = '离线';
    }
  }));
}

/* ---------- ② 发通知 ---------- */

// 取当前模式下的发送内容与类型
function getShoutSendPayload() {
  if (shoutMsgMode === 'image') {
    if (!window.shoutImageData) return { error: '请先选择一张图片' };
    return { content: window.shoutImageData, msgType: 'image' };
  }
  const ta = $('shoutSendContent');
  const content = ta ? ta.value.trim() : '';
  if (!content) return { error: shoutMsgMode === 'voice' ? '请输入要播报的内容' : '请输入要显示的内容' };
  return { content: content, msgType: shoutMsgType || 'text' };
}

function clearShoutSendInput() {
  if (shoutMsgMode === 'image') {
    window.shoutImageData = '';
    return;
  }
  const ta = $('shoutSendContent');
  const counter = $('shoutSendCount');
  if (ta) ta.value = '';
  if (counter) counter.textContent = '0/200';
}

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

  /* 顶部：班级 + 角色 + 在线状态 +（图片模式下隐藏）消息类型 */
  html += '<div class="shout-send-head">' +
    '<div class="select-wrap shout-send-class-wrap">' +
      '<select id="shoutSendClass" class="cell-pop-input">' + classOptions + '</select>' +
    '</div>' +
    '<span class="shout-role-pill ' + (room.is_owner ? 'owner' : 'teacher') + '">' + escapeHtml(roleLabel) + '</span>' +
    '<span class="shout-online-status">' +
      '<span class="shout-status-dot" id="shoutSendStatusDot"></span>' +
      '<span id="shoutSendStatusText">检测中…</span>' +
    '</span>';

  if (shoutMsgMode !== 'image') {
    html += '<div class="select-wrap shout-send-type-wrap">' +
      '<select id="shoutSendType" class="cell-pop-input" title="选择消息在大屏上的显示类型">' +
        '<option value="text"'   + (shoutMsgType === 'text'   ? ' selected' : '') + '>💬 消息</option>' +
        '<option value="notice"' + (shoutMsgType === 'notice' ? ' selected' : '') + '>📢 通知</option>' +
        '<option value="urgent"' + (shoutMsgType === 'urgent' ? ' selected' : '') + '>🚨 紧急</option>' +
      '</select>' +
    '</div>';
  }
  html += '</div>';

  /* 模式标签：桌面弹窗 / 语音广播 / 发送图片 */
  const modes = [
    { key: 'popup', icon: '🖥️', label: '桌面弹窗' },
    { key: 'voice', icon: '🔊', label: '语音广播' },
    { key: 'image', icon: '🖼️', label: '发送图片' }
  ];
  html += '<div class="shout-mode-tabs">';
  modes.forEach(function (m) {
    html += '<button class="shout-mode-tab' + (shoutMsgMode === m.key ? ' active' : '') +
      '" data-mode="' + m.key + '">' +
      '<span class="shout-mode-icon">' + m.icon + '</span>' +
      '<span>' + m.label + '</span></button>';
  });
  html += '</div>';

  /* 输入区域 */
  if (shoutMsgMode === 'image') {
    const hasImg = !!window.shoutImageData;
    html += '<div class="shout-input-wrap">' +
      '<div class="shout-image-drop' + (hasImg ? ' has-image' : '') + '" id="shoutImageDrop">' +
        (hasImg
          ? '<img class="shout-image-preview" src="' + window.shoutImageData + '" alt="预览" />' +
            '<button type="button" class="shout-image-clear" id="shoutImageClear" title="移除图片">×</button>'
          : '<div class="shout-image-placeholder">' +
              '<div class="shout-image-icon">🖼️</div>' +
              '<div class="shout-image-title">点击此处选择图片</div>' +
              '<div class="shout-image-hint">支持 JPG / PNG / GIF，建议 ≤ 2MB</div>' +
            '</div>') +
      '</div>' +
      '<input type="file" id="shoutImageInput" accept="image/*" style="display:none">' +
      '<div class="shout-input-meta">' +
        '<span class="shout-input-tag">发送后大屏将以图片弹窗方式展示</span>' +
        '<span class="shout-input-count">' + (hasImg ? '已选择图片' : '未选择图片') + '</span>' +
      '</div>' +
    '</div>';
  } else {
    let placeholder = '输入文字，教室音箱将以自然语音朗读播报…';
    if (shoutMsgMode === 'popup') placeholder = '输入要显示在大屏上的文字…';

    html += '<div class="shout-input-wrap">' +
      '<textarea id="shoutSendContent" class="cell-pop-input shout-textarea" rows="6" maxlength="200" ' +
        'placeholder="' + escapeHtml(placeholder) + '"></textarea>' +
      '<div class="shout-input-meta">' +
        '<span class="shout-input-tag">' + (shoutMsgMode === 'voice' ? '智能 TTS 语音朗读' : '大屏弹窗展示') + '</span>' +
        '<span class="shout-input-count" id="shoutSendCount">0/200</span>' +
      '</div>' +
    '</div>';
  }

  /* 大屏呈现形式 */
  html += '<div class="shout-opt-row">' +
    '<div class="shout-opt-info">' +
      '<div class="shout-opt-label">大屏呈现形式</div>' +
      '<div class="shout-opt-hint">居中卡片展示，醒目提醒</div>' +
    '</div>' +
    '<div class="shout-opt-seg" data-opt="display">' +
      '<button class="shout-opt-btn' + (shoutDisplay === 'marquee' ? ' active' : '') + '" data-display="marquee">跑马灯</button>' +
      '<button class="shout-opt-btn' + (shoutDisplay === 'card' ? ' active' : '') + '" data-display="card">完整卡片</button>' +
    '</div>' +
  '</div>';

  /* 播报次数 */
  html += '<div class="shout-opt-row">' +
    '<div class="shout-opt-info">' +
      '<div class="shout-opt-label">播报次数</div>' +
      '<div class="shout-opt-hint">大屏将按所设次数连播，间隔1.2秒</div>' +
    '</div>' +
    '<div class="shout-opt-seg" data-opt="count">' +
      '<button class="shout-opt-btn' + (shoutBroadcastCount === 1 ? ' active' : '') + '" data-count="1">1次</button>' +
      '<button class="shout-opt-btn' + (shoutBroadcastCount === 2 ? ' active' : '') + '" data-count="2">2次</button>' +
      '<button class="shout-opt-btn' + (shoutBroadcastCount === 3 ? ' active' : '') + '" data-count="3">3次</button>' +
    '</div>' +
  '</div>';

  /* 定时发送开关 */
  html += '<div class="shout-opt-row">' +
    '<div class="shout-opt-info">' +
      '<div class="shout-opt-label">定时发送</div>' +
      '<div class="shout-opt-hint">到达预设时间大屏将准时播报（关闭页面也生效）</div>' +
    '</div>' +
    '<div class="shout-opt-toggle">' +
      '<label class="tgl">' +
        '<input type="checkbox" id="shoutSendSchedule">' +
        '<span class="tgl-slider"></span>' +
      '</label>' +
    '</div>' +
  '</div>';

  html += '<div class="shout-schedule-box" id="shoutScheduleBox" style="display:none;">' +
    '<label class="shout-schedule-label">日期：</label>' +
    '<input type="date" id="shoutScheduleDate" class="shout-schedule-input">' +
    '<label class="shout-schedule-label">时间：</label>' +
    '<input type="time" id="shoutScheduleTime" class="shout-schedule-input">' +
    '<button type="button" id="shoutScheduleBtn" class="shout-schedule-btn">加入定时队列</button>' +
  '</div>';

  html += '<div class="me-error" id="shoutSendError" style="min-height:18px;"></div>';

  html += '<button id="shoutSendBtn" class="shout-send-main">' +
    '<span class="shout-send-icon">✈</span><span>发送至教室大屏</span></button>';

  html += '<div id="shoutScheduledBox" class="shout-client-block" style="display:none;margin-top:18px;"></div>';

  body.innerHTML = html;

  /* ---------- 绑定 ---------- */
  const clsSel = $('shoutSendClass');
  clsSel.value = currentShoutClass;
  clsSel.onchange = function () {
    currentShoutClass = clsSel.value;
    renderShoutSend();
  };

  const typeSel = $('shoutSendType');
  if (typeSel) {
    typeSel.onchange = function () {
      shoutMsgType = typeSel.value || 'text';
    };
  }

  body.querySelectorAll('.shout-mode-tab').forEach(function (b) {
    b.onclick = function () {
      shoutMsgMode = b.dataset.mode;
      renderShoutSend();
    };
  });

  // 文本输入
  const ta = $('shoutSendContent');
  const counter = $('shoutSendCount');
  if (ta) {
    ta.oninput = function () {
      if (counter) counter.textContent = ta.value.length + '/200';
    };
  }

  // 图片模式
  if (shoutMsgMode === 'image') {
    const drop = $('shoutImageDrop');
    const fileInp = $('shoutImageInput');
    const clearBtn = $('shoutImageClear');

    if (drop && fileInp) {
      drop.onclick = function (e) {
        if (e.target.closest('#shoutImageClear')) return;
        fileInp.click();
      };
    }
    if (fileInp) {
      fileInp.onchange = async function () {
        const f = fileInp.files && fileInp.files[0];
        if (!f) return;
        try {
          showSaveStatus('正在处理图片…', false);
          const dataUrl = await compressShoutImage(f, 1280, 0.82);
          window.shoutImageData = dataUrl;
          renderShoutSend();
          showSaveStatus('图片已就绪', false);
        } catch (err) {
          alert('图片处理失败：' + (err.message || err));
        } finally {
          fileInp.value = '';
        }
      };
    }
    if (clearBtn) {
      clearBtn.onclick = function (e) {
        e.stopPropagation();
        window.shoutImageData = '';
        renderShoutSend();
      };
    }
  }

  // 大屏呈现形式
  body.querySelectorAll('.shout-opt-seg[data-opt="display"] .shout-opt-btn').forEach(function (b) {
    b.onclick = function () {
      shoutDisplay = b.dataset.display;
      body.querySelectorAll('.shout-opt-seg[data-opt="display"] .shout-opt-btn')
        .forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
    };
  });

  // 播报次数
  body.querySelectorAll('.shout-opt-seg[data-opt="count"] .shout-opt-btn').forEach(function (b) {
    b.onclick = function () {
      shoutBroadcastCount = parseInt(b.dataset.count, 10) || 1;
      body.querySelectorAll('.shout-opt-seg[data-opt="count"] .shout-opt-btn')
        .forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
    };
  });

  // 定时发送
  const sch = $('shoutSendSchedule');
  const schBox = $('shoutScheduleBox');
  const schDate = $('shoutScheduleDate');
  const schTime = $('shoutScheduleTime');

  function updateScheduleVisibility() {
    if (!sch || !schBox) return;
    schBox.style.display = sch.checked ? 'flex' : 'none';
    if (sch.checked && !schDate.value) {
      const d = new Date(Date.now() + 5 * 60000);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mi = String(d.getMinutes()).padStart(2, '0');
      schDate.value = yyyy + '-' + mm + '-' + dd;
      schTime.value = hh + ':' + mi;
    }
  }
  if (sch) sch.onchange = updateScheduleVisibility;

  const schBtn = $('shoutScheduleBtn');
  if (schBtn) {
    schBtn.onclick = async function () {
      const errEl = $('shoutSendError');
      errEl.textContent = '';

      const dateVal = schDate.value;
      const timeVal = schTime.value;
      if (!dateVal || !timeVal) { errEl.textContent = '请选择日期和时间'; return; }

      const target = new Date(dateVal + 'T' + timeVal + ':00');
      const sendAtMs = target.getTime();
      if (isNaN(sendAtMs)) { errEl.textContent = '时间格式错误'; return; }
      if (sendAtMs - Date.now() < 1000) { errEl.textContent = '时间已过，请重新选择'; return; }

      const payload = getShoutSendPayload();
      if (payload.error) { errEl.textContent = payload.error; return; }

      const duration = 20 * (shoutBroadcastCount || 1);

      schBtn.disabled = true; schBtn.style.opacity = '.7';
      try {
        await API.scheduleShout(currentShoutClass, payload.content, payload.msgType, duration, sendAtMs);
        showSaveStatus('已加入服务端定时队列，到点自动发送', false);
        clearShoutSendInput();
        if (sch) sch.checked = false;
        updateScheduleVisibility();
        renderShoutSend();
      } catch (e) {
        errEl.textContent = e.message || '设置定时失败';
      } finally {
        schBtn.disabled = false; schBtn.style.opacity = '';
      }
    };
  }

  updateScheduleVisibility();

  // 立即发送
  $('shoutSendBtn').onclick = async function () {
    const errEl = $('shoutSendError');
    errEl.textContent = '';

    const payload = getShoutSendPayload();
    if (payload.error) { errEl.textContent = payload.error; return; }

    const duration = 20 * (shoutBroadcastCount || 1);
    const btn = $('shoutSendBtn');
    btn.disabled = true;
    btn.style.opacity = '.7';

    try {
      await API.sendShout(currentShoutClass, payload.content, payload.msgType, duration);
      clearShoutSendInput();
      shoutHistoryList = [];
      showSaveStatus('已发送至教室大屏', false);
      renderShoutSend();
    } catch (e) {
      errEl.textContent = e.message || '发送失败';
    } finally {
      btn.disabled = false;
      btn.style.opacity = '';
    }
  };

  await refreshSendStatus();
  if (shoutStatusTimer) { clearInterval(shoutStatusTimer); shoutStatusTimer = null; }
  shoutStatusTimer = setInterval(refreshSendStatus, 3000);

  renderScheduledList();
}

async function renderScheduledList() {
  const box = document.getElementById('shoutScheduledBox');
  if (!box) return;

  let list = [];
  try {
    const resp = await API.listScheduledShouts(50);
    list = (resp.scheduled || []).filter(function (s) { return s.status === 'pending'; });
  } catch (e) { list = []; }

  if (!list.length) {
    box.innerHTML = '';
    box.style.display = 'none';
    return;
  }
  box.style.display = '';

  let html = '<div class="shout-client-head">' +
    '<div class="shout-client-title">⏰ 待发送定时任务（' + list.length + '）</div>' +
  '</div>';
  html += '<div class="shout-member-list">';
  list.forEach(function (s) {
    const dt = new Date(s.send_at_ms);
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    const hh = String(dt.getHours()).padStart(2, '0');
    const mi = String(dt.getMinutes()).padStart(2, '0');
    const timeStr = yyyy + '-' + mm + '-' + dd + ' ' + hh + ':' + mi;
    const room = shoutRooms.find(function (r) { return r.room_key === s.room_key; });
    const roomName = room ? room.name : s.room_key;

    const isImage = s.msg_type === 'image';
    const contentPreview = isImage ? '🖼️ [图片]' : escapeHtml(s.content);

    html += '<div class="shout-member-row">' +
      '<span class="shout-member-name" style="flex:1;min-width:0;">' +
        escapeHtml(timeStr) + ' · ' + escapeHtml(roomName) +
        '<div style="font-size:12px;color:var(--text-sub);margin-top:4px;white-space:pre-wrap;word-break:break-word;font-weight:400;">' +
          contentPreview +
        '</div>' +
      '</span>' +
      '<button class="shout-member-del" type="button" data-sid="' + s.id + '">取消</button>' +
    '</div>';
  });
  html += '</div>';
  box.innerHTML = html;

  box.querySelectorAll('.shout-member-del').forEach(function (b) {
    b.onclick = async function () {
      if (!confirm('取消这条定时发送？')) return;
      try {
        await API.cancelScheduledShout(parseInt(b.dataset.sid, 10));
        showSaveStatus('已取消', false);
        renderScheduledList();
      } catch (e) { alert(e.message || '取消失败'); }
    };
  });
}

async function refreshSendStatus() {
  const dot = $('shoutSendStatusDot');
  const text = $('shoutSendStatusText');
  if (!dot || !text || !currentShoutClass) return;

  try {
    const resp = await API.getShoutRoomStatus(currentShoutClass);
    const online = !!resp.online;
    dot.classList.toggle('online', online);
    text.textContent = online ? '在线' : '离线';
  } catch (e) {
    dot.classList.remove('online');
    text.textContent = '离线';
  }
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
    else if (m.msg_type === 'image') { typeLabel = '图片'; typeCls = 'image'; }

    let time = m.created_at;
    try { time = new Date(m.created_at).toLocaleString('zh-CN'); } catch (e) {}

    const delivered = m.delivered !== false;
    const statusCls = delivered ? 'ok' : 'fail';
    const statusText = delivered ? '✓ 已送达' : '✕ 未送达';

    const contentHtml = (m.msg_type === 'image')
      ? '<div class="shout-history-content shout-history-image">🖼️ [图片]</div>'
      : '<div class="shout-history-content">' + escapeHtml(m.content) + '</div>';

    html += '<div class="shout-history-item" data-id="' + m.id + '">' +
      '<div class="shout-history-top">' +
        '<span class="shout-history-room">' + escapeHtml(roomName) + '</span>' +
        '<span class="shout-history-type ' + typeCls + '">' + typeLabel + '</span>' +
        '<span class="shout-history-status ' + statusCls + '">' + statusText + '</span>' +
      '</div>' +
      '<div class="shout-history-time">' + escapeHtml(time) + '</div>' +
      contentHtml +
      '<div class="shout-history-foot">' +
        '<button type="button" class="shout-history-btn reshare" data-act="resend" data-id="' + m.id + '">重发</button>' +
        '<button type="button" class="shout-history-btn danger" data-act="delete" data-id="' + m.id + '">删除</button>' +
      '</div>' +
    '</div>';
  });
  html += '</div>';
  el.innerHTML = html;

  el.querySelectorAll('.shout-history-btn').forEach(function (btn) {
    btn.onclick = function (ev) {
      ev.stopPropagation();
      const act = btn.dataset.act;
      const id = parseInt(btn.dataset.id, 10);
      const msg = shoutHistoryList.find(function (m) { return m.id === id; });
      if (!msg) return;

      if (act === 'resend')      handleResendShout(msg);
      else if (act === 'delete') handleDeleteShout(msg);
    };
  });
}

async function handleResendShout(msg) {
  if (!confirm('确认重发这条消息？')) return;
  try {
    await API.sendShout(
      msg.room_key,
      msg.content,
      msg.msg_type || 'text',
      msg.duration || 20
    );
    showSaveStatus('已重新发送', false);
    try {
      const resp = await API.getMyShoutMessages(200);
      shoutHistoryList = resp.messages || [];
    } catch (e) { /* 忽略 */ }
    renderShoutHistoryList();
  } catch (e) {
    showSaveStatus('重发失败：' + (e.message || ''), true);
  }
}

async function handleDeleteShout(msg) {
  if (!confirm('确认删除这条发送记录？')) return;
  try {
    await API.deleteShoutMessage(msg.id);
    shoutHistoryList = shoutHistoryList.filter(function (m) { return m.id !== msg.id; });
    renderShoutHistoryList();
    showSaveStatus('已删除', false);
  } catch (e) {
    showSaveStatus('删除失败：' + (e.message || ''), true);
  }
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

/* ---------- 教室详情弹窗 ---------- */

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
  html += '<div class="shout-info-row">' +
    '<span class="k">教室码</span>' +
    '<span class="v">' +
      '<b class="shout-code">' + escapeHtml(room.room_key) + '</b>' +
      '<button class="shout-copy" data-copy="' + escapeHtml(room.room_key) + '" type="button">复制</button>' +
      (room.is_owner
        ? '<button class="shout-copy" id="shoutResetKeyBtn" type="button" ' +
          'style="background:#fef7e0;color:#b06000;border-color:#f0d58a;">重置</button>'
        : '') +
    '</span>' +
  '</div>';

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

  const resetKeyBtn = $('shoutResetKeyBtn');
  if (resetKeyBtn) {
    resetKeyBtn.onclick = async function () {
      if (!confirm(
        '重置后原教室码立即失效。\n\n' +
        '已加入的老师不受影响，仍可继续向本教室发送通知；\n' +
        '新老师需要用新的教室码加入。\n\n' +
        '确认重置？'
      )) return;
      try {
        const resp = await API.regenerateShoutRoomKey(roomKey);
        showSaveStatus('教室码已重置为 ' + resp.room_key, false);
        await ensureShoutRooms(true);
        if (currentShoutClass === roomKey) currentShoutClass = resp.room_key;
        openShoutRoomPop(resp.room_key);
      } catch (e) {
        alert(e.message || '重置失败');
      }
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
  if (rc) rc.onclick = function () {
    $('shoutRoomPop').style.display = 'none';
  };
  const rp = $('shoutRoomPop');
  if (rp) rp.addEventListener('click', function (e) {
    if (e.target === rp) {
      rp.style.display = 'none';
    }
  });
})();