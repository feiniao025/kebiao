const API = (function () {
  'use strict';
  const BASE = '/api';
  let token = localStorage.getItem('kebiao_token') || '';

  function setToken(t) { token = t; if (t) localStorage.setItem('kebiao_token', t); else localStorage.removeItem('kebiao_token'); }
  function getToken() { return token; }
  function clearToken() { setToken(''); }

  async function request(method, path, body) {
    const opts = { method: method, headers: { 'Content-Type': 'application/json' } };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (body) opts.body = JSON.stringify(body);
    const resp = await fetch(BASE + path, opts);
    const data = await resp.json().catch(function () { return {}; });
    if (!resp.ok) { const e = new Error(data.error || 'Request failed'); e.status = resp.status; e.data = data; throw e; }
    return data;
  }

  return {
    setToken: setToken, getToken: getToken, clearToken: clearToken,
    register: function (u, p) { return request('POST', '/auth/register', { username: u, password: p }); },
    login: function (u, p) { return request('POST', '/auth/login', { username: u, password: p }); },
    me: function () { return request('GET', '/auth/me'); },
    changePassword: function (o, n) { return request('PUT', '/auth/password', { old_password: o, new_password: n }); },
    getPreferences: function () { return request('GET', '/auth/preferences'); },
    updatePreferences: function (p) { return request('PUT', '/auth/preferences', p); },
    getPublicConfig: function () { return request('GET', '/config'); },
    getDefaults: function () { return request('GET', '/schedule/default'); },
    getCells: function () { return request('GET', '/schedule'); },
    upsertCell: function (c) { return request('PUT', '/schedule/cell', c); },
    batchUpsert: function (c) { return request('POST', '/schedule/batch', { cells: c }); },
    listClasses: function () { return request('GET', '/classes'); },
    // 新增 customName 参数：为空字符串时表示普通班级（年级+班号）
    createClass: function (g, n, b, customName) {
      return request('POST', '/classes', {
        grade: g,
        class_num: n,
        badge: b || '',
        custom_name: customName || ''
      });
    },
    updateClass: function (id, d) { return request('PUT', '/classes/' + encodeURIComponent(id), d); },
    deleteClass: function (id) { return request('DELETE', '/classes/' + encodeURIComponent(id)); },
    updateClassOrder: function (ids) { return request('PUT', '/classes/order', { class_ids: ids }); },
    getSeat: function () { return request('GET', '/seat'); },
    updateStudent: function (s) { return request('PUT', '/seat/student', s); },
    deleteStudent: function (r, c) { return request('DELETE', '/seat/student', { seat_row: r, seat_col: c }); },
    swap: function (r1, c1, r2, c2) { return request('POST', '/seat/swap', { row1: r1, col1: c1, row2: r2, col2: c2 }); },
    resize: function (r, c) { return request('POST', '/seat/resize', { rows: r, cols: c }); },
    setOrder: function (o) { return request('POST', '/seat/order', { order: o }); },
    setAisle: function (a) { return request('POST', '/seat/aisle', { aisle: a }); },
    getSyncStatus: function () { return request('GET', '/sync/status'); },
    pushSync: function () { return request('POST', '/sync/push'); },
    pullSync: function () { return request('POST', '/sync/pull'); },
    testSync: function () { return request('POST', '/sync/test'); },
    listRoster: function (id) { return request('GET', '/students/roster' + (id ? '?class_id=' + encodeURIComponent(id) : '')); },
    upsertRoster: function (r) { return request('POST', '/students/roster', r); },
    deleteRoster: function (c, n) { return request('DELETE', '/students/roster?class_id=' + encodeURIComponent(c) + '&name=' + encodeURIComponent(n)); },
    moveRoster: function (f, t) { return request('POST', '/students/roster/move', { from_class_id: f, to_class_id: t }); },
    listExams: function (id) { return request('GET', '/students/exams' + (id ? '?class_id=' + encodeURIComponent(id) : '')); },
    createExam: function (d) { return request('POST', '/students/exams', d); },
    updateExam: function (id, d) { return request('PUT', '/students/exams/' + id, d); },
    deleteExam: function (id) { return request('DELETE', '/students/exams/' + id); },
    getExamDetail: function (id) { return request('GET', '/students/exams/' + id); },
    saveScores: function (id, s) { return request('PUT', '/students/exams/' + id + '/scores', { scores: s }); },
    getStudentHistory: function (n, s) { return request('GET', '/students/exams/history?name=' + encodeURIComponent(n) + '&subject=' + encodeURIComponent(s)); },
    listAttendance: function (c, d) { return request('GET', '/students/attendance?class_id=' + encodeURIComponent(c) + '&date=' + encodeURIComponent(d)); },
    listAttendanceDates: function (c) { return request('GET', '/students/attendance/dates?class_id=' + encodeURIComponent(c)); },
    attendanceSummary: function (c, d) { return request('GET', '/students/attendance/summary?class_id=' + encodeURIComponent(c) + '&date=' + encodeURIComponent(d)); },
    saveAttendance: function (c, d, i) { return request('POST', '/students/attendance', { class_id: c, date: d, items: i }); },
    deleteAttendance: function (c, d) { return request('DELETE', '/students/attendance?class_id=' + encodeURIComponent(c) + '&date=' + encodeURIComponent(d)); },
    listUsers: function () { return request('GET', '/admin/users'); },
    getUserDetail: function (u) { return request('GET', '/admin/users/' + encodeURIComponent(u)); },
    adminUpdateUser: function (u, n, p) { return request('PUT', '/admin/users/' + encodeURIComponent(u), { new_username: n || '', new_password: p || '' }); },
    resetUserPassword: function (u, p) { return request('POST', '/admin/users/' + encodeURIComponent(u) + '/reset-password', { new_password: p }); },
    clearUserData: function (u) { return request('DELETE', '/admin/users/' + encodeURIComponent(u) + '/data'); },
    deleteUser: function (u) { return request('DELETE', '/admin/users/' + encodeURIComponent(u)); },
    getSupabaseConfig: function () { return request('GET', '/admin/supabase'); },
    updateSupabaseConfig: function (c) { return request('PUT', '/admin/supabase', c); },
    testSupabase: function () { return request('POST', '/admin/supabase/test'); },
    getSchemaSQL: function () { return request('GET', '/admin/supabase/schema'); },
    adminGetSystemConfig: function () { return request('GET', '/admin/system/config'); },
    adminUpdateSystemConfig: function (n) { return request('PUT', '/admin/system/config', { login_notice: n }); }
  };
})();