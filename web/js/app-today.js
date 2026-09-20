/* ============================================================
   app-today.js —— 今天模块
   功能：
   - 「今日课程」和「今日考勤」两张独立卡片
   - 考勤统计格子可点击，弹出该状态的学生名单
   - 「第几周 · 周几」下拉选择器（周末显示）
   - 手动选择仅当天有效，第二天自动恢复「跟随今天」
   ============================================================ */

/* 今日考勤明细缓存（供点击查看用） */
window._todayAttDetail = {
  classId: '',
  date: '',
  className: '',
  records: []
};

/* 手动选择查看：周次 + 周几
   - currentTodayManualWeek: 0=跟随当月周；1~4=指定周
   - currentTodayManualDay:  -1=跟随今天；1~5=指定周几
   ★ 持久化到 localStorage，但仅当天有效 */
window.currentTodayManualWeek = 0;
window.currentTodayManualDay = -1;

(function loadTodayManual() {
  try {
    const raw = localStorage.getItem('kebiao_today_manual_day');
    if (!raw) return;
    const obj = JSON.parse(raw);
    const today = new Date().toISOString().slice(0, 10);
    if (obj && obj.date === today && typeof obj.day === 'number') {
      window.currentTodayManualDay = obj.day;
      window.currentTodayManualWeek = obj.week || 0;
    } else {
      localStorage.removeItem('kebiao_today_manual_day');
    }
  } catch (e) { /* 忽略 */ }
})();

window.saveTodayManual = function (day, week) {
  window.currentTodayManualDay = day;
  window.currentTodayManualWeek = (typeof week === 'number') ? week : 0;
  try {
    if (day === -1 && !window.currentTodayManualWeek) {
      localStorage.removeItem('kebiao_today_manual_day');
    } else {
      const today = new Date().toISOString().slice(0, 10);
      localStorage.setItem('kebiao_today_manual_day', JSON.stringify({
        date: today,
        day: day,
        week: window.currentTodayManualWeek
      }));
    }
  } catch (e) { /* 忽略 */ }
};

/* 返回当前实际用于渲染课程的天：
   - 用户手动选过：返回选中的天（1~5）
   - 否则：跟随今天 */
window.getTodayEffectiveDay = function () {
  if (window.currentTodayManualDay >= 1 && window.currentTodayManualDay <= 5) {
    return window.currentTodayManualDay;
  }
  return new Date().getDay();
};

/* 返回当前实际用于渲染课服的周次（1~4） */
window.getTodayEffectiveWeek = function () {
  if (window.currentTodayManualWeek >= 1 && window.currentTodayManualWeek <= 4) {
    return window.currentTodayManualWeek;
  }
  return (typeof getWeekOfMonth === 'function') ? getWeekOfMonth() : 1;
};

