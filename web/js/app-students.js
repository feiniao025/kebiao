/* ============================================================
   app-students.js —— 学生模块（花名册 / 成绩 / 考勤）
   ============================================================ */

/* ---------- 花名册 ---------- */
window.renderRoster = async function () {
  const classOptions = ['<option value="">全部班级</option>'].concat(
    classes.map(c => '<option value="' + escapeHtml(c.class_id) + '">' + escapeHtml(c.name) + '</option>')
  ).join('');

  rosterContainer.innerHTML =
    '<div class="me-page">' +
      '<div class="me-card">' +
        '<div class="roster-toolbar">' +
          '<select id="rosterFilterClass" class="cell-pop-input" style="flex:1;">' + classOptions + '</select>' +
          '<input type="text" id="rosterSearch" class="cell-pop-input" placeholder="按姓名搜索…" style="flex:1;">' +
          '<button id="rosterAddBtn" class="btn-primary">＋ 添加</button>' +
        '</div>' +
        '<div id="rosterList" class="roster-list">加载中...</div>' +
      '</div>' +
    '</div>';

  const clsSel = $('rosterFilterClass');
  clsSel.value = currentRosterClassId;
  clsSel.onchange = () => { currentRosterClassId = clsSel.value; loadRoster(); };
  const search = $('rosterSearch');
  search.value = currentRosterKeyword;
  search.oninput = () => { currentRosterKeyword = search.value.trim(); renderRosterList(); };
  $('rosterAddBtn').onclick = () => openRosterPop(null);
  await loadRoster();
};

window.loadRoster = async function () {
  try {
    const resp = await API.listRoster(currentRosterClassId);
    rosterList = resp.students || [];
  } catch { rosterList = []; }
  renderRosterList();
};

window.renderRosterList = function () {
  const el = $('rosterList');
  if (!el) return;
  const kw = currentRosterKeyword.toLowerCase();
  let list = rosterList;
  if (kw) list = list.filter(s => (s.name || '').toLowerCase().includes(kw));

  if (list.length === 0) {
    el.innerHTML = '<div class="today-empty">暂无学生，点击右上角「＋ 添加」开始录入</div>';
    return;
  }

  const classOrder = {};
  classes.forEach((c, i) => { classOrder[c.class_id] = i; });
  list = list.slice().sort((a, b) => {
    const aMatched = a.class_id in classOrder;
    const bMatched = b.class_id in classOrder;
    if (aMatched !== bMatched) return aMatched ? -1 : 1;
    if (aMatched) { if (classOrder[a.class_id] !== classOrder[b.class_id]) return classOrder[a.class_id] - classOrder[b.class_id]; }
    else { if (a.class_id !== b.class_id) return (a.class_id || '').localeCompare(b.class_id || '', 'zh-CN'); }
    return (a.name || '').localeCompare(b.name || '', 'zh-CN');
  });

  let html = '<table class="roster-table"><thead><tr>' +
    '<th>序号</th><th>姓名</th><th>性别</th>' +
    '<th>身份证</th><th>班级</th><th>家长电话1</th><th>家长电话2</th><th>家庭地址</th>' +
    '</tr></thead><tbody>';

  list.forEach((s, i) => {
    const cls = classes.find(c => c.class_id === s.class_id);
    const isPending = !cls;
    const clsDisplay = isPending ? escapeHtml(s.class_id) + ' <span class="pending-tag">待关联</span>' : escapeHtml(cls.name);
    const genderCls = s.gender === '女' ? 'gender-f' : (s.gender === '男' ? 'gender-m' : '');
    html += '<tr class="roster-tr' + (isPending ? ' pending-class' : '') + '" data-class="' + escapeHtml(s.class_id) + '" data-name="' + escapeHtml(s.name) + '">' +
      '<td class="idx">' + (i + 1) + '</td>' +
      '<td class="name">' + escapeHtml(s.name) + '</td>' +
      '<td class="' + genderCls + '">' + escapeHtml(s.gender || '') + '</td>' +
      '<td>' + escapeHtml(s.id_card || '') + '</td>' +
      '<td>' + clsDisplay + '</td>' +
      '<td>' + escapeHtml(s.tel1 || '') + '</td>' +
      '<td>' + escapeHtml(s.tel2 || '') + '</td>' +
      '<td class="addr">' + escapeHtml(s.address || '') + '</td></tr>';
  });
  html += '</tbody></table>';
  el.innerHTML = html;

  el.querySelectorAll('.roster-tr').forEach(tr => {
    tr.onclick = () => {
      const cid = tr.dataset.class, name = tr.dataset.name;
      const s = rosterList.find(x => x.class_id === cid && x.name === name);
      if (s) openRosterPop(s);
    };
  });
};

window.openRosterPop = function (student) {
  if (classes.length === 0) { alert('请先在「班级 → 课表」中创建班级'); return; }
  const isNew = !student;
  const editable = isNew || rosterEditOn;
  $('rosterPopTitle').textContent = isNew ? '添加学生' : (editable ? '编辑学生' : '查看学生');
  fillClassSelect($('rosterPopClass'), student ? student.class_id : currentRosterClassId);
  $('rosterPopName').value = student ? student.name : '';
  $('rosterPopGender').value = student ? (student.gender || '男') : '男';
  $('rosterPopIdCard').value = student ? (student.id_card || '') : '';
  $('rosterPopTel1').value = student ? (student.tel1 || '') : '';
  $('rosterPopTel2').value = student ? (student.tel2 || '') : '';
  $('rosterPopAddress').value = student ? (student.address || '') : '';
  $('rosterPopError').textContent = '';
  $('rosterPopName').readOnly = !editable;
  $('rosterPopClass').disabled = !editable;
  $('rosterPopGender').disabled = !editable;
  $('rosterPopIdCard').readOnly = !editable;
  $('rosterPopTel1').readOnly = !editable;
  $('rosterPopTel2').readOnly = !editable;
  $('rosterPopAddress').readOnly = !editable;
  const saveBtn = $('rosterPopSave');
  if (saveBtn) saveBtn.style.display = editable ? '' : 'none';
  $('rosterPop').style.display = 'flex';
  $('rosterPop').dataset.editing = isNew ? '0' : '1';
  $('rosterPop').dataset.oldClass = student ? student.class_id : '';
  $('rosterPop').dataset.oldName = student ? student.name : '';
  setTimeout(() => { if (isNew) $('rosterPopName').focus(); }, 100);
};

