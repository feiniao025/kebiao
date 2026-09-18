/* ============================================================
   app-today.js —— 今天模块
   ============================================================ */

window.renderToday = function () {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dateStr = yyyy + '-' + mm + '-' + dd;
  const wd = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];

  if (window.currentTodayClass !== 'all' && !window.classes.find(function (c) { return c.class_id === window.currentTodayClass; })) {
    window.currentTodayClass = 'all';
    localStorage.setItem('kebiao_today_class', 'all');
  }

  const classFilterOptions =
    '<option value="all">全部班级</option>' +
    window.classes.map(function (c) {
      return '<option value="' + escapeHtml(c.class_id) + '">' + escapeHtml(c.name) + '</option>';
    }).join('');

  const classOptions = window.classes.map(function (c) {
    return '<option value="' + escapeHtml(c.class_id) + '">' + escapeHtml(c.name) + '</option>';
  }).join('');

  window.todayContainer.innerHTML =
    '<div class="me-page">' +
      '<div class="me-card">' +
        '<div class="today-date">' + yyyy + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日 星期' + wd + '</div>' +
        '<div class="today-section">' +
          '<div class="today-section-header">' +
            '<h4>📚 今日课程</h4>' +
            '<select id="todayClassFilter" class="cell-pop-input today-grade-filter">' + classFilterOptions + '</select>' +
          '</div>' +
          '<div id="todayClasses" class="today-course-list">' + window.renderTodayCourses(now.getDay()) + '</div>' +
        '</div>' +
        '<div class="today-section">' +
          '<h4>✅ 今日考勤</h4>' +
          '<div class="cell-pop-row" style="margin:8px 0;">' +
            '<label>班级：</label>' +
            '<select id="todayAttendanceClass" class="cell-pop-input">' +
              (classOptions || '<option value="">（暂无班级）</option>') +
            '</select>' +
          '</div>' +
          '<div id="todayAttendanceSummary" class="today-summary">选择班级后查看今日考勤</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  const classSel = document.getElementById('todayClassFilter');
  if (classSel) {
    classSel.value = window.currentTodayClass;
    classSel.onchange = function () {
      window.currentTodayClass = classSel.value;
      localStorage.setItem('kebiao_today_class', window.currentTodayClass);
      const listEl = document.getElementById('todayClasses');
      if (listEl) listEl.innerHTML = window.renderTodayCourses(now.getDay());
    };
  }

  const sel = document.getElementById('todayAttendanceClass');
  if (sel && window.classes.length > 0) {
    sel.onchange = function () { window.loadTodayAttendanceSummary(sel.value, dateStr); };
    window.loadTodayAttendanceSummary(window.classes[0].class_id, dateStr);
  }
};

window.renderTodayCourses = function (wd) {
  if (wd === 0 || wd === 6) return '<div class="today-empty">周末无课程安排 🎉</div>';
  if (window.classes.length === 0) return '<div class="today-empty">暂无班级</div>';

  let list = window.classes;
  if (window.currentTodayClass !== 'all') {
    list = window.classes.filter(function (c) { return c.class_id === window.currentTodayClass; });
  }
  if (list.length === 0) return '<div class="today-empty">该班级不存在</div>';

  let html = '';
  list.forEach(function (cls) {
    const lessons = [];
    const periodCount = (cls.period_count && cls.period_count > 0) ? cls.period_count : window.defaultPeriods.length;
    for (let pIdx = 0; pIdx < periodCount; pIdx++) {
      const idx = pIdx * 6 + (wd - 1) + 1;
      const key = cls.class_id + '_cell_' + idx;
      const cell = window.cellData[key];
      const pKey = cls.class_id + '_cell_' + (pIdx * 6);
      const pCell = window.cellData[pKey];
      const pName = (pCell && pCell.period_name) || (window.defaultPeriods[pIdx] && window.defaultPeriods[pIdx].name) || ('第' + (pIdx + 1) + '节');
      const pTime = (pCell && pCell.period_time) || (window.defaultPeriods[pIdx] && window.defaultPeriods[pIdx].time) || '';
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
      lessons.forEach(function (l) {
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

window.loadTodayAttendanceSummary = async function (classId, date) {
  const el = document.getElementById('todayAttendanceSummary');
  if (!el) return;
  if (!classId) { el.textContent = '请选择班级'; return; }
  el.textContent = '加载中...';
  try {
    const sum = await API.attendanceSummary(classId, date);
    if (!sum || sum.total === 0) {
      el.innerHTML = '<span class="today-empty">今日暂无考勤记录</span>';
      return;
    }
    el.innerHTML =
      '<div class="today-summary-grid">' +
        '<div><span class="num">' + sum.total + '</span><span class="lbl">应到</span></div>' +
        '<div class="ok"><span class="num">' + sum.present + '</span><span class="lbl">出勤</span></div>' +
        '<div class="warn"><span class="num">' + sum.late + '</span><span class="lbl">迟到</span></div>' +
        '<div class="info"><span class="num">' + sum.leave + '</span><span class="lbl">请假</span></div>' +
        '<div class="bad"><span class="num">' + sum.absent + '</span><span class="lbl">缺勤</span></div>' +
      '</div>';
  } catch (e) { el.textContent = '加载失败'; }
};