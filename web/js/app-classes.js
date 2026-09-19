/* ============================================================
   app-classes.js —— 班级模块（课表/座位/值日/班级管理/导入导出）
   含：
   - 课服 1 / 课服 2 按「每月 4 周循环」设置
   - 课服编辑合并视图（课服1、课服2 一起编辑）
   - 值日项目：单行编辑（点哪行改哪行）
   ============================================================ */

/* ---------- 课服 4 周循环状态 ---------- */
window.currentCSClassId = '';
window.currentCSPeriods = [];
window.currentCSTabIdx = 0;

/* ---------- 座位标题 / 班级筛选 ---------- */
window.updateSeatCardTitle = function () {
  const el = $('seatCardTitle');
  if (!el) return;
  if (classes.length > 0) {
    el.textContent = classes[0].name || formatClassName(classes[0].grade || 7, classes[0].class_num || 1);
  } else el.textContent = '';
};

window.renderFilterButtons = function () {
  const container = $('classFilterButtons');
  if (!container) return;
  container.innerHTML = '';
  classes.forEach(cls => {
    const btn = document.createElement('button');
    btn.className = 'schedule-only';
    btn.dataset.filter = cls.class_id;
    btn.textContent = '仅' + (cls.name || cls.class_id);
    container.appendChild(btn);
  });
  applyFilter(preferences.schedule_filter || 'all');
};

window.applyFilter = function (fv) {
  document.querySelectorAll('#classControlBar button[data-filter]').forEach(b => b.classList.toggle('active', b.dataset.filter === fv));
  document.querySelectorAll('.class-card').forEach(card => {
    card.style.display = (fv === 'all' || card.dataset.class === fv) ? 'block' : 'none';
  });
};

/* ---------- 课服 4 周辅助 ---------- */

// 获取当前是月内第几周（1-4，29/30/31 日回到第 1 周循环）
window.getWeekOfMonth = function () {
  const d = new Date();
  return (Math.floor((d.getDate() - 1) / 7) % 4) + 1;
};

// 判断某班级的某一节（pIdx）是否是"课服"节次（以"课服"开头）
window.isClassServicePeriod = function (cls, pIdx) {
  const pKey = cls.class_id + '_cell_' + (pIdx * 6);
  const pCell = cellData[pKey];
  let name = '';
  if (pCell && pCell.cell_type === 'period' && pCell.period_name) name = pCell.period_name;
  else if (defaultPeriods[pIdx] && defaultPeriods[pIdx].name) name = defaultPeriods[pIdx].name;
  return /^课服/.test(String(name));
};

// 找到班级里所有的"课服"节次索引
window.findClassServicePeriods = function (cls) {
  const list = [];
  const periodCount = (cls.period_count && cls.period_count > 0)
    ? cls.period_count : defaultPeriods.length;
  for (let pIdx = 0; pIdx < periodCount; pIdx++) {
    if (isClassServicePeriod(cls, pIdx)) list.push(pIdx);
  }
  return list;
};

/* ---------- 课表渲染 ---------- */
window.renderSchedule = function () {
  const container = scheduleContainer;
  if (!container) return;
  container.innerHTML = '';

  if (classes.length === 0) {
    const emptyCard = document.createElement('div');
    emptyCard.className = 'card';
    emptyCard.innerHTML =
      '<div style="text-align:center;padding:40px 20px;">' +
      '<p style="font-size:16px;color:var(--text-sub);margin-bottom:16px;">暂无班级</p>' +
      '<button id="emptyCreateClassBtn" style="padding:10px 24px;border-radius:10px;border:none;background:#16a085;color:#fff;font-size:14px;cursor:pointer;font-family:inherit;">＋ 新建班级</button>' +
      '<p style="font-size:13px;color:var(--text-sub);margin-top:16px;">或点击「⚙️ 更多 → 📗 导入」批量导入</p>' +
      '</div>';
    container.appendChild(emptyCard);
    const b = $('emptyCreateClassBtn');
    if (b) b.onclick = () => openCreateClassPop();
    renderLegendCard(container);
    renderFilterButtons();
    return;
  }

  classes.forEach(cls => renderClassCard(container, cls));
  renderLegendCard(container);
  updateAllLegends();
  renderFilterButtons();
  renderWeekHighlight();
};

window.createBreakRow = function (cls) {
  const tr = document.createElement('tr');
  tr.className = 'break-row';
  const td = document.createElement('td');
  td.colSpan = 6;
  td.dataset.type = 'break';
  td.dataset.idx = String(BREAK_CELL_INDEX);
  td.dataset.classId = cls.class_id;

  let bName = '午休';
  let bTime = '12:00-13:00';
  const key = cls.class_id + '_cell_' + BREAK_CELL_INDEX;
  if (cellData[key] && cellData[key].cell_type === 'break') {
    if (cellData[key].period_name) bName = cellData[key].period_name;
    if (cellData[key].period_time !== undefined) bTime = cellData[key].period_time;
  }
  td.innerHTML =
    '<span class="cell-period-name">' + escapeHtml(bName) + '</span>' +
    '<span class="cell-time">' + escapeHtml(bTime) + '</span>';
  tr.appendChild(td);
  return tr;
};

window.renderClassCard = function (container, cls) {
  const card = document.createElement('div');
  card.className = 'card class-card';
  card.dataset.class = cls.class_id;

  const header = document.createElement('div');
  header.className = 'card-header';
  header.innerHTML =
    '<h2>' + escapeHtml(cls.name) +
    (cls.badge ? '<span class="badge">' + escapeHtml(cls.badge) + '</span>' : '') +
    '</h2>' +
    '<div class="legend">' +
    '<span class="legend-items" data-legend-items="' + escapeHtml(cls.class_id) + '"></span>' +
    '<button class="mini-toggle" data-class-menu="' + escapeHtml(cls.class_id) + '">菜单</button>' +
    '</div>';
  card.appendChild(header);

  const table = document.createElement('table');
  table.className = 'schedule-table';
  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>节次</th><th>星期一</th><th>星期二</th><th>星期三</th><th>星期四</th><th>星期五</th></tr>';
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  const periodCount = (cls.period_count && cls.period_count > 0) ? cls.period_count : defaultPeriods.length;

  for (let pIdx = 0; pIdx < periodCount; pIdx++) {
    const tr = document.createElement('tr');

    // 判断这一节是不是"课服"，若是则按当前周读取
    const isCS = isClassServicePeriod(cls, pIdx);
    const curWeek = isCS ? getWeekOfMonth() : 1;

    const tdP = document.createElement('td');
    const pIdxGlobal = pIdx * 6;
    tdP.dataset.type = 'period';
    tdP.dataset.idx = pIdxGlobal.toString();
    tdP.dataset.classId = cls.class_id;

    let pName = (defaultPeriods[pIdx] && defaultPeriods[pIdx].name) || ('第' + (pIdx + 1) + '节');
    let pTime = (defaultPeriods[pIdx] && defaultPeriods[pIdx].time) || '';
    const pKey = cls.class_id + '_cell_' + pIdxGlobal;
    if (cellData[pKey] && cellData[pKey].cell_type === 'period') {
      if (cellData[pKey].period_name) pName = cellData[pKey].period_name;
      if (cellData[pKey].period_time !== undefined) pTime = cellData[pKey].period_time;
    }

    let pNameHTML;
    if (isCS) {
      pNameHTML = escapeHtml(pName) + '<span class="cs-week-tag">· 第' + curWeek + '周</span>';
    } else {
      pNameHTML = escapeHtml(pName);
    }
    tdP.innerHTML = '<span class="cell-period-name">' + pNameHTML + '</span><span class="cell-time">' + escapeHtml(pTime) + '</span>';
    tr.appendChild(tdP);

    for (let d = 0; d < 5; d++) {
      const td = document.createElement('td');
      const baseIdx = pIdx * 6 + d + 1;
      const idx = isCS ? (baseIdx + (curWeek - 1) * 100) : baseIdx;
      td.dataset.type = 'lesson';
      td.dataset.idx = idx.toString();
      td.dataset.classId = cls.class_id;
      if (isCS) {
        td.dataset.isCs = '1';
        td.dataset.csWeek = String(curWeek);
      }

      let subj = '', teacher = '';
      const cKey = cls.class_id + '_cell_' + idx;
      if (cellData[cKey] && cellData[cKey].cell_type === 'lesson') {
        subj = cellData[cKey].subject || '';
        teacher = cellData[cKey].teacher || '';
      }
      td.innerHTML = '<span class="cell-subject">' + escapeHtml(subj) + '</span><span class="cell-teacher">' + escapeHtml(teacher) + '</span>';
      refreshCellStyle(td);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);

    if (pIdx === BREAK_AFTER_PERIOD - 1 && pIdx < periodCount - 1) {
      tbody.appendChild(createBreakRow(cls));
    }
  }

  table.appendChild(tbody);
  card.appendChild(table);
  container.appendChild(card);

  table.querySelectorAll('tbody td').forEach(td => {
    td.onclick = () => {
      if (Date.now() - suppressClickTime < 400) return;
      if (!editAllOn) { showSaveStatus('已锁定，请点击顶部「✏️ 编辑课表」开启编辑', true); return; }
      openCellPop(td);
    };
  });

  const menuBtn = header.querySelector('.mini-toggle[data-class-menu]');
  if (menuBtn) {
    menuBtn.onclick = (e) => {
      if (Date.now() - suppressClickTime < 400) return;
      e.stopPropagation();
      openClassManagePop(cls);
    };
  }

  setupClassDrag(card, cls);
};

window.renderLegendCard = function (container) {
  if (!defaultLegend || !defaultLegend.length) return;
  const legendCard = document.createElement('div');
  legendCard.className = 'card legend-card';
  legendCard.id = 'legendCard';
  legendCard.innerHTML =
    '<div class="card-header"><h2>📖 课程简称说明</h2><div class="legend" style="font-size:13px;color:var(--text-sub);">共 <strong style="color:var(--text-main);">' + defaultLegend.length + '</strong> 项</div></div>' +
    '<div class="legend-grid">' + defaultLegend.map(item =>
      '<div class="legend-item"><span class="abbr' + (item.special ? ' special' : '') + '">' + escapeHtml(item.abbr) + '</span><span class="full">' + escapeHtml(item.full) + '</span></div>'
    ).join('') + '</div>';
  container.appendChild(legendCard);
};

window.refreshCellStyle = function (td) {
  td.classList.remove('empty');
  td.removeAttribute('data-bg-color');
  if (td.dataset.type !== 'lesson') return;
  const subjEl = td.querySelector('.cell-subject');
  if (!subjEl) return;
  const t = subjEl.textContent.trim();
  if (!t || t === '—') { td.classList.add('empty'); return; }
  const cls = td.dataset.classId;
  const key = cls + '_cell_' + td.dataset.idx;
  const data = cellData[key] || {};
  if (data.bg_color && data.bg_color !== '0') td.setAttribute('data-bg-color', data.bg_color);
};