window.renderToday = function () {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dateStr = yyyy + '-' + mm + '-' + dd;
  const wd = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];

  // 校验：如果当前选中的班级已被删除，重置为"全部"
  if (currentTodayClass !== 'all' && !classes.find(c => c.class_id === currentTodayClass)) {
    currentTodayClass = 'all';
    localStorage.setItem('kebiao_today_class', 'all');
  }

  // 今日课程筛选：全部 + 每个班级
  const classFilterOptions =
    '<option value="all">全部班级</option>' +
    classes.map(c =>
      '<option value="' + escapeHtml(c.class_id) + '">' + escapeHtml(c.name) + '</option>'
    ).join('');

  // 今日考勤选择班级
  const classOptions = classes.map(c =>
    '<option value="' + escapeHtml(c.class_id) + '">' + escapeHtml(c.name) + '</option>'
  ).join('');

  todayContainer.innerHTML =
    '<div class="me-page">' +

      // ===== 卡片 1：日期 + 今日课程 =====
      '<div class="me-card">' +
        '<div class="today-date">' + yyyy + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日 星期' + wd + '</div>' +
        '<div class="today-section" style="margin-bottom:0;">' +
          '<div class="today-section-header">' +
            '<h4>📚 今日课程</h4>' +
            '<div class="today-header-controls">' +
              '<div id="todayWeekdayPicker" class="today-weekday-picker" style="display:none;"></div>' +
              '<select id="todayClassFilter" class="cell-pop-input today-grade-filter">' + classFilterOptions + '</select>' +
            '</div>' +
          '</div>' +
          '<div id="todayClasses" class="today-course-list">' + renderTodayCourses(getTodayEffectiveDay(), getTodayEffectiveWeek()) + '</div>' +
        '</div>' +
      '</div>' +

      // ===== 卡片 2：今日考勤 =====
      '<div class="me-card" style="margin-top:20px;">' +
        '<div class="today-section" style="margin-bottom:0;">' +
          '<div class="today-section-header">' +
            '<h4>✅ 今日考勤</h4>' +
            '<select id="todayAttendanceClass" class="cell-pop-input today-grade-filter">' +
              (classOptions || '<option value="">（暂无班级）</option>') +
            '</select>' +
          '</div>' +
          '<div id="todayAttendanceSummary" class="today-summary"><div class="today-empty">选择班级后查看今日考勤</div></div>' +
        '</div>' +
      '</div>' +

    '</div>';

  // 绑定班级筛选
  const classSel = $('todayClassFilter');
  if (classSel) {
    classSel.value = currentTodayClass;
    classSel.onchange = () => {
      currentTodayClass = classSel.value;
      localStorage.setItem('kebiao_today_class', currentTodayClass);
      const listEl = $('todayClasses');
      if (listEl) listEl.innerHTML = renderTodayCourses(getTodayEffectiveDay(), getTodayEffectiveWeek());
    };
  }

  const sel = $('todayAttendanceClass');
  if (sel && classes.length > 0) {
    sel.onchange = () => loadTodayAttendanceSummary(sel.value, dateStr);
    loadTodayAttendanceSummary(classes[0].class_id, dateStr);
  }

  // ★ 周末显示「手动选择查看某天」下拉框
  if (now.getDay() === 0 || now.getDay() === 6) {
    renderTodayWeekdayPicker();
  }
};

window.renderTodayCourses = function (wd, week) {
  if (wd === 0 || wd === 6) return '<div class="today-empty">周末无课程安排 🎉</div>';
  if (classes.length === 0) return '<div class="today-empty">暂无班级</div>';

  // 按班级筛选
  let list = classes;
  if (currentTodayClass !== 'all') {
    list = classes.filter(c => c.class_id === currentTodayClass);
  }
  if (list.length === 0) return '<div class="today-empty">该班级不存在</div>';

  // ★ 当前是月内第几周（供课服使用）
  const curWeek = (week && week >= 1 && week <= 4)
    ? week
    : ((typeof getWeekOfMonth === 'function') ? getWeekOfMonth() : 1);

  let html = '';
  list.forEach(cls => {
    const lessons = [];
    const periodCount = (cls.period_count && cls.period_count > 0) ? cls.period_count : defaultPeriods.length;
    for (let pIdx = 0; pIdx < periodCount; pIdx++) {
      // ★ 判断这一节是不是"课服"
      const isCS = (typeof isClassServicePeriod === 'function')
        ? isClassServicePeriod(cls, pIdx)
        : false;

      const baseIdx = pIdx * 6 + (wd - 1) + 1;
      // ★ 课服按当前周读取对应 slot
      const idx = isCS ? (baseIdx + (curWeek - 1) * 100) : baseIdx;

      const key = cls.class_id + '_cell_' + idx;
      const cell = cellData[key];

      const pKey = cls.class_id + '_cell_' + (pIdx * 6);
      const pCell = cellData[pKey];
      let pName = (pCell && pCell.period_name) || (defaultPeriods[pIdx] && defaultPeriods[pIdx].name) || ('第' + (pIdx + 1) + '节');
      const pTime = (pCell && pCell.period_time) || (defaultPeriods[pIdx] && defaultPeriods[pIdx].time) || '';

      // ★ 课服节次名后追加「 · 第N周」
      if (isCS) pName = pName + ' · 第' + curWeek + '周';

      if (cell && cell.cell_type === 'lesson' && cell.subject) {
        lessons.push({ pName: pName, pTime: pTime, subject: cell.subject, teacher: cell.teacher || '' });
      }
    }
    html += '<div class="today-class-block">';
    html += '<div class="today-class-name">' + escapeHtml(cls.name) + '</div>';
    if (lessons.length === 0) {
      html += '<div class="today-empty">今日无课程</div>';
    } else {
      html += '<ul class="today-course-ul">';
      lessons.forEach(l => {
        html += '<li><span class="tc-time">' + escapeHtml(l.pName) + ' ' + escapeHtml(l.pTime) + '</span>' +
                '<span class="tc-subj">' + escapeHtml(l.subject) + '</span>' +
                (l.teacher ? '<span class="tc-tchr">' + escapeHtml(l.teacher) + '</span>' : '') +
                '</li>';
      });
      html += '</ul>';
    }
    html += '</div>';
  });
  return html;
};