window.exportRosterImage = async function () {
  try { await ensureHtml2Canvas(); }
  catch (e) { alert('图片导出库加载失败，请检查网络：' + (e.message || e)); return; }

  const card = rosterContainer.querySelector('.me-card');
  if (!card) { alert('无法获取花名册内容'); return; }
  const wrap = document.createElement('div');
  wrap.style.padding = '20px';
  wrap.style.background = getComputedStyle(document.body).background;
  const cloned = card.cloneNode(true);
  cloned.querySelectorAll('.roster-toolbar').forEach(el => el.remove());
  wrap.appendChild(cloned);
  document.body.appendChild(wrap);
  try {
    const canvas = await html2canvas(wrap, { useCORS: true, scale: 2, backgroundColor: null });
    const link = document.createElement('a');
    link.download = '花名册_' + new Date().toLocaleDateString('zh-CN').replace(/\//g, '-') + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    showSaveStatus('已导出图片', false);
  } catch (e) { alert('导出失败：' + (e.message || e)); }
  finally { wrap.remove(); }
};

window.openExportRosterPop = function () {
  const gradeSel = $('exportRosterGrade');
  const numSel = $('exportRosterNum');
  const errEl = $('exportRosterError');
  const allCb = $('exportRosterAll');
  errEl.textContent = '';
  let defaultCls = null;
  if (currentRosterClassId) defaultCls = classes.find(c => c.class_id === currentRosterClassId);
  if (!defaultCls && classes.length > 0) defaultCls = classes[0];
  if (defaultCls) { fillGradeSelect(gradeSel, defaultCls.grade || 7); fillClassNumSelect(numSel, defaultCls.class_num || 1); }
  else { fillGradeSelect(gradeSel, 7); fillClassNumSelect(numSel, 1); }
  allCb.checked = false;
  gradeSel.disabled = false;
  numSel.disabled = false;
  allCb.onchange = () => {
    const checked = allCb.checked;
    gradeSel.disabled = checked;
    numSel.disabled = checked;
    errEl.textContent = '';
  };
  $('exportRosterPop').style.display = 'flex';
};

window.exportRosterExcelByClass = async function (classId) {
  try { await ensureXLSX(); }
  catch (e) { alert('Excel 导出库加载失败，请检查网络'); return; }

  let list = [];
  try { const resp = await apiCall(API.listRoster, classId || ''); list = resp.students || []; } catch (e) { return; }
  if (list.length === 0) { alert(classId ? '该班级暂无学生' : '暂无学生数据'); return; }
  const classOrder = {};
  classes.forEach((c, i) => { classOrder[c.class_id] = i; });
  list = list.slice().sort((a, b) => {
    const aMatched = a.class_id in classOrder;
    const bMatched = b.class_id in classOrder;
    if (aMatched !== bMatched) return aMatched ? -1 : 1;
    if (aMatched) { if (classOrder[a.class_id] !== classOrder[b.class_id]) return classOrder[a.class_id] - classOrder[b.class_id]; }
    else { if (a.class_id !== b.class_id) return (a.class_id || '').localeCompare(b.class_id || '', 'zh-CN'); }
    return (a.name || '').localeCompare(b.name || '', 'zh-CN');
  });
  const rows = [['序号', '姓名', '性别', '身份证', '班级', '家长电话1', '家长电话2', '家庭地址']];
  list.forEach((s, i) => {
    const cls = classes.find(c => c.class_id === s.class_id);
    rows.push([i + 1, s.name || '', s.gender || '', s.id_card || '',
      cls ? cls.name : (s.class_id + '（待关联）'),
      s.tel1 || '', s.tel2 || '', s.address || '']);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 5 }, { wch: 10 }, { wch: 6 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 30 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '花名册');
  let prefix = '全部花名册';
  if (classId) { const cls = classes.find(c => c.class_id === classId); prefix = cls ? cls.name + '_花名册' : '花名册'; }
  XLSX.writeFile(wb, safeFilePart(prefix) + '_' + dateStamp() + '.xlsx');
  showSaveStatus('已导出 ' + list.length + ' 条', false);
};

window.matchRosterHeaderCell = function (cell) {
  const t = String(cell || '').trim();
  if (!t) return '';
  const low = t.toLowerCase();
  const aliases = {
    name: ['姓名', '名字', '学生姓名', '学生', 'name'],
    gender: ['性别', 'sex'],
    idCard: ['身份证号', '身份证', '证件号', 'idcard', 'id_card'],
    tel1: ['家长电话1', '家长1电话', '家长电话一', '电话1', '联系电话1', '联系电话', '家长电话', '父/母电话', 'tel1'],
    tel2: ['家长电话2', '家长2电话', '家长电话二', '电话2', '联系电话2', '备用电话', 'tel2'],
    address: ['家庭地址', '家庭住址', '住址', '地址', 'address'],
    classCol: ['班级', '班级名称', '所在班级', '班别', 'class', '行政班'],
  };
  for (const k of Object.keys(aliases)) {
    for (const a of aliases[k]) {
      if (t === a || t.indexOf(a) >= 0 || low === a || low.indexOf(a) >= 0) return k;
    }
  }
  return '';
};

window.importRosterExcel = async function (file, targetClass, gradeHint) {
  const isAllMode = !targetClass;
  gradeHint = gradeHint || 0;
  let wb;
  try { wb = await readExcelFile(file); }
  catch (e) { showSaveStatus('Excel 解析库加载失败，请检查网络', true); return; }

  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (rows.length < 1) { alert('Excel 内容为空'); return; }

  let headerRowIdx = -1, headerMap = {}, bestScore = 0;
  for (let r = 0; r < Math.min(10, rows.length); r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;
    const map = {}; let score = 0;
    row.forEach((cell, ci) => {
      const k = matchRosterHeaderCell(cell);
      if (k && map[k] === undefined) { map[k] = ci; score++; }
    });
    if (map.name !== undefined && score > bestScore) { bestScore = score; headerRowIdx = r; headerMap = map; }
  }

  let dataStartIdx, colIdx;
  if (headerRowIdx >= 0) {
    dataStartIdx = headerRowIdx + 1;
    colIdx = {
      name: headerMap.name !== undefined ? headerMap.name : -1,
      gender: headerMap.gender !== undefined ? headerMap.gender : -1,
      idCard: headerMap.idCard !== undefined ? headerMap.idCard : -1,
      tel1: headerMap.tel1 !== undefined ? headerMap.tel1 : -1,
      tel2: headerMap.tel2 !== undefined ? headerMap.tel2 : -1,
      address: headerMap.address !== undefined ? headerMap.address : -1,
      classCol: headerMap.classCol !== undefined ? headerMap.classCol : -1,
    };
  } else {
    const yes = await showConfirm(
      '未在 Excel 前 10 行中找到「姓名」表头。\n\n是否按常见列顺序解析？\n（默认：序号 | 姓名 | 性别 | 身份证 | 班级 | 家长电话1 | 家长电话2 | 家庭地址）',
      { title: '确认解析方式', okText: '按默认解析', danger: false }
    );
    if (!yes) return;
    dataStartIdx = 0;
    colIdx = { name: 1, gender: 2, idCard: 3, classCol: 4, tel1: 5, tel2: 6, address: 7 };
  }

  if (isAllMode && colIdx.classCol < 0) {
    alert('「全部班级」模式需要能识别出「班级」列。\n请检查 Excel 中是否有班级列，或改用「指定班级」导入。');
    return;
  }

  const classByName = {};
  classes.forEach(c => { classByName[c.name] = c.class_id; });

  const CN_NUM_MAP = { '一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,
    '十一':11,'十二':12,'十三':13,'十四':14,'十五':15,'十六':16,'十七':17,'十八':18,'十九':19,'二十':20,
    '二十一':21,'二十二':22,'二十三':23,'二十四':24,'二十五':25,'二十六':26,'二十七':27,'二十八':28,'二十九':29,'三十':30 };

  function findClassByGradeAndNum(grade, num) {
    for (const c of classes) if (c.grade === grade && c.class_num === num) return c.class_id;
    return '';
  }

  function matchClassId(text) {
    if (!text) return '';
    const t = String(text).trim();
    if (!t) return '';
    if (classByName[t]) return classByName[t];
    const mNum = t.match(/^(\d+)\s*班?$/);
    if (mNum && gradeHint) { const n = parseInt(mNum[1], 10); const hit = findClassByGradeAndNum(gradeHint, n); if (hit) return hit; }
    const mCN = t.match(/^([一二三四五六七八九十]+)\s*班?$/);
    if (mCN && gradeHint) { const n = CN_NUM_MAP[mCN[1]]; if (n) { const hit = findClassByGradeAndNum(gradeHint, n); if (hit) return hit; } }
    for (const c of classes) {
      const zh = c.name.replace(/^(.+?)\.(\d+)班$/, '$1年级$2班');
      if (zh === t) return c.class_id;
      if (t === c.grade + '-' + c.class_num) return c.class_id;
      if (t === c.grade + '.' + c.class_num) return c.class_id;
      if (t === c.grade + '_' + c.class_num) return c.class_id;
      if (t === c.grade + '年' + c.class_num + '班') return c.class_id;
      if (t === c.grade + '年级' + c.class_num + '班') return c.class_id;
      if (t === c.grade + '年级' + c.class_num) return c.class_id;
      if (t === gradeLabel(c.grade) + '年级' + c.class_num + '班') return c.class_id;
      if (t === gradeLabel(c.grade) + '.' + c.class_num + '班') return c.class_id;
      if (t === gradeLabel(c.grade) + c.class_num + '班') return c.class_id;
    }
    const mGrade = t.match(/^([一二三四五六七八九十\d]+)\s*年级\s*(\d+)\s*班?$/);
    if (mGrade) {
      let g;
      if (/^\d+$/.test(mGrade[1])) g = parseInt(mGrade[1], 10);
      else g = CN_NUM_MAP[mGrade[1]] || 0;
      const n = parseInt(mGrade[2], 10);
      if (g && n) { const hit = findClassByGradeAndNum(g, n); if (hit) return hit; }
    }
    return '';
  }

  const toImport = [];
  let skipped = 0, emptyName = 0, pending = 0;

  for (let i = dataStartIdx; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    if (colIdx.name >= 0 && matchRosterHeaderCell(r[colIdx.name]) === 'name') continue;
    const name = colIdx.name >= 0 ? String(r[colIdx.name] || '').trim() : '';
    if (!name) { emptyName++; continue; }
    let classId = '';
    if (isAllMode) {
      const clsText = colIdx.classCol >= 0 ? String(r[colIdx.classCol] || '').trim() : '';
      if (!clsText) { emptyName++; continue; }
      const matched = matchClassId(clsText);
      classId = matched || clsText;
      if (!matched) pending++;
    } else classId = targetClass.class_id;
    let g = colIdx.gender >= 0 ? String(r[colIdx.gender] || '').trim() : '';
    if (g.indexOf('女') >= 0) g = '女';
    else if (g.indexOf('男') >= 0) g = '男';
    else g = '男';
    let idCard = colIdx.idCard >= 0 ? String(r[colIdx.idCard] || '').trim().replace(/\s+/g, '') : '';
    if (idCard && !/^\d{17}[\dXx]$/.test(idCard)) { skipped++; idCard = ''; }
    let tel1 = colIdx.tel1 >= 0 ? String(r[colIdx.tel1] || '').trim().replace(/[\s-]+/g, '') : '';
    if (tel1 && !/^\d{11}$/.test(tel1)) { skipped++; tel1 = ''; }
    let tel2 = colIdx.tel2 >= 0 ? String(r[colIdx.tel2] || '').trim().replace(/[\s-]+/g, '') : '';
    if (tel2 && !/^\d{11}$/.test(tel2)) { skipped++; tel2 = ''; }
    const address = colIdx.address >= 0 ? String(r[colIdx.address] || '').trim() : '';
    toImport.push({ class_id: classId, name, gender: g, id_card: idCard, tel1, tel2, address });
  }

  if (!toImport.length) { alert('未从 Excel 中解析到有效的学生数据\n\n空姓名行数：' + emptyName); return; }

  let msg = isAllMode
    ? '即将把 ' + toImport.length + ' 名学生按 Excel 中的「班级」列分别导入花名册'
    : '即将把 ' + toImport.length + ' 名学生导入到「' + targetClass.name + '」';
  msg += '\n（同班同名学生将覆盖原记录）';
  if (skipped > 0) msg += '\n有 ' + skipped + ' 条格式错误（身份证/电话）已被清空';
  if (pending > 0) msg += '\n有 ' + pending + ' 条所在班级尚未创建，将以「待关联」状态保存';
  msg += '\n\n确认导入？';
  if (!(await showConfirm(msg, { title: '导入花名册', okText: '确认导入', danger: false }))) return;

  showSaveStatus('正在导入...', false);
  let ok = 0, fail = 0;
  for (const item of toImport) {
    try { await API.upsertRoster(item); ok++; } catch (e) { fail++; }
  }
  await loadRoster();
  showSaveStatus('导入完成：成功 ' + ok + ' 条' + (fail ? '，失败 ' + fail + ' 条' : ''), fail > 0);
};

/* ---------- 成绩 ---------- */
window.renderGrades = async function () {
  const classOptions = classes.map(c => '<option value="' + escapeHtml(c.class_id) + '">' + escapeHtml(c.name) + '</option>').join('');
  const subjectOptions = SUBJECTS.map(s => '<option value="' + s + '">' + s + '</option>').join('');

  gradesContainer.innerHTML =
    '<div class="me-page">' +
      '<div class="me-card">' +
        '<div class="roster-toolbar">' +
          '<select id="gradesClass" class="cell-pop-input" style="flex:1;">' + (classOptions || '<option value="">（暂无班级）</option>') + '</select>' +
          '<select id="gradesSubject" class="cell-pop-input" style="flex:1;">' + subjectOptions + '</select>' +
          '<button id="gradesAddExam" class="btn-primary">＋ 新建考试</button>' +
        '</div>' +
        '<div id="examsList" class="exams-list">加载中...</div>' +
      '</div>' +
    '</div>';

  if (classes.length === 0) { $('examsList').innerHTML = '<div class="today-empty">请先在「班级 → 课表」中创建班级</div>'; return; }
  if (!currentGradesClassId) currentGradesClassId = classes[0].class_id;
  const clsSel = $('gradesClass');
  clsSel.value = currentGradesClassId;
  clsSel.onchange = () => { currentGradesClassId = clsSel.value; loadExams(); };
  const subSel = $('gradesSubject');
  subSel.value = currentGradesSubject;
  subSel.onchange = () => { currentGradesSubject = subSel.value; loadExams(); };
  $('gradesAddExam').onclick = () => openExamPop(null);
  await loadExams();
};

window.loadExams = async function () {
  const el = $('examsList');
  if (!el) return;
  el.textContent = '加载中...';
  try {
    const resp = await API.listExams(currentGradesClassId);
    examsList = (resp.exams || []).filter(e => e.subject === currentGradesSubject);
  } catch { examsList = []; }
  if (examsList.length === 0) {
    el.innerHTML = '<div class="today-empty">暂无「' + escapeHtml(currentGradesSubject) + '」考试记录，点击「＋ 新建考试」开始</div>';
    return;
  }
  let html = '';
  for (const e of examsList) {
    html += '<div class="exam-row" data-id="' + e.id + '">' +
      '<div class="exam-row-head"><span class="exam-name">' + escapeHtml(e.name) + ' · ' + escapeHtml(e.subject) + '</span>' +
      '<div class="exam-actions">' +
      '<button class="btn-sm btn-edit-exam" data-exam=\'' + JSON.stringify(e).replace(/'/g, "\\'") + '\'>' + icon('pencil') + ' 修改</button>' +
      '<button class="btn-sm btn-del-exam" data-id="' + e.id + '">' + icon('trash') + ' 删除</button>' +
      '</div></div>' +
      '<div class="exam-meta">满分 ' + e.full_score + ' · 及格 ' + e.pass_score + ' · 优秀 ' + e.excellent_score + '</div>' +
      '<div class="exam-stats" data-stats-for="' + e.id + '">加载中...</div></div>';
  }
  el.innerHTML = html;
  el.querySelectorAll('.btn-edit-exam').forEach(btn => {
    btn.onclick = (ev) => { ev.stopPropagation(); const examData = JSON.parse(btn.dataset.exam); openExamPop(examData); };
  });
  el.querySelectorAll('.btn-del-exam').forEach(btn => {
    btn.onclick = (ev) => { ev.stopPropagation(); window.deleteExam(parseInt(btn.dataset.id, 10)); };
  });
  el.querySelectorAll('.exam-row').forEach(row => {
    row.onclick = (ev) => { if (ev.target.closest('.exam-actions')) return; openScoresPop(parseInt(row.dataset.id, 10)); };
  });
  for (const e of examsList) loadExamStats(e.id);
};

window.loadExamStats = async function (examId) {
  const el = document.querySelector('[data-stats-for="' + examId + '"]');
  if (!el) return;
  try {
    const resp = await API.getExamDetail(examId);
    const st = resp.stats || {};

    // 取该考试对应班级的花名册人数
    let total = 0;
    try {
      const cid = (resp.exam && resp.exam.class_id) || currentGradesClassId;
      const rosterResp = await API.listRoster(cid);
      total = (rosterResp.students || []).length;
    } catch (e) { total = 0; }

    el.innerHTML =
      '<div class="stat-cell"><span class="k">平均分</span><span class="v">' + (st.average ? st.average.toFixed(1) : '—') + ' / ' + (st.full_score || 0) + '</span></div>' +
      '<div class="stat-cell"><span class="k">及格率</span><span class="v">' + (st.pass_rate ? st.pass_rate.toFixed(1) : '0.0') + '% (' + (st.pass_count || 0) + '人 ≥' + (st.pass_line || 0) + ')</span></div>' +
      '<div class="stat-cell"><span class="k">优秀率</span><span class="v">' + (st.excellent_rate ? st.excellent_rate.toFixed(1) : '0.0') + '% (' + (st.excellent_count || 0) + '人 ≥' + (st.excellent_line || 0) + ')</span></div>' +
      '<div class="stat-cell"><span class="k">最高/最低</span><span class="v">' + (st.max_score || 0) + ' / ' + (st.min_score || 0) + '</span></div>' +
      '<div class="stat-cell"><span class="k">已录/缺考/总</span><span class="v">' + (st.count || 0) + ' / ' + (st.absent_count || 0) + ' / ' + total + '</span></div>';
  } catch { el.textContent = '加载失败'; }
};

window.fillSubjectSelect = function (sel, defaultVal) {
  if (!sel) return;
  sel.innerHTML = '';
  SUBJECTS.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s; opt.textContent = s;
    if (s === defaultVal) opt.selected = true;
    sel.appendChild(opt);
  });
};

/* 填充分值/预设考试名下拉：预设列表 + "自定义名称…" 选项 */
window.fillExamNameSelect = function (sel, defaultVal) {
  if (!sel) return;
  sel.innerHTML = '';

  let matched = false;
  EXAM_NAMES.forEach(n => {
    const opt = document.createElement('option');
    opt.value = n;
    opt.textContent = n;
    if (n === defaultVal) { opt.selected = true; matched = true; }
    sel.appendChild(opt);
  });

  // ★ 追加"自定义名称"选项
  const customOpt = document.createElement('option');
  customOpt.value = '__custom__';
  customOpt.textContent = '自定义名称…';
  if (!matched && defaultVal) customOpt.selected = true;
  sel.appendChild(customOpt);
};

window.openExamPop = function (exam) {
  if (classes.length === 0) { alert('请先创建班级'); return; }
  const isNew = !exam;
  $('examPopTitle').textContent = isNew ? '新建考试' : '编辑考试';
  fillClassSelect($('examPopClass'), exam ? exam.class_id : currentGradesClassId);
  fillSubjectSelect($('examPopSubject'), exam ? exam.subject : currentGradesSubject);
  fillExamNameSelect($('examPopName'), exam ? exam.name : EXAM_NAMES[0]);

  // ★ 自定义名称行控制
  const nameSel     = $('examPopName');
  const customRow   = $('examPopCustomNameRow');
  const customInput = $('examPopCustomName');

  if (exam && EXAM_NAMES.indexOf(exam.name) < 0) {
    customInput.value = exam.name;
  } else {
    customInput.value = '';
  }

  const syncCustomVisibility = () => {
    const isCustom = (nameSel.value === '__custom__');
    customRow.style.display = isCustom ? 'flex' : 'none';
    if (isCustom && !customInput.value && exam && EXAM_NAMES.indexOf(exam.name) < 0) {
      customInput.value = exam.name;
    }
  };
  nameSel.onchange = syncCustomVisibility;
  syncCustomVisibility();

  const fullInput = $('examPopFull'), passInput = $('examPopPass');
  const mediumInput = $('examPopMedium'), goodInput = $('examPopGood'), excellentInput = $('examPopExcellent');
  const RATIOS = { pass: 0.6, medium: 0.7, good: 0.8, excellent: 0.9 };

  function applyRatios() {
    const full = parseInt(fullInput.value, 10) || 100;
    passInput.value = Math.round(full * RATIOS.pass);
    mediumInput.value = Math.round(full * RATIOS.medium);
    goodInput.value = Math.round(full * RATIOS.good);
    excellentInput.value = Math.round(full * RATIOS.excellent);
  }

  // ★ 优先使用已有值；只有该值确实无效（null/undefined/<=0）时才回退到默认
  const pick = (v, dft) => (v != null && v > 0) ? v : dft;

  if (exam) {
    // ---- 编辑模式：保持考试自身的分值，不用默认值覆盖 ----
    const full = pick(exam.full_score, 100);
    fullInput.value      = full;
    passInput.value      = pick(exam.pass_score,      Math.round(full * RATIOS.pass));
    mediumInput.value    = pick(exam.medium_score,    Math.round(full * RATIOS.medium));
    goodInput.value      = pick(exam.good_score,      Math.round(full * RATIOS.good));
    excellentInput.value = pick(exam.excellent_score, Math.round(full * RATIOS.excellent));

    // ★ 编辑时修改满分，其它分数线也按比例联动
    fullInput.oninput = applyRatios;
  } else {
    // ---- 新建模式：满分默认 100，改满分时按比例联动其它分数线 ----
    fullInput.value = 100;
    applyRatios();
    fullInput.oninput = applyRatios;
  }

  $('examPopError').textContent = '';
  $('examPopClass').disabled = !isNew;
  $('examPopSubject').disabled = !isNew;
  $('examPopName').disabled = false;   // ★ 编辑时也允许修改考试名称
  $('examPop').dataset.id = isNew ? '' : exam.id;
  $('examPop').style.display = 'flex';
};

window.applyScoreLevel = function (input, exam) {
  const v = parseFloat(input.value);
  input.removeAttribute('data-level');
  if (isNaN(v) || input.value === '') return;
  if (v >= exam.excellent_score) input.setAttribute('data-level', 'excellent');
  else if (v >= exam.good_score) input.setAttribute('data-level', 'good');
  else if (v >= exam.medium_score) input.setAttribute('data-level', 'medium');
  else if (v >= exam.pass_score) input.setAttribute('data-level', 'pass');
  else input.setAttribute('data-level', 'fail');
};

window.importScoresFromExcel = async function (exam, onSaved) {
  const input = $('excelFileInput');
  if (!input) return;
  input.value = '';
  input.onchange = async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      let wb;
      try { wb = await readExcelFile(file); }
      catch (e) { alert('Excel 解析库加载失败，请检查网络'); return; }

      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (rows.length < 1) { alert('Excel 内容为空'); return; }

      let nameCol = -1, scoreCol = -1, headerRowIdx = -1;
      for (let i = 0; i < Math.min(5, rows.length); i++) {
        const row = rows[i];
        if (!Array.isArray(row)) continue;
        row.forEach((cell, ci) => {
          const t = String(cell || '').trim();
          if (!t) return;
          if (nameCol < 0 && /^(姓名|名字|学生姓名|学生|name)$/i.test(t)) nameCol = ci;
          if (scoreCol < 0 && /^(分数|成绩|得分|score)$/i.test(t)) scoreCol = ci;
        });
        if (nameCol >= 0 && scoreCol >= 0) { headerRowIdx = i; break; }
      }

      let dataStartIdx, nc, sc;
      if (headerRowIdx >= 0) { dataStartIdx = headerRowIdx + 1; nc = nameCol; sc = scoreCol; }
      else {
        const yes = await showConfirm(
          '未找到「姓名」「分数」表头。\n\n是否按第一列姓名、第二列分数解析？',
          { title: '确认解析方式', okText: '按默认解析', danger: false }
        );
        if (!yes) return;
        dataStartIdx = 0; nc = 0; sc = 1;
      }

      const scoreMap = {};
      for (let i = dataStartIdx; i < rows.length; i++) {
        const r = rows[i];
        if (!r) continue;
        const name = String(r[nc] || '').trim();
        if (!name) continue;
        const raw = r[sc];
        if (raw === undefined || raw === null || String(raw).trim() === '') continue;
        const score = parseFloat(raw);
        if (isNaN(score)) continue;
        scoreMap[name] = score;
      }
      if (Object.keys(scoreMap).length === 0) { alert('未从 Excel 中解析到有效的成绩数据'); return; }

      const toSave = [];
      const inputs = $('scoresInputBody').querySelectorAll('.score-input');
      const rosterNames = new Set();
      inputs.forEach(inp => {
        const name = inp.dataset.name;
        rosterNames.add(name);
        if (scoreMap[name] !== undefined) {
          inp.value = scoreMap[name];
          applyScoreLevel(inp, exam);
          toSave.push({ student_name: name, score: scoreMap[name] });
        }
      });

      const unmatched = Object.keys(scoreMap).filter(n => !rosterNames.has(n));
      if (toSave.length === 0) { alert('Excel 中的姓名与当前花名册都不匹配，未保存任何数据'); return; }

      showSaveStatus('正在保存 ' + toSave.length + ' 条...', false);
      try {
        await apiCall(API.saveScores, exam.id, toSave);
        let msg = '已导入并保存 ' + toSave.length + ' 名学生的成绩';
        if (unmatched.length > 0) {
          msg += '\n\n注意：有 ' + unmatched.length + ' 名学生不在当前花名册，已跳过：\n' + unmatched.slice(0, 8).join('、');
          if (unmatched.length > 8) msg += ' …等';
        }
        alert(msg);
        showSaveStatus('已导入并保存 ' + toSave.length + ' 条', false);
        if (typeof onSaved === 'function') onSaved();
      } catch (err) { alert('保存失败：' + (err.message || err)); showSaveStatus('导入保存失败', true); }
    } catch (err) { alert('导入失败：' + (err.message || err)); }
    finally { input.value = ''; }
  };
  input.click();
};