window.updateClassLegend = function (classId) {
  const card = document.querySelector('.class-card[data-class="' + cssEscape(classId) + '"]');
  if (!card) return;
  const container = card.querySelector('.legend-items');
  if (!container) return;
  const colorMap = {}, seen = {};
  card.querySelectorAll('.schedule-table tbody td[data-type="lesson"]').forEach(td => {
    const subjEl = td.querySelector('.cell-subject');
    if (!subjEl) return;
    const subj = subjEl.textContent.trim();
    if (!subj || subj === '—') return;
    const bg = td.getAttribute('data-bg-color');
    if (bg && bg !== '0' && !seen[subj]) {
      seen[subj] = true;
      if (!colorMap[bg]) colorMap[bg] = [];
      colorMap[bg].push(subj);
    }
  });
  const colorOrder = ['1', '2', '3', '4', '5', '6'];
  const groups = [];
  colorOrder.forEach(c => { if (colorMap[c] && colorMap[c].length > 0) groups.push({ color: c, subjects: colorMap[c] }); });
  if (groups.length === 0) { container.innerHTML = '<span class="legend-text">未设置高亮</span>'; return; }
  container.innerHTML = groups.map(g => {
    const idx = parseInt(g.color, 10);
    const bg = (idx > 0 && idx < COLOR_BG.length) ? COLOR_BG[idx] : '#f9d0d0';
    const bd = (idx > 0 && idx < COLOR_BD.length) ? COLOR_BD[idx] : '#f0b8b8';
    return '<span class="dot" style="background:' + bg + ';border-color:' + bd + '"></span><span class="legend-text">含「' + g.subjects.join('、') + '」的科目</span>';
  }).join('<span class="sep">·</span>');
};

window.updateAllLegends = function () { classes.forEach(c => updateClassLegend(c.class_id)); };

window.openCellPop = function (td) {
  currentCellIdx = +td.dataset.idx;
  currentCellType = td.dataset.type;
  currentCellClassId = td.dataset.classId;
  const isBreak = currentCellType === 'break';
  const isPeriod = currentCellType === 'period';
  const showPeriod = isPeriod || isBreak;

  $('cellPopPeriodRow1').style.display = showPeriod ? 'flex' : 'none';
  $('cellPopPeriodRow2').style.display = showPeriod ? 'flex' : 'none';
  $('cellPopSubjectRow').style.display = showPeriod ? 'none' : 'flex';
  $('cellPopTeacherRow').style.display = showPeriod ? 'none' : 'flex';
  $('cellPopColorRow').style.display = showPeriod ? 'none' : 'flex';

  if (showPeriod) {
    $('cellPopTitle').textContent = isBreak ? '编辑午休' : '编辑节次';
    const nameEl = td.querySelector('.cell-period-name');
    const timeEl = td.querySelector('.cell-time');
    $('cellPopPeriodName').value = nameEl ? nameEl.textContent : '';
    $('cellPopPeriodTime').value = timeEl ? timeEl.textContent : '';
  } else {
    // 若是课服单元格，标题加"第 N 周"
    let titleText = '编辑课程';
    if (td.dataset.isCs === '1') titleText = '编辑课服 · 第' + (td.dataset.csWeek || '?') + '周';
    $('cellPopTitle').textContent = titleText;
    $('cellPopSubject').value = td.querySelector('.cell-subject').textContent;
    $('cellPopTeacher').value = td.querySelector('.cell-teacher').textContent || '';
    const key = currentCellClassId + '_cell_' + currentCellIdx;
    const data = cellData[key] || {};
    currentBgColor = data.bg_color || '0';
    document.querySelectorAll('#cellPopColors button').forEach(b => b.classList.toggle('selected', b.dataset.color === currentBgColor));
  }
  $('cellPop').style.display = 'flex';
  setTimeout(() => { (showPeriod ? $('cellPopPeriodName') : $('cellPopSubject')).focus(); }, 100);
};

/* ---------- 值日 ---------- */
window.getDutyClassId = function () {
  if (currentDutyClassId) return currentDutyClassId;
  if (classes.length > 0) return classes[0].class_id;
  return '';
};
window.getDutyStorageId = function (classId) { return '_duty_' + classId; };
window.getDutyRows = function (classId) {
  if (!classId) return 4;
  const storageId = getDutyStorageId(classId);
  const key = storageId + '_cell_-1';
  const c = cellData[key];
  if (c && c.period_name) {
    try {
      const j = JSON.parse(c.period_name);
      if (j && j.rows >= 1 && j.rows <= 12) return j.rows;
    } catch (e) {
      const n = parseInt(c.period_name, 10);
      if (n >= 1 && n <= 12) return n;
    }
  }
  return 4;
};
window.getDutyNote = function (classId) {
  if (!classId) return DEFAULT_DUTY_NOTE;
  const storageId = getDutyStorageId(classId);
  const key = storageId + '_cell_-2';
  const c = cellData[key];
  return (c && c.subject) || DEFAULT_DUTY_NOTE;
};
window.setDutyConfig = async function (classId, rows, note) {
  const storageId = getDutyStorageId(classId);
  await apiCall(API.upsertCell, {
    class_id: storageId, cell_index: -1, cell_type: 'duty_config',
    period_name: JSON.stringify({ rows: rows }), period_time: '',
    subject: '', teacher: '', bg_color: '0'
  });
  cellData[storageId + '_cell_-1'] = {
    class_id: storageId, cell_index: -1, cell_type: 'duty_config',
    period_name: JSON.stringify({ rows: rows }), subject: '', teacher: '', bg_color: '0'
  };
  await apiCall(API.upsertCell, {
    class_id: storageId, cell_index: -2, cell_type: 'duty_note',
    period_name: '', period_time: '',
    subject: note, teacher: '', bg_color: '0'
  });
  cellData[storageId + '_cell_-2'] = {
    class_id: storageId, cell_index: -2, cell_type: 'duty_note',
    period_name: '', subject: note, teacher: '', bg_color: '0'
  };
};

