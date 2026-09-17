const API = (function () {
  const BASE = '/api';
  let token = localStorage.getItem('kebiao_token') || '';

  function setToken(t) {
    token = t;
    if (t) localStorage.setItem('kebiao_token', t);
    else localStorage.removeItem('kebiao_token');
  }

  function getToken() { return token; }
  function clearToken() { setToken(''); }

  async function request(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (body) opts.body = JSON.stringify(body);

    const resp = await fetch(BASE + path, opts);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const err = new Error(data.error || 'Request failed');
      err.status = resp.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  return {
    setToken, getToken, clearToken,

    // Auth
    register: (username, password) => request('POST', '/auth/register', { username, password }),
    login: (username, password) => request('POST', '/auth/login', { username, password }),
    me: () => request('GET', '/auth/me'),
    changePassword: (oldPwd, newPwd) => request('PUT', '/auth/password', { old_password: oldPwd, new_password: newPwd }),
    getPreferences: () => request('GET', '/auth/preferences'),
    updatePreferences: (prefs) => request('PUT', '/auth/preferences', prefs),

    // Public config
    getPublicConfig: () => request('GET', '/config'),

    // Schedule
    getDefaults: () => request('GET', '/schedule/default'),
    getCells: () => request('GET', '/schedule'),
    upsertCell: (cell) => request('PUT', '/schedule/cell', cell),
    batchUpsert: (cells) => request('POST', '/schedule/batch', { cells }),

    // Classes
    listClasses: () => request('GET', '/classes'),
    createClass: (grade, classNum, badge) =>
      request('POST', '/classes', { grade, class_num: classNum, badge: badge || '' }),
    updateClass: (classId, data) =>
      request('PUT', '/classes/' + encodeURIComponent(classId), data),
    deleteClass: (classId) =>
      request('DELETE', '/classes/' + encodeURIComponent(classId)),
    updateClassOrder: (classIds) =>
      request('PUT', '/classes/order', { class_ids: classIds }),

    // Seat
    getSeat: () => request('GET', '/seat'),
    updateStudent: (student) => request('PUT', '/seat/student', student),
    deleteStudent: (row, col) => request('DELETE', '/seat/student', { seat_row: row, seat_col: col }),
    swap: (r1, c1, r2, c2) => request('POST', '/seat/swap', { row1: r1, col1: c1, row2: r2, col2: c2 }),
    resize: (rows, cols) => request('POST', '/seat/resize', { rows, cols }),
    setOrder: (order) => request('POST', '/seat/order', { order }),
    setAisle: (aisle) => request('POST', '/seat/aisle', { aisle }),

    // Sync
    getSyncStatus: () => request('GET', '/sync/status'),
    pushSync: () => request('POST', '/sync/push'),
    pullSync: () => request('POST', '/sync/pull'),
    testSync: () => request('POST', '/sync/test'),

    // ============ Students ============
    // 花名册
    listRoster: (classId) => request('GET', '/students/roster' + (classId ? '?class_id=' + encodeURIComponent(classId) : '')),
    upsertRoster: (r) => request('POST', '/students/roster', r),
    deleteRoster: (classId, name) => request('DELETE', '/students/roster?class_id=' + encodeURIComponent(classId) + '&name=' + encodeURIComponent(name)),
	moveRoster: (fromClassId, toClassId) => request('POST', '/students/roster/move', { from_class_id: fromClassId, to_class_id: toClassId }),

    // 成绩
    listExams: (classId) => request('GET', '/students/exams' + (classId ? '?class_id=' + encodeURIComponent(classId) : '')),
    createExam: (data) => request('POST', '/students/exams', data),
    updateExam: (id, data) => request('PUT', '/students/exams/' + id, data),
    deleteExam: (id) => request('DELETE', '/students/exams/' + id),
    getExamDetail: (id) => request('GET', '/students/exams/' + id),
    saveScores: (id, scores) => request('PUT', '/students/exams/' + id + '/scores', { scores }),

    // 考勤
    listAttendance: (classId, date) => request('GET', '/students/attendance?class_id=' + encodeURIComponent(classId) + '&date=' + encodeURIComponent(date)),
    listAttendanceDates: (classId) => request('GET', '/students/attendance/dates?class_id=' + encodeURIComponent(classId)),
    attendanceSummary: (classId, date) => request('GET', '/students/attendance/summary?class_id=' + encodeURIComponent(classId) + '&date=' + encodeURIComponent(date)),
    saveAttendance: (classId, date, items) => request('POST', '/students/attendance', { class_id: classId, date, items }),
    deleteAttendance: (classId, date) => request('DELETE', '/students/attendance?class_id=' + encodeURIComponent(classId) + '&date=' + encodeURIComponent(date)),

    // Admin
    listUsers: () => request('GET', '/admin/users'),
    getUserDetail: (username) => request('GET', '/admin/users/' + encodeURIComponent(username)),
    adminUpdateUser: (username, newUsername, newPassword) =>
      request('PUT', '/admin/users/' + encodeURIComponent(username), {
        new_username: newUsername || '',
        new_password: newPassword || '',
      }),
    resetUserPassword: (username, newPwd) =>
      request('POST', '/admin/users/' + encodeURIComponent(username) + '/reset-password', { new_password: newPwd }),
    clearUserData: (username) => request('DELETE', '/admin/users/' + encodeURIComponent(username) + '/data'),
    deleteUser: (username) => request('DELETE', '/admin/users/' + encodeURIComponent(username)),
    getSupabaseConfig: () => request('GET', '/admin/supabase'),
    updateSupabaseConfig: (cfg) => request('PUT', '/admin/supabase', cfg),
    testSupabase: () => request('POST', '/admin/supabase/test'),
    getSchemaSQL: () => request('GET', '/admin/supabase/schema'),
    adminGetSystemConfig: () => request('GET', '/admin/system/config'),
    adminUpdateSystemConfig: (loginNotice) =>
      request('PUT', '/admin/system/config', { login_notice: loginNotice }),
  };
})();