/* ---------- 成绩走势 ---------- */

/* 计算某学生在一次考试中的名次
 * 若该考试手动排过序（sort_order > 0），按 sort_order 优先；
 * 否则按分数降序。
 */
function computeExamRank(scores, studentName) {
  const hasManualOrder = scores.some(s => (s.sort_order || 0) > 0);
  const ranked = scores.slice().sort(
    hasManualOrder
      ? (a, b) => ((a.sort_order || 999999) - (b.sort_order || 999999)) ||
                  ((b.score || 0) - (a.score || 0))
      : (a, b) => (b.score || 0) - (a.score || 0)
  );
  return {
    rank: ranked.findIndex(s => s.student_name === studentName) + 1,
    totalCount: scores.length,
  };
}

/* 拉取某学生某科目的历史成绩走势数据
 * 返回 [{ examName, date, score, fullScore, average, rank, totalCount }, ...]
 * 已按日期升序排列
 */
async function loadStudentTrendData(studentName, subject, fallbackFullScore) {
  const examsResp = await API.listExams(currentGradesClassId);
  const subjectExams = (examsResp.exams || []).filter(e => e.subject === subject);
  const details = await Promise.all(
    subjectExams.map(e => API.getExamDetail(e.id).catch(() => null))
  );

  const rows = [];
  for (const d of details) {
    if (!d || !d.exam || !d.scores) continue;
    const { exam, scores } = d;

    const stu = scores.find(s => s.student_name === studentName);
    if (!stu) continue;

    const sum = scores.reduce((acc, s) => acc + s.score, 0);
    const average = scores.length ? sum / scores.length : 0;
    const { rank, totalCount } = computeExamRank(scores, studentName);

    rows.push({
      examName: exam.name,
      date: exam.created_at ? String(exam.created_at).slice(0, 10) : '',
      score: stu.score,
      fullScore: exam.full_score || fallbackFullScore,
      average,
      rank,
      totalCount,
    });
  }

  rows.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  return rows;
}

