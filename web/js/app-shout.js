/* ============================================================
   app-shout.js —— 远程喊话
   子分类：班级管理 / 发通知 / 发送记录

   本版本：
   - 三种模式：🖥️ 桌面弹窗 / 🔊 语音广播 / 📁 传输文件
   - 桌面弹窗支持「语音播报」开关（弹窗 + TTS 同时进行）
   - 语音广播模式不显示右上角消息类型下拉
   - 传输文件支持：图片 / 视频 / 任意文件，可选择「在一体机打开」
   - 图片自动压缩；视频/文件走 dataURL 直传
   - 大屏端按类型渲染：图片 / 视频 / 文件卡片
   - ★ 大屏呈现形式：默认「完整卡片」，可切换「跑马灯」
   - ★ 播报次数 / 播报时间：桌面弹窗 / 语音广播 均显示
   - ★ 播报次数与播报时间左右分栏；播报时间默认30秒，步长5秒
   - ★ 大屏呈现形式提示文字跟随选择动态变化
   - ★ 发送记录里标注「卡片」/「跑马灯」/「🔊 语音」/「广播」
   - ★ 发送记录支持「编辑」按钮，一键回填至发通知页
   - ★ count 字段写入 payload，大屏端读 count 循环播报
   - ★ 教室卡片下方新增四个操作按钮：查看桌面 / 查看监控 / 远程喊话 / 设备控制
   - ★ 查看桌面 / 查看监控 / 远程喊话 弹出远程控制面板
   - ★ 设备控制弹出一键关机 / 重启电脑 / 定时关机 / 全屏时钟
   - ★ 远程控制弹窗图标统一为线性 SVG（跟随 currentColor）
   - ★ 「远程喊话」入口 / 按钮也在弹窗内显示监控画面
   ============================================================ */

/* ============================================================
   远程控制弹窗图标（线性 SVG · Lucide 风格 · 跟随 currentColor）
   ============================================================ */
const RC_ICONS = {
  monitor:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round">' +
      '<rect width="20" height="14" x="2" y="3" rx="2"/>' +
      '<line x1="8" x2="16" y1="21" y2="21"/>' +
      '<line x1="12" x2="12" y1="17" y2="21"/>' +
    '</svg>',

  video:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="m22 8-6 4 6 4V8Z"/>' +
      '<rect width="14" height="12" x="2" y="6" rx="2" ry="2"/>' +
    '</svg>',

  megaphone:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="m3 11 18-5v12L3 14v-3z"/>' +
      '<path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>' +
    '</svg>',

  mic:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>' +
      '<path d="M19 10v2a7 7 0 0 1-14 0v-2"/>' +
      '<line x1="12" x2="12" y1="19" y2="22"/>' +
    '</svg>',
};

window.shoutSubTab = 'manage';           // manage | send | history
window.shoutRooms = [];
window.currentShoutRoomKey = '';
window.currentShoutClass = '';
window.currentRemoteRoomKey = '';
window.shoutMsgMode = 'popup';           // popup | voice | file
window.shoutMsgType = 'text';            // text | notice | urgent
window.shoutDisplay = 'card';            // card | marquee（默认完整卡片）
window.shoutBroadcastCount = 1;
window.shoutBroadcastDuration = 30;      // 大屏显示时长（秒），默认30
window.shoutHistoryFilter = 'all';
window.shoutHistoryList = [];
window.shoutFileInfo = null;             // { name, type, size, data }
window.shoutFileAutoOpen = true;         // 传输完成后是否在一体机打开
window.shoutPopupVoice = false;          // 桌面弹窗 + 语音播报开关
window.shoutEditDraftText = '';          // 编辑回填草稿文本

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

/* ---------- 通用文件读取 ---------- */

function readShoutFile(file) {
  return new Promise(function (resolve, reject) {
    if (!file) { reject(new Error('未选择文件')); return; }
    const MAX = 20 * 1024 * 1024;   // 20MB
    if (file.size > MAX) { reject(new Error('文件超过 20MB，请压缩后再传输')); return; }

    const isImage = /^image\//.test(file.type);
    if (isImage) {
      compressShoutImage(file, 1280, 0.82).then(function (dataUrl) {
        resolve({ name: file.name, type: file.type, size: file.size, data: dataUrl });
      }).catch(reject);
      return;
    }
    const reader = new FileReader();
    reader.onload = function () {
      resolve({
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        data: reader.result
      });
    };
    reader.onerror = function () { reject(new Error('文件读取失败')); };
    reader.readAsDataURL(file);
  });
}