window.renderDuty = function () {
  const container = scheduleContainer;
  if (!container) return;
  container.innerHTML = '';

  if (classes.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'card';
    empty.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--text-sub);">请先在「班级 → 课表」中创建班级</div>';
    container.appendChild(empty);
    return;
  }

  if (!currentDutyClassId || !classes.find(c => c.class_id === currentDutyClassId)) {
    currentDutyClassId = classes[0].class_id;
  }
  const classId = currentDutyClassId;
  const storageId = getDutyStorageId(classId);
  const clsInfo = classes.find(c => c.class_id === classId);
  const title = clsInfo ? (clsInfo.name + ' · 值日表') : '值日表';

  const card = document.createElement('div');
  card.className = 'card class-card duty-card';

  const header = document.createElement('div');
  header.className = 'card-header';
  header.innerHTML =
    '<h2>' + escapeHtml(title) + '</h2>' +
    '<div class="legend"><button class="mini-toggle" id="dutyCardMenuBtn">菜单</button></div>';
  card.appendChild(header);

  const menuBtn = header.querySelector('#dutyCardMenuBtn');
  if (menuBtn) menuBtn.onclick = (e) => { e.stopPropagation(); openDutyManagePop(); };

  const table = document.createElement('table');
  table.className = 'schedule-table duty-table';
  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>值日项目</th><th>星期一</th><th>星期二</th><th>星期三</th><th>星期四</th><th>星期五</th></tr>';
  table.appendChild(thead);

  const rows = getDutyRows(classId);
  const tbody = document.createElement('tbody');
  for (let row = 0; row < rows; row++) {
    const tr = document.createElement('tr');

    const tdP = document.createElement('td');
    tdP.dataset.type = 'duty_period';
    tdP.dataset.idx = String(row * 6);
    tdP.dataset.classId = storageId;
    const pKey = storageId + '_cell_' + (row * 6);
    const pCell = cellData[pKey];
    const pName = (pCell && pCell.period_name) || '';
    if (pName) tdP.innerHTML = '<span class="cell-period-name">' + escapeHtml(pName) + '</span>';
    else { tdP.innerHTML = '<span class="cell-empty">＋ 项目</span>'; tdP.classList.add('empty'); }
    tr.appendChild(tdP);

    for (let d = 0; d < DUTY_DAYS; d++) {
      const td = document.createElement('td');
      const idx = row * 6 + d + 1;
      td.dataset.type = 'duty';
      td.dataset.idx = String(idx);
      td.dataset.classId = storageId;
      const cKey = storageId + '_cell_' + idx;
      const cCell = cellData[cKey];
      const students = (cCell && cCell.subject) || '';
      if (students) {
        const lines = students.split('\n').map(s => s.trim()).filter(Boolean);
        td.innerHTML = lines.map(s => '<span class="cell-student">' + escapeHtml(s) + '</span>').join('');
      } else { td.innerHTML = '<span class="cell-empty">＋</span>'; td.classList.add('empty'); }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  card.appendChild(table);

  const noteText = getDutyNote(classId);
  if (noteText && noteText.trim()) {
    const noteEl = document.createElement('div');
    noteEl.className = 'duty-note';
    noteEl.textContent = noteText;
    card.appendChild(noteEl);
  }

  container.appendChild(card);

  table.querySelectorAll('tbody td').forEach(td => {
    td.onclick = () => {
      if (!dutyEditOn) { showSaveStatus('请点击顶部「✏️ 编辑值日」开启编辑', true); return; }
      openDutyPop(td);
    };
  });
  renderWeekHighlight();
};

window.openDutyPop = function (td) {
  const type = td.dataset.type;
  const idx = parseInt(td.dataset.idx, 10);
  const classId = td.dataset.classId;

  currentCellIdx = idx;
  currentCellType = type;
  currentCellClassId = classId;

  const isPeriod = (type === 'duty_period');
  $('dutyPopPeriodRow').style.display = isPeriod ? 'flex' : 'none';
  $('dutyPopStudentsRow').style.display = isPeriod ? 'none' : 'flex';
  $('dutyPopTitle').textContent = isPeriod ? '编辑值日项目' : '编辑值日学生';
  $('dutyPopError').textContent = '';

  if (isPeriod) {
    const nameEl = td.querySelector('.cell-period-name');
    $('dutyPopPeriodName').value = nameEl ? nameEl.textContent : '';
  } else {
    const cKey = classId + '_cell_' + idx;
    const cCell = cellData[cKey];
    $('dutyPopStudents').value = (cCell && cCell.subject) || '';
  }
  $('dutyPop').style.display = 'flex';
  setTimeout(() => { if (isPeriod) $('dutyPopPeriodName').focus(); else $('dutyPopStudents').focus(); }, 100);
};

window.openDutyManagePop = function () {
  if (classes.length === 0) { alert('请先创建至少一个班级'); return; }
  const cls = classes.find(c => c.class_id === getDutyClassId()) || classes[0];
  fillGradeSelect($('dutyManageGrade'), cls.grade || 7);
  fillClassNumSelect($('dutyManageNum'), cls.class_num || 1);
  loadDutyConfigIntoPop(cls.class_id);

  const onClassChange = () => {
    const g = parseInt($('dutyManageGrade').value, 10);
    const n = parseInt($('dutyManageNum').value, 10);
    const target = classes.find(c => c.grade === g && c.class_num === n);
    if (!target) return;
    loadDutyConfigIntoPop(target.class_id);
  };
  $('dutyManageGrade').onchange = onClassChange;
  $('dutyManageNum').onchange = onClassChange;
  $('dutyManageError').textContent = '';
  $('dutyManagePop').style.display = 'flex';
};

window.loadDutyConfigIntoPop = function (classId) {
  const rows = getDutyRows(classId);
  const sel = $('dutyManageRows');
  sel.innerHTML = '';
  for (let n = 1; n <= 12; n++) {
    const opt = document.createElement('option');
    opt.value = n;
    opt.textContent = n + ' 项';
    if (n === rows) opt.selected = true;
    sel.appendChild(opt);
  }
  $('dutyManageNote').value = getDutyNote(classId);
  $('dutyManagePop').dataset.classId = classId;
};

/* ---------- 班级 CRUD ---------- */
window.openCreateClassPop = async function () {
  const gradeSel = $('classPopGrade');
  const numSel = $('classPopNum');
  const errEl = $('classPopError');
  if (errEl) errEl.textContent = '';
  fillGradeSelect(gradeSel, 7);
  fillClassNumSelect(numSel, 1, true);
  $('classPopBadge').value = '';

  const customRow = $('classPopCustomNameRow');
  const customInput = $('classPopCustomName');
  if (customRow && customInput) { customRow.style.display = 'none'; customInput.value = ''; }

  numSel.onchange = () => {
    if (!customRow) return;
    if (numSel.value === 'custom') {
      customRow.style.display = 'flex';
      setTimeout(() => customInput && customInput.focus(), 100);
    } else customRow.style.display = 'none';
  };

  const rosterRow = $('classPopRosterRow');
  const rosterSel = $('classPopRoster');
  if (rosterRow && rosterSel) {
    rosterRow.style.display = 'none';
    rosterSel.innerHTML = '';
    try {
      const resp = await API.listRoster('');
      const all = resp.students || [];
      const classIds = new Set(classes.map(c => c.class_id));
      const pending = new Set();
      all.forEach(s => { if (s.class_id && !classIds.has(s.class_id)) pending.add(s.class_id); });
      if (pending.size > 0) {
        rosterSel.innerHTML = '<option value="">（不关联）</option>' +
          Array.from(pending).sort().map(n => '<option value="' + escapeHtml(n) + '">' + escapeHtml(n) + '（可导入）</option>').join('');
        rosterRow.style.display = 'flex';
      }
    } catch (e) {}
  }
  $('classPop').style.display = 'flex';
};

window.openClassManagePop = function (cls) {
  currentManageClassId = cls.class_id;
  $('classManageTitle').textContent = '班级管理 · ' + cls.name;
  fillGradeSelect($('classManageGrade'), cls.grade || 7);

  const numSel = $('classManageNum');
  const isCustom = (cls.class_num === 0 || !cls.class_num);
  fillClassNumSelect(numSel, isCustom ? 'custom' : (cls.class_num || 1), true);
  fillPeriodCountSelect($('classManagePeriods'), cls.period_count || 8);
  $('classManageBadge').value = stripBadgePrefix(cls.badge);

  const customRow = $('classManageCustomNameRow');
  const customInput = $('classManageCustomName');
  if (isCustom && customRow && customInput) { customRow.style.display = 'flex'; customInput.value = cls.name; }
  else if (customRow && customInput) { customRow.style.display = 'none'; customInput.value = ''; }

  numSel.onchange = () => {
    if (!customRow) return;
    if (numSel.value === 'custom') {
      customRow.style.display = 'flex';
      setTimeout(() => customInput && customInput.focus(), 100);
    } else customRow.style.display = 'none';
  };
  $('classManageError').textContent = '';

  // 若该班级存在"课服"节次，显示编辑按钮
  const csPeriods = findClassServicePeriods(cls);
  const csBtn = $('classManageEditCsBtn');
  if (csBtn) {
    if (csPeriods.length > 0) {
      csBtn.style.display = '';
      csBtn.onclick = () => {
        $('classManagePop').style.display = 'none';
        openClassServicePop(cls);
      };
    } else {
      csBtn.style.display = 'none';
    }
  }

  $('classManagePop').style.display = 'flex';
};

/* ---------- 课服 4 周编辑弹窗（合并视图） ---------- */

window.openClassServicePop = function (cls) {
  const csPeriods = findClassServicePeriods(cls);
  if (csPeriods.length === 0) { alert('该班级没有「课服」节次'); return; }

  currentCSClassId = cls.class_id;
  currentCSPeriods = csPeriods;
  currentCSTabIdx = 0;

  $('classServiceTitle').textContent = '编辑课服 · ' + cls.name;
  $('classServiceError').textContent = '';

  // 合并视图，不再需要 tab 切换
  const tabHeader = document.querySelector('#classServicePop .tab-header');
  if (tabHeader) tabHeader.style.display = 'none';

  renderClassServiceTable();
  $('classServicePop').style.display = 'flex';
};

window.renderClassServiceTable = function () {
  const cls = classes.find(c => c.class_id === currentCSClassId);
  if (!cls) return;
  const body = $('classServiceBody');
  const DAYS = ['周一', '周二', '周三', '周四', '周五'];
  const csPeriods = currentCSPeriods; // [pIdx1, pIdx2, ...]

  let html = '<div style="overflow-x:auto;"><table class="cs-table">';
  html += '<thead><tr><th>周次</th>';
  for (let d = 0; d < 5; d++) html += '<th>' + DAYS[d] + '</th>';
  html += '</tr></thead><tbody>';

  for (let w = 0; w < 4; w++) {
    html += '<tr><td>第' + (w + 1) + '周</td>';
    for (let d = 0; d < 5; d++) {
      html += '<td>';
      csPeriods.forEach(pIdx => {
        const baseIdx = pIdx * 6 + d + 1;
        const idx = baseIdx + w * 100;
        const cKey = cls.class_id + '_cell_' + idx;
        const cell = cellData[cKey];
        const subj = (cell && cell.cell_type === 'lesson') ? (cell.subject || '') : '';
        const teacher = (cell && cell.cell_type === 'lesson') ? (cell.teacher || '') : '';
        const val = (subj || teacher) ? (subj + (teacher ? '/' + teacher : '')) : '';

        // 取节次名（课服1 / 课服2），显示时去掉"课服"前缀，只留 1、2
        const pKey = cls.class_id + '_cell_' + (pIdx * 6);
        const pCell = cellData[pKey];
        let pName = (pCell && pCell.period_name)
          || (defaultPeriods[pIdx] && defaultPeriods[pIdx].name)
          || ('课服');
        pName = String(pName).replace(/^课服\s*/, '') || pName;

        html += '<div class="cs-cell-row">' +
          '<span class="cs-cell-label">' + escapeHtml(pName) + '</span>' +
          '<input type="text" class="cs-input" data-period-idx="' + pIdx +
          '" data-base-idx="' + baseIdx + '" data-week="' + (w + 1) +
          '" value="' + escapeHtml(val) + '" placeholder="科目/老师">' +
        '</div>';
      });
      html += '</td>';
    }
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  body.innerHTML = html;

  body.querySelectorAll('.cs-input').forEach(inp => {
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const list = Array.from(body.querySelectorAll('.cs-input'));
        const i = list.indexOf(inp);
        if (i >= 0 && i < list.length - 1) list[i + 1].focus();
      }
    });
  });
};

window.saveClassService = async function () {
  const cls = classes.find(c => c.class_id === currentCSClassId);
  if (!cls) return;
  const errEl = $('classServiceError');
  errEl.textContent = '';
  const inputs = $('classServiceBody').querySelectorAll('.cs-input');
  const updates = [];
  inputs.forEach(inp => {
    const baseIdx = parseInt(inp.dataset.baseIdx, 10);
    const week = parseInt(inp.dataset.week, 10);
    const idx = baseIdx + (week - 1) * 100;
    const raw = inp.value.trim();
    let subj = raw, teacher = '';
    const slash = raw.indexOf('/');
    if (slash >= 0) { subj = raw.slice(0, slash).trim(); teacher = raw.slice(slash + 1).trim(); }
    updates.push({
      class_id: cls.class_id,
      cell_index: idx,
      cell_type: 'lesson',
      subject: subj,
      teacher: teacher,
      period_name: '',
      period_time: '',
      bg_color: '0',
    });
  });
  if (!updates.length) return;
  try {
    await apiCall(API.batchUpsert, updates);
    updates.forEach(u => {
      cellData[u.class_id + '_cell_' + u.cell_index] = u;
    });
    renderSchedule();
    showSaveStatus('已保存课服', false);
    scheduleAutoSync();
    $('classServicePop').style.display = 'none';
  } catch (err) {
    errEl.textContent = err.message || '保存失败';
  }
};

window.clearClassService = async function () {
  const cls = classes.find(c => c.class_id === currentCSClassId);
  if (!cls) return;
  if (!confirm('确认清空该班级全部课服（4 周）内容？')) return;
  const updates = [];
  currentCSPeriods.forEach(pIdx => {
    for (let d = 0; d < 5; d++) {
      for (let w = 0; w < 4; w++) {
        const idx = (pIdx * 6 + d + 1) + w * 100;
        updates.push({
          class_id: cls.class_id, cell_index: idx, cell_type: 'lesson',
          subject: '', teacher: '', period_name: '', period_time: '', bg_color: '0',
        });
      }
    }
  });
  try {
    await apiCall(API.batchUpsert, updates);
    updates.forEach(u => {
      cellData[u.class_id + '_cell_' + u.cell_index] = u;
    });
    renderClassServiceTable();
    renderSchedule();
    showSaveStatus('已清空', false);
    scheduleAutoSync();
  } catch (err) {
    $('classServiceError').textContent = err.message || '清空失败';
  }
};

/* ---------- 拖拽 ---------- */
window.setupClassDrag = function (card, cls) {
  const header = card.querySelector('.card-header');
  if (!header) return;
  const onPressStart = (x, y) => {
    if (!editAllOn) return;
    classPressState = { el: card, cls, x, y };
    if (classPressTimer) clearTimeout(classPressTimer);
    classPressTimer = setTimeout(() => {
      classPressTimer = null;
      const ps = classPressState;
      classPressState = null;
      if (ps && editAllOn) activateClassDrag(ps.el, ps.cls, ps.x, ps.y);
    }, CLASS_LONG_PRESS_MS);
  };
  header.addEventListener('mousedown', (e) => { if (e.target.closest('button')) return; onPressStart(e.clientX, e.clientY); });
  header.addEventListener('touchstart', (e) => {
    if (e.target.closest('button')) return;
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    onPressStart(t.clientX, t.clientY);
  }, { passive: true });
};

window.activateClassDrag = function (el, cls, x, y) {
  const rect = el.getBoundingClientRect();
  const ghost = el.cloneNode(true);
  ghost.classList.add('class-drag-ghost');
  ghost.style.position = 'fixed';
  ghost.style.left = rect.left + 'px';
  ghost.style.top = rect.top + 'px';
  ghost.style.width = rect.width + 'px';
  ghost.style.pointerEvents = 'none';
  ghost.style.zIndex = '99999';
  ghost.style.opacity = '0.9';
  document.body.appendChild(ghost);
  el.classList.add('dragging-class');
  classDrag = { el, cls, ghost, offsetX: x - rect.left, offsetY: y - rect.top, target: null };
  document.body.style.userSelect = 'none';
};