window.showStudentReportInline = async function (studentName, subject, fullScore, gender) {
  const panel = document.getElementById('rankRightPanel');
  if (!panel) return;
  if (trendCtx.studentName !== studentName) {
    trendCtx.studentName = studentName;
    trendCtx.gender = gender || '';
    trendCtx.fullScore = fullScore || 100;
    trendCtx.subject = subject || '语文';
  } else {
    if (subject) trendCtx.subject = subject;
    if (fullScore) trendCtx.fullScore = fullScore;
    if (gender) trendCtx.gender = gender;
  }
  const sel = document.getElementById('trendStudentSelect');
  if (sel && sel.value !== studentName) sel.value = studentName;
  document.querySelectorAll('.rank-table .student-name a').forEach(a => a.classList.remove('selected'));
  document.querySelectorAll('.rank-table .student-name a').forEach(a => { if (a.textContent === studentName) a.classList.add('selected'); });
  await renderTrendPanel(panel);
};

window.bindSubjectTabs = function (panel) {
  panel.querySelectorAll('.report-subject-tab').forEach(btn => {
    btn.onclick = () => {
      const s = btn.dataset.subject;
      if (!s || s === trendCtx.subject) return;
      trendCtx.subject = s;
      renderTrendPanel(panel);
    };
  });
};

window.renderTrendPanel = async function (panel) {
  const studentName = trendCtx.studentName;
  const gender = trendCtx.gender;
  const subject = trendCtx.subject;
  let fullScore = trendCtx.fullScore || 100;
  panel.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-sub);font-size:13px;">加载中...</div>';

  try {
    const rows = await loadStudentTrendData(studentName, subject, fullScore);

    const initial = studentName ? escapeHtml(studentName.charAt(0)) : '?';
    const genderClass = gender === '女' ? 'female' : (gender === '男' ? 'male' : 'unknown');
    const subjectTabsHtml = SUBJECTS.map(s =>
      '<button class="report-subject-tab' + (s === subject ? ' active' : '') + '" data-subject="' + escapeHtml(s) + '">' + escapeHtml(s) + '</button>'
    ).join('');

    let html = `
      <div class="report-header">
        <div class="report-avatar ${genderClass}">${initial}</div>
        <div class="report-header-info">
          <div class="report-name">${escapeHtml(studentName)}</div>
          <div class="report-sub">${escapeHtml(subject)} · 共 ${rows.length} 次</div>
        </div>
      </div>
      <div class="report-subject-tabs">${subjectTabsHtml}</div>`;

    if (rows.length === 0) {
      html += '<div class="today-empty">暂无「' + escapeHtml(subject) + '」科目的历史成绩记录</div>';
      panel.innerHTML = html;
      bindSubjectTabs(panel);
      return;
    }

    const lastRow = rows[rows.length - 1];
    html += `
      <div class="report-section-title" style="display:flex;justify-content:space-between;align-items:center;">
        <span>历次成绩走势</span><span class="report-count-badge">名次 ${lastRow.rank} → ${lastRow.totalCount}</span>
      </div>
      <div id="chartInlineHistory" style="width:100%;height:240px;"></div>
      <div class="report-section-title" style="margin-top:14px;display:flex;justify-content:space-between;align-items:center;">
        <span>考试成绩明细</span><span class="report-count-badge">${rows.length}次</span>
      </div>
      <div class="report-detail-list">
        ${rows.slice().reverse().map(r => `
          <div class="report-detail-row">
            <div class="report-detail-info">
              <div class="report-detail-name">${escapeHtml(r.examName)}</div>
              <div class="report-detail-date">${escapeHtml(r.date)} · ${escapeHtml(subject)}</div>
            </div>
            <div class="report-detail-score">${r.score}</div>
          </div>
        `).join('')}
      </div>`;
    panel.innerHTML = html;
    bindSubjectTabs(panel);

    try { await ensureECharts(); }
    catch (e) { console.warn('[renderTrendPanel] echarts 加载失败:', e); }

    setTimeout(() => {
      const chartDom = document.getElementById('chartInlineHistory');
      if (!chartDom) return;
      if (typeof echarts === 'undefined') {
        chartDom.innerHTML = '<div class="today-empty">图表库未加载，无法显示走势图</div>';
        return;
      }
      let chart = echarts.getInstanceByDom(chartDom);
      if (!chart) chart = echarts.init(chartDom);
      const maxFull = Math.max.apply(null, rows.map(r => r.fullScore || fullScore).concat([fullScore]));
      const maxTotal = Math.max.apply(null, rows.map(r => r.totalCount).concat([10]));
      chart.setOption({
        tooltip: { trigger: 'axis', textStyle: { fontWeight: 'bold' } },
        legend: { bottom: 0, left: 'center', icon: 'roundRect', itemWidth: 14, itemHeight: 3, itemGap: 16, textStyle: { fontSize: 12, fontWeight: 'bold' } },
        grid: { left: 46, right: 60, top: 30, bottom: 56 },
        xAxis: { type: 'category', data: rows.map(r => r.examName), axisLabel: { interval: 0, fontSize: 11, fontWeight: 'bold', margin: 10 }, axisTick: { show: false } },
        yAxis: [
          { type: 'value', name: '分数', min: 0, max: maxFull, nameTextStyle: { fontSize: 11, fontWeight: 'bold', padding: [0, 0, 6, 0] }, axisLabel: { fontSize: 11, fontWeight: 'bold' }, splitLine: { lineStyle: { color: '#f0f0f0' } }, axisLine: { show: false }, axisTick: { show: false } },
          { type: 'value', name: '排名', min: 1, max: maxTotal, inverse: true, nameTextStyle: { fontSize: 11, fontWeight: 'bold', padding: [0, 0, 6, 0] }, axisLabel: { fontSize: 11, fontWeight: 'bold', formatter: '名次{value}' }, splitLine: { show: false }, axisLine: { show: false }, axisTick: { show: false } }
        ],
        series: [
          { name: '学生成绩', type: 'line', smooth: true, symbol: 'circle', symbolSize: 8, data: rows.map(r => r.score), itemStyle: { color: '#1e3a8a' }, lineStyle: { width: 3 }, label: { show: true, position: 'top', fontSize: 11, fontWeight: 'bold', color: '#1e3a8a' } },
          { name: '班级平均', type: 'line', smooth: true, symbol: 'circle', symbolSize: 8, data: rows.map(r => Math.round(r.average * 10) / 10), itemStyle: { color: '#94a3b8' }, lineStyle: { width: 3 }, label: { show: true, position: 'top', fontSize: 11, fontWeight: 'bold', color: '#64748b' } },
          { name: '学生排名', type: 'line', yAxisIndex: 1, smooth: true, symbol: 'circle', symbolSize: 8, data: rows.map(r => r.rank), itemStyle: { color: '#f59e0b' }, lineStyle: { width: 3 }, label: { show: true, position: 'top', fontSize: 11, fontWeight: 'bold', color: '#f59e0b' } }
        ]
      });
      if (chartDom.__trendRO) { try { chartDom.__trendRO.disconnect(); } catch (e) {} chartDom.__trendRO = null; }
      if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => { if (chart && !chart.isDisposed()) chart.resize(); });
        ro.observe(chartDom);
        chartDom.__trendRO = ro;
      }
      chart.resize();
      requestAnimationFrame(() => { if (chart) chart.resize(); });
      setTimeout(() => { if (chart) chart.resize(); }, 100);
      setTimeout(() => { if (chart) chart.resize(); }, 300);
      setTimeout(() => { if (chart) chart.resize(); }, 600);
    }, 100);
  } catch (err) {
    panel.innerHTML = '<div class="today-empty">加载失败：' + escapeHtml(err.message) + '</div>';
  }
};