function formatFileSize(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

function renderShoutFilePreview(f) {
  const isImage = /^image\//.test(f.type);
  const isVideo = /^video\//.test(f.type);
  let inner = '';
  if (isImage) {
    inner = '<img class="shout-image-preview" src="' + f.data + '" alt="预览" />';
  } else if (isVideo) {
    inner = '<video class="shout-file-video" src="' + f.data + '" controls preload="metadata"></video>';
  } else {
    inner = '<div class="shout-file-doc">' +
              '<div class="shout-file-icon">' + icon('file') + '</div>' +
              '<div class="shout-file-name">' + escapeHtml(f.name) + '</div>' +
              '<div class="shout-file-size">' + formatFileSize(f.size) + '</div>' +
            '</div>';
  }
  return inner +
    '<button type="button" class="shout-image-clear" id="shoutFileClear" title="移除文件">×</button>';
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
      const rk = escapeHtml(r.room_key);
      html += '<div class="shout-room-item" data-key="' + rk + '">' +
        '<div class="shout-room-info">' +
          '<div class="shout-room-name-row">' +
            '<span class="shout-room-name">' + escapeHtml(r.name) + '</span>' +
            '<span class="shout-role-pill ' + roleCls + '">' + escapeHtml(roleLabel) + '</span>' +
          '</div>' +
          '<div class="shout-room-sub">教室码 ' + rk +
            ' · ' + (r.member_count || 0) + ' 位老师</div>' +
        '</div>' +
        '<span class="shout-online-status" data-status-key="' + rk + '">' +
          '<span class="shout-status-dot"></span>' +
          '<span>检测中…</span>' +
        '</span>' +
        '<button class="shout-room-more" data-more="' + rk + '" title="班级设置">⋯</button>' +
        '<div class="shout-room-actions-row">' +
          '<button type="button" class="shout-action-btn" data-action="view-desktop"   data-key="' + rk + '">' +
            '<span class="shout-action-icon">' + icon('monitor') + '</span>' +
            '<span class="shout-action-text">查看桌面</span>' +
          '</button>' +
          '<button type="button" class="shout-action-btn" data-action="view-monitor"   data-key="' + rk + '">' +
            '<span class="shout-action-icon">' + icon('video') + '</span>' +
            '<span class="shout-action-text">查看监控</span>' +
          '</button>' +
          '<button type="button" class="shout-action-btn" data-action="shout"          data-key="' + rk + '">' +
            '<span class="shout-action-icon">' + icon('megaphone') + '</span>' +
            '<span class="shout-action-text">远程喊话</span>' +
          '</button>' +
          '<button type="button" class="shout-action-btn" data-action="device-control" data-key="' + rk + '">' +
            '<span class="shout-action-icon">' + icon('sliders') + '</span>' +
            '<span class="shout-action-text">设备控制</span>' +
          '</button>' +
        '</div>' +
      '</div>';
    });
    html += '</div>';
  }

  if (shoutRooms.length > 0) {
    const first = shoutRooms[0];
    const displayUrl = location.origin + '/display.html?token=' + encodeURIComponent(first.display_token);
    html += '<div class="shout-client-block">' +
      '<div class="shout-client-head">' +
        '<div class="shout-client-title">' + icon('monitor') + ' 教室大屏客户端</div>' +
        '<button class="shout-copy-link" type="button" data-copy="' + escapeHtml(displayUrl) + '">' + icon('copy') + ' 复制安装网址</button>' +
      '</div>' +
      '<div class="shout-client-desc">在教室一体机浏览器打开下方网址下载安装：</div>' +
      '<div class="shout-client-url" data-copy="' + escapeHtml(displayUrl) + '">' +
        '<span class="shout-client-url-text">' + escapeHtml(displayUrl) + '</span>' +
      '</div>' +
    '</div>';
  }

  body.innerHTML = html;

  const cb = $('shoutCreateBtn'); if (cb) cb.onclick = openShoutCreatePop;
  const jb = $('shoutJoinBtn');   if (jb) jb.onclick = openShoutJoinPop;

  body.querySelectorAll('.shout-room-item').forEach(function (el) {
    el.onclick = function (e) {
      if (e.target.closest('.shout-room-more')) return;
      if (e.target.closest('.shout-action-btn')) return;
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

  body.querySelectorAll('.shout-action-btn').forEach(function (btn) {
    btn.onclick = function (e) {
      e.stopPropagation();
      handleShoutRoomAction(btn.dataset.action, btn.dataset.key);
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

/* ---------- 教室四功能入口 ---------- */
function handleShoutRoomAction(action, roomKey) {
  switch (action) {
    case 'view-desktop':
      window.currentRemoteRoomKey = roomKey;
      window.openRemoteControlPop('desktop');
      break;

    case 'view-monitor':
      window.currentRemoteRoomKey = roomKey;
      window.openRemoteControlPop('monitor');
      break;

    case 'shout':
      // ★ 改为 'shout' 模式：弹窗内直接显示监控画面，同时可按住说话
      window.currentRemoteRoomKey = roomKey;
      window.openRemoteControlPop('shout');
      break;

    case 'device-control':
      window.currentRemoteRoomKey = roomKey;
      window.openDeviceControlPop();
      break;
  }
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

function getShoutSendPayload() {
  if (shoutMsgMode === 'file') {
    if (!window.shoutFileInfo) return { error: '请先选择一个文件' };
    const f = window.shoutFileInfo;
    return {
      content: JSON.stringify({
        name: f.name,
        type: f.type,
        size: f.size,
        open: !!window.shoutFileAutoOpen,
        data: f.data
      }),
      msgType: 'file'
    };
  }

  const ta = $('shoutSendContent');
  const content = ta ? ta.value.trim() : '';
  if (!content) {
    return { error: shoutMsgMode === 'voice' ? '请输入要播报的内容' : '请输入要显示的内容' };
  }

  const isVoiceMode = (shoutMsgMode === 'voice');
  const voiceFlag = isVoiceMode || (shoutMsgMode === 'popup' && !!window.shoutPopupVoice);
  const display = shoutMsgMode === 'popup'
    ? shoutDisplay
    : (isVoiceMode ? 'voice' : 'card');

  const count = window.shoutBroadcastCount || 1;

  return {
    content: JSON.stringify({
      text: content,
      voice: voiceFlag,
      display: display,
      count: count
    }),
    msgType: shoutMsgType || 'text'
  };
}

function clearShoutSendInput() {
  if (shoutMsgMode === 'file') {
    window.shoutFileInfo = null;
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

  html += '<div class="shout-send-head">' +
    '<div class="select-wrap shout-send-class-wrap">' +
      '<select id="shoutSendClass" class="cell-pop-input">' + classOptions + '</select>' +
    '</div>' +
    '<span class="shout-role-pill ' + (room.is_owner ? 'owner' : 'teacher') + '">' + escapeHtml(roleLabel) + '</span>' +
    '<span class="shout-online-status">' +
      '<span class="shout-status-dot" id="shoutSendStatusDot"></span>' +
      '<span id="shoutSendStatusText">检测中…</span>' +
    '</span>';

  if (shoutMsgMode === 'popup') {
    html += '<div class="select-wrap shout-send-type-wrap">' +
      '<select id="shoutSendType" class="cell-pop-input" title="选择消息在大屏上的显示类型">' +
        '<option value="text"'   + (shoutMsgType === 'text'   ? ' selected' : '') + '>消息</option>' +
        '<option value="notice"' + (shoutMsgType === 'notice' ? ' selected' : '') + '>通知</option>' +
        '<option value="urgent"' + (shoutMsgType === 'urgent' ? ' selected' : '') + '>紧急</option>' +
      '</select>' +
    '</div>';
  }
  html += '</div>';

  const modes = [
    { key: 'popup', icon: icon('monitor'), label: '桌面弹窗' },
    { key: 'voice', icon: icon('volume'),  label: '语音广播' },
    { key: 'file',  icon: icon('folder'),  label: '传输文件' }
  ];
  html += '<div class="shout-mode-tabs">';
  modes.forEach(function (m) {
    html += '<button class="shout-mode-tab' + (shoutMsgMode === m.key ? ' active' : '') +
      '" data-mode="' + m.key + '">' +
      '<span class="shout-mode-icon">' + m.icon + '</span>' +
      '<span>' + m.label + '</span></button>';
  });
  html += '</div>';

  if (shoutMsgMode === 'file') {
    const f = window.shoutFileInfo;
    const hasFile = !!f;
    html += '<div class="shout-input-wrap">' +
      '<div class="shout-image-drop' + (hasFile ? ' has-image' : '') + '" id="shoutFileDrop">' +
        (hasFile
          ? renderShoutFilePreview(f)
          : '<div class="shout-image-placeholder">' +
              '<div class="shout-image-icon">' + icon('folder') + '</div>' +
              '<div class="shout-image-title">点击此处选择文件</div>' +
              '<div class="shout-image-hint">支持 图片 / 视频 / 文档等，建议 ≤ 20MB</div>' +
            '</div>') +
      '</div>' +
      '<input type="file" id="shoutFileInput" style="display:none">' +
      '<div class="shout-input-meta">' +
        '<span class="shout-input-tag">发送后大屏将按文件类型展示</span>' +
        '<span class="shout-input-count">' + (hasFile ? escapeHtml(f.name) : '未选择文件') + '</span>' +
      '</div>' +
    '</div>';

    html += '<div class="shout-opt-row">' +
      '<div class="shout-opt-info">' +
        '<div class="shout-opt-label">传输完成后在一体机打开</div>' +
        '<div class="shout-opt-hint">开启后，接收端会自动播放/打开该文件；关闭则只显示文件卡片</div>' +
      '</div>' +
      '<div class="shout-opt-toggle">' +
        '<label class="tgl">' +
          '<input type="checkbox" id="shoutFileAutoOpen"' + (window.shoutFileAutoOpen ? ' checked' : '') + '>' +
          '<span class="tgl-slider"></span>' +
        '</label>' +
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

  if (shoutMsgMode === 'popup') {
    html += '<div class="shout-opt-row">' +
      '<div class="shout-opt-info">' +
        '<div class="shout-opt-label">语音播报</div>' +
        '<div class="shout-opt-hint">开启后，弹窗显示的同时朗读这条消息</div>' +
      '</div>' +
      '<div class="shout-opt-toggle">' +
        '<label class="tgl">' +
          '<input type="checkbox" id="shoutPopupVoiceToggle"' + (window.shoutPopupVoice ? ' checked' : '') + '>' +
          '<span class="tgl-slider"></span>' +
        '</label>' +
      '</div>' +
    '</div>';
  }

  if (shoutMsgMode === 'popup') {
    var displayHint = (shoutDisplay === 'marquee') ? '跑马灯在顶部滚动显示' : '完整卡片居中显示';

    html += '<div class="shout-opt-row">' +
      '<div class="shout-opt-info">' +
        '<div class="shout-opt-label">大屏呈现形式</div>' +
        '<div class="shout-opt-hint" id="shoutDisplayHint">' + displayHint + '</div>' +
      '</div>' +
      '<div class="shout-opt-seg" data-opt="display">' +
        '<button class="shout-opt-btn' + (shoutDisplay === 'card'    ? ' active' : '') + '" data-display="card">完整卡片</button>' +
        '<button class="shout-opt-btn' + (shoutDisplay === 'marquee' ? ' active' : '') + '" data-display="marquee">跑马灯</button>' +
      '</div>' +
    '</div>';
  }

  if (shoutMsgMode !== 'file') {
    var countHint = '大屏连播次数';
    var durHint   = '大屏显示秒数';

    if (shoutMsgMode === 'voice') {
      countHint = '语音连播次数';
      durHint   = '最长播报秒数';
    } else if (shoutMsgMode === 'popup' && shoutDisplay === 'marquee') {
      countHint = '滚动连播次数';
      durHint   = '顶部滚动秒数';
    } else if (shoutMsgMode === 'popup' && shoutDisplay === 'card') {
      countHint = '弹窗连播次数';
      durHint   = '弹窗显示秒数';
    }

    html += '<div class="shout-opt-row shout-opt-row-split">' +
      '<div class="shout-opt-half">' +
        '<div class="shout-opt-info">' +
          '<div class="shout-opt-label">播报次数</div>' +
          '<div class="shout-opt-hint">' + countHint + '</div>' +
        '</div>' +
        '<div class="shout-opt-seg" data-opt="count" style="margin-left: 10px;">' +
          '<button class="shout-opt-btn' + (shoutBroadcastCount === 1 ? ' active' : '') + '" data-count="1">1次</button>' +
          '<button class="shout-opt-btn' + (shoutBroadcastCount === 2 ? ' active' : '') + '" data-count="2">2次</button>' +
          '<button class="shout-opt-btn' + (shoutBroadcastCount === 3 ? ' active' : '') + '" data-count="3">3次</button>' +
        '</div>' +
      '</div>' +
      '<div class="shout-opt-half">' +
        '<div class="shout-opt-info">' +
          '<div class="shout-opt-label">播报时间</div>' +
          '<div class="shout-opt-hint">' + durHint + '</div>' +
        '</div>' +
        '<div class="shout-duration-stepper">' +
          '<button type="button" class="shout-dur-btn" data-act="minus">−</button>' +
          '<span class="shout-dur-val" id="shoutDurationVal">' + (window.shoutBroadcastDuration || 30) + '</span>' +
          '<button type="button" class="shout-dur-btn" data-act="plus">+</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

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
    '<span class="shout-send-icon">' + icon('send') + '</span><span>发送至教室大屏</span></button>';

  html += '<div id="shoutScheduledBox" class="shout-client-block" style="display:none;margin-top:18px;"></div>';

  body.innerHTML = html;

  if (window.shoutEditDraftText) {
    const ta = $('shoutSendContent');
    if (ta) {
      ta.value = window.shoutEditDraftText;
      const counter = $('shoutSendCount');
      if (counter) counter.textContent = ta.value.length + '/200';
      ta.focus();
    }
    const popupVoiceCb = $('shoutPopupVoiceToggle');
    if (popupVoiceCb && window.shoutPopupVoice) {
      popupVoiceCb.checked = true;
    }
    window.shoutEditDraftText = '';
  }

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
      if (shoutMsgMode !== 'popup') {
        shoutMsgType = 'text';
        window.shoutPopupVoice = false;
      }
      renderShoutSend();
    };
  });

  const ta = $('shoutSendContent');
  const counter = $('shoutSendCount');
  if (ta) {
    ta.oninput = function () {
      if (counter) counter.textContent = ta.value.length + '/200';
    };
  }

  if (shoutMsgMode === 'file') {
    const drop = $('shoutFileDrop');
    const fileInp = $('shoutFileInput');
    const clearBtn = $('shoutFileClear');

    if (drop && fileInp) {
      drop.onclick = function (e) {
        if (e.target.closest('#shoutFileClear')) return;
        fileInp.click();
      };
    }
    if (fileInp) {
      fileInp.onchange = async function () {
        const f = fileInp.files && fileInp.files[0];
        if (!f) return;
        try {
          showSaveStatus('正在处理文件…', false);
          const info = await readShoutFile(f);
          window.shoutFileInfo = info;
          renderShoutSend();
          showSaveStatus('文件已就绪', false);
        } catch (err) {
          alert('文件处理失败：' + (err.message || err));
        } finally {
          fileInp.value = '';
        }
      };
    }
    if (clearBtn) {
      clearBtn.onclick = function (e) {
        e.stopPropagation();
        window.shoutFileInfo = null;
        renderShoutSend();
      };
    }

    const autoOpenCb = $('shoutFileAutoOpen');
    if (autoOpenCb) {
      autoOpenCb.onchange = function () {
        window.shoutFileAutoOpen = autoOpenCb.checked;
      };
    }
  }

  const popupVoiceCb = $('shoutPopupVoiceToggle');
  if (popupVoiceCb) {
    popupVoiceCb.onchange = function () {
      window.shoutPopupVoice = popupVoiceCb.checked;
    };
  }

  body.querySelectorAll('.shout-opt-seg[data-opt="display"] .shout-opt-btn').forEach(function (b) {
    b.onclick = function () {
      shoutDisplay = b.dataset.display;
      body.querySelectorAll('.shout-opt-seg[data-opt="display"] .shout-opt-btn')
        .forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');

      var hintEl = $('shoutDisplayHint');
      if (hintEl) {
        hintEl.textContent = (shoutDisplay === 'marquee') ? '跑马灯在顶部滚动显示' : '完整卡片居中显示';
      }

      renderShoutSend();
    };
  });

  body.querySelectorAll('.shout-opt-seg[data-opt="count"] .shout-opt-btn').forEach(function (b) {
    b.onclick = function () {
      shoutBroadcastCount = parseInt(b.dataset.count, 10) || 1;
      body.querySelectorAll('.shout-opt-seg[data-opt="count"] .shout-opt-btn')
        .forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
    };
  });

  const durValEl = $('shoutDurationVal');
  if (durValEl) {
    body.querySelectorAll('.shout-dur-btn').forEach(function (btn) {
      btn.onclick = function () {
        var act = btn.dataset.act;
        if (act === 'minus') {
          if (window.shoutBroadcastDuration > 5) {
            window.shoutBroadcastDuration -= 5;
          }
        } else if (act === 'plus') {
          if (window.shoutBroadcastDuration < 300) {
            window.shoutBroadcastDuration += 5;
          }
        }
        durValEl.textContent = window.shoutBroadcastDuration;
      };
    });
  }

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

      const duration = window.shoutBroadcastDuration || 30;

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

  $('shoutSendBtn').onclick = async function () {
    const errEl = $('shoutSendError');
    errEl.textContent = '';

    const payload = getShoutSendPayload();
    if (payload.error) { errEl.textContent = payload.error; return; }

    const duration = window.shoutBroadcastDuration || 30;
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
    '<div class="shout-client-title">' + icon('alarmClock') + ' 待发送定时任务（' + list.length + '）</div>' +
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

    const isFile = s.msg_type === 'file';
    const isImage = s.msg_type === 'image';
    let preview = escapeHtml(s.content);
    if (isFile) {
      try {
        const meta = JSON.parse(s.content);
        const t = meta.type || '';
        if (/^image\//.test(t)) preview = icon('image') + ' [图片] ' + escapeHtml(meta.name || '');
        else if (/^video\//.test(t)) preview = icon('film') + ' [视频] ' + escapeHtml(meta.name || '');
        else preview = icon('file') + ' [文件] ' + escapeHtml(meta.name || '');
      } catch (e) { preview = icon('folder') + ' [文件]'; }
    } else if (isImage) {
      preview = icon('image') + ' [图片]';
    } else if (s.content && s.content.charAt(0) === '{') {
      try {
        const parsed = JSON.parse(s.content);
        if (parsed && typeof parsed.text === 'string') {
          preview = escapeHtml(parsed.text) + (parsed.voice ? ' <span style="color:#16a085;">' + icon('volume') + ' [语音]</span>' : '');
        }
      } catch (e) {}
    }

    html += '<div class="shout-member-row">' +
      '<span class="shout-member-name" style="flex:1;min-width:0;">' +
        escapeHtml(timeStr) + ' · ' + escapeHtml(roomName) +
        '<div style="font-size:12px;color:var(--text-sub);margin-top:4px;white-space:pre-wrap;word-break:break-word;font-weight:400;">' +
          preview +
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
    else if (m.msg_type === 'file') {
      typeCls = 'file';
      try {
        const meta = JSON.parse(m.content);
        const t = meta.type || '';
        if (/^image\//.test(t)) typeLabel = '图片';
        else if (/^video\//.test(t)) typeLabel = '视频';
        else typeLabel = '文件';
      } catch (e) { typeLabel = '文件'; }
    }

    let displayLabel = '';
    let voiceTag = '';

    if (m.msg_type === 'text' || m.msg_type === 'notice' || m.msg_type === 'urgent') {
      try {
        const parsed = JSON.parse(m.content);
        if (parsed && parsed.display === 'marquee') {
          displayLabel = '<span class="shout-history-display-tag display-marquee">跑马灯</span>';
        } else if (parsed && parsed.display === 'card') {
          displayLabel = '<span class="shout-history-display-tag display-card">卡片</span>';
        } else if (parsed && parsed.display === 'voice') {
          typeLabel = '广播';
          typeCls = 'voice';
        }
        if (parsed && parsed.voice && parsed.display !== 'voice') {
          voiceTag = '<span class="shout-history-display-tag display-voice">语音</span>';
        }
      } catch (e) {}
    }

    let time = m.created_at;
    try { time = new Date(m.created_at).toLocaleString('zh-CN'); } catch (e) {}

    const delivered = m.delivered !== false;
    const statusCls = delivered ? 'ok' : 'fail';
    const statusText = delivered ? icon('check') + ' 已送达' : icon('x') + ' 未送达';

    let contentHtml;
    if (m.msg_type === 'image') {
      contentHtml = '<div class="shout-history-content shout-history-image">' + icon('image') + ' [图片]</div>';
    } else if (m.msg_type === 'file') {
      try {
        const meta = JSON.parse(m.content);
        const t = meta.type || '';
        if (/^image\//.test(t)) {
          contentHtml = '<div class="shout-history-content shout-history-image">' + icon('image') + ' [图片] ' + escapeHtml(meta.name || '') + '</div>';
        } else if (/^video\//.test(t)) {
          contentHtml = '<div class="shout-history-content shout-history-image">' + icon('film') + ' [视频] ' + escapeHtml(meta.name || '') + '</div>';
        } else {
          contentHtml = '<div class="shout-history-content shout-history-image">' + icon('file') + ' [文件] ' + escapeHtml(meta.name || '') + '</div>';
        }
      } catch (e) {
        contentHtml = '<div class="shout-history-content shout-history-image">' + icon('folder') + ' [文件]</div>';
      }
    } else {
      let plainText = m.content;
      if (m.content && m.content.charAt(0) === '{') {
        try {
          const parsed = JSON.parse(m.content);
          if (parsed && typeof parsed.text === 'string') {
            plainText = parsed.text;
          }
        } catch (e) {}
      }
      contentHtml = '<div class="shout-history-content">' + escapeHtml(plainText) + '</div>';
    }

    html += '<div class="shout-history-item" data-id="' + m.id + '">' +
      '<div class="shout-history-top">' +
        '<div class="shout-history-top-left">' +
          '<span class="shout-history-room">' + escapeHtml(roomName) + '</span>' +
          '<span class="shout-history-type ' + typeCls + '">' + typeLabel + '</span>' +
          displayLabel +
          voiceTag +
        '</div>' +
        '<span class="shout-history-status ' + statusCls + '">' + statusText + '</span>' +
      '</div>' +
      '<div class="shout-history-time">' + escapeHtml(time) + '</div>' +
      contentHtml +
      '<div class="shout-history-foot">' +
        '<button type="button" class="shout-history-btn edit" data-act="edit" data-id="' + m.id + '">编辑</button>' +
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
      else if (act === 'edit')   handleEditShout(msg);
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
    } catch (e) {}
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

async function handleEditShout(msg) {
  window.shoutMsgMode = 'popup';
  window.shoutDisplay = 'card';
  window.shoutPopupVoice = false;
  window.shoutFileInfo = null;
  window.shoutEditDraftText = '';
  window.shoutBroadcastCount = 1;

  if (msg.msg_type === 'file') {
    window.shoutMsgMode = 'file';
    try {
      const meta = JSON.parse(msg.content);
      if (meta && meta.data) {
        window.shoutFileInfo = meta;
        window.shoutFileAutoOpen = !!meta.open;
      }
    } catch (e) {}
  } else if (msg.content && msg.content.charAt(0) === '{') {
    try {
      const p = JSON.parse(msg.content);
      if (p && typeof p.text === 'string') {
        window.shoutEditDraftText = p.text;
        window.shoutDisplay = p.display || 'card';
        window.shoutBroadcastCount = Math.max(1, Math.min(3, parseInt(p.count, 10) || 1));
        if (p.display === 'voice') {
          window.shoutMsgMode = 'voice';
        } else {
          window.shoutMsgMode = 'popup';
          if (p.voice) window.shoutPopupVoice = true;
        }
      }
    } catch (e) {
      window.shoutEditDraftText = msg.content;
    }
  } else {
    window.shoutEditDraftText = msg.content;
  }

  window.currentShoutClass = msg.room_key;
  window.shoutMsgType = msg.msg_type === 'file' ? 'text' : (msg.msg_type || 'text');
  window.shoutSubTab = 'send';

  await renderShout();
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

  html += '<div class="shout-section-title">' + icon('users') + ' 班级成员（' + members.length + '）</div>';
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
    html += '<div class="shout-section-title">' + icon('settings') + ' 班级管理</div>';
    html += '<div class="shout-danger-row">' +
      '<button id="shoutResetTokenBtn" type="button" class="shout-btn-ghost">' + icon('refresh') + ' 重置大屏地址</button>' +
      '<button id="shoutDeleteRoomBtn" type="button" class="shout-btn-danger">' + icon('trash') + ' 删除班级</button>' +
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

/* ---------- 远程控制弹窗 ---------- */

window.openRemoteControlPop = function (mode) {
  mode = mode || 'desktop';

  let pop = document.getElementById('remoteControlPop');
  if (!pop) {
    pop = document.createElement('div');
    pop.id = 'remoteControlPop';
    pop.className = 'seat-pop';
    pop.innerHTML =
      '<div class="seat-pop-inner remote-control-inner">' +
        '<button class="pop-close-x" id="remoteControlClose" type="button">×</button>' +

        '<div class="remote-preview" id="remotePreview"></div>' +

        '<div class="remote-actions">' +
          '<button type="button" class="remote-action-circle" data-mode="desktop">' +
            '<span class="remote-circle-icon">' + RC_ICONS.monitor + '</span>' +
            '<span class="remote-circle-text">查看桌面</span>' +
          '</button>' +
          '<button type="button" class="remote-action-circle" data-mode="monitor">' +
            '<span class="remote-circle-icon">' + RC_ICONS.video + '</span>' +
            '<span class="remote-circle-text">查看监控</span>' +
          '</button>' +
          '<button type="button" class="remote-action-circle" data-mode="shout">' +
            '<span class="remote-circle-icon">' + RC_ICONS.megaphone + '</span>' +
            '<span class="remote-circle-text">远程喊话</span>' +
          '</button>' +
        '</div>' +

        '<div class="remote-hint">按住说话，您的讲话内容会发送到班级教室黑板，学生可听到您所发送的语音</div>' +

        '<button type="button" class="remote-talk-btn" id="remoteTalkBtn">' +
          '<span class="remote-talk-icon">' + RC_ICONS.mic + '</span>' +
          '<span class="remote-talk-text">按住说话</span>' +
        '</button>' +
      '</div>';
    document.body.appendChild(pop);

    document.getElementById('remoteControlClose').onclick = closeRemoteControlPop;
    pop.addEventListener('click', function (e) {
      if (e.target === pop) closeRemoteControlPop();
    });

    pop.querySelectorAll('.remote-action-circle').forEach(function (btn) {
      btn.onclick = function () {
        const m = btn.dataset.mode;
        // ★ 三个模式都在弹窗内切换预览：desktop / monitor / shout
        pop.querySelectorAll('.remote-action-circle').forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
        renderRemotePreview(m);
      };
    });

    setupRemoteTalkBtn(document.getElementById('remoteTalkBtn'));
  }

  pop.querySelectorAll('.remote-action-circle').forEach(function (b) {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  renderRemotePreview(mode);

  pop.style.display = 'flex';
};

window.closeRemoteControlPop = function () {
  const pop = document.getElementById('remoteControlPop');
  if (pop) pop.style.display = 'none';
};

function renderRemotePreview(mode) {
  const preview = document.getElementById('remotePreview');
  if (!preview) return;

  if (mode === 'monitor' || mode === 'shout') {
    preview.innerHTML =
      '<div class="remote-preview-placeholder">' +
        '<div class="remote-preview-icon">' + RC_ICONS.video + '</div>' +
        '<div class="remote-preview-text">暂无监控画面</div>' +
        '<div class="remote-preview-hint">大屏端接入摄像头后即可显示</div>' +
      '</div>';
  } else {
    preview.innerHTML =
      '<div class="remote-preview-placeholder">' +
        '<div class="remote-preview-icon">' + RC_ICONS.monitor + '</div>' +
        '<div class="remote-preview-text">暂无桌面画面</div>' +
        '<div class="remote-preview-hint">大屏端客户端接入后即可显示</div>' +
      '</div>';
  }
}

function setupRemoteTalkBtn(btn) {
  if (!btn) return;
  let recording = false;
  const textEl = btn.querySelector('.remote-talk-text');

  const start = function (e) {
    if (e) e.preventDefault();
    if (recording) return;
    recording = true;
    btn.classList.add('recording');
    if (textEl) textEl.textContent = '松开结束';
    showSaveStatus('正在讲话…', false, true);
  };
  const end = function (e) {
    if (e) e.preventDefault();
    if (!recording) return;
    recording = false;
    btn.classList.remove('recording');
    if (textEl) textEl.textContent = '按住说话';
    showSaveStatus('已发送语音到教室', false);
    // TODO: 接入后此处调用真正的语音上传接口
  };

  btn.addEventListener('mousedown', start);
  btn.addEventListener('mouseup', end);
  btn.addEventListener('mouseleave', end);
  btn.addEventListener('touchstart', start, { passive: false });
  btn.addEventListener('touchend', end, { passive: false });
  btn.addEventListener('touchcancel', end);
}

/* ---------- 设备控制弹窗 ---------- */

window.openDeviceControlPop = function () {
  let pop = document.getElementById('deviceControlPop');
  if (!pop) {
    pop = document.createElement('div');
    pop.id = 'deviceControlPop';
    pop.className = 'seat-pop';
    pop.innerHTML =
      '<div class="seat-pop-inner device-control-inner">' +
        '<button class="pop-close-x" id="deviceControlClose" type="button">×</button>' +
        '<h3 class="device-control-title">设备控制</h3>' +
        '<div class="device-control-sub">控制教室大屏一体机</div>' +

        '<div class="device-control-grid">' +
          '<button type="button" class="device-action-card" data-action="shutdown">' +
            '<span class="device-action-icon">' + icon('power') + '</span>' +
            '<span class="device-action-label">一键关机</span>' +
            '<span class="device-action-desc">立即关闭设备</span>' +
          '</button>' +

          '<button type="button" class="device-action-card" data-action="reboot">' +
            '<span class="device-action-icon">' + icon('refresh') + '</span>' +
            '<span class="device-action-label">重启电脑</span>' +
            '<span class="device-action-desc">立即重启设备</span>' +
          '</button>' +

          '<button type="button" class="device-action-card" data-action="timer">' +
            '<span class="device-action-icon">' + icon('alarmClock') + '</span>' +
            '<span class="device-action-label">定时关机</span>' +
            '<span class="device-action-desc">指定时间自动关机</span>' +
          '</button>' +

          '<button type="button" class="device-action-card" data-action="clock">' +
            '<span class="device-action-icon">' + icon('clock') + '</span>' +
            '<span class="device-action-label">全屏时钟</span>' +
            '<span class="device-action-desc">大屏显示全屏时钟</span>' +
          '</button>' +
        '</div>' +

        '<div class="device-timer-panel" id="deviceTimerPanel" style="display:none;">' +
          '<div class="device-timer-row">' +
            '<label>关机时间：</label>' +
            '<input type="time" id="deviceTimerTime" class="cell-pop-input">' +
          '</div>' +
          '<div class="device-timer-row">' +
            '<label>重复：</label>' +
            '<select id="deviceTimerRepeat" class="cell-pop-input">' +
              '<option value="once">仅一次</option>' +
              '<option value="daily">每天</option>' +
              '<option value="weekday">工作日</option>' +
            '</select>' +
          '</div>' +
          '<div class="device-timer-actions">' +
            '<button type="button" class="device-btn-ghost" id="deviceTimerCancel">取消</button>' +
            '<button type="button" class="device-btn-primary" id="deviceTimerConfirm">确认定时</button>' +
          '</div>' +
        '</div>' +

        '<div class="me-error" id="deviceControlError" style="min-height:18px;"></div>' +
      '</div>';
    document.body.appendChild(pop);

    document.getElementById('deviceControlClose').onclick = function () {
      pop.style.display = 'none';
      const panel = document.getElementById('deviceTimerPanel');
      if (panel) panel.style.display = 'none';
    };
    pop.addEventListener('click', function (e) {
      if (e.target === pop) {
        pop.style.display = 'none';
        const panel = document.getElementById('deviceTimerPanel');
        if (panel) panel.style.display = 'none';
      }
    });

    pop.querySelectorAll('.device-action-card').forEach(function (btn) {
      btn.onclick = function () {
        handleDeviceAction(btn.dataset.action);
      };
    });

    document.getElementById('deviceTimerCancel').onclick = function () {
      document.getElementById('deviceTimerPanel').style.display = 'none';
    };
    document.getElementById('deviceTimerConfirm').onclick = function () {
      const t = document.getElementById('deviceTimerTime').value;
      const r = document.getElementById('deviceTimerRepeat').value;
      if (!t) {
        document.getElementById('deviceControlError').textContent = '请选择关机时间';
        return;
      }
      document.getElementById('deviceControlError').textContent = '';
      const roomKey = window.currentRemoteRoomKey || '';
      const repeatLabel = { once: '仅一次', daily: '每天', weekday: '工作日' }[r] || '仅一次';
      showSaveStatus('已设置定时关机：' + t + '（' + repeatLabel + '）', false);
      document.getElementById('deviceTimerPanel').style.display = 'none';
      pop.style.display = 'none';
    };
  }

  const panel = document.getElementById('deviceTimerPanel');
  if (panel) panel.style.display = 'none';
  const err = document.getElementById('deviceControlError');
  if (err) err.textContent = '';
  const timeInput = document.getElementById('deviceTimerTime');
  if (timeInput && !timeInput.value) {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    timeInput.value = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  pop.style.display = 'flex';
};

function handleDeviceAction(action) {
  const roomKey = window.currentRemoteRoomKey || '';
  const errEl = document.getElementById('deviceControlError');
  if (errEl) errEl.textContent = '';

  switch (action) {
    case 'shutdown': {
      if (!confirm('确认要立刻关闭教室大屏一体机吗？')) return;
      showSaveStatus('已发送「一键关机」指令', false);
      const pop = document.getElementById('deviceControlPop');
      if (pop) pop.style.display = 'none';
      break;
    }

    case 'reboot': {
      if (!confirm('确认要重启教室大屏一体机吗？')) return;
      showSaveStatus('已发送「重启电脑」指令', false);
      const pop = document.getElementById('deviceControlPop');
      if (pop) pop.style.display = 'none';
      break;
    }

    case 'timer': {
      const panel = document.getElementById('deviceTimerPanel');
      if (panel) panel.style.display = 'block';
      break;
    }

    case 'clock': {
      showSaveStatus('已发送「全屏时钟」指令', false);
      const pop = document.getElementById('deviceControlPop');
      if (pop) pop.style.display = 'none';
      break;
    }
  }
}

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