window.updateClassDrag = function (x, y) {
  if (!classDrag) return;
  classDrag.ghost.style.left = (x - classDrag.offsetX) + 'px';
  classDrag.ghost.style.top = (y - classDrag.offsetY) + 'px';
  classDrag.ghost.style.display = 'none';
  const el = document.elementFromPoint(x, y);
  classDrag.ghost.style.display = '';
  const target = el && el.closest ? el.closest('.class-card') : null;
  if (classDrag.target && classDrag.target !== target) classDrag.target.classList.remove('drag-over-class');
  if (target && target !== classDrag.el) { target.classList.add('drag-over-class'); classDrag.target = target; }
  else classDrag.target = null;
};

window.finishClassDrag = async function () {
  if (!classDrag) return;
  const drag = classDrag;
  classDrag = null;
  document.body.style.userSelect = '';
  try { drag.ghost.remove(); } catch (e) {}
  drag.el.classList.remove('dragging-class');
  if (drag.target) drag.target.classList.remove('drag-over-class');
  suppressClickTime = Date.now();
  if (!drag.target) return;
  const fromId = drag.cls.class_id;
  const toId = drag.target.dataset.class;
  if (!fromId || !toId || fromId === toId) return;
  const fromIdx = classes.findIndex(c => c.class_id === fromId);
  const toIdx = classes.findIndex(c => c.class_id === toId);
  if (fromIdx < 0 || toIdx < 0) return;
  const tmp = classes[fromIdx]; classes[fromIdx] = classes[toIdx]; classes[toIdx] = tmp;
  classes.forEach((c, i) => { c.sort_order = i; });
  renderSchedule();
  try { await apiCall(API.updateClassOrder, classes.map(c => c.class_id)); showSaveStatus('顺序已更新', false); scheduleAutoSync(); }
  catch (e) {}
};

/* ---------- 座位 ---------- */
window.displayToData = function (row, col) {
  if (seat.order === 'asc') return row * seat.cols + col;
  return (seat.rows - 1 - row) * seat.cols + (seat.cols - 1 - col);
};

window.renderSeats = function () {
  const grid = $('seatGrid');
  const stage = $('seatStage');
  if (!grid || !stage) return;

  const segments = getAisleSegments(seat.aisle || '', seat.cols);
  const hasAisle = segments.length > 1;
  grid.style.gridTemplateColumns = getGridColumns(segments);

  let maleCount = 0, femaleCount = 0;
  seat.students.forEach(s => { if (!s || !s.name) return; if (s.gender === '男') maleCount++; else if (s.gender === '女') femaleCount++; });
  const sizeEl = $('seatSizeInfo');
  if (sizeEl) sizeEl.textContent = seat.rows + '行×' + seat.cols + '列 · 男' + maleCount + ' 女' + femaleCount;
  if (seat.order === 'asc') stage.parentNode.insertBefore(stage, grid);
  else stage.parentNode.insertBefore(stage, grid.nextSibling);
  grid.innerHTML = '';

  const aisleCols = hasAisle ? getAisleGridCols(segments) : [];
  for (const ac of aisleCols) {
    const aisleDiv = document.createElement('div');
    aisleDiv.className = 'seat-aisle';
    aisleDiv.style.gridColumn = ac;
    aisleDiv.style.gridRow = '1 / span ' + seat.rows;
    grid.appendChild(aisleDiv);
  }

  for (let r = 0; r < seat.rows; r++) {
    for (let c = 0; c < seat.cols; c++) {
      const di = displayToData(r, c);
      const stu = seat.students[di] || { name: '', gender: '', id_card: '', tel1: '', tel2: '', address: '' };
      const hasName = !!(stu.name && String(stu.name).trim());

      const div = document.createElement('div');
      div.className = 'seat-item' + (hasName ? '' : ' seat-empty');
      if (hasName) {
        if (stu.gender === '女') div.classList.add('female');
        else if (stu.gender === '男') div.classList.add('male');
      } else if (seatEditOn) div.classList.add('add-mode');
      div.dataset.idx = di;
      div.dataset.actualRow = Math.floor(di / seat.cols);
      div.dataset.actualCol = di % seat.cols;
      div.style.gridColumn = getGridColIdx(c, segments);
      div.style.gridRow = (r + 1);

      if (hasName) div.textContent = String(stu.name);
      else { div.textContent = seatEditOn ? '＋' : '空'; div.style.color = 'var(--empty-text)'; }

      div.addEventListener('click', () => {
        if (Date.now() - suppressClickTime < 400) return;
        if (activeDrag !== null) return;
        const idx = +div.dataset.idx;
        const s = seat.students[idx];
        if (!s || !s.name) { if (!seatEditOn) return; openSeatPop(idx, true); return; }
        openSeatPop(idx);
      });
      if (hasName && seatEditOn) {
        div.addEventListener('mousedown', e => { if (e.button !== 0) return; startSeatPress(div, di, e.clientX, e.clientY); });
        div.addEventListener('touchstart', e => { if (e.touches.length !== 1) return; const t = e.touches[0]; startSeatPress(div, di, t.clientX, t.clientY); }, { passive: true });
      }
      grid.appendChild(div);
    }
  }
};

window.startSeatPress = function (el, idx, x, y) {
  cancelSeatPress();
  pressState = { el, idx, x, y };
  pressTimer = setTimeout(() => {
    pressTimer = null;
    const ps = pressState;
    pressState = null;
    if (ps) activateSeatDrag(ps.el, ps.idx, ps.x, ps.y);
  }, LONG_PRESS_MS);
};
window.cancelSeatPress = function () { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } pressState = null; };

window.activateSeatDrag = function (el, idx, x, y) {
  const rect = el.getBoundingClientRect();
  const ghost = document.createElement('div');
  ghost.className = 'touch-ghost';
  ghost.textContent = el.textContent || '';
  ghost.style.width = rect.width + 'px';
  ghost.style.height = rect.height + 'px';
  document.body.appendChild(ghost);
  positionGhost(ghost, x, y);
  el.classList.add('dragging');
  activeDrag = { el, idx, ghost, target: null };
};

window.positionGhost = function (ghost, x, y) {
  ghost.style.left = (x - ghost.offsetWidth / 2) + 'px';
  ghost.style.top = (y - ghost.offsetHeight / 2) + 'px';
};

window.onSeatMove = function (x, y) {
  if (pressState) {
    const dx = x - pressState.x, dy = y - pressState.y;
    if (Math.sqrt(dx * dx + dy * dy) > MOVE_CANCEL_PX) cancelSeatPress();
    return;
  }
  if (activeDrag) {
    positionGhost(activeDrag.ghost, x, y);
    const el = document.elementFromPoint(x, y);
    const target = el && el.closest ? el.closest('.seat-item') : null;
    if (activeDrag.target && activeDrag.target !== target) activeDrag.target.classList.remove('drag-over');
    if (target && target !== activeDrag.el) { target.classList.add('drag-over'); activeDrag.target = target; }
    else activeDrag.target = null;
  }
};

window.onSeatEnd = function () {
  if (pressState) { cancelSeatPress(); return; }
  if (activeDrag) {
    const fromIdx = activeDrag.idx;
    const target = activeDrag.target;
    const dragEl = activeDrag.el;
    if (activeDrag.ghost) activeDrag.ghost.remove();
    if (target) target.classList.remove('drag-over');
    if (dragEl) dragEl.classList.remove('dragging');
    activeDrag = null;
    if (target && dragEl) {
      const toIdx = +target.dataset.idx;
      if (toIdx !== fromIdx) {
        const r1 = +dragEl.dataset.actualRow, c1 = +dragEl.dataset.actualCol;
        const r2 = +target.dataset.actualRow, c2 = +target.dataset.actualCol;
        apiCall(API.swap, r1, c1, r2, c2).then(() => {
          const tmp = seat.students[fromIdx]; seat.students[fromIdx] = seat.students[toIdx]; seat.students[toIdx] = tmp;
          renderSeats();
          showSaveStatus('座位已交换', false);
          scheduleAutoSync();
        }).catch(() => { renderSeats(); });
      }
    }
    suppressClickTime = Date.now();
  }
};

window.openSeatPop = function (idx, isNew) {
  const s = seat.students[idx] || { name: '', gender: '', id_card: '', tel1: '', tel2: '', address: '' };
  currentPopIdx = idx;
  currentPopIsNew = !!isNew;
  $('popNameInput').value = s.name || '';
  $('popGenderInput').value = (s.gender === '女') ? '女' : '男';
  $('popIdCardInput').value = s.id_card || '';
  $('popTel1Input').value = s.tel1 || '';
  $('popTel2Input').value = s.tel2 || '';
  $('popAddrInput').value = s.address || '';
  const titleEl = document.querySelector('#seatPop .seat-pop-inner h3');
  if (titleEl) titleEl.textContent = currentPopIsNew ? '添加学生' : '学生信息';
  const delBtn = $('popDeleteBtn');
  if (delBtn) delBtn.style.display = (currentPopIsNew || !s.name) ? 'none' : '';
  ['popNameInput', 'popGenderInput', 'popIdCardInput', 'popTel1Input', 'popTel2Input', 'popAddrInput'].forEach(id => {
    const el = $(id);
    if (!el) return;
    if (el.tagName === 'SELECT') el.disabled = !seatEditOn;
    else el.readOnly = !seatEditOn;
  });
  updateDialBtns();
  $('seatPop').style.display = 'flex';
  if (seatEditOn) setTimeout(() => $('popNameInput').focus(), 100);
};

window.updateDialBtns = function () {
  const t1 = $('popTel1Input').value.trim();
  const t2 = $('popTel2Input').value.trim();
  $('popTel1Dial').disabled = !t1;
  $('popTel2Dial').disabled = !t2;
};

window.reloadSeatData = async function () {
  try {
    const seatResp = await API.getSeat();
    seat.rows = seatResp.rows || 7;
    seat.cols = seatResp.cols || 8;
    seat.order = seatResp.order || 'asc';
    seat.aisle = seatResp.aisle || '';
    seat.students = [];
    for (let i = 0; i < seat.rows * seat.cols; i++) {
      seat.students.push({ name: '', gender: '', id_card: '', tel1: '', tel2: '', address: '' });
    }
    (seatResp.students || []).forEach(s => {
      const idx = s.seat_row * seat.cols + s.seat_col;
      if (idx < seat.students.length) seat.students[idx] = s;
    });
    const btn = $('seatOrderBtn');
    if (btn) { btn.textContent = seat.order === 'asc' ? '讲台上' : '讲台下'; btn.classList.toggle('active', seat.order === 'desc'); }
    updateAisleBtn();
    renderSeats();
  } catch { /* ignore */ }
};

window.resizeSeat = async function (dr, dc) {
  const nr = Math.min(12, Math.max(2, seat.rows + dr));
  const nc = Math.min(10, Math.max(2, seat.cols + dc));
  if (nr === seat.rows && nc === seat.cols) return;
  try {
    await apiCall(API.resize, nr, nc);
    await reloadSeatData();
    showSaveStatus('座位已调整', false);
    scheduleAutoSync();
  } catch (err) { showSaveStatus(err.message || '调整失败', true); }
};