window.openScoresPop = async function (examId) {
  $('scoresPop').style.display = 'flex';
  $('scoresPopBody').innerHTML = '<div style="text-align:center;padding:20px;">加载中...</div>';
  $('scoresPop').dataset.id = examId;

  try { await ensureECharts(); }
  catch (e) { console.warn('[openScoresPop] echarts 加载失败:', e); }

  try {
    const [detail, rosterResp] = await Promise.all([API.getExamDetail(examId), API.listRoster(currentGradesClassId)]);
    currentExamDetail = detail;
    const exam = detail.exam;
    const stats = detail.stats || {};
    const scores = detail.scores || [];
    const roster = rosterResp.students || [];
    const clsName = (classes.find(c => c.class_id === exam.class_id) || {}).name || '';
    $('scoresPopTitle').textContent = exam.name + ' · ' + exam.subject + ' （' + clsName + '）';

    // ★ 过滤掉不在当前花名册里的失效成绩（比如改名后残留的旧数据）
    const rosterNames = new Set(roster.map(s => s.name));
    const validScores = scores.filter(s => rosterNames.has(s.student_name));
    // 用过滤后的数据重新计算统计，覆盖后端传来的 stats
    let validCount = 0, validAbsent = 0, validSum = 0;
    validScores.forEach(s => {
        if (s.absent) { validAbsent++; }
        else { validSum += s.score; validCount++; }
    });
    if (detail.stats) {
        detail.stats.count = validCount;
        detail.stats.absent_count = validAbsent;
        detail.stats.average = validCount ? (validSum / validCount) : 0;
    }

    const passLine = exam.pass_score, mediumLine = exam.medium_score;
    const goodLine = exam.good_score, excellentLine = exam.excellent_score, fullScore = exam.full_score;

    // ★ 修复：scoreMap 提前到最外层，供全函数共用
    const scoreMap = {};
    validScores.forEach(s => { scoreMap[s.student_name] = s; });

    const bands = [
      { label: '<' + passLine, name: '不及格', color: '#f28b82', min: -Infinity, max: passLine },
      { label: passLine + '~' + (mediumLine - 1), name: '及格', color: '#fb8c00', min: passLine, max: mediumLine },
      { label: mediumLine + '~' + (goodLine - 1), name: '中等', color: '#fdd835', min: mediumLine, max: goodLine },
      { label: goodLine + '~' + (excellentLine - 1), name: '良好', color: '#8ab4f8', min: goodLine, max: excellentLine },
      { label: excellentLine + '~' + fullScore, name: '优秀', color: '#81c784', min: excellentLine, max: Infinity },
    ];
    const counts = bands.map(() => 0);
    scores.forEach(s => {
      if (s.absent) return;
      for (let i = 0; i < bands.length; i++) { if (s.score >= bands[i].min && s.score < bands[i].max) { counts[i]++; break; } }
    });

    let html = `
      <div class="tab-header">
        <button class="tab-btn active" data-tab="input">${icon('note')} 成绩录入</button>
        <button class="tab-btn" data-tab="analysis">${icon('chart')} 分数段</button>
        <button class="tab-btn" data-tab="rank">${icon('trophy')} 名次表</button>
        <button class="tab-btn" data-tab="trend">${icon('trending')} 成绩走势</button>
      </div>
      <div id="tab-content-input" class="tab-pane active">
        <div class="scores-stats" id="scoresPopStats"></div>
        <div id="scoresInputBody" style="margin-top:12px;"></div>
        <div class="scores-action-bar">
          <button id="scoresImportBtn" class="btn-scores-import">${icon('import')} 导入</button>
          <button id="scoresSaveBtn" class="btn-scores-save">${icon('save')} 保存</button>
        </div>
      </div>
      <div id="tab-content-analysis" class="tab-pane">
        <div id="chartDistribution" style="width:100%;height:300px;"></div>
      </div>
      <div id="tab-content-rank" class="tab-pane">
        <div id="rankTableBody"></div>
        <div style="position:sticky;bottom:0;display:flex;justify-content:center;padding:12px 0 6px;background:var(--pop-bg,#fff);z-index:5;box-shadow:0 -8px 12px -8px rgba(0,0,0,.12);margin-top:10px;">
          <button id="rankExportImgBtn" type="button" style="padding:8px 26px;border:none;border-radius:22px;background:#2c3e50;color:#fff;font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;letter-spacing:.5px;box-shadow:0 3px 10px rgba(0,0,0,.18);transition:background .2s, transform .15s;">${icon('camera')} 导出图片</button>
        </div>
      </div>
      <div id="tab-content-trend" class="tab-pane">
        <div class="trend-toolbar">
          <label>选择学生：</label>
          <select id="trendStudentSelect" class="cell-pop-input"></select>
        </div>
        <div class="rank-right" id="rankRightPanel">
          <div class="rank-right-empty">请选择学生查看个人成绩走势</div>
        </div>
      </div>`;
    $('scoresPopBody').innerHTML = html;

    $('scoresPopStats').innerHTML =
      '<div class="stat-cell"><span class="k">平均分</span><span class="v">' + (stats.average ? stats.average.toFixed(1) : '—') + ' / ' + exam.full_score + '</span></div>' +
      '<div class="stat-cell"><span class="k">及格率</span><span class="v">' + (stats.pass_rate ? stats.pass_rate.toFixed(1) : '0.0') + '% (' + (stats.pass_count || 0) + '人 ≥' + exam.pass_score + ')</span></div>' +
      '<div class="stat-cell"><span class="k">优秀率</span><span class="v">' + (stats.excellent_rate ? stats.excellent_rate.toFixed(1) : '0.0') + '% (' + (stats.excellent_count || 0) + '人 ≥' + exam.excellent_score + ')</span></div>' +
      '<div class="stat-cell"><span class="k">最高/最低</span><span class="v">' + (stats.max_score || 0) + ' / ' + (stats.min_score || 0) + '</span></div>' +
      '<div class="stat-cell"><span class="k">已录/缺考/总</span><span class="v">' + (stats.count || 0) + ' / ' + (stats.absent_count || 0) + ' / ' + roster.length + '</span></div>';

    if (roster.length === 0) {
      $('scoresInputBody').innerHTML = '<div class="today-empty">该班级暂无花名册学生<br>请先到「学生 → 花名册」添加学生</div>';
    } else {
      let inputHtml = '<div class="scores-input-list">';
      roster.forEach(stu => {
        const safeName = String(stu.name || '');
        const rec = scoreMap[safeName];
        const isAbsent = rec ? !!rec.absent : false;
        const val = (rec && !rec.absent) ? rec.score : undefined;
        const initial = safeName ? escapeHtml(safeName.charAt(0)) : '?';
        const genderClass = stu.gender === '女' ? 'female' : (stu.gender === '男' ? 'male' : 'unknown');
        inputHtml += '<div class="scores-input-row">' +
          '<div class="scores-input-info">' +
            '<div class="scores-avatar ' + genderClass + '">' + initial + '</div>' +
            '<span class="scores-name">' + escapeHtml(safeName) + '</span>' +
          '</div>' +
          '<div class="scores-input-wrap">' +
            '<button type="button" class="absent-btn' + (isAbsent ? ' active' : '') +
              '" data-name="' + escapeHtml(safeName) + '">缺考</button>' +
            '<input type="number" class="score-input" data-name="' + escapeHtml(safeName) +
              '" value="' + (val !== undefined ? val : '') + '" min="0" max="' + exam.full_score +
              '" step="0.5" inputmode="decimal"' + (isAbsent ? ' disabled' : '') + '>' +
            '<span class="scores-max">/ ' + exam.full_score + '</span>' +
          '</div>' +
        '</div>';
      });
      inputHtml += '</div>';
      $('scoresInputBody').innerHTML = inputHtml;
      $('scoresInputBody').querySelectorAll('.score-input').forEach(inp => {
        if (inp.disabled) return;
        applyScoreLevel(inp, exam);
        inp.addEventListener('input', () => applyScoreLevel(inp, exam));
      });
      $('scoresInputBody').querySelectorAll('.absent-btn').forEach(btn => {
        btn.onclick = () => {
          const row = btn.closest('.scores-input-row');
          const inp = row.querySelector('.score-input');
          const nowActive = btn.classList.toggle('active');
          if (nowActive) {
            inp.value = '';
            inp.disabled = true;
            inp.removeAttribute('data-level');
          } else {
            inp.disabled = false;
            applyScoreLevel(inp, exam);
            inp.focus();
          }
        };
      });
    }

    /* ---------- 名次表 ---------- */
    if (roster.length === 0) {
      $('rankTableBody').innerHTML = '<div class="today-empty">暂无学生数据</div>';
    } else {
      const hasManualOrder = scores.some(s => (s.sort_order || 0) > 0);

      let rankList = roster.map(stu => {
        const rec = scoreMap[stu.name];
        return {
          name: stu.name,
          gender: stu.gender || '',
          score: (rec && !rec.absent) ? rec.score : null,
          absent: rec ? !!rec.absent : false,
          sortOrder: (rec && rec.sort_order) || 0,
        };
      });

      if (hasManualOrder) {
        rankList.sort((a, b) => {
          const ao = a.sortOrder || 999999;
          const bo = b.sortOrder || 999999;
          if (ao !== bo) return ao - bo;
          return (a.name || '').localeCompare(b.name || '', 'zh-CN');
        });
      } else {
        rankList.sort((a, b) => {
          if (a.score === null && b.score === null) return 0;
          if (a.score === null) return 1;
          if (b.score === null) return -1;
          return b.score - a.score;
        });
      }

      let rankTableHtml = '<table class="rank-table" id="rankTableEl"><thead><tr>' +
        '<th style="width:20px;text-align:center;"></th><th style="text-align:center;">名次</th><th style="text-align:center;">姓名</th><th style="text-align:center;">性别</th><th style="text-align:center;">分数</th><th style="text-align:center;">总分</th><th style="text-align:center;">层次</th>' +
        '</tr></thead><tbody>';
      let rank = 1;
      rankList.forEach(item => {
        rankTableHtml += '<tr data-name="' + escapeHtml(item.name) + '">';
        rankTableHtml += '<td class="drag-handle" style="text-align:center;" title="长按拖动排序">⋮⋮</td>';
        if (item.absent) {
          rankTableHtml += '<td class="rank-num" style="text-align:center;">-</td>' +
            '<td class="student-name" style="text-align:center;">' + escapeHtml(item.name) + '</td>' +
            '<td style="text-align:center;">' + escapeHtml(item.gender) + '</td>' +
            '<td colspan="3" style="color:#f39c12;font-weight:600;text-align:center;">缺考</td>';
        } else if (item.score === null) {
          rankTableHtml += '<td class="rank-num" style="text-align:center;">-</td>' +
            '<td class="student-name" style="text-align:center;">' + escapeHtml(item.name) + '</td>' +
            '<td style="text-align:center;">' + escapeHtml(item.gender) + '</td>' +
            '<td colspan="3" style="color:var(--empty-text);text-align:center;">未录入</td>';
        } else {
          let level, levelColor;
          if (item.score >= exam.excellent_score) { level = '优秀'; levelColor = '#27ae60'; }
          else if (item.score >= exam.good_score) { level = '良好'; levelColor = '#3498db'; }
          else if (item.score >= exam.medium_score) { level = '中等'; levelColor = '#f39c12'; }
          else if (item.score >= exam.pass_score) { level = '及格'; levelColor = '#e67e22'; }
          else { level = '不及格'; levelColor = '#e74c3c'; }
          rankTableHtml += '<td class="rank-num" style="text-align:center;">' + (rank++) + '</td>' +
            '<td class="student-name" style="text-align:center;"><a href="javascript:void(0)" class="rank-student-link" data-name="' + escapeHtml(item.name) + '" data-gender="' + escapeHtml(item.gender) + '">' + escapeHtml(item.name) + '</a></td>' +
            '<td style="text-align:center;">' + escapeHtml(item.gender) + '</td>' +
            '<td class="score-val" style="text-align:center;">' + item.score + '</td>' +
            '<td style="text-align:center;">' + exam.full_score + '</td>' +
            '<td style="text-align:center;"><span style="color:' + levelColor + ';font-weight:600;">' + level + '</span></td>';
        }
        rankTableHtml += '</tr>';
      });
      rankTableHtml += '</tbody></table>';
      $('rankTableBody').innerHTML = rankTableHtml;

      $('rankTableBody').querySelectorAll('.rank-student-link').forEach(a => {
        a.onclick = (ev) => {
          ev.preventDefault(); ev.stopPropagation();
          if (Date.now() < (window.suppressClickTime || 0)) return;
          $('scoresPopBody').querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
          $('scoresPopBody').querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
          const trendBtn = $('scoresPopBody').querySelector('.tab-btn[data-tab="trend"]');
          if (trendBtn) trendBtn.classList.add('active');
          const trendPane = document.getElementById('tab-content-trend');
          if (trendPane) trendPane.classList.add('active');
          const sel2 = $('trendStudentSelect');
          if (sel2) sel2.value = a.dataset.name;
          window.showStudentReportInline(a.dataset.name, exam.subject, exam.full_score, a.dataset.gender);
        };
      });

      window.bindRankDrag(exam);
    }

    // 趋势下拉
    const trendSel = $('trendStudentSelect');
    if (trendSel) {
      const scoredList = roster.map(stu => {
        const rec = scoreMap[stu.name];
        return { name: stu.name, gender: stu.gender || '', absent: rec ? !!rec.absent : false };
      });
      trendSel.innerHTML = '<option value="">— 请选择 —</option>' +
        scoredList.map(s => '<option value="' + escapeHtml(s.name) + '" data-gender="' + escapeHtml(s.gender) + '">' + escapeHtml(s.name) + '</option>').join('');
      trendSel.onchange = () => {
        const opt = trendSel.options[trendSel.selectedIndex];
        if (!opt || !opt.value) { const panel = document.getElementById('rankRightPanel'); if (panel) panel.innerHTML = '<div class="rank-right-empty">请选择学生查看个人成绩走势</div>'; return; }
        window.showStudentReportInline(opt.value, exam.subject, exam.full_score, opt.dataset.gender);
      };
    }

    const importBtn = $('scoresImportBtn');
    if (importBtn) importBtn.onclick = () => importScoresFromExcel(exam, () => { openScoresPop(examId); loadExamStats(examId); });
    const saveBtn = $('scoresSaveBtn');
    if (saveBtn) saveBtn.onclick = async () => {
      const inputs = $('scoresInputBody').querySelectorAll('.score-input');
      const toSave = [];
      inputs.forEach(inp => {
        const name = inp.dataset.name;
        const row = inp.closest('.scores-input-row');
        const absentBtn = row ? row.querySelector('.absent-btn') : null;
        const isAbsent = absentBtn && absentBtn.classList.contains('active');
        if (isAbsent) {
          toSave.push({ student_name: name, score: 0, absent: true });
          return;
        }
        const v = inp.value.trim();
        if (v === '') return;
        const score = parseFloat(v);
        if (isNaN(score)) return;
        toSave.push({ student_name: name, score: score, absent: false });
      });
      if (toSave.length === 0) { alert('请至少录入一个成绩或勾选缺考'); return; }
      try {
        await apiCall(API.saveScores, examId, toSave);
        showSaveStatus('已保存 ' + toSave.length + ' 条成绩', false);
        await openScoresPop(examId);
        loadExamStats(examId);
      } catch {}
    };

    const rankExportBtn = $('rankExportImgBtn');
    if (rankExportBtn) rankExportBtn.onclick = () => window.exportRankImage(exam);

    $('scoresPopBody').querySelectorAll('.tab-btn').forEach(btn => {
      btn.onclick = () => {
        $('scoresPopBody').querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        $('scoresPopBody').querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        $('tab-content-' + btn.dataset.tab).classList.add('active');
        if (btn.dataset.tab === 'analysis') {
          setTimeout(() => {
            const chartDom = document.getElementById('chartDistribution');
            if (!chartDom) return;
            if (typeof echarts === 'undefined') { chartDom.innerHTML = '<div class="today-empty">图表库未加载，无法显示分数段</div>'; return; }
            let myChart = echarts.getInstanceByDom(chartDom);
            if (!myChart) myChart = echarts.init(chartDom);
            const seriesList = bands.map((b, i) => ({
              name: b.name, type: 'bar', barWidth: '55%', barGap: '-100%',
              data: bands.map((_, j) => j === i ? counts[i] : 0),
              itemStyle: { color: b.color, borderRadius: [4, 4, 0, 0] },
              label: { show: true, position: 'top', fontWeight: 'bold', formatter: (p) => p.value > 0 ? p.value : '' }
            }));
            myChart.setOption({
              title: { text: exam.subject + ' 分数段分布', left: 'center', textStyle: { fontSize: 14, fontWeight: 'bold' } },
              tooltip: { trigger: 'axis' },
              legend: { bottom: 0, left: 'center', icon: 'circle', textStyle: { fontWeight: 'bold', fontSize: 12 } },
              grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
              xAxis: { type: 'category', data: bands.map(b => b.label), axisLabel: { fontWeight: 'bold', fontSize: 11 }, axisLine: { lineStyle: { width: 2 } } },
              yAxis: { type: 'value', axisLabel: { fontWeight: 'bold' }, axisLine: { lineStyle: { width: 2 } }, splitLine: { lineStyle: { width: 1.5 } } },
              series: seriesList
            });
            myChart.resize();
            setTimeout(() => myChart.resize(), 300);
          }, 200);
        }
        if (btn.dataset.tab === 'trend') {
          const sel = document.getElementById('trendStudentSelect');
          if (sel && !sel.value && sel.options.length > 1) {
            for (let i = 1; i < sel.options.length; i++) {
              if (sel.options[i].value) {
                sel.selectedIndex = i;
                window.showStudentReportInline(sel.options[i].value, exam.subject, exam.full_score, sel.options[i].dataset.gender);
                break;
              }
            }
          }
        }
      };
    });
  } catch (err) {
    $('scoresPopBody').innerHTML = '<div class="today-empty">加载失败：' + escapeHtml(err.message) + '</div>';
  }
};

