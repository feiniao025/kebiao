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
    const yes = confirm('未在 Excel 前 10 行中找到「姓名」表头。\n\n是否按常见列顺序解析？（默认：序号 | 姓名 | 性别 | 身份证 | 班级 | 家长电话1 | 家长电话2 | 家庭地址）');
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
  if (!confirm(msg + '\n\n确认导入？')) return;

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
      '<button class="btn-sm btn-edit-exam" data-exam=\'' + JSON.stringify(e).replace(/'/g, "\\'") + '\'>✏️ 修改</button>' +
      '<button class="btn-sm btn-del-exam" data-id="' + e.id + '">🗑️ 删除</button>' +
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
    el.innerHTML =
      '<div class="stat-cell"><span class="k">平均分</span><span class="v">' + (st.average ? st.average.toFixed(1) : '—') + ' / ' + (st.full_score || 0) + '</span></div>' +
      '<div class="stat-cell"><span class="k">及格率</span><span class="v">' + (st.pass_rate ? st.pass_rate.toFixed(1) : '0.0') + '% (' + (st.pass_count || 0) + '人 ≥' + (st.pass_line || 0) + ')</span></div>' +
      '<div class="stat-cell"><span class="k">优秀率</span><span class="v">' + (st.excellent_rate ? st.excellent_rate.toFixed(1) : '0.0') + '% (' + (st.excellent_count || 0) + '人 ≥' + (st.excellent_line || 0) + ')</span></div>' +
      '<div class="stat-cell"><span class="k">最高/最低</span><span class="v">' + (st.max_score || 0) + ' / ' + (st.min_score || 0) + '</span></div>' +
      '<div class="stat-cell"><span class="k">已录人数</span><span class="v">' + (st.count || 0) + '</span></div>';
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

window.fillExamNameSelect = function (sel, defaultVal) {
  if (!sel) return;
  sel.innerHTML = '';
  EXAM_NAMES.forEach(n => {
    const opt = document.createElement('option');
    opt.value = n; opt.textContent = n;
    if (n === defaultVal) opt.selected = true;
    sel.appendChild(opt);
  });
};

window.openExamPop = function (exam) {
  if (classes.length === 0) { alert('请先创建班级'); return; }
  const isNew = !exam;
  $('examPopTitle').textContent = isNew ? '新建考试' : '编辑考试';
  fillClassSelect($('examPopClass'), exam ? exam.class_id : currentGradesClassId);
  fillSubjectSelect($('examPopSubject'), exam ? exam.subject : currentGradesSubject);
  fillExamNameSelect($('examPopName'), exam ? exam.name : EXAM_NAMES[0]);

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
  if (exam) {
    const full = exam.full_score || 100;
    fullInput.value = full;
    passInput.value = exam.pass_score || Math.round(full * RATIOS.pass);
    mediumInput.value = exam.medium_score || Math.round(full * RATIOS.medium);
    goodInput.value = exam.good_score || Math.round(full * RATIOS.good);
    excellentInput.value = exam.excellent_score || Math.round(full * RATIOS.excellent);
  } else { fullInput.value = 100; applyRatios(); }
  fullInput.oninput = applyRatios;
  $('examPopError').textContent = '';
  $('examPopClass').disabled = !isNew;
  $('examPopSubject').disabled = !isNew;
  $('examPopName').disabled = !isNew;
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
        if (!confirm('未找到「姓名」「分数」表头。\n\n是否按第一列姓名、第二列分数解析？')) return;
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
        let msg = '✅ 已导入并保存 ' + toSave.length + ' 名学生的成绩';
        if (unmatched.length > 0) {
          msg += '\n\n⚠️ 有 ' + unmatched.length + ' 名学生不在当前花名册，已跳过：\n' + unmatched.slice(0, 8).join('、');
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
    const examsResp = await API.listExams(currentGradesClassId);
    const allExams = examsResp.exams || [];
    const subjectExams = allExams.filter(e => e.subject === subject);
    const details = await Promise.all(subjectExams.map(e => API.getExamDetail(e.id).catch(() => null)));
    const rows = [];
    for (const d of details) {
      if (!d || !d.exam || !d.scores) continue;
      const exam = d.exam;
      const scores = d.scores;
      const stu = scores.find(s => s.student_name === studentName);
      if (!stu) continue;
      const sum = scores.reduce((a, b) => a + b.score, 0);
      const avg = scores.length ? sum / scores.length : 0;
      const sorted = scores.slice().sort((a, b) => b.score - a.score);
      const rank = sorted.findIndex(s => s.student_name === studentName) + 1;
      rows.push({ examName: exam.name, date: exam.created_at ? String(exam.created_at).slice(0, 10) : '', score: stu.score,
        fullScore: exam.full_score || fullScore, average: avg, rank: rank, totalCount: scores.length });
    }
    rows.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

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

    const passLine = exam.pass_score, mediumLine = exam.medium_score;
    const goodLine = exam.good_score, excellentLine = exam.excellent_score, fullScore = exam.full_score;

    const bands = [
      { label: '<' + passLine, name: '不及格', color: '#f28b82', min: -Infinity, max: passLine },
      { label: passLine + '~' + (mediumLine - 1), name: '及格', color: '#fb8c00', min: passLine, max: mediumLine },
      { label: mediumLine + '~' + (goodLine - 1), name: '中等', color: '#fdd835', min: mediumLine, max: goodLine },
      { label: goodLine + '~' + (excellentLine - 1), name: '良好', color: '#8ab4f8', min: goodLine, max: excellentLine },
      { label: excellentLine + '~' + fullScore, name: '优秀', color: '#81c784', min: excellentLine, max: Infinity },
    ];
    const counts = bands.map(() => 0);
    scores.forEach(s => { for (let i = 0; i < bands.length; i++) { if (s.score >= bands[i].min && s.score < bands[i].max) { counts[i]++; break; } } });

    let html = `
      <div class="tab-header">
        <button class="tab-btn active" data-tab="input">📝 成绩录入</button>
        <button class="tab-btn" data-tab="analysis">📊 分数段</button>
        <button class="tab-btn" data-tab="rank">🏆 名次表</button>
        <button class="tab-btn" data-tab="trend">📈 成绩走势</button>
      </div>
      <div id="tab-content-input" class="tab-pane active">
        <div class="scores-stats" id="scoresPopStats"></div>
        <div id="scoresInputBody" style="margin-top:12px;"></div>
        <div class="scores-action-bar">
          <button id="scoresImportBtn" class="btn-scores-import">📗 导入</button>
          <button id="scoresSaveBtn" class="btn-scores-save">💾 保存</button>
        </div>
      </div>
      <div id="tab-content-analysis" class="tab-pane">
        <div id="chartDistribution" style="width:100%;height:300px;"></div>
      </div>
      <div id="tab-content-rank" class="tab-pane">
        <div id="rankTableBody"></div>
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
      '<div class="stat-cell"><span class="k">已录人数</span><span class="v">' + (stats.count || 0) + ' / ' + roster.length + '</span></div>';

    if (roster.length === 0) {
      $('scoresInputBody').innerHTML = '<div class="today-empty">该班级暂无花名册学生<br>请先到「学生 → 花名册」添加学生</div>';
    } else {
      const scoreMap = {};
      scores.forEach(s => { scoreMap[s.student_name] = s.score; });
      let inputHtml = '<div class="scores-input-list">';
      roster.forEach(stu => {
        const val = scoreMap[stu.name];
        const safeName = String(stu.name || '');
        const initial = safeName ? escapeHtml(safeName.charAt(0)) : '?';
        const genderClass = stu.gender === '女' ? 'female' : (stu.gender === '男' ? 'male' : 'unknown');
        inputHtml += '<div class="scores-input-row"><div class="scores-input-info">' +
          '<div class="scores-avatar ' + genderClass + '">' + initial + '</div>' +
          '<span class="scores-name">' + escapeHtml(safeName) + '</span></div>' +
          '<div class="scores-input-wrap">' +
          '<input type="number" class="score-input" data-name="' + escapeHtml(safeName) + '" value="' + (val !== undefined ? val : '') + '" min="0" max="' + exam.full_score + '" step="0.5" inputmode="decimal">' +
          '<span class="scores-max">/ ' + exam.full_score + '</span></div></div>';
      });
      inputHtml += '</div>';
      $('scoresInputBody').innerHTML = inputHtml;
      $('scoresInputBody').querySelectorAll('.score-input').forEach(inp => {
        applyScoreLevel(inp, exam);
        inp.addEventListener('input', () => applyScoreLevel(inp, exam));
      });
    }

    if (roster.length === 0) $('rankTableBody').innerHTML = '<div class="today-empty">暂无学生数据</div>';
    else {
      const rankList = roster.map(stu => {
        const scoreObj = scores.find(s => s.student_name === stu.name);
        return { name: stu.name, gender: stu.gender || '', score: scoreObj ? scoreObj.score : null };
      }).sort((a, b) => {
        if (a.score === null && b.score === null) return 0;
        if (a.score === null) return 1;
        if (b.score === null) return -1;
        return b.score - a.score;
      });

      let rankTableHtml = '<table class="rank-table"><thead><tr><th>名次</th><th>姓名</th><th>性别</th><th>分数</th><th>总分</th><th>层次</th></tr></thead><tbody>';
      let rank = 1;
      rankList.forEach(item => {
        if (item.score === null) {
          rankTableHtml += '<tr><td class="rank-num">-</td><td class="student-name">' + escapeHtml(item.name) + '</td><td>' + escapeHtml(item.gender) + '</td><td colspan="3" style="color:var(--empty-text);">未录入</td></tr>';
          return;
        }
        let level, levelColor;
        if (item.score >= exam.excellent_score) { level = '优秀'; levelColor = '#27ae60'; }
        else if (item.score >= exam.good_score) { level = '良好'; levelColor = '#3498db'; }
        else if (item.score >= exam.medium_score) { level = '中等'; levelColor = '#f39c12'; }
        else if (item.score >= exam.pass_score) { level = '及格'; levelColor = '#e67e22'; }
        else { level = '不及格'; levelColor = '#e74c3c'; }
        rankTableHtml += '<tr><td class="rank-num">' + (rank++) + '</td>' +
          '<td class="student-name"><a href="javascript:void(0)" class="rank-student-link" data-name="' + escapeHtml(item.name) + '" data-gender="' + escapeHtml(item.gender) + '">' + escapeHtml(item.name) + '</a></td>' +
          '<td>' + escapeHtml(item.gender) + '</td><td class="score-val">' + item.score + '</td>' +
          '<td>' + exam.full_score + '</td><td><span style="color:' + levelColor + ';font-weight:600;">' + level + '</span></td></tr>';
      });
      rankTableHtml += '</tbody></table>';
      $('rankTableBody').innerHTML = rankTableHtml;

      const trendSel = $('trendStudentSelect');
      if (trendSel) {
        trendSel.innerHTML = '<option value="">— 请选择 —</option>' +
          rankList.map(s => '<option value="' + escapeHtml(s.name) + '" data-gender="' + escapeHtml(s.gender) + '">' + escapeHtml(s.name) + '</option>').join('');
        trendSel.onchange = () => {
          const opt = trendSel.options[trendSel.selectedIndex];
          if (!opt || !opt.value) { const panel = document.getElementById('rankRightPanel'); if (panel) panel.innerHTML = '<div class="rank-right-empty">请选择学生查看个人成绩走势</div>'; return; }
          window.showStudentReportInline(opt.value, exam.subject, exam.full_score, opt.dataset.gender);
        };
      }
      $('rankTableBody').querySelectorAll('.rank-student-link').forEach(a => {
        a.onclick = (ev) => {
          ev.preventDefault(); ev.stopPropagation();
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
    }

    const importBtn = $('scoresImportBtn');
    if (importBtn) importBtn.onclick = () => importScoresFromExcel(exam, () => { openScoresPop(examId); loadExamStats(examId); });
    const saveBtn = $('scoresSaveBtn');
    if (saveBtn) saveBtn.onclick = async () => {
      const inputs = $('scoresInputBody').querySelectorAll('.score-input');
      const toSave = [];
      inputs.forEach(inp => {
        const v = inp.value.trim();
        if (v === '') return;
        const score = parseFloat(v);
        if (isNaN(score)) return;
        toSave.push({ student_name: inp.dataset.name, score });
      });
      if (toSave.length === 0) { alert('请至少录入一个成绩'); return; }
      try {
        await apiCall(API.saveScores, examId, toSave);
        showSaveStatus('已保存 ' + toSave.length + ' 条成绩', false);
        await openScoresPop(examId);
        loadExamStats(examId);
      } catch {}
    };

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

/* ---------- 考勤 ---------- */
window.renderAttendance = async function () {
  const classOptions = classes.map(c => '<option value="' + escapeHtml(c.class_id) + '">' + escapeHtml(c.name) + '</option>').join('');
  attendanceContainer.innerHTML =
    '<div class="me-page">' +
      '<div class="me-card">' +
        '<div class="roster-toolbar">' +
          '<select id="attClass" class="cell-pop-input" style="flex:1;min-width:110px;">' + (classOptions || '<option value="">（暂无班级）</option>') + '</select>' +
          '<input type="date" id="attDate" class="cell-pop-input" style="flex:1;min-width:120px;">' +
          '<button id="attDelBtn" class="btn-primary" style="background:#eeeeee;color:#555;" title="删除当日考勤">🗑️</button>' +
          '<button id="attSaveBtn" class="btn-primary" title="保存考勤">💾</button>' +
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

  // ★ 删除当天该班级的全部考勤记录
  $('attDelBtn').onclick = async () => {
    if (!currentAttendanceClassId) { showSaveStatus('请先选择班级', true); return; }
    const cls = classes.find(c => c.class_id === currentAttendanceClassId);
    const clsName = cls ? cls.name : currentAttendanceClassId;
    if (!confirm('确认删除「' + clsName + '」在 ' + currentAttendanceDate + ' 的全部考勤记录？\n\n此操作不可恢复。')) return;
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
        '<div class="att-student-info">' +
          '<div class="att-avatar ' + genderClass + '">' + initial + '</div>' +
          '<span class="att-name">' + escapeHtml(safeName) + '</span>' +
        '</div>' +
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
    updateAttSummary();
  } catch (err) { el.innerHTML = '<div class="today-empty">加载失败：' + escapeHtml(err.message) + '</div>'; }
};

window.updateAttSummary = function () {
  const el = $('attList');
  const sumEl = $('attSummary');
  if (!el || !sumEl) return;
  const counts = { 出勤: 0, 迟到: 0, 请假: 0, 缺勤: 0 };
  el.querySelectorAll('.att-status-btn.active').forEach(b => { if (counts[b.dataset.status] !== undefined) counts[b.dataset.status]++; });
  const total = attendanceList.length;

  // ★ 第 6 格固定显示"今天"的日期，不跟随上面的选择器
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

  // 按钮进入"保存中"状态
  const saveBtn = $('attSaveBtn');
  const oldText = saveBtn ? saveBtn.textContent : '';
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.style.opacity = '0.6';
    saveBtn.textContent = '⏳';
  }

  try {
    await apiCall(API.saveAttendance, currentAttendanceClassId, currentAttendanceDate, items);

    // 从服务端重新加载，保证显示与实际一致
    await loadAttendance();

    // 顶部绿条
    showSaveStatus('已保存 ' + items.length + ' 条', false);

    // 按钮短暂显示"✓ 已保存"
    if (saveBtn) {
      saveBtn.textContent = '✓';
      saveBtn.style.background = '#27ae60';
      setTimeout(() => {
        saveBtn.textContent = oldText;
        saveBtn.style.background = '';
      }, 1200);
    }
  } catch (err) {
    // apiCall 已经弹过错误提示
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
  if (examPopEl) examPopEl.addEventListener('click', e => { if (e.target === examPopEl) examPopEl.style.display = 'none'; });
  const examPopSave = $('examPopSave');
  if (examPopSave) examPopSave.onclick = async () => {
    const errEl = $('examPopError');
    errEl.textContent = '';
    const full = parseInt($('examPopFull').value, 10) || 100;
    const data = {
      class_id: $('examPopClass').value,
      subject: $('examPopSubject').value,
      name: $('examPopName').value,
      full_score: full,
      pass_score: parseInt($('examPopPass').value, 10) || Math.round(full * 0.6),
      medium_score: parseInt($('examPopMedium').value, 10) || Math.round(full * 0.7),
      good_score: parseInt($('examPopGood').value, 10) || Math.round(full * 0.8),
      excellent_score: parseInt($('examPopExcellent').value, 10) || Math.round(full * 0.9),
    };
    if (!data.class_id || !data.subject || !data.name) { errEl.textContent = '请填写完整'; return; }
    try {
      const id = $('examPop').dataset.id;
      if (id) await API.updateExam(id, data);
      else await API.createExam(data);
      showSaveStatus('已保存', false);
      $('examPop').style.display = 'none';
      await loadExams();
    } catch (err) { errEl.textContent = err.message || '保存失败'; }
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
    rosterMoreToggle.textContent = open ? '⚙️ 收起' : '⚙️ 更多';
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

  /* 花名册右键删除 */
  document.addEventListener('contextmenu', e => {
    const item = e.target.closest && e.target.closest('.roster-tr');
    if (item) {
      e.preventDefault();
      if (!rosterEditOn) { showSaveStatus('已锁定，请先点击「✏️ 编辑名册」', true); return; }
      const cid = item.dataset.class, name = item.dataset.name;
      if (confirm('删除学生「' + name + '」？')) {
        API.deleteRoster(cid, name).then(() => loadRoster()).catch(() => {});
      }
    }
  });

  /* 导出花名册弹窗 */
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