/* ---------- 导入导出 ---------- */
window.importScheduleExcel = async function (file, targetClass) {
  if (!targetClass) { alert('未选择目标班级'); return; }
  let wb;
  try { wb = await readExcelFile(file); }
  catch (e) { showSaveStatus('Excel 解析库加载失败，请检查网络', true); return; }

  const updates = [];
  const periodCount = (targetClass.period_count && targetClass.period_count > 0) ? targetClass.period_count : defaultPeriods.length;
  const sheetName = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });

  let pIdx = 0;
  for (let i = 1; i < rows.length && pIdx < periodCount; i++) {
    const row = rows[i];
    const pName = String(row[0] !== undefined ? row[0] : '').trim();
    const pTime = String(row[1] !== undefined ? row[1] : '').trim();
    const isBreakRow = /午休|休息|午餐/.test(pName);
    if (isBreakRow) {
      if (pName || pTime) {
        updates.push({ class_id: targetClass.class_id, cell_index: BREAK_CELL_INDEX, cell_type: 'break',
          period_name: pName || '午休', period_time: pTime, subject: '', teacher: '', bg_color: '0' });
      }
      continue;
    }
    if (pName) {
      updates.push({ class_id: targetClass.class_id, cell_index: pIdx * 6, cell_type: 'period',
        period_name: pName, period_time: pTime, subject: '', teacher: '', bg_color: '0' });
    }
    for (let d = 0; d < 5; d++) {
      const raw = row[d + 2];
      if (raw === undefined || raw === null) continue;
      const cellStr = String(raw).trim();
      let subj = cellStr, teacher = '';
      const slashIdx = cellStr.indexOf('/');
      if (slashIdx >= 0) { subj = cellStr.slice(0, slashIdx).trim(); teacher = cellStr.slice(slashIdx + 1).trim(); }
      const idxGlobal = pIdx * 6 + d + 1;
      const key = targetClass.class_id + '_cell_' + idxGlobal;
      const oldBg = (cellData[key] && cellData[key].bg_color) || '0';
      updates.push({ class_id: targetClass.class_id, cell_index: idxGlobal, cell_type: 'lesson',
        subject: subj, teacher, period_name: '', period_time: '', bg_color: oldBg });
    }
    pIdx++;
  }

  if (!updates.length) { alert('未从 Excel 中解析到有效的课程数据'); return; }
  if (!confirm('即将把「' + sheetName + '」中的 ' + updates.length + ' 个单元格导入到「' + targetClass.name + '」，确认？')) return;
  showSaveStatus('正在导入...', false);
  try {
    await apiCall(API.batchUpsert, updates);
    await reloadCellData();
    renderSchedule();
    showSaveStatus('课表已导入到「' + targetClass.name + '」', false);
    scheduleAutoSync();
  } catch (err) { showSaveStatus('导入失败: ' + (err.message || ''), true); }
};

window.exportSeatExcel = async function () {
  try { await ensureXLSX(); }
  catch (e) { alert('Excel 导出库加载失败，请检查网络'); return; }

  const rows = [['行', '列', '姓名', '性别', '身份证号', '家长1电话', '家长2电话', '家庭地址']];
  for (let r = 0; r < seat.rows; r++) {
    for (let c = 0; c < seat.cols; c++) {
      const idx = r * seat.cols + c;
      const s = seat.students[idx];
      if (!s || !s.name) continue;
      rows.push([r + 1, c + 1, s.name, s.gender || '', s.id_card || '', s.tel1 || '', s.tel2 || '', s.address || '']);
    }
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 5 }, { wch: 5 }, { wch: 10 }, { wch: 6 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 30 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '座位表');
  const prefix = (classes.length > 0 && classes[0].name) ? classes[0].name : '座位表';
  XLSX.writeFile(wb, safeFilePart(prefix) + '_座位表_' + dateStamp() + '.xlsx');
};

window.importSeatExcel = async function (file) {
  let wb;
  try { wb = await readExcelFile(file); }
  catch (e) { showSaveStatus('Excel 解析库加载失败，请检查网络', true); return; }

  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const toImport = [];
  let maxRow = 0, maxCol = 0, skipped = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = parseInt(r[0], 10);
    const colNum = parseInt(r[1], 10);
    const name = String(r[2] || '').trim();
    if (!name) continue;
    if (isNaN(rowNum) || isNaN(colNum)) continue;
    if (rowNum < 1 || colNum < 1) continue;
    if (rowNum > 12 || colNum > 10) { skipped++; continue; }
    let g = String(r[3] || '').trim();
    if (g.indexOf('女') >= 0) g = '女';
    else if (g.indexOf('男') >= 0) g = '男';
    else g = '男';
    toImport.push({
      seat_row: rowNum - 1, seat_col: colNum - 1, name, gender: g,
      id_card: String(r[4] || '').trim(), tel1: String(r[5] || '').trim(),
      tel2: String(r[6] || '').trim(), address: String(r[7] || '').trim(),
    });
    if (rowNum > maxRow) maxRow = rowNum;
    if (colNum > maxCol) maxCol = colNum;
  }

  if (!toImport.length) { alert('未从 Excel 中解析到有效的学生数据'); return; }
  if (skipped > 0) { if (!confirm('有 ' + skipped + ' 条记录超出最大座位范围（12行 × 10列），将被跳过。继续导入？')) return; }

  const clearFirst = confirm('即将导入 ' + toImport.length + ' 名学生。\n\n「确定」= 清空现有座位表后再导入（完全替换）\n「取消」= 仅覆盖 Excel 中出现的座位（保留其他）');

  const MAX_ROWS = 12, MAX_COLS = 10;
  let targetCols = Math.max(8, seat.cols, maxCol);
  if (targetCols > MAX_COLS) targetCols = MAX_COLS;
  let targetRows = Math.max(seat.rows, maxRow, Math.ceil(toImport.length / targetCols));
  if (targetRows > MAX_ROWS) targetRows = MAX_ROWS;
  if (targetRows * targetCols < toImport.length) {
    alert('学生数过多，超过最大容量（' + MAX_ROWS + ' 行 × ' + MAX_COLS + ' 列 = ' + (MAX_ROWS * MAX_COLS) + ' 人）\n本次需导入 ' + toImport.length + ' 人');
    return;
  }

  showSaveStatus('正在导入...', false);
  try {
    if (clearFirst) {
      for (let r = 0; r < seat.rows; r++) {
        for (let c = 0; c < seat.cols; c++) {
          const idx = r * seat.cols + c;
          const s = seat.students[idx];
          if (s && s.name) { try { await apiCall(API.deleteStudent, r, c); } catch {} }
        }
      }
    }
    if (targetRows !== seat.rows || targetCols !== seat.cols) {
      try { await apiCall(API.resize, targetRows, targetCols); }
      catch (e) { showSaveStatus('扩展座位失败: ' + (e.message || ''), true); return; }
      await reloadSeatData();
    }
    for (const st of toImport) { try { await apiCall(API.updateStudent, st); } catch {} }
    await reloadSeatData();
    showSaveStatus('座位表已导入', false);
    scheduleAutoSync();
  } catch (err) { showSaveStatus('导入失败: ' + (err.message || ''), true); }
};

window.openImportTargetPop = function (mode) {
  importTargetMode = mode || 'schedule';
  const gradeSel = $('importTargetGrade');
  const numSel = $('importTargetNum');
  const errEl = $('importTargetError');
  errEl.textContent = '';
  const first = classes[0] || { grade: 7, class_num: 1 };
  fillGradeSelect(gradeSel, first.grade || 7);
  fillClassNumSelect(numSel, first.class_num || 1);

  const h3 = document.querySelector('#importTargetPop h3');
  if (h3) h3.textContent = (importTargetMode === 'roster') ? '选择花名册导入目标班级' : '选择课程表导入目标班级';
  const hint = $('importTargetHint');
  if (hint) hint.textContent = (importTargetMode === 'roster')
    ? '默认导入到所选班级；勾选下方「全部班级」则按 Excel 里的「班级」列自动分班'
    : 'Excel 文件第一个工作表的课程将导入到所选班级';

  const allRow = $('importRosterAllRow');
  const allCb = $('importRosterAll');
  const gradeHint = $('importRosterGradeHint');
  const isRoster = (importTargetMode === 'roster');
  if (allRow) allRow.style.display = isRoster ? 'flex' : 'none';
  if (gradeHint) gradeHint.style.display = 'none';
  gradeSel.disabled = false;
  numSel.disabled = false;

  if (allCb) {
    allCb.checked = false;
    allCb.onchange = () => {
      const checked = allCb.checked;
      numSel.disabled = checked;
      if (gradeHint) gradeHint.style.display = (checked && isRoster) ? '' : 'none';
      errEl.textContent = '';
    };
  }
  $('importTargetPop').style.display = 'flex';
};

window.openExportSchedulePop = function () {
  if (!classes.length) { alert('暂无班级可导出'); return; }
  const listEl = $('exportScheduleList');
  const errEl = $('exportScheduleError');
  listEl.innerHTML = '';
  errEl.textContent = '';
  classes.forEach(cls => {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 6px;cursor:pointer;border-radius:6px;font-size:14px;color:var(--text-main);';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.dataset.classId = cls.class_id; cb.checked = true;
    cb.style.cssText = 'width:16px;height:16px;cursor:pointer;';
    const text = document.createElement('span');
    text.innerHTML = escapeHtml(cls.name) + (cls.badge ? ' <span style="color:var(--text-sub);font-size:12px;">· ' + escapeHtml(cls.badge) + '</span>' : '');
    row.appendChild(cb); row.appendChild(text);
    listEl.appendChild(row);
  });
  $('exportScheduleAll').checked = true;
  $('exportSchedulePop').style.display = 'flex';
};