/* ============================================================
   名次表：长按拖动排序
   ============================================================ */
window.suppressClickTime = window.suppressClickTime || 0;
window._rankDragCleanup = null;

window.bindRankDrag = function (exam) {
  if (window._rankDragCleanup) {
    window._rankDragCleanup();
    window._rankDragCleanup = null;
  }

  const tbody = document.querySelector('#rankTableBody tbody');
  if (!tbody) return;
  const LONG_PRESS = 400;

  let pressTimer = null;
  let pressState = null;
  let dragState = null;

  function onStart(e, row) {
    if (e.target.closest('a, button')) return;
    const touch = e.touches && e.touches[0];
    const x = touch ? touch.clientX : e.clientX;
    const y = touch ? touch.clientY : e.clientY;
    pressState = { row, x, y };
    pressTimer = setTimeout(() => {
      pressTimer = null;
      if (!pressState) return;
      const ps = pressState;
      pressState = null;
      activateDrag(ps.row, ps.x, ps.y);
    }, LONG_PRESS);
  }

  function activateDrag(row, x, y) {
    const rect = row.getBoundingClientRect();
    const sourceTable = row.closest('table');

    // ★ 用一个外层 div + 内层 table 包住克隆行，保持表格上下文，避免单元格挤在一起
    const ghost = document.createElement('div');
    ghost.style.cssText =
      'position:fixed;pointer-events:none;z-index:99999;' +
      'left:' + rect.left + 'px;top:' + rect.top + 'px;' +
      'width:' + rect.width + 'px;';

    const wrapTable = document.createElement('table');
    wrapTable.className = sourceTable ? sourceTable.className : 'rank-table';
    wrapTable.style.cssText =
      'width:100%;border-collapse:collapse;margin:0;' +
      'background:var(--card-bg,#fff);' +
      'box-shadow:0 12px 32px rgba(0,0,0,.22);' +
      'border-radius:8px;overflow:hidden;';

    const clonedRow = row.cloneNode(true);
    // 拖动时把左列手柄符号淡一点，视觉上更干净
    const handle = clonedRow.querySelector('.drag-handle');
    if (handle) handle.style.opacity = '0.3';

    const tb = document.createElement('tbody');
    tb.appendChild(clonedRow);
    wrapTable.appendChild(tb);
    ghost.appendChild(wrapTable);
    document.body.appendChild(ghost);

    row.classList.add('rank-dragging');
    dragState = {
      row, ghost,
      offsetX: x - rect.left,
      offsetY: y - rect.top,
      targetRow: null,
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
  }

  function onMove(e) {
    if (pressState) {
      const touch = e.touches && e.touches[0];
      const x = touch ? touch.clientX : e.clientX;
      const y = touch ? touch.clientY : e.clientY;
      const dx = x - pressState.x, dy = y - pressState.y;
      if (Math.sqrt(dx * dx + dy * dy) > 8) {
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
        pressState = null;
      }
      return;
    }
    if (!dragState) return;
    if (e.cancelable) e.preventDefault();
    const touch = e.touches && e.touches[0];
    const x = touch ? touch.clientX : e.clientX;
    const y = touch ? touch.clientY : e.clientY;
    dragState.ghost.style.left = (x - dragState.offsetX) + 'px';
    dragState.ghost.style.top = (y - dragState.offsetY) + 'px';

    dragState.ghost.style.display = 'none';
    const el = document.elementFromPoint(x, y);
    dragState.ghost.style.display = '';
    const targetTr = el && el.closest ? el.closest('tr[data-name]') : null;
    if (dragState.targetRow && dragState.targetRow !== targetTr) {
      dragState.targetRow.classList.remove('rank-drag-over');
    }
    if (targetTr && targetTr !== dragState.row && targetTr.parentNode === tbody) {
      targetTr.classList.add('rank-drag-over');
      dragState.targetRow = targetTr;
    } else {
      dragState.targetRow = null;
    }
  }

  function renumber() {
    let r = 1;
    tbody.querySelectorAll('tr[data-name]').forEach(row => {
      if (row.querySelector('.score-val')) {
        const c = row.querySelector('.rank-num');
        if (c) c.textContent = r++;
      }
    });
  }

  function onEnd() {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    pressState = null;
    if (!dragState) return;
    const state = dragState;
    dragState = null;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    try { state.ghost.remove(); } catch (e) {}
    state.row.classList.remove('rank-dragging');
    if (state.targetRow) {
      state.targetRow.classList.remove('rank-drag-over');
      const allRows = Array.from(tbody.querySelectorAll('tr[data-name]'));
      const fromIdx = allRows.indexOf(state.row);
      const toIdx = allRows.indexOf(state.targetRow);
      if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
        if (fromIdx < toIdx) {
          tbody.insertBefore(state.row, state.targetRow.nextSibling);
        } else {
          tbody.insertBefore(state.row, state.targetRow);
        }
        renumber();
        window.suppressClickTime = Date.now() + 400;
        const names = Array.from(tbody.querySelectorAll('tr[data-name]')).map(r => r.dataset.name);
        API.setExamRankOrder(exam.id, names)
          .then(() => showSaveStatus('名次顺序已保存', false))
          .catch(err => showSaveStatus('保存排序失败: ' + (err.message || ''), true));
      }
    }
  }

  const rows = Array.from(tbody.querySelectorAll('tr[data-name]'));
  rows.forEach(row => {
    row.addEventListener('mousedown', (e) => onStart(e, row));
    row.addEventListener('touchstart', (e) => onStart(e, row), { passive: true });
  });

  document.addEventListener('mousemove', onMove);
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('mouseup', onEnd);
  document.addEventListener('touchend', onEnd);
  document.addEventListener('touchcancel', onEnd);

  window._rankDragCleanup = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('mouseup', onEnd);
    document.removeEventListener('touchend', onEnd);
    document.removeEventListener('touchcancel', onEnd);
  };
};