/* ---------- 周末手动选「第几周 · 周几」（下拉框） ---------- */
window.renderTodayWeekdayPicker = function () {
  const box = document.getElementById('todayWeekdayPicker');
  if (!box) return;
  box.style.display = 'flex';

  const DAYS = ['周一', '周二', '周三', '周四', '周五'];
  const isFollow = (window.currentTodayManualDay === -1) && (!window.currentTodayManualWeek);

  let html = '<select id="todayWeekdaySelect" class="cell-pop-input today-weekday-select">';
  html += '<option value="0-0"' + (isFollow ? ' selected' : '') + '>跟随今天</option>';

  for (let w = 1; w <= 4; w++) {
    for (let d = 1; d <= 5; d++) {
      const val = w + '-' + d;
      const label = '第' + w + '周 · ' + DAYS[d - 1];
      const sel = (window.currentTodayManualWeek === w && window.currentTodayManualDay === d);
      html += '<option value="' + val + '"' + (sel ? ' selected' : '') + '>' + label + '</option>';
    }
  }
  html += '</select>';

  box.innerHTML = html;

  const sel = document.getElementById('todayWeekdaySelect');
  if (sel) {
    sel.onchange = () => {
      const v = sel.value;
      if (v === '0-0') {
        saveTodayManual(-1, 0);
      } else {
        const parts = v.split('-');
        const w = parseInt(parts[0], 10);
        const d = parseInt(parts[1], 10);
        saveTodayManual(d, w);
      }
      const listEl = document.getElementById('todayClasses');
      if (listEl) listEl.innerHTML = renderTodayCourses(getTodayEffectiveDay(), getTodayEffectiveWeek());
    };
  }
};

/* ---------- 今日考勤汇总 ---------- */
window.loadTodayAttendanceSummary = async function (classId, date) {
  const el = document.getElementById('todayAttendanceSummary');
  if (!el) return;
  if (!classId) { el.textContent = '请选择班级'; return; }
  el.innerHTML = '<div class="today-empty">加载中...</div>';
  try {
    const [sum, detail] = await Promise.all([
      API.attendanceSummary(classId, date),
      API.listAttendance(classId, date).catch(() => ({ records: [] }))
    ]);

    const cls = classes.find(c => c.class_id === classId);
    window._todayAttDetail = {
      classId: classId,
      date: date,
      className: cls ? cls.name : classId,
      records: (detail && detail.records) || []
    };

    if (!sum || sum.total === 0) {
      el.innerHTML = '<div class="today-empty">今日暂无考勤记录</div>';
      return;
    }

    el.innerHTML =
      '<div class="today-summary-grid">' +
        _attSummaryCell('应到', sum.total, '',      '__all__') +
        _attSummaryCell('出勤', sum.present, 'ok',   '出勤') +
        _attSummaryCell('迟到', sum.late,    'warn', '迟到') +
        _attSummaryCell('请假', sum.leave,   'info', '请假') +
        _attSummaryCell('缺勤', sum.absent,  'bad',  '缺勤') +
      '</div>';

    el.querySelectorAll('[data-att-status]').forEach(node => {
      node.onclick = () => window.showTodayAttendanceDetail(node.dataset.attStatus);
    });
  } catch (e) {
    el.innerHTML = '<div class="today-empty">加载失败</div>';
  }
};