window.doExportScheduleExcel = async function (list) {
  try { await ensureXLSX(); }
  catch (e) { alert('Excel 导出库加载失败，请检查网络'); return; }

  const wb = XLSX.utils.book_new();
  list.forEach(cls => {
    const rows = [['节次', '时间段', '星期一', '星期二', '星期三', '星期四', '星期五']];
    const periodCount = (cls.period_count && cls.period_count > 0) ? cls.period_count : defaultPeriods.length;
    for (let pIdx = 0; pIdx < periodCount; pIdx++) {
      let pName = (defaultPeriods[pIdx] && defaultPeriods[pIdx].name) || ('第' + (pIdx + 1) + '节');
      let pTime = (defaultPeriods[pIdx] && defaultPeriods[pIdx].time) || '';
      const pKey = cls.class_id + '_cell_' + (pIdx * 6);
      if (cellData[pKey] && cellData[pKey].cell_type === 'period') {
        if (cellData[pKey].period_name) pName = cellData[pKey].period_name;
        if (cellData[pKey].period_time !== undefined) pTime = cellData[pKey].period_time;
      }
      const row = [pName, pTime];
      for (let d = 0; d < 5; d++) {
        const idx = pIdx * 6 + d + 1;
        const key = cls.class_id + '_cell_' + idx;
        let subj = '', teacher = '';
        if (cellData[key] && cellData[key].cell_type === 'lesson') {
          subj = cellData[key].subject || '';
          teacher = cellData[key].teacher || '';
        }
        let cell = subj || '';
        if (teacher) cell = subj ? (subj + '/' + teacher) : teacher;
        row.push(cell);
      }
      rows.push(row);
      if (pIdx === BREAK_AFTER_PERIOD - 1 && pIdx < periodCount - 1) {
        const bKey = cls.class_id + '_cell_' + BREAK_CELL_INDEX;
        let bName = '午休', bTime = '12:00-13:00';
        if (cellData[bKey] && cellData[bKey].cell_type === 'break') {
          if (cellData[bKey].period_name) bName = cellData[bKey].period_name;
          if (cellData[bKey].period_time !== undefined) bTime = cellData[bKey].period_time;
        }
        rows.push([bName, bTime, '', '', '', '', '']);
      }
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
    let sheetName = (cls.name || cls.class_id).replace(/[\\\/\?\*\[\]:]/g, '_').slice(0, 31);
    if (!sheetName) sheetName = cls.class_id;
    let finalName = sheetName, n = 1;
    while (wb.SheetNames.indexOf(finalName) >= 0) { finalName = sheetName.slice(0, 28) + '_' + n; n++; }
    XLSX.utils.book_append_sheet(wb, ws, finalName);
  });
  let prefix;
  if (list.length === 1) prefix = list[0].name || list[0].class_id;
  else if (list.length === classes.length) prefix = '全部' + list.length + '个班';
  else prefix = '多个班级(' + list.length + ')';
  XLSX.writeFile(wb, safeFilePart(prefix) + '_课程表_' + dateStamp() + '.xlsx');
  showSaveStatus('已导出 ' + list.length + ' 个班级', false);
};

/* ---------- 事件绑定 ---------- */
(function bindClassEvents() {
  const editToggleBtn = $('editToggleBtn');
  if (editToggleBtn) editToggleBtn.onclick = (e) => {
    e.stopPropagation();
    editAllOn = !editAllOn;
    editToggleBtn.classList.toggle('active', editAllOn);
    showSaveStatus(editAllOn ? '已开启编辑' : '已锁定', false);
  };

  const seatEditToggle = $('seatEditToggle');
  if (seatEditToggle) seatEditToggle.onclick = (e) => {
    e.stopPropagation();
    seatEditOn = !seatEditOn;
    seatEditToggle.classList.toggle('active', seatEditOn);
    document.body.classList.toggle('person-mode', seatEditOn);
    renderSeats();
    showSaveStatus(seatEditOn ? '已开启编辑座位' : '已锁定', false);
  };

  const dutyEditToggle = $('dutyEditToggle');
  if (dutyEditToggle) dutyEditToggle.onclick = (e) => {
    e.stopPropagation();
    dutyEditOn = !dutyEditOn;
    dutyEditToggle.classList.toggle('active', dutyEditOn);
    showSaveStatus(dutyEditOn ? '已开启编辑值日' : '已锁定', false);
  };

  const classCtrlBar = $('classControlBar');
  if (classCtrlBar) classCtrlBar.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-filter]');
    if (!btn) return;
    const fv = btn.dataset.filter;
    preferences.schedule_filter = fv;
    applyFilter(fv);
    API.updatePreferences({ schedule_filter: fv }).catch(() => {});
  });

  const moreToggle = $('moreToggle');
  if (moreToggle) moreToggle.onclick = (e) => {
    e.stopPropagation();
    const panel = $('morePanel');
    if (!panel) return;
    const open = panel.classList.toggle('open');
    moreToggle.classList.toggle('open', open);
    moreToggle.textContent = open ? '⚙️ 收起' : '⚙️ 更多';
  };

  const createClassBtn = $('createClassBtn');
  if (createClassBtn) createClassBtn.onclick = () => {
    if (!currentUser) { alert('请先登录'); return; }
    openCreateClassPop();
  };

  const seatOrderBtn = $('seatOrderBtn');
  if (seatOrderBtn) seatOrderBtn.onclick = async () => {
    seat.order = seat.order === 'asc' ? 'desc' : 'asc';
    seatOrderBtn.textContent = seat.order === 'asc' ? '讲台上' : '讲台下';
    seatOrderBtn.classList.toggle('active', seat.order === 'desc');
    try { await apiCall(API.setOrder, seat.order); } catch { return; }
    renderSeats();
    scheduleAutoSync();
  };

  const seatAisleBtn = $('seatAisleBtn');
  if (seatAisleBtn) seatAisleBtn.onclick = () => {
    $('aisleInput').value = seat.aisle || '';
    const hint = $('aisleHint');
    if (hint) hint.textContent = '当前座位表：' + seat.cols + ' 列';
    $('aisleError').textContent = '';
    $('aislePop').style.display = 'flex';
    setTimeout(() => $('aisleInput').focus(), 100);
  };

  const seatResizeToggle = $('seatResizeToggle');
  if (seatResizeToggle) seatResizeToggle.onclick = () => {
    const panel = $('seatResizePanel');
    if (!panel) return;
    const open = panel.classList.toggle('open');
    seatResizeToggle.textContent = open ? '行列 收起' : '行列 展开';
    seatResizeToggle.classList.toggle('active', open);
  };
  const seatAddRow = $('seatAddRow'); if (seatAddRow) seatAddRow.onclick = () => resizeSeat(1, 0);
  const seatDelRow = $('seatDelRow'); if (seatDelRow) seatDelRow.onclick = () => resizeSeat(-1, 0);
  const seatAddCol = $('seatAddCol'); if (seatAddCol) seatAddCol.onclick = () => resizeSeat(0, 1);
  const seatDelCol = $('seatDelCol'); if (seatDelCol) seatDelCol.onclick = () => resizeSeat(0, -1);

  const classPopClose = $('classPopClose');
  if (classPopClose) classPopClose.onclick = () => { $('classPop').style.display = 'none'; };
  const classPopEl = $('classPop');
  if (classPopEl) classPopEl.addEventListener('click', e => { if (e.target === classPopEl) classPopEl.style.display = 'none'; });

  const classPopSave = $('classPopSave');
  if (classPopSave) classPopSave.onclick = async () => {
    const grade = parseInt($('classPopGrade').value, 10);
    const numVal = $('classPopNum').value;
    const isCustom = numVal === 'custom';
    const classNum = isCustom ? 0 : parseInt(numVal, 10);
    const customName = isCustom ? ($('classPopCustomName').value || '').trim() : '';
    const badgeName = $('classPopBadge').value.trim();
    const pendingName = ($('classPopRoster') || {}).value || '';
    const errEl = $('classPopError');
    errEl.textContent = '';

    if (!grade || grade < 1 || grade > 12) { errEl.textContent = '请选择年级'; return; }
    if (isCustom) {
      if (!customName) { errEl.textContent = '请输入自定义班级名称'; return; }
      if (customName.length > 30) { errEl.textContent = '自定义名称不能超过 30 个字符'; return; }
      if (classes.some(c => c.name === customName)) { errEl.textContent = '该班级名称已存在'; return; }
    } else {
      if (!classNum || classNum < 1 || classNum > 30) { errEl.textContent = '请选择班级'; return; }
      if (classes.some(c => c.grade === grade && c.class_num === classNum)) { errEl.textContent = '该班级已存在'; return; }
    }
    try {
      const resp = await apiCall(API.createClass, grade, classNum, withBadgePrefix(badgeName), customName);
      classes.push(resp.class);
      classes.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      if (pendingName && resp.class) {
        try { await API.moveRoster(pendingName, resp.class.class_id); showSaveStatus('班级已创建，花名册已导入', false); loadRoster().catch(() => {}); }
        catch (e) { showSaveStatus('班级已创建，但花名册关联失败', true); }
      } else showSaveStatus('班级已创建', false);
      renderFilterButtons();
      renderSchedule();
      updateSeatCardTitle();
      scheduleAutoSync();
      $('classPop').style.display = 'none';
    } catch (err) { errEl.textContent = err.message || '创建失败'; }
  };

  const classManageClose = $('classManageClose');
  if (classManageClose) classManageClose.onclick = () => { $('classManagePop').style.display = 'none'; };
  const classManagePopEl = $('classManagePop');
  if (classManagePopEl) classManagePopEl.addEventListener('click', e => { if (e.target === classManagePopEl) classManagePopEl.style.display = 'none'; });

  const classManageSave = $('classManageSave');
  if (classManageSave) classManageSave.onclick = async () => {
    if (!currentManageClassId) return;
    const cls = classes.find(c => c.class_id === currentManageClassId);
    if (!cls) return;
    const grade = parseInt($('classManageGrade').value, 10);
    const numVal = $('classManageNum').value;
    const isCustom = numVal === 'custom';
    const classNum = isCustom ? 0 : parseInt(numVal, 10);
    const customName = isCustom ? ($('classManageCustomName').value || '').trim() : '';
    const periodCount = parseInt(($('classManagePeriods') || {}).value, 10) || 8;
    const badgeName = $('classManageBadge').value.trim();
    const errEl = $('classManageError');
    errEl.textContent = '';
    if (!grade) { errEl.textContent = '请选择年级'; return; }
    if (isCustom) {
      if (!customName) { errEl.textContent = '请输入自定义班级名称'; return; }
      if (classes.some(c => c.class_id !== cls.class_id && c.name === customName)) { errEl.textContent = '该班级名称已存在'; return; }
    } else {
      if (!classNum) { errEl.textContent = '请选择班级'; return; }
      if (classes.some(c => c.class_id !== cls.class_id && c.grade === grade && c.class_num === classNum)) { errEl.textContent = '该班级已存在'; return; }
    }
    try {
      const newName = isCustom ? customName : formatClassName(grade, classNum);
      await apiCall(API.updateClass, cls.class_id, {
        name: newName, badge: withBadgePrefix(badgeName), grade: grade, class_num: classNum,
        period_count: periodCount, custom_name: isCustom ? customName : '',
      });
      cls.name = newName; cls.badge = withBadgePrefix(badgeName);
      cls.grade = grade; cls.class_num = classNum; cls.period_count = periodCount;
      renderSchedule();
      updateSeatCardTitle();
      showSaveStatus('班级已更新', false);
      scheduleAutoSync();
      $('classManagePop').style.display = 'none';
    } catch (err) { errEl.textContent = err.message || '保存失败'; }
  };

  const classManageDelete = $('classManageDelete');
  if (classManageDelete) classManageDelete.onclick = async () => {
    if (!currentManageClassId) return;
    const cls = classes.find(c => c.class_id === currentManageClassId);
    if (!cls) return;
    if (!confirm('确认删除班级「' + cls.name + '」及其所有课程数据？此操作不可恢复。')) return;
    try {
      await apiCall(API.deleteClass, cls.class_id);
      classes = classes.filter(c => c.class_id !== cls.class_id);
      Object.keys(cellData).forEach(k => { if (k.startsWith(cls.class_id + '_cell_')) delete cellData[k]; });
      renderSchedule();
      updateSeatCardTitle();
      showSaveStatus('班级已删除', false);
      scheduleAutoSync();
      $('classManagePop').style.display = 'none';
    } catch {}
  };

  const cellPopClose = $('cellPopClose');
  if (cellPopClose) cellPopClose.onclick = () => { $('cellPop').style.display = 'none'; };
  const cellPopEl = $('cellPop');
  if (cellPopEl) cellPopEl.addEventListener('click', e => { if (e.target === cellPopEl) cellPopEl.style.display = 'none'; });

  document.querySelectorAll('#cellPopColors button').forEach(b => {
    b.onclick = () => {
      currentBgColor = b.dataset.color;
      document.querySelectorAll('#cellPopColors button').forEach(x => x.classList.remove('selected'));
      b.classList.add('selected');
    };
  });

  const cellPopSave = $('cellPopSave');
  if (cellPopSave) cellPopSave.onclick = async function () {
    if (currentCellIdx === null) return;
    const td = document.querySelector('.schedule-table tbody td[data-idx="' + currentCellIdx + '"][data-class-id="' + cssEscape(currentCellClassId) + '"]');
    if (!td) return;
    const cls = currentCellClassId;
    const key = cls + '_cell_' + currentCellIdx;
    const isCsCell = td.dataset.isCs === '1';

    if (currentCellType === 'period' || currentCellType === 'break') {
      const name = $('cellPopPeriodName').value.trim();
      const time = $('cellPopPeriodTime').value.trim();
      const type = currentCellType;
      const nameEl = td.querySelector('.cell-period-name');
      const timeEl = td.querySelector('.cell-time');
      if (nameEl) nameEl.textContent = name || (type === 'break' ? '午休' : '');
      if (timeEl) timeEl.textContent = time;
      cellData[key] = { class_id: cls, cell_index: currentCellIdx, cell_type: type, period_name: name, period_time: time, bg_color: '0' };
      try {
        await apiCall(API.upsertCell, { class_id: cls, cell_index: currentCellIdx, cell_type: type, period_name: name, period_time: time, subject: '', teacher: '', bg_color: '0' });
      } catch (err) {
        showSaveStatus('保存失败：' + (err.message || ''), true);
        return;
      }
    } else {
      const subject = $('cellPopSubject').value.trim();
      const teacher = $('cellPopTeacher').value.trim();
      td.querySelector('.cell-subject').textContent = subject;
      td.querySelector('.cell-teacher').textContent = teacher;
      cellData[key] = { class_id: cls, cell_index: currentCellIdx, cell_type: 'lesson', subject, teacher, bg_color: currentBgColor };
      try {
        await apiCall(API.upsertCell, { class_id: cls, cell_index: currentCellIdx, cell_type: 'lesson', subject, teacher, bg_color: currentBgColor, period_name: '', period_time: '' });
      } catch (err) {
        showSaveStatus('保存失败：' + (err.message || ''), true);
        return;
      }
      refreshCellStyle(td);
      updateAllLegends();
      // ★ 课服格子保存后重渲染整个课表，确保"第N周"标签与当前周数据同步
      if (isCsCell) renderSchedule();
    }
    renderWeekHighlight();
    showSaveStatus('已保存', false);
    scheduleAutoSync();
    $('cellPop').style.display = 'none';
  };

  const cellPopSubject = $('cellPopSubject');
  if (cellPopSubject) cellPopSubject.addEventListener('keydown', e => { if (e.key === 'Enter') $('cellPopSave').click(); });
  const cellPopTeacher = $('cellPopTeacher');
  if (cellPopTeacher) cellPopTeacher.addEventListener('keydown', e => { if (e.key === 'Enter') $('cellPopSave').click(); });
  const cellPopPeriodName = $('cellPopPeriodName');
  if (cellPopPeriodName) cellPopPeriodName.addEventListener('keydown', e => { if (e.key === 'Enter') $('cellPopPeriodTime').focus(); });
  const cellPopPeriodTime = $('cellPopPeriodTime');
  if (cellPopPeriodTime) cellPopPeriodTime.addEventListener('keydown', e => { if (e.key === 'Enter') $('cellPopSave').click(); });

  const popSaveBtn = $('popSaveBtn');
  if (popSaveBtn) popSaveBtn.onclick = async () => {
    if (!seatEditOn) { alert('请先开启「✏️ 编辑座位」开关'); return; }
    if (currentPopIdx === null) return;
    const s = seat.students[currentPopIdx];
    if (!s) return;
    const name = $('popNameInput').value.trim();
    const gender = $('popGenderInput').value;
    const idCardRaw = $('popIdCardInput').value.trim();
    const tel1Raw = $('popTel1Input').value.trim();
    const tel2Raw = $('popTel2Input').value.trim();
    const addr = $('popAddrInput').value.trim();
    if (!name) { alert('❌ 请填写「姓名」'); $('popNameInput').focus(); return; }
    if (!gender) { alert('❌ 请选择「性别」（男 / 女）'); $('popGenderInput').focus(); return; }
    let idCard = '';
    if (idCardRaw) { idCard = idCardRaw.replace(/\s+/g, ''); if (!/^\d{17}[\dXx]$/.test(idCard)) { alert('❌ 「身份证号」格式错误（需 18 位）\n当前输入：' + idCardRaw); $('popIdCardInput').focus(); return; } }
    let tel1 = '';
    if (tel1Raw) { tel1 = tel1Raw.replace(/[\s-]+/g, ''); if (!/^\d{11}$/.test(tel1)) { alert('❌ 「家长1电话」需为 11 位数字\n当前输入：' + tel1Raw); $('popTel1Input').focus(); return; } }
    let tel2 = '';
    if (tel2Raw) { tel2 = tel2Raw.replace(/[\s-]+/g, ''); if (!/^\d{11}$/.test(tel2)) { alert('❌ 「家长2电话」需为 11 位数字\n当前输入：' + tel2Raw); $('popTel2Input').focus(); return; } }
    if (!addr) { alert('❌ 请填写「家庭地址」'); $('popAddrInput').focus(); return; }
    const aRow = Math.floor(currentPopIdx / seat.cols);
    const aCol = currentPopIdx % seat.cols;
    try {
      await apiCall(API.updateStudent, { seat_row: aRow, seat_col: aCol, name, gender, id_card: idCard, tel1, tel2, address: addr });
      seat.students[currentPopIdx] = { name, gender, id_card: idCard, tel1, tel2, address: addr, seat_row: aRow, seat_col: aCol };
      renderSeats();
      showSaveStatus(currentPopIsNew ? '已添加学生' : '已保存', false);
      scheduleAutoSync();
      $('seatPop').style.display = 'none';
    } catch {}
  };

  const popDeleteBtn = $('popDeleteBtn');
  if (popDeleteBtn) popDeleteBtn.onclick = async () => {
    if (!seatEditOn) { alert('请先开启「✏️ 编辑座位」开关'); return; }
    if (currentPopIdx === null) return;
    const s = seat.students[currentPopIdx];
    if (!s || !s.name) return;
    if (!confirm('确认删除「' + s.name + '」的座位信息？')) return;
    const aRow = Math.floor(currentPopIdx / seat.cols);
    const aCol = currentPopIdx % seat.cols;
    try {
      await apiCall(API.deleteStudent, aRow, aCol);
      seat.students[currentPopIdx] = { name: '', gender: '', id_card: '', tel1: '', tel2: '', address: '' };
      renderSeats();
      showSaveStatus('已删除', false);
      scheduleAutoSync();
      $('seatPop').style.display = 'none';
    } catch {}
  };
  const popCloseBtn = $('popCloseBtn');
  if (popCloseBtn) popCloseBtn.onclick = () => { $('seatPop').style.display = 'none'; };
  const seatPopEl = $('seatPop');
  if (seatPopEl) seatPopEl.addEventListener('click', e => { if (e.target === seatPopEl) seatPopEl.style.display = 'none'; });
  const popTel1Input = $('popTel1Input');
  if (popTel1Input) popTel1Input.addEventListener('input', updateDialBtns);
  const popTel2Input = $('popTel2Input');
  if (popTel2Input) popTel2Input.addEventListener('input', updateDialBtns);
  const popTel1Dial = $('popTel1Dial');
  if (popTel1Dial) popTel1Dial.onclick = () => { const v = $('popTel1Input').value.trim(); if (v) window.location.href = 'tel:' + v; };
  const popTel2Dial = $('popTel2Dial');
  if (popTel2Dial) popTel2Dial.onclick = () => { const v = $('popTel2Input').value.trim(); if (v) window.location.href = 'tel:' + v; };
  ['popNameInput', 'popIdCardInput', 'popTel1Input', 'popTel2Input', 'popAddrInput'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') $('popSaveBtn').click(); });
  });

  const aislePopClose = $('aislePopClose');
  if (aislePopClose) aislePopClose.onclick = () => { $('aislePop').style.display = 'none'; };
  const aislePopEl = $('aislePop');
  if (aislePopEl) aislePopEl.addEventListener('click', e => { if (e.target === aislePopEl) aislePopEl.style.display = 'none'; });
  const aisleSave = $('aisleSave');
  if (aisleSave) aisleSave.onclick = async () => {
    const raw = $('aisleInput').value.trim();
    const errEl = $('aisleError');
    errEl.textContent = '';
    if (raw) {
      const parts = raw.split('+').map(s => parseInt(s.trim(), 10));
      if (parts.length < 2) { errEl.textContent = '至少需要 2 段，如 3+5'; return; }
      if (parts.some(n => isNaN(n) || n < 1)) { errEl.textContent = '格式错误，每段应为数字'; return; }
      const sum = parts.reduce((a, b) => a + b, 0);
      if (sum !== seat.cols) { errEl.textContent = '段数之和 ' + sum + ' 需等于列数 ' + seat.cols; return; }
    }
    try {
      await apiCall(API.setAisle, raw);
      seat.aisle = raw ? raw.split('+').map(s => parseInt(s.trim(), 10)).join('+') : '';
      updateAisleBtn();
      renderSeats();
      showSaveStatus(raw ? '过道已设置' : '已取消过道', false);
      scheduleAutoSync();
      $('aislePop').style.display = 'none';
    } catch (err) { errEl.textContent = err.message; }
  };

  const dutyPopClose = $('dutyPopClose');
  if (dutyPopClose) dutyPopClose.onclick = () => { $('dutyPop').style.display = 'none'; };
  const dutyPopEl = $('dutyPop');
  if (dutyPopEl) dutyPopEl.addEventListener('click', e => { if (e.target === dutyPopEl) dutyPopEl.style.display = 'none'; });
  const dutyPopSave = $('dutyPopSave');
  if (dutyPopSave) dutyPopSave.onclick = async () => {
    if (currentCellIdx === null) return;
    const classId = currentCellClassId;
    const idx = currentCellIdx;
    const type = currentCellType;
    const errEl = $('dutyPopError');
    errEl.textContent = '';
    if (type === 'duty_period') {
      const name = $('dutyPopPeriodName').value.trim();
      try {
        await apiCall(API.upsertCell, { class_id: classId, cell_index: idx, cell_type: 'duty_period', period_name: name, period_time: '', subject: '', teacher: '', bg_color: '0' });
        cellData[classId + '_cell_' + idx] = { class_id: classId, cell_index: idx, cell_type: 'duty_period', period_name: name, subject: '', teacher: '', bg_color: '0' };
        renderDuty();
        showSaveStatus('已保存', false);
        scheduleAutoSync();
        $('dutyPop').style.display = 'none';
      } catch (e) { errEl.textContent = e.message || '保存失败'; }
    } else {
      const raw = $('dutyPopStudents').value;
      const lines = raw.split('\n').map(s => s.trim()).filter(Boolean);
      if (lines.length > 3) { errEl.textContent = '最多 3 名学生'; return; }
      const students = lines.join('\n');
      try {
        await apiCall(API.upsertCell, { class_id: classId, cell_index: idx, cell_type: 'duty', subject: students, teacher: '', bg_color: '0', period_name: '', period_time: '' });
        cellData[classId + '_cell_' + idx] = { class_id: classId, cell_index: idx, cell_type: 'duty', subject: students, teacher: '', bg_color: '0' };
        renderDuty();
        showSaveStatus('已保存', false);
        scheduleAutoSync();
        $('dutyPop').style.display = 'none';
      } catch (e) { errEl.textContent = e.message || '保存失败'; }
    }
  };

  const dutyManageClose = $('dutyManageClose');
  if (dutyManageClose) dutyManageClose.onclick = () => { $('dutyManagePop').style.display = 'none'; };
  const dutyManagePopEl = $('dutyManagePop');
  if (dutyManagePopEl) dutyManagePopEl.addEventListener('click', e => { if (e.target === dutyManagePopEl) dutyManagePopEl.style.display = 'none'; });
  const dutyManageSave = $('dutyManageSave');
  if (dutyManageSave) dutyManageSave.onclick = async () => {
    const classId = $('dutyManagePop').dataset.classId;
    if (!classId) return;
    const n = parseInt($('dutyManageRows').value, 10) || 4;
    const note = $('dutyManageNote').value;
    try {
      await setDutyConfig(classId, n, note);
      currentDutyClassId = classId;
      renderDuty();
      showSaveStatus('已保存', false);
      scheduleAutoSync();
      $('dutyManagePop').style.display = 'none';
    } catch (e) { $('dutyManageError').textContent = e.message || '保存失败'; }
  };
  const dutyManageClear = $('dutyManageClear');
  if (dutyManageClear) dutyManageClear.onclick = async () => {
    if (!confirm('确认清空该班级的值日表？此操作不可恢复。')) return;
    const classId = $('dutyManagePop').dataset.classId;
    if (!classId) return;
    try {
      const storageId = getDutyStorageId(classId);
      const rows = getDutyRows(classId);
      const batch = [];
      for (let row = 0; row < rows; row++) {
        batch.push({ class_id: storageId, cell_index: row * 6, cell_type: 'duty_period', period_name: '', period_time: '', subject: '', teacher: '', bg_color: '0' });
        for (let d = 0; d < DUTY_DAYS; d++) {
          batch.push({ class_id: storageId, cell_index: row * 6 + d + 1, cell_type: 'duty', period_name: '', period_time: '', subject: '', teacher: '', bg_color: '0' });
        }
      }
      await apiCall(API.batchUpsert, batch);
      await reloadCellData();
      renderDuty();
      showSaveStatus('值日表已清空', false);
      scheduleAutoSync();
      $('dutyManagePop').style.display = 'none';
    } catch (e) { $('dutyManageError').textContent = e.message || '清空失败'; }
  };

  const exportScheduleAll = $('exportScheduleAll');
  if (exportScheduleAll) exportScheduleAll.onchange = () => {
    const checked = exportScheduleAll.checked;
    document.querySelectorAll('#exportScheduleList input[type="checkbox"]').forEach(cb => { cb.checked = checked; });
    $('exportScheduleError').textContent = '';
  };
  const exportScheduleList = $('exportScheduleList');
  if (exportScheduleList) exportScheduleList.addEventListener('change', () => {
    const all = document.querySelectorAll('#exportScheduleList input[type="checkbox"]');
    const checked = document.querySelectorAll('#exportScheduleList input[type="checkbox"]:checked');
    $('exportScheduleAll').checked = (all.length > 0 && checked.length === all.length);
    $('exportScheduleError').textContent = '';
  });
  const exportScheduleClose = $('exportScheduleClose');
  if (exportScheduleClose) exportScheduleClose.onclick = () => { $('exportSchedulePop').style.display = 'none'; };
  const exportSchedulePopEl = $('exportSchedulePop');
  if (exportSchedulePopEl) exportSchedulePopEl.addEventListener('click', e => { if (e.target === exportSchedulePopEl) exportSchedulePopEl.style.display = 'none'; });
  const exportScheduleConfirm = $('exportScheduleConfirm');
  if (exportScheduleConfirm) exportScheduleConfirm.onclick = () => {
    const selected = [];
    document.querySelectorAll('#exportScheduleList input[type="checkbox"]:checked').forEach(cb => {
      const id = cb.dataset.classId;
      const cls = classes.find(c => c.class_id === id);
      if (cls) selected.push(cls);
    });
    if (!selected.length) { $('exportScheduleError').textContent = '请至少选择一个班级'; return; }
    doExportScheduleExcel(selected);
    $('exportSchedulePop').style.display = 'none';
  };

  const importTargetClose = $('importTargetClose');
  if (importTargetClose) importTargetClose.onclick = () => { $('importTargetPop').style.display = 'none'; };
  const importTargetPopEl = $('importTargetPop');
  if (importTargetPopEl) importTargetPopEl.addEventListener('click', e => { if (e.target === importTargetPopEl) importTargetPopEl.style.display = 'none'; });
  const importTargetConfirm = $('importTargetConfirm');
  if (importTargetConfirm) importTargetConfirm.onclick = () => {
    const errEl = $('importTargetError');
    errEl.textContent = '';
    const allCb = $('importRosterAll');
    if (importTargetMode === 'roster' && allCb && allCb.checked) {
      const gradeForAll = parseInt($('importTargetGrade').value, 10) || 0;
      $('importTargetPop').style.display = 'none';
      pickExcelFile((file) => importRosterExcel(file, null, gradeForAll));
      return;
    }
    const grade = parseInt($('importTargetGrade').value, 10);
    const classNum = parseInt($('importTargetNum').value, 10);
    const cls = classes.find(c => c.grade === grade && c.class_num === classNum);
    if (!cls) { errEl.textContent = '该班级不存在，请先创建'; return; }
    $('importTargetPop').style.display = 'none';
    if (importTargetMode === 'roster') pickExcelFile((file) => importRosterExcel(file, cls, 0));
    else pickExcelFile((file) => importScheduleExcel(file, cls));
  };

  const exportExcelBtn = $('exportExcelBtn');
  if (exportExcelBtn) exportExcelBtn.onclick = () => {
    if (activeSubTab === 'seat') exportSeatExcel();
    else if (activeSubTab === 'schedule') openExportSchedulePop();
    else showSaveStatus('请先切换到课程表或座位表', true);
  };
  const importExcelBtn = $('importExcelBtn');
  if (importExcelBtn) importExcelBtn.onclick = () => {
    if (activeSubTab !== 'schedule' && activeSubTab !== 'seat') { showSaveStatus('请先切换到课程表或座位表', true); return; }
    if (activeSubTab === 'seat') pickExcelFile((file) => importSeatExcel(file));
    else { if (!classes.length) { alert('请先创建至少一个班级'); return; } openImportTargetPop('schedule'); }
  };
  const exportBtn = $('exportBtn');
  if (exportBtn) exportBtn.onclick = async () => {
    try { await ensureHtml2Canvas(); }
    catch (e) { alert('图片导出库加载失败，请检查网络：' + (e.message || e)); return; }

    const isSeat = (activeSubTab === 'seat');
    let wrap;
    if (isSeat) {
      wrap = seatCard.cloneNode(true);
      wrap.style.display = 'block';
      wrap.querySelectorAll('.seat-tools').forEach(el => el.remove());
      wrap.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    } else {
      const legendCard = $('legendCard');
      const cards = document.querySelectorAll('.class-card');
      const visible = Array.from(cards).filter(c => c.style.display !== 'none');
      if (!visible.length) return alert('没有选中班级卡片');
      wrap = document.createElement('div');
      wrap.style.padding = '20px';
      wrap.style.background = getComputedStyle(document.body).background;
      visible.forEach(c => wrap.appendChild(c.cloneNode(true)));
      if (legendCard) wrap.appendChild(legendCard.cloneNode(true));
    }
    document.body.appendChild(wrap);
    try {
      const canvas = await html2canvas(wrap, { useCORS: true, scale: 2, backgroundColor: null });
      const link = document.createElement('a');
      link.download = (isSeat ? '座位表' : '课程表') + '_' + new Date().toLocaleDateString() + '.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e) { alert('导出失败：' + (e.message || e)); }
    finally { wrap.remove(); }
  };

  /* 课服编辑弹窗 */
  const csClose = $('classServiceClose');
  if (csClose) csClose.onclick = () => { $('classServicePop').style.display = 'none'; };
  const csPopEl = $('classServicePop');
  if (csPopEl) csPopEl.addEventListener('click', e => { if (e.target === csPopEl) csPopEl.style.display = 'none'; });
  const csSaveBtn = $('classServiceSave');
  if (csSaveBtn) csSaveBtn.onclick = () => saveClassService();
  const csClearBtn = $('classServiceClear');
  if (csClearBtn) csClearBtn.onclick = () => clearClassService();

  /* 班级拖拽 document 级事件 */
  document.addEventListener('mousemove', (e) => {
    if (classPressState) {
      const dx = e.clientX - classPressState.x;
      const dy = e.clientY - classPressState.y;
      if (Math.sqrt(dx * dx + dy * dy) > CLASS_MOVE_CANCEL_PX) {
        if (classPressTimer) { clearTimeout(classPressTimer); classPressTimer = null; }
        classPressState = null;
      }
      return;
    }
    if (classDrag) updateClassDrag(e.clientX, e.clientY);
  });
  document.addEventListener('mouseup', () => {
    if (classPressState) { if (classPressTimer) { clearTimeout(classPressTimer); classPressTimer = null; } classPressState = null; }
    if (classDrag) finishClassDrag();
  });
  document.addEventListener('touchmove', (e) => {
    if (classPressState && e.touches.length === 1) {
      const t = e.touches[0];
      const dx = t.clientX - classPressState.x, dy = t.clientY - classPressState.y;
      if (Math.sqrt(dx * dx + dy * dy) > CLASS_MOVE_CANCEL_PX) { if (classPressTimer) { clearTimeout(classPressTimer); classPressTimer = null; } classPressState = null; }
      return;
    }
    if (classDrag && e.touches.length === 1) { e.preventDefault(); updateClassDrag(e.touches[0].clientX, e.touches[0].clientY); }
  }, { passive: false });
  document.addEventListener('touchend', () => {
    if (classPressState) { if (classPressTimer) { clearTimeout(classPressTimer); classPressTimer = null; } classPressState = null; }
    if (classDrag) finishClassDrag();
  });
  document.addEventListener('touchcancel', () => {
    if (classPressState) { if (classPressTimer) { clearTimeout(classPressTimer); classPressTimer = null; } classPressState = null; }
    if (classDrag) finishClassDrag();
  });

  /* 座位拖拽 document 级事件 */
  document.addEventListener('mousemove', e => onSeatMove(e.clientX, e.clientY));
  document.addEventListener('mouseup', onSeatEnd);
  window.addEventListener('blur', onSeatEnd);
  document.addEventListener('touchmove', e => {
    if (activeDrag) { e.preventDefault(); if (e.touches.length === 1) onSeatMove(e.touches[0].clientX, e.touches[0].clientY); }
    else if (pressState) { if (e.touches.length === 1) { const t = e.touches[0]; const dx = t.clientX - pressState.x, dy = t.clientY - pressState.y; if (Math.sqrt(dx * dx + dy * dy) > MOVE_CANCEL_PX) cancelSeatPress(); } }
  }, { passive: false });
  document.addEventListener('touchend', onSeatEnd);
  document.addEventListener('touchcancel', onSeatEnd);
  document.addEventListener('contextmenu', e => {
    const t = e.target;
    if (t && t.closest && t.closest('.seat-item')) { e.preventDefault(); return false; }
  });
})();