/* ============================================================
   名次表：导出图片
   ============================================================ */
window.exportRankImage = async function (exam) {
  try { await ensureHtml2Canvas(); }
  catch (e) { alert('图片导出库加载失败，请检查网络'); return; }

  const src = $('rankTableBody');
  if (!src) return;
  const table = src.querySelector('.rank-table');
  if (!table) { alert('暂无名次表内容'); return; }

  const clsName = (classes.find(c => c.class_id === exam.class_id) || {}).name || '';
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;left:-99999px;top:0;background:#fff;padding:24px;width:680px;' +
                       'font-family:"PingFang SC","Microsoft YaHei",sans-serif;';

  const header = document.createElement('div');
  header.style.cssText = 'font-size:18px;font-weight:700;text-align:center;color:#2c3e50;margin-bottom:16px;';
  header.textContent = (clsName ? clsName + ' · ' : '') + exam.name + ' · ' + exam.subject + ' · 名次表';
  wrap.appendChild(header);

  const cloned = table.cloneNode(true);
  cloned.style.cssText = 'width:100%;border-collapse:collapse;font-size:14px;color:#2c3e50;';
  cloned.querySelectorAll('th').forEach(th => {
    th.style.cssText = 'background:#2c3e50;color:#fff;padding:10px 8px;text-align:left;font-weight:600;font-size:13px;';
  });
  cloned.querySelectorAll('td').forEach(td => {
    td.style.cssText = 'border-bottom:1px solid #edf2f7;padding:8px;';
  });
  cloned.querySelectorAll('tr').forEach(tr => {
    const first = tr.firstElementChild;
    if (first && (first.classList.contains('drag-handle') || first.textContent.trim() === '')) {
      first.remove();
    }
  });
  wrap.appendChild(cloned);

  const footer = document.createElement('div');
  footer.style.cssText = 'text-align:right;color:#7f8c8d;font-size:11px;margin-top:12px;';
  footer.textContent = '导出时间：' + new Date().toLocaleString('zh-CN');
  wrap.appendChild(footer);

  document.body.appendChild(wrap);
  try {
    const canvas = await html2canvas(wrap, { useCORS: true, scale: 2, backgroundColor: '#fff' });
    const link = document.createElement('a');
    link.download = (clsName ? clsName + '_' : '') + exam.name + '_' + exam.subject + '_名次表.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    showSaveStatus('已导出图片', false);
  } catch (e) {
    alert('导出失败：' + (e.message || e));
  } finally {
    wrap.remove();
  }
};

/* ---------- 考勤 ---------- */
window.renderAttendance = async function () {
  const classOptions = classes.map(c => '<option value="' + escapeHtml(c.class_id) + '">' + escapeHtml(c.name) + '</option>').join('');
  attendanceContainer.innerHTML =
    '<div class="me-page">' +
      '<div class="me-card">' +
        '<div class="roster-toolbar">' +
          '<select id="attClass" class="cell-pop-input" style="flex:1;min-width:100px;">' + (classOptions || '<option value="">（暂无班级）</option>') + '</select>' +
          '<input type="date" id="attDate" class="cell-pop-input" style="flex:1;min-width:110px;">' +
          '<button id="attDelBtn" class="btn-primary" style="background:#eeeeee;color:#555;" title="删除当日考勤">' + icon('trash') + '</button>' +
          '<button id="attSaveBtn" class="btn-primary" title="保存考勤">' + icon('save') + '</button>' +
        '</div>' +
        '<div id="attSummary" class="att-summary"></div>' +
        '<div id="attList" class="att-list">加载中...</div>' +
      '</div>' +
    '</div>';
  if (classes.length === 0) { $('attList').innerHTML = '<div class="today-empty">请先在「班级 → 课表」中创建班级</div>'; return; }
  if (!currentAttendanceClassId) currentAttendanceClassId = classes[0].class_id;
  const clsSel = $('attClass');
  clsSel.value = currentAttendanceClassId;
  clsSel.onchange = () => { currentAttendanceClassId = clsSel.value; loadAttendance(); };
  const dateInput = $('attDate');
  dateInput.value = currentAttendanceDate;
  dateInput.onchange = () => { currentAttendanceDate = dateInput.value; loadAttendance(); };
  $('attSaveBtn').onclick = saveAttendance;

  $('attDelBtn').onclick = async () => {
    if (!currentAttendanceClassId) { showSaveStatus('请先选择班级', true); return; }
    const cls = classes.find(c => c.class_id === currentAttendanceClassId);
    const clsName = cls ? cls.name : currentAttendanceClassId;

    const ok = await showConfirm(
      '将删除「' + clsName + '」在 ' + currentAttendanceDate + ' 的全部考勤记录。\n\n此操作不可恢复。',
      { title: '删除考勤记录', okText: '确认删除' }
    );
    if (!ok) return;

    try {
      await apiCall(API.deleteAttendance, currentAttendanceClassId, currentAttendanceDate);
      showSaveStatus('已删除当日考勤记录', false);
      await loadAttendance();
    } catch (e) { /* apiCall 已经提示 */ }
  };

  await loadAttendance();
};

window.loadAttendance = async function () {
  const el = $('attList');
  const sumEl = $('attSummary');
  if (!el) return;
  el.textContent = '加载中...';
  sumEl.innerHTML = '';
  try {
    const [rosterResp, attResp] = await Promise.all([
      API.listRoster(currentAttendanceClassId),
      API.listAttendance(currentAttendanceClassId, currentAttendanceDate),
    ]);
    const roster = rosterResp.students || [];
    const records = attResp.records || [];
    attendanceList = roster;
    if (roster.length === 0) { el.innerHTML = '<div class="today-empty">该班级暂无花名册学生</div>'; return; }
    const statusMap = {};
    records.forEach(r => { statusMap[r.student_name] = r; });
    const STATUSES = ['出勤', '迟到', '请假', '缺勤'];
    el.innerHTML = roster.map(stu => {
      const cur = statusMap[stu.name] || { status: '', remark: '' };
      const safeName = String(stu.name || '');
      const initial = safeName ? escapeHtml(safeName.charAt(0)) : '?';
      const genderClass = stu.gender === '女' ? 'female' : 'male';
      return '<div class="att-row">' +
        // ① 左侧：头像 + 姓名
        '<div class="att-student-info">' +
          '<div class="att-avatar ' + genderClass + '">' + initial + '</div>' +
          '<span class="att-name">' + escapeHtml(safeName) + '</span>' +
        '</div>' +
        // ② 中间：状态按钮 + 备注
        '<div class="att-status-group">' +
          '<div class="att-status-btns">' +
            STATUSES.map(s =>
              '<button class="att-status-btn status-' + s + (cur.status === s ? ' active' : '') +
              '" data-name="' + escapeHtml(safeName) + '" data-status="' + s + '">' + s + '</button>'
            ).join('') +
          '</div>' +
          '<input type="text" class="att-remark" data-name="' + escapeHtml(safeName) +
          '" placeholder="备注" value="' + escapeHtml(cur.remark || '') + '">' +
        '</div>' +
        // ③ 右侧：独立的"月"按钮包裹层（垂直居中）
        '<div class="att-month-wrapper">' +
          '<button class="att-month-btn" data-name="' + escapeHtml(safeName) + '" title="查看月度考勤">' + icon('calendarDay') + '</button>' +
        '</div>' +
      '</div>';
    }).join('');
    el.querySelectorAll('.att-status-btn').forEach(b => {
      b.onclick = () => {
        const name = b.dataset.name;
        el.querySelectorAll('.att-status-btn[data-name="' + cssEscape(name) + '"]').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        updateAttSummary();
      };
    });
    // 月度考勤按钮事件
    el.querySelectorAll('.att-month-btn').forEach(b => {
      b.onclick = () => { openStudentMonthPop(b.dataset.name); };
    });
    updateAttSummary();
  } catch (err) { el.innerHTML = '<div class="today-empty">加载失败：' + escapeHtml(err.message) + '</div>'; }
};

/* ★ 打开月度考勤弹窗 */
window.openStudentMonthPop = function (studentName) {
  const pop = $('attendanceMonthPop');
  const picker = $('attendanceMonthPicker');
  const title = $('attendanceMonthTitle');
  const body = $('attendanceMonthBody');

  // 默认当前月份
  const now = new Date();
  const defaultMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  picker.value = defaultMonth;
  title.textContent = studentName + ' · 月度考勤明细';

  const loadData = async () => {
    body.innerHTML = '<div class="today-empty">加载中...</div>';
    try {
      const resp = await API.getStudentMonthlyAttendance(currentAttendanceClassId, studentName, picker.value);
      const records = resp.records || [];
      if (records.length === 0) {
        body.innerHTML = '<div class="today-empty">该月暂无考勤记录</div>';
        return;
      }
      let html = '<table class="rank-table">' +
        '<thead><tr><th style="width:100px;">日期</th><th style="width:70px;">状态</th><th>备注</th></tr></thead><tbody>';
      records.forEach(r => {
        let color = '#333';
        if (r.status === '出勤') color = '#137333';
        else if (r.status === '迟到') color = '#b06000';
        else if (r.status === '请假') color = '#1967d2';
        else if (r.status === '缺勤') color = '#c5221f';
        html += '<tr>' +
          '<td>' + escapeHtml(r.date) + '</td>' +
          '<td><span style="color:' + color + ';font-weight:600;">' + escapeHtml(r.status) + '</span></td>' +
          '<td style="color:var(--text-sub);font-size:12px;">' + escapeHtml(r.remark || '') + '</td>' +
        '</tr>';
      });
      html += '</tbody></table>';
      body.innerHTML = html;
    } catch (err) {
      body.innerHTML = '<div class="today-empty">加载失败：' + escapeHtml(err.message) + '</div>';
    }
  };

  picker.onchange = loadData;
  loadData();
  pop.style.display = 'flex';
};

/* ★ 绑定月度考勤弹窗关闭事件 */
(function bindMonthlyAttendancePop() {
  const closeBtn = $('attendanceMonthClose');
  const pop = $('attendanceMonthPop');
  if (closeBtn) closeBtn.onclick = () => { pop.style.display = 'none'; };
  if (pop) pop.addEventListener('click', e => { if (e.target === pop) pop.style.display = 'none'; });
})();