/* 生成一个可点击的统计格子 */
function _attSummaryCell(label, num, cls, status) {
  return '<div class="' + (cls || '') + '" data-att-status="' + status + '" ' +
         'style="cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent;" ' +
         'title="点击查看' + label + '学生名单">' +
           '<span class="num">' + num + '</span>' +
           '<span class="lbl">' + label + '</span>' +
         '</div>';
}

/* ---------- 点击格子 → 弹出学生明细 ---------- */
window.showTodayAttendanceDetail = function (status) {
  const detail = window._todayAttDetail || {};
  const all = detail.records || [];

  let list, title;
  if (status === '__all__') {
    list = all.slice();
    title = '全部记录';
  } else {
    list = all.filter(r => r.status === status);
    title = status;
  }
  list.sort((a, b) => (a.student_name || '').localeCompare(b.student_name || '', 'zh-CN'));

  // 首次调用时创建弹窗，之后复用
  let pop = document.getElementById('todayAttDetailPop');
  if (!pop) {
    pop = document.createElement('div');
    pop.id = 'todayAttDetailPop';
    pop.className = 'seat-pop';
    pop.innerHTML =
      '<div class="seat-pop-inner" style="min-width:320px;max-width:92vw;">' +
        '<button class="pop-close-x" id="todayAttDetailClose" type="button">×</button>' +
        '<h3 id="todayAttDetailTitle">考勤明细</h3>' +
        '<div id="todayAttDetailBody" style="max-height:60vh;overflow:auto;margin-top:10px;"></div>' +
      '</div>';
    document.body.appendChild(pop);
    pop.addEventListener('click', e => { if (e.target === pop) pop.style.display = 'none'; });
    pop.querySelector('#todayAttDetailClose').onclick = () => { pop.style.display = 'none'; };
  }

  const mainName = detail.className || '';
  const subInfo =
    (detail.date ? ' · ' + detail.date : '') +
    ' · ' + title + '（' + list.length + '人）';
  pop.querySelector('#todayAttDetailTitle').innerHTML =
    escapeHtml(mainName) +
    '<span class="today-att-sub">' + escapeHtml(subInfo) + '</span>';

  const body = pop.querySelector('#todayAttDetailBody');
  if (list.length === 0) {
    body.innerHTML = '<div class="today-empty">没有该状态的学生</div>';
  } else {
    body.innerHTML =
      '<table class="rank-table">' +
        '<thead><tr>' +
          '<th style="width:48px;">#</th>' +
          '<th>姓名</th>' +
          '<th style="width:70px;">状态</th>' +
          '<th>备注</th>' +
        '</tr></thead>' +
        '<tbody>' +
        list.map((r, i) => {
          let color = '#333';
          if (r.status === '出勤') color = '#137333';
          else if (r.status === '迟到') color = '#b06000';
          else if (r.status === '请假') color = '#1967d2';
          else if (r.status === '缺勤') color = '#c5221f';
          return '<tr>' +
            '<td class="rank-num">' + (i + 1) + '</td>' +
            '<td class="student-name">' + escapeHtml(r.student_name || '') + '</td>' +
            '<td><span style="color:' + color + ';font-weight:600;">' + escapeHtml(r.status || '') + '</span></td>' +
            '<td style="color:var(--text-sub);font-size:12px;">' + escapeHtml(r.remark || '') + '</td>' +
          '</tr>';
        }).join('') +
        '</tbody>' +
      '</table>';
  }

  pop.style.display = 'flex';
};