window.updateAttSummary = function () {
  const el = $('attList');
  const sumEl = $('attSummary');
  if (!el || !sumEl) return;
  const counts = { 出勤: 0, 迟到: 0, 请假: 0, 缺勤: 0 };
  el.querySelectorAll('.att-status-btn.active').forEach(b => { if (counts[b.dataset.status] !== undefined) counts[b.dataset.status]++; });
  const total = attendanceList.length;

  const today = new Date();
  const mmdd = String(today.getMonth() + 1).padStart(2, '0') + '/' +
               String(today.getDate()).padStart(2, '0');

  sumEl.innerHTML =
    '<div class="today-summary-grid">' +
      '<div><span class="num">' + total + '</span><span class="lbl">应到</span></div>' +
      '<div class="ok"><span class="num">' + counts['出勤'] + '</span><span class="lbl">出勤</span></div>' +
      '<div class="warn"><span class="num">' + counts['迟到'] + '</span><span class="lbl">迟到</span></div>' +
      '<div class="info"><span class="num">' + counts['请假'] + '</span><span class="lbl">请假</span></div>' +
      '<div class="bad"><span class="num">' + counts['缺勤'] + '</span><span class="lbl">缺勤</span></div>' +
      '<div class="date-cell">' +
        '<span class="num">' + mmdd + '</span>' +
        '<span class="lbl">今日</span>' +
      '</div>' +
    '</div>';
};

window.saveAttendance = async function () {
  const el = $('attList');
  if (!el) return;
  const items = [];
  el.querySelectorAll('.att-row').forEach(row => {
    const activeBtn = row.querySelector('.att-status-btn.active');
    const remarkEl = row.querySelector('.att-remark');
    const name = activeBtn ? activeBtn.dataset.name : (remarkEl ? remarkEl.dataset.name : '');
    if (!name) return;
    items.push({ student_name: name, status: activeBtn ? activeBtn.dataset.status : '出勤', remark: remarkEl ? remarkEl.value.trim() : '' });
  });
  if (items.length === 0) { alert('没有可保存的记录'); return; }

  const saveBtn = $('attSaveBtn');
  const oldText = saveBtn ? saveBtn.textContent : '';
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.style.opacity = '0.6';
    saveBtn.textContent = '⏳';
  }

  try {
    await apiCall(API.saveAttendance, currentAttendanceClassId, currentAttendanceDate, items);
    await loadAttendance();
    showSaveStatus('已保存 ' + items.length + ' 条', false);
    if (saveBtn) {
      saveBtn.innerHTML = icon('check');
      saveBtn.style.background = '#27ae60';
      setTimeout(() => {
        saveBtn.textContent = oldText;
        saveBtn.style.background = '';
      }, 1200);
    }
  } catch (err) {
    if (saveBtn) saveBtn.textContent = oldText;
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.style.opacity = '';
    }
  }
};

/* ---------- 事件绑定 ---------- */
(function bindStudentsEvents() {
  const rosterPopClose = $('rosterPopClose');
  if (rosterPopClose) rosterPopClose.onclick = () => { $('rosterPop').style.display = 'none'; };
  const rosterPopEl = $('rosterPop');
  if (rosterPopEl) rosterPopEl.addEventListener('click', e => { if (e.target === rosterPopEl) rosterPopEl.style.display = 'none'; });

  const rosterPopSave = $('rosterPopSave');
  if (rosterPopSave) rosterPopSave.onclick = async () => {
    const errEl = $('rosterPopError');
    errEl.textContent = '';
    const isNew = $('rosterPop').dataset.editing === '0';
    const idCardRaw = $('rosterPopIdCard').value.trim().replace(/\s+/g, '');
    if (idCardRaw && !/^\d{17}[\dXx]$/.test(idCardRaw)) { errEl.textContent = '身份证号需为 18 位（前 17 位数字，最后一位数字或 X）'; return; }
    const tel1Raw = $('rosterPopTel1').value.trim().replace(/[\s-]+/g, '');
    if (tel1Raw && !/^\d{11}$/.test(tel1Raw)) { errEl.textContent = '家长电话1 需为 11 位数字'; return; }
    const tel2Raw = $('rosterPopTel2').value.trim().replace(/[\s-]+/g, '');
    if (tel2Raw && !/^\d{11}$/.test(tel2Raw)) { errEl.textContent = '家长电话2 需为 11 位数字'; return; }
    const data = {
      class_id: $('rosterPopClass').value,
      name: $('rosterPopName').value.trim(),
      gender: $('rosterPopGender').value,
      id_card: idCardRaw, tel1: tel1Raw, tel2: tel2Raw,
      address: $('rosterPopAddress').value.trim(),
    };
    if (!data.class_id) { errEl.textContent = '请选择班级'; return; }
    if (!data.name) { errEl.textContent = '请输入姓名'; return; }
    const oldClassId = $('rosterPop').dataset.oldClass || '';
    const oldName = $('rosterPop').dataset.oldName || '';
    try {
      await apiCall(API.upsertRoster, data);
      if (!isNew && (oldClassId !== data.class_id || oldName !== data.name)) {
        try { await API.deleteRoster(oldClassId, oldName); } catch (e) {}
      }
      showSaveStatus(isNew ? '已添加' : '已更新', false);
      $('rosterPop').style.display = 'none';
      await loadRoster();
    } catch (err) { errEl.textContent = err.message || '保存失败'; }
  };

  const examPopClose = $('examPopClose');
  if (examPopClose) examPopClose.onclick = () => { $('examPop').style.display = 'none'; };

  const examPopEl = $('examPop');
  if (examPopEl) examPopEl.addEventListener('click', e => {
    if (e.target === examPopEl) examPopEl.style.display = 'none';
  });

  const examPopSave = $('examPopSave');
  if (examPopSave) examPopSave.onclick = async () => {
    const errEl = $('examPopError');
    errEl.textContent = '';

    const full = parseInt($('examPopFull').value, 10) || 100;

    // ★ 处理考试名称：预设 or 自定义
    let examName = '';
    if ($('examPopName').value === '__custom__') {
      examName = ($('examPopCustomName').value || '').trim();
      if (!examName) {
        errEl.textContent = '请输入自定义考试名称';
        return;
      }
      if (examName.length > 30) {
        errEl.textContent = '考试名称不能超过 30 个字符';
        return;
      }
    } else {
      examName = $('examPopName').value;
    }

    const data = {
      class_id:        $('examPopClass').value,
      subject:         $('examPopSubject').value,
      name:            examName,
      full_score:      full,
      pass_score:      parseInt($('examPopPass').value, 10)      || Math.round(full * 0.6),
      medium_score:    parseInt($('examPopMedium').value, 10)    || Math.round(full * 0.7),
      good_score:      parseInt($('examPopGood').value, 10)      || Math.round(full * 0.8),
      excellent_score: parseInt($('examPopExcellent').value, 10) || Math.round(full * 0.9),
    };
    if (!data.class_id || !data.subject || !data.name) {
      errEl.textContent = '请填写完整';
      return;
    }

    try {
      const id = $('examPop').dataset.id;
      if (id) await API.updateExam(id, data);
      else    await API.createExam(data);

      showSaveStatus('已保存', false);
      $('examPop').style.display = 'none';
      await loadExams();
    } catch (err) {
      errEl.textContent = err.message || '保存失败';
    }
  };

  const scoresPopClose = $('scoresPopClose');
  if (scoresPopClose) scoresPopClose.onclick = () => { $('scoresPop').style.display = 'none'; };
  const scoresPopEl = $('scoresPop');
  if (scoresPopEl) scoresPopEl.addEventListener('click', e => { if (e.target === scoresPopEl) scoresPopEl.style.display = 'none'; });

  const studentReportClose = $('studentReportClose');
  if (studentReportClose) studentReportClose.onclick = () => { $('studentReportPop').style.display = 'none'; };
  const studentReportPopEl = $('studentReportPop');
  if (studentReportPopEl) studentReportPopEl.addEventListener('click', e => { if (e.target === studentReportPopEl) studentReportPopEl.style.display = 'none'; });

  const rosterEditBtn = $('rosterEditBtn');
  if (rosterEditBtn) rosterEditBtn.onclick = (e) => {
    e.stopPropagation();
    rosterEditOn = !rosterEditOn;
    rosterEditBtn.classList.toggle('active', rosterEditOn);
    renderRosterList();
    showSaveStatus(rosterEditOn ? '已开启编辑：点击行可修改学生信息' : '已锁定', !rosterEditOn ? true : false);
  };
  const rosterMoreToggle = $('rosterMoreToggle');
  const rosterMorePanel = $('rosterMorePanel');
  if (rosterMoreToggle && rosterMorePanel) rosterMoreToggle.onclick = (e) => {
    e.stopPropagation();
    const open = rosterMorePanel.classList.toggle('open');
    rosterMoreToggle.classList.toggle('open', open);
    rosterMoreToggle.innerHTML = open ? icon('settings') + ' 收起' : icon('settings') + ' 更多';
  };
  const rosterImportBtn = $('rosterImportBtn');
  if (rosterImportBtn) rosterImportBtn.onclick = () => {
    if (classes.length === 0) { alert('请先在「班级 → 课表」中创建班级'); return; }
    openImportTargetPop('roster');
  };
  const rosterExportBtn = $('rosterExportBtn');
  if (rosterExportBtn) rosterExportBtn.onclick = () => openExportRosterPop();
  const rosterExportImgBtn = $('rosterExportImgBtn');
  if (rosterExportImgBtn) rosterExportImgBtn.onclick = () => exportRosterImage();

  document.addEventListener('contextmenu', async e => {
    const item = e.target.closest && e.target.closest('.roster-tr');
    if (item) {
      e.preventDefault();
      if (!rosterEditOn) { showSaveStatus('已锁定，请先点击「编辑名册」', true); return; }
      const cid = item.dataset.class, name = item.dataset.name;
      const ok = await showConfirm('删除学生「' + name + '」？', { title: '删除学生', okText: '删除' });
      if (ok) {
        API.deleteRoster(cid, name).then(() => loadRoster()).catch(() => {});
      }
    }
  });

  const exportRosterClose = $('exportRosterClose');
  if (exportRosterClose) exportRosterClose.onclick = () => { $('exportRosterPop').style.display = 'none'; };
  const exportRosterPopEl = $('exportRosterPop');
  if (exportRosterPopEl) exportRosterPopEl.addEventListener('click', e => { if (e.target === exportRosterPopEl) exportRosterPopEl.style.display = 'none'; });
  const exportRosterConfirm = $('exportRosterConfirm');
  if (exportRosterConfirm) exportRosterConfirm.onclick = () => {
    const errEl = $('exportRosterError');
    errEl.textContent = '';
    const allCb = $('exportRosterAll');
    if (allCb && allCb.checked) { $('exportRosterPop').style.display = 'none'; exportRosterExcelByClass(''); return; }
    const grade = parseInt($('exportRosterGrade').value, 10);
    const classNum = parseInt($('exportRosterNum').value, 10);
    const cls = classes.find(c => c.grade === grade && c.class_num === classNum);
    if (!cls) { errEl.textContent = '该班级不存在'; return; }
    $('exportRosterPop').style.display = 'none';
    exportRosterExcelByClass(cls.class_id);
  };
})();