package database

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"

	"kebiao/internal/model"
)

type SQLite struct {
	db *sql.DB
}

func NewSQLite(dbPath string) (*SQLite, error) {
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}

	dsn := fmt.Sprintf("file:%s?_journal_mode=WAL&_busy_timeout=5000", dbPath)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	db.SetMaxOpenConns(1)

	s := &SQLite{db: db}
	if err := s.migrate(); err != nil {
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return s, nil
}

func (s *SQLite) Close() error {
	return s.db.Close()
}

func (s *SQLite) migrate() error {
	schema := `
	CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		username TEXT UNIQUE NOT NULL,
		password TEXT NOT NULL,
		is_admin INTEGER DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		last_login_at DATETIME
	);

	CREATE TABLE IF NOT EXISTS classes (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		class_id TEXT NOT NULL,
		name TEXT DEFAULT '',
		badge TEXT DEFAULT '',
		grade INTEGER DEFAULT 0,
		class_num INTEGER DEFAULT 0,
		period_count INTEGER DEFAULT 8,
		sort_order INTEGER DEFAULT 0,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(user_id, class_id)
	);

	CREATE TABLE IF NOT EXISTS schedule_cells (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		class_id TEXT NOT NULL,
		cell_index INTEGER NOT NULL,
		cell_type TEXT NOT NULL,
		subject TEXT DEFAULT '',
		teacher TEXT DEFAULT '',
		period_name TEXT DEFAULT '',
		period_time TEXT DEFAULT '',
		bg_color TEXT DEFAULT '0',
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(user_id, class_id, cell_index)
	);

	CREATE TABLE IF NOT EXISTS students (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		seat_row INTEGER NOT NULL,
		seat_col INTEGER NOT NULL,
		name TEXT DEFAULT '',
		gender TEXT DEFAULT '',
		id_card TEXT DEFAULT '',
		tel1 TEXT DEFAULT '',
		tel2 TEXT DEFAULT '',
		address TEXT DEFAULT '',
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(user_id, seat_row, seat_col)
	);

	CREATE TABLE IF NOT EXISTS seat_configs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER UNIQUE NOT NULL,
		rows INTEGER DEFAULT 7,
		cols INTEGER DEFAULT 8,
		"order" TEXT DEFAULT 'asc',
		aisle TEXT DEFAULT '',
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS user_preferences (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER UNIQUE NOT NULL,
		theme TEXT DEFAULT 'light',
		schedule_filter TEXT DEFAULT 'all',
		week_highlight INTEGER DEFAULT 1,
		seat_drag_on INTEGER DEFAULT 0,
		seat_person_on INTEGER DEFAULT 0,
		active_tab TEXT DEFAULT 'schedule',
		edit_on_23 INTEGER DEFAULT 0,
		edit_on_22 INTEGER DEFAULT 0,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS supabase_config (
		id INTEGER PRIMARY KEY CHECK (id = 1),
		enabled INTEGER DEFAULT 0,
		url TEXT DEFAULT '',
		api_key TEXT DEFAULT '',
		sync_interval INTEGER DEFAULT 300,
		registration_locked INTEGER DEFAULT 0
	);

	CREATE TABLE IF NOT EXISTS system_config (
		id INTEGER PRIMARY KEY CHECK (id = 1),
		login_notice TEXT DEFAULT '',
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS sync_log (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		direction TEXT NOT NULL,
		status TEXT NOT NULL,
		error_msg TEXT DEFAULT '',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS roster_students (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		class_id TEXT NOT NULL,
		name TEXT NOT NULL,
		gender TEXT DEFAULT '',
		id_card TEXT DEFAULT '',
		tel1 TEXT DEFAULT '',
		tel2 TEXT DEFAULT '',
		address TEXT DEFAULT '',
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(user_id, class_id, name)
	);

	CREATE TABLE IF NOT EXISTS exams (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		class_id TEXT NOT NULL,
		subject TEXT NOT NULL,
		name TEXT NOT NULL,
		full_score INTEGER DEFAULT 100,
		pass_score INTEGER DEFAULT 75,
		excellent_score INTEGER DEFAULT 100,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(user_id, class_id, subject, name)
	);

	CREATE TABLE IF NOT EXISTS exam_scores (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		exam_id INTEGER NOT NULL,
		user_id INTEGER NOT NULL,
		student_name TEXT NOT NULL,
		score REAL DEFAULT 0,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(exam_id, student_name)
	);

	CREATE TABLE IF NOT EXISTS attendance_records (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		class_id TEXT NOT NULL,
		date TEXT NOT NULL,
		student_name TEXT NOT NULL,
		status TEXT DEFAULT '出勤',
		remark TEXT DEFAULT '',
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(user_id, class_id, date, student_name)
	);
	`
	if _, err := s.db.Exec(schema); err != nil {
		return err
	}

	// ============ 兼容老库：补充新列 ============
	_, _ = s.db.Exec(`ALTER TABLE classes ADD COLUMN grade INTEGER DEFAULT 0`)
	_, _ = s.db.Exec(`ALTER TABLE classes ADD COLUMN class_num INTEGER DEFAULT 0`)
	_, _ = s.db.Exec(`ALTER TABLE classes ADD COLUMN period_count INTEGER DEFAULT 8`)
	_, _ = s.db.Exec(`ALTER TABLE supabase_config ADD COLUMN registration_locked INTEGER DEFAULT 0`)
	_, _ = s.db.Exec(`ALTER TABLE users ADD COLUMN last_login_at DATETIME`)
	_, _ = s.db.Exec(`ALTER TABLE system_config ADD COLUMN login_notice TEXT DEFAULT ''`)
	_, _ = s.db.Exec(`ALTER TABLE seat_configs ADD COLUMN aisle TEXT DEFAULT ''`)
	_, _ = s.db.Exec(`ALTER TABLE roster_students ADD COLUMN id_card TEXT DEFAULT ''`)
	_, _ = s.db.Exec(`ALTER TABLE roster_students ADD COLUMN tel1 TEXT DEFAULT ''`)
	_, _ = s.db.Exec(`ALTER TABLE roster_students ADD COLUMN tel2 TEXT DEFAULT ''`)
	_, _ = s.db.Exec(`ALTER TABLE roster_students ADD COLUMN address TEXT DEFAULT ''`)

	// 回填 classes 老数据
	_, _ = s.db.Exec(`UPDATE classes SET grade=7, class_num=CAST(class_id AS INTEGER)
		WHERE grade=0 AND class_id GLOB '[0-9]*'`)

	// 回填 period_count
	_, _ = s.db.Exec(`UPDATE classes SET period_count = 8
		WHERE period_count IS NULL OR period_count < 1`)

	// 迁移：把历史 schedule_cells 里的 class_id 登记为班级
	_, _ = s.db.Exec(`
		INSERT OR IGNORE INTO classes (user_id, class_id, name, badge, grade, class_num, period_count, sort_order)
		SELECT DISTINCT user_id, class_id,
			CASE class_id
				WHEN '23' THEN '七.23班'
				WHEN '22' THEN '七.22班'
				ELSE '七.' || class_id || '班'
			END,
			'班主任 · XX',
			7,
			CAST(class_id AS INTEGER),
			8,
			CASE class_id WHEN '23' THEN 0 WHEN '22' THEN 1 ELSE 2 END
		FROM schedule_cells
		WHERE class_id GLOB '[0-9]*'
		  AND (user_id, class_id) NOT IN (SELECT user_id, class_id FROM classes)
	`)

	// 保证 supabase_config 有一行初始记录
	_, _ = s.db.Exec(`
		INSERT OR IGNORE INTO supabase_config (id, enabled, url, api_key, sync_interval, registration_locked)
		VALUES (1, 0, '', '', 300, 0)
	`)

	// 保证 system_config 有一行初始记录
	_, _ = s.db.Exec(`
		INSERT OR IGNORE INTO system_config (id, login_notice)
		VALUES (1, '数据存储在服务端 SQLite，管理员可启用 Supabase 云同步实现多端数据同步。')
	`)

	return nil
}

// ============ User ============

func (s *SQLite) CreateUser(u *model.User) error {
	res, err := s.db.Exec(
		`INSERT INTO users (username, password, is_admin) VALUES (?, ?, ?)`,
		u.Username, u.Password, boolToInt(u.IsAdmin),
	)
	if err != nil {
		return err
	}
	u.ID, _ = res.LastInsertId()
	return nil
}

func (s *SQLite) scanUser(scanner interface {
	Scan(dest ...interface{}) error
}) (*model.User, error) {
	u := &model.User{}
	var isAdmin int
	var lastLogin sql.NullTime
	err := scanner.Scan(&u.ID, &u.Username, &u.Password, &isAdmin, &u.CreatedAt, &lastLogin)
	if err != nil {
		return nil, err
	}
	u.IsAdmin = isAdmin == 1
	if lastLogin.Valid {
		t := lastLogin.Time
		u.LastLoginAt = &t
	}
	return u, nil
}

func (s *SQLite) GetUserByUsername(username string) (*model.User, error) {
	row := s.db.QueryRow(
		`SELECT id, username, password, is_admin, created_at, last_login_at FROM users WHERE username = ?`,
		username,
	)
	return s.scanUser(row)
}

func (s *SQLite) GetUserByID(id int64) (*model.User, error) {
	row := s.db.QueryRow(
		`SELECT id, username, password, is_admin, created_at, last_login_at FROM users WHERE id = ?`,
		id,
	)
	return s.scanUser(row)
}

func (s *SQLite) GetAllUsers() ([]model.User, error) {
	rows, err := s.db.Query(`SELECT id, username, password, is_admin, created_at, last_login_at FROM users ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []model.User
	for rows.Next() {
		var u model.User
		var isAdmin int
		var lastLogin sql.NullTime
		if err := rows.Scan(&u.ID, &u.Username, &u.Password, &isAdmin, &u.CreatedAt, &lastLogin); err != nil {
			continue
		}
		u.IsAdmin = isAdmin == 1
		if lastLogin.Valid {
			t := lastLogin.Time
			u.LastLoginAt = &t
		}
		users = append(users, u)
	}
	return users, nil
}

func (s *SQLite) UserCount() (int, error) {
	var count int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&count)
	return count, err
}

func (s *SQLite) UpdateUserPassword(id int64, hashedPwd string) error {
	_, err := s.db.Exec(`UPDATE users SET password = ? WHERE id = ?`, hashedPwd, id)
	return err
}

func (s *SQLite) UpdateUsername(id int64, newUsername string) error {
	_, err := s.db.Exec(`UPDATE users SET username = ? WHERE id = ?`, newUsername, id)
	return err
}

func (s *SQLite) UpdateLastLogin(id int64, t time.Time) error {
	_, err := s.db.Exec(`UPDATE users SET last_login_at = ? WHERE id = ?`, t, id)
	return err
}

func (s *SQLite) DeleteUser(id int64) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	for _, table := range []string{
		"schedule_cells", "students", "seat_configs", "user_preferences",
		"classes", "roster_students", "exam_scores", "exams", "attendance_records",
	} {
		if _, err := tx.Exec(fmt.Sprintf(`DELETE FROM %s WHERE user_id = ?`, table), id); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(`DELETE FROM users WHERE id = ?`, id); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *SQLite) ClearUserData(id int64) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	for _, table := range []string{"schedule_cells", "students"} {
		if _, err := tx.Exec(fmt.Sprintf(`DELETE FROM %s WHERE user_id = ?`, table), id); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(`UPDATE seat_configs SET rows=7, cols=8, "order"='asc', aisle='', updated_at=CURRENT_TIMESTAMP WHERE user_id = ?`, id); err != nil {
		return err
	}
	return tx.Commit()
}

// ============ Classes ============

func (s *SQLite) GetClasses(userID int64) ([]model.Class, error) {
	rows, err := s.db.Query(
		`SELECT id, user_id, class_id, name, badge, grade, class_num,
		        COALESCE(period_count, 8), sort_order, updated_at
		 FROM classes WHERE user_id = ? ORDER BY sort_order ASC, id ASC`, userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []model.Class
	for rows.Next() {
		var c model.Class
		if err := rows.Scan(&c.ID, &c.UserID, &c.ClassID, &c.Name, &c.Badge,
			&c.Grade, &c.ClassNum, &c.PeriodCount, &c.SortOrder, &c.UpdatedAt); err != nil {
			continue
		}
		list = append(list, c)
	}
	return list, nil
}

func (s *SQLite) GetClassByClassID(userID int64, classID string) (*model.Class, error) {
	c := &model.Class{}
	err := s.db.QueryRow(
		`SELECT id, user_id, class_id, name, badge, grade, class_num,
		        COALESCE(period_count, 8), sort_order, updated_at
		 FROM classes WHERE user_id = ? AND class_id = ?`, userID, classID,
	).Scan(&c.ID, &c.UserID, &c.ClassID, &c.Name, &c.Badge,
		&c.Grade, &c.ClassNum, &c.PeriodCount, &c.SortOrder, &c.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return c, nil
}

func (s *SQLite) CreateClass(c *model.Class) error {
	if c.PeriodCount < 1 {
		c.PeriodCount = 8
	}
	res, err := s.db.Exec(
		`INSERT INTO classes (user_id, class_id, name, badge, grade, class_num, period_count, sort_order)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		c.UserID, c.ClassID, c.Name, c.Badge, c.Grade, c.ClassNum, c.PeriodCount, c.SortOrder,
	)
	if err != nil {
		return err
	}
	c.ID, _ = res.LastInsertId()
	return nil
}

func (s *SQLite) UpdateClass(c *model.Class) error {
	if c.PeriodCount < 1 {
		c.PeriodCount = 8
	}
	_, err := s.db.Exec(
		`UPDATE classes SET name = ?, badge = ?, grade = ?, class_num = ?,
		        period_count = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
		 WHERE user_id = ? AND class_id = ?`,
		c.Name, c.Badge, c.Grade, c.ClassNum, c.PeriodCount, c.SortOrder, c.UserID, c.ClassID,
	)
	return err
}

func (s *SQLite) DeleteClass(userID int64, classID string) error {
	_, err := s.db.Exec(`DELETE FROM classes WHERE user_id = ? AND class_id = ?`, userID, classID)
	return err
}

func (s *SQLite) DeleteClassCells(userID int64, classID string) error {
	_, err := s.db.Exec(`DELETE FROM schedule_cells WHERE user_id = ? AND class_id = ?`, userID, classID)
	return err
}

// ============ Schedule Cells ============

func (s *SQLite) GetScheduleCells(userID int64) ([]model.ScheduleCell, error) {
	rows, err := s.db.Query(
		`SELECT id, user_id, class_id, cell_index, cell_type, subject, teacher, period_name, period_time, bg_color, updated_at
		FROM schedule_cells WHERE user_id = ?`, userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cells []model.ScheduleCell
	for rows.Next() {
		var c model.ScheduleCell
		if err := rows.Scan(&c.ID, &c.UserID, &c.ClassID, &c.CellIndex, &c.CellType, &c.Subject, &c.Teacher, &c.PeriodName, &c.PeriodTime, &c.BgColor, &c.UpdatedAt); err != nil {
			continue
		}
		cells = append(cells, c)
	}
	return cells, nil
}

func (s *SQLite) UpsertScheduleCell(c *model.ScheduleCell) error {
	_, err := s.db.Exec(
		`INSERT INTO schedule_cells (user_id, class_id, cell_index, cell_type, subject, teacher, period_name, period_time, bg_color, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(user_id, class_id, cell_index) DO UPDATE SET
			cell_type=excluded.cell_type,
			subject=excluded.subject, teacher=excluded.teacher,
			period_name=excluded.period_name, period_time=excluded.period_time,
			bg_color=excluded.bg_color, updated_at=CURRENT_TIMESTAMP`,
		c.UserID, c.ClassID, c.CellIndex, c.CellType, c.Subject, c.Teacher, c.PeriodName, c.PeriodTime, c.BgColor,
	)
	return err
}

// ============ Students / Seat ============

func (s *SQLite) GetStudents(userID int64) ([]model.Student, error) {
	rows, err := s.db.Query(
		`SELECT id, user_id, seat_row, seat_col, name, gender, id_card, tel1, tel2, address, updated_at
		FROM students WHERE user_id = ?`, userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var students []model.Student
	for rows.Next() {
		var st model.Student
		if err := rows.Scan(&st.ID, &st.UserID, &st.SeatRow, &st.SeatCol, &st.Name, &st.Gender, &st.IDCard, &st.Tel1, &st.Tel2, &st.Address, &st.UpdatedAt); err != nil {
			continue
		}
		students = append(students, st)
	}
	return students, nil
}

func (s *SQLite) UpsertStudent(st *model.Student) error {
	_, err := s.db.Exec(
		`INSERT INTO students (user_id, seat_row, seat_col, name, gender, id_card, tel1, tel2, address, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(user_id, seat_row, seat_col) DO UPDATE SET
			name=excluded.name, gender=excluded.gender, id_card=excluded.id_card,
			tel1=excluded.tel1, tel2=excluded.tel2, address=excluded.address,
			updated_at=CURRENT_TIMESTAMP`,
		st.UserID, st.SeatRow, st.SeatCol, st.Name, st.Gender, st.IDCard, st.Tel1, st.Tel2, st.Address,
	)
	return err
}

func (s *SQLite) DeleteStudent(userID int64, row, col int) error {
	_, err := s.db.Exec(`DELETE FROM students WHERE user_id = ? AND seat_row = ? AND seat_col = ?`, userID, row, col)
	return err
}

func (s *SQLite) DeleteAllStudents(userID int64) error {
	_, err := s.db.Exec(`DELETE FROM students WHERE user_id = ?`, userID)
	return err
}

func (s *SQLite) SwapStudents(userID int64, r1, c1, r2, c2 int) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var s1, s2 *model.Student

	s1, err = s.getStudentTx(tx, userID, r1, c1)
	if err != nil && err != sql.ErrNoRows {
		return err
	}
	s2, err = s.getStudentTx(tx, userID, r2, c2)
	if err != nil && err != sql.ErrNoRows {
		return err
	}

	if s1 != nil {
		if _, err := tx.Exec(`DELETE FROM students WHERE user_id = ? AND seat_row = ? AND seat_col = ?`, userID, r1, c1); err != nil {
			return err
		}
	}
	if s2 != nil {
		if _, err := tx.Exec(`DELETE FROM students WHERE user_id = ? AND seat_row = ? AND seat_col = ?`, userID, r2, c2); err != nil {
			return err
		}
	}

	if s1 != nil {
		if _, err := tx.Exec(`INSERT INTO students (user_id, seat_row, seat_col, name, gender, id_card, tel1, tel2, address, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
			userID, r2, c2, s1.Name, s1.Gender, s1.IDCard, s1.Tel1, s1.Tel2, s1.Address); err != nil {
			return err
		}
	}
	if s2 != nil {
		if _, err := tx.Exec(`INSERT INTO students (user_id, seat_row, seat_col, name, gender, id_card, tel1, tel2, address, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
			userID, r1, c1, s2.Name, s2.Gender, s2.IDCard, s2.Tel1, s2.Tel2, s2.Address); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (s *SQLite) getStudentTx(tx *sql.Tx, userID int64, row, col int) (*model.Student, error) {
	st := &model.Student{}
	err := tx.QueryRow(
		`SELECT id, user_id, seat_row, seat_col, name, gender, id_card, tel1, tel2, address FROM students WHERE user_id = ? AND seat_row = ? AND seat_col = ?`,
		userID, row, col,
	).Scan(&st.ID, &st.UserID, &st.SeatRow, &st.SeatCol, &st.Name, &st.Gender, &st.IDCard, &st.Tel1, &st.Tel2, &st.Address)
	if err != nil {
		return nil, err
	}
	return st, nil
}

// ============ Seat Config ============

func (s *SQLite) GetSeatConfig(userID int64) (*model.SeatConfig, error) {
	sc := &model.SeatConfig{UserID: userID, Rows: 7, Cols: 8, Order: "asc", Aisle: ""}
	err := s.db.QueryRow(
		`SELECT id, user_id, rows, cols, "order", aisle, updated_at FROM seat_configs WHERE user_id = ?`,
		userID,
	).Scan(&sc.ID, &sc.UserID, &sc.Rows, &sc.Cols, &sc.Order, &sc.Aisle, &sc.UpdatedAt)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}
	if err == sql.ErrNoRows {
		_, err = s.db.Exec(
			`INSERT OR IGNORE INTO seat_configs (user_id, rows, cols, "order", aisle) VALUES (?, 7, 8, 'asc', '')`,
			userID,
		)
		if err != nil {
			// 不返回错误，直接把默认值返回，避免上层拿到 nil
			return sc, nil
		}
		return s.GetSeatConfig(userID)
	}

	return sc, nil
}

func (s *SQLite) UpdateSeatConfig(userID int64, rows, cols int, order string) error {
	_, err := s.db.Exec(
		`INSERT INTO seat_configs (user_id, rows, cols, "order", updated_at)
		VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(user_id) DO UPDATE SET rows=excluded.rows, cols=excluded.cols, "order"=excluded."order", updated_at=CURRENT_TIMESTAMP`,
		userID, rows, cols, order,
	)
	return err
}

func (s *SQLite) UpdateSeatAisle(userID int64, aisle string) error {
	_, err := s.db.Exec(
		`UPDATE seat_configs SET aisle = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
		aisle, userID,
	)
	return err
}

// ============ User Preferences ============

func (s *SQLite) GetPreferences(userID int64) (*model.UserPreference, error) {
	p := &model.UserPreference{UserID: userID}
	var wh, sd, sp, e23, e22 int
	err := s.db.QueryRow(
		`SELECT id, user_id, theme, schedule_filter, week_highlight, seat_drag_on, seat_person_on, active_tab, edit_on_23, edit_on_22, updated_at
		FROM user_preferences WHERE user_id = ?`, userID,
	).Scan(&p.ID, &p.UserID, &p.Theme, &p.ScheduleFilter, &wh, &sd, &sp, &p.ActiveTab, &e23, &e22, &p.UpdatedAt)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}
	if err == sql.ErrNoRows {
		p.Theme = "light"
		p.ScheduleFilter = "all"
		p.WeekHighlight = true
		p.ActiveTab = "schedule"
		return p, nil
	}
	p.WeekHighlight = wh == 1
	p.SeatDragOn = sd == 1
	p.SeatPersonOn = sp == 1
	p.EditOn23 = e23 == 1
	p.EditOn22 = e22 == 1
	return p, nil
}

func (s *SQLite) UpsertPreferences(p *model.UserPreference) error {
	_, err := s.db.Exec(
		`INSERT INTO user_preferences (user_id, theme, schedule_filter, week_highlight, seat_drag_on, seat_person_on, active_tab, edit_on_23, edit_on_22, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(user_id) DO UPDATE SET
			theme=excluded.theme, schedule_filter=excluded.schedule_filter,
			week_highlight=excluded.week_highlight, seat_drag_on=excluded.seat_drag_on,
			seat_person_on=excluded.seat_person_on, active_tab=excluded.active_tab,
			edit_on_23=excluded.edit_on_23, edit_on_22=excluded.edit_on_22, updated_at=CURRENT_TIMESTAMP`,
		p.UserID, p.Theme, p.ScheduleFilter, boolToInt(p.WeekHighlight), boolToInt(p.SeatDragOn),
		boolToInt(p.SeatPersonOn), p.ActiveTab, boolToInt(p.EditOn23), boolToInt(p.EditOn22),
	)
	return err
}

// ============ Supabase Config ============

func (s *SQLite) GetSupabaseConfig() (*model.SupabaseConfig, error) {
	sc := &model.SupabaseConfig{}
	var enabled, regLocked int
	err := s.db.QueryRow(
		`SELECT enabled, url, api_key, sync_interval, registration_locked FROM supabase_config WHERE id = 1`,
	).Scan(&enabled, &sc.URL, &sc.APIKey, &sc.SyncInterval, &regLocked)
	if err != nil {
		return nil, err
	}
	sc.Enabled = enabled == 1
	sc.RegistrationLocked = regLocked == 1
	return sc, nil
}

func (s *SQLite) UpdateSupabaseConfig(sc *model.SupabaseConfig) error {
	_, err := s.db.Exec(
		`UPDATE supabase_config SET enabled = ?, url = ?, api_key = ?, sync_interval = ?, registration_locked = ? WHERE id = 1`,
		boolToInt(sc.Enabled), sc.URL, sc.APIKey, sc.SyncInterval, boolToInt(sc.RegistrationLocked),
	)
	return err
}

// ============ System Config ============

func (s *SQLite) GetSystemConfig() (*model.SystemConfig, error) {
	sc := &model.SystemConfig{}
	err := s.db.QueryRow(
		`SELECT login_notice, updated_at FROM system_config WHERE id = 1`,
	).Scan(&sc.LoginNotice, &sc.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return sc, nil
}

func (s *SQLite) UpdateSystemConfig(sc *model.SystemConfig) error {
	_, err := s.db.Exec(
		`UPDATE system_config SET login_notice = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
		sc.LoginNotice,
	)
	return err
}

// ============ Sync Log ============

func (s *SQLite) AddSyncLog(direction, status, errMsg string) error {
	_, err := s.db.Exec(
		`INSERT INTO sync_log (direction, status, error_msg) VALUES (?, ?, ?)`,
		direction, status, errMsg,
	)
	return err
}

func (s *SQLite) GetSyncStatus() (*model.SyncStatus, error) {
	status := &model.SyncStatus{}
	var statusStr string
	err := s.db.QueryRow(
		`SELECT created_at, status, error_msg FROM sync_log ORDER BY id DESC LIMIT 1`,
	).Scan(&status.LastSyncAt, &statusStr, &status.LastError)
	if err != nil && err == sql.ErrNoRows {
		return status, nil
	}
	if err != nil {
		return nil, err
	}
	status.LastSyncOK = statusStr == "success"
	return status, nil
}

// ============ Batch helpers for sync ============

func (s *SQLite) ReplaceAllStudents(userID int64, students []model.Student) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`DELETE FROM students WHERE user_id = ?`, userID); err != nil {
		return err
	}
	for _, st := range students {
		if _, err := tx.Exec(
			`INSERT INTO students (user_id, seat_row, seat_col, name, gender, id_card, tel1, tel2, address, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
			userID, st.SeatRow, st.SeatCol, st.Name, st.Gender, st.IDCard, st.Tel1, st.Tel2, st.Address,
		); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *SQLite) ReplaceAllScheduleCells(userID int64, cells []model.ScheduleCell) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`DELETE FROM schedule_cells WHERE user_id = ?`, userID); err != nil {
		return err
	}
	for _, c := range cells {
		if _, err := tx.Exec(
			`INSERT INTO schedule_cells (user_id, class_id, cell_index, cell_type, subject, teacher, period_name, period_time, bg_color, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
			userID, c.ClassID, c.CellIndex, c.CellType, c.Subject, c.Teacher, c.PeriodName, c.PeriodTime, c.BgColor,
		); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// ============ 花名册 ============

func (s *SQLite) GetRosterStudents(userID int64, classID string) ([]model.RosterStudent, error) {
	var (
		rows *sql.Rows
		err  error
	)
	if classID == "" {
		rows, err = s.db.Query(
			`SELECT id, user_id, class_id, name, gender, id_card, tel1, tel2, address, updated_at
			 FROM roster_students WHERE user_id = ? ORDER BY class_id ASC, name ASC`, userID)
	} else {
		rows, err = s.db.Query(
			`SELECT id, user_id, class_id, name, gender, id_card, tel1, tel2, address, updated_at
			 FROM roster_students WHERE user_id = ? AND class_id = ? ORDER BY name ASC`, userID, classID)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []model.RosterStudent
	for rows.Next() {
		var r model.RosterStudent
		if err := rows.Scan(&r.ID, &r.UserID, &r.ClassID, &r.Name, &r.Gender,
			&r.IDCard, &r.Tel1, &r.Tel2, &r.Address, &r.UpdatedAt); err != nil {
			continue
		}
		list = append(list, r)
	}
	return list, nil
}

func (s *SQLite) UpsertRosterStudent(r *model.RosterStudent) error {
	_, err := s.db.Exec(
		`INSERT INTO roster_students (user_id, class_id, name, gender, id_card, tel1, tel2, address, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		 ON CONFLICT(user_id, class_id, name) DO UPDATE SET
			gender=excluded.gender, id_card=excluded.id_card,
			tel1=excluded.tel1, tel2=excluded.tel2, address=excluded.address,
			updated_at=CURRENT_TIMESTAMP`,
		r.UserID, r.ClassID, r.Name, r.Gender, r.IDCard, r.Tel1, r.Tel2, r.Address,
	)
	return err
}

func (s *SQLite) DeleteRosterStudent(userID int64, classID, name string) error {
	_, err := s.db.Exec(
		`DELETE FROM roster_students WHERE user_id = ? AND class_id = ? AND name = ?`,
		userID, classID, name)
	return err
}

func (s *SQLite) DeleteRosterClass(userID int64, classID string) error {
	_, err := s.db.Exec(`DELETE FROM roster_students WHERE user_id = ? AND class_id = ?`, userID, classID)
	return err
}

func (s *SQLite) MoveRosterClass(userID int64, fromClassID, toClassID string) error {
	_, err := s.db.Exec(
		`UPDATE roster_students SET class_id = ?, updated_at = CURRENT_TIMESTAMP
		 WHERE user_id = ? AND class_id = ?`,
		toClassID, userID, fromClassID)
	return err
}

// ============ 成绩 ============

func (s *SQLite) GetExams(userID int64, classID string) ([]model.Exam, error) {
	var (
		rows *sql.Rows
		err  error
	)
	if classID == "" {
		rows, err = s.db.Query(
			`SELECT id, user_id, class_id, subject, name, full_score, pass_score, excellent_score, created_at, updated_at
			 FROM exams WHERE user_id = ? ORDER BY updated_at DESC`, userID)
	} else {
		rows, err = s.db.Query(
			`SELECT id, user_id, class_id, subject, name, full_score, pass_score, excellent_score, created_at, updated_at
			 FROM exams WHERE user_id = ? AND class_id = ? ORDER BY updated_at DESC`, userID, classID)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []model.Exam
	for rows.Next() {
		var e model.Exam
		if err := rows.Scan(&e.ID, &e.UserID, &e.ClassID, &e.Subject, &e.Name,
			&e.FullScore, &e.PassScore, &e.ExcellentScore, &e.CreatedAt, &e.UpdatedAt); err != nil {
			continue
		}
		list = append(list, e)
	}
	return list, nil
}

func (s *SQLite) GetExamByID(userID, examID int64) (*model.Exam, error) {
	e := &model.Exam{}
	err := s.db.QueryRow(
		`SELECT id, user_id, class_id, subject, name, full_score, pass_score, excellent_score, created_at, updated_at
		 FROM exams WHERE id = ? AND user_id = ?`, examID, userID,
	).Scan(&e.ID, &e.UserID, &e.ClassID, &e.Subject, &e.Name,
		&e.FullScore, &e.PassScore, &e.ExcellentScore, &e.CreatedAt, &e.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return e, nil
}

func (s *SQLite) GetExamByName(userID int64, classID, subject, name string) (*model.Exam, error) {
	e := &model.Exam{}
	err := s.db.QueryRow(
		`SELECT id, user_id, class_id, subject, name, full_score, pass_score, excellent_score, created_at, updated_at
		 FROM exams WHERE user_id = ? AND class_id = ? AND subject = ? AND name = ?`,
		userID, classID, subject, name,
	).Scan(&e.ID, &e.UserID, &e.ClassID, &e.Subject, &e.Name,
		&e.FullScore, &e.PassScore, &e.ExcellentScore, &e.CreatedAt, &e.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return e, nil
}

func (s *SQLite) CreateExam(e *model.Exam) error {
	if e.FullScore <= 0 {
		e.FullScore = 100
	}
	if e.PassScore <= 0 {
		e.PassScore = 75
	}
	if e.ExcellentScore <= 0 {
		e.ExcellentScore = 100
	}
	res, err := s.db.Exec(
		`INSERT INTO exams (user_id, class_id, subject, name, full_score, pass_score, excellent_score)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		e.UserID, e.ClassID, e.Subject, e.Name, e.FullScore, e.PassScore, e.ExcellentScore)
	if err != nil {
		return err
	}
	e.ID, _ = res.LastInsertId()
	return nil
}

func (s *SQLite) UpdateExam(e *model.Exam) error {
	_, err := s.db.Exec(
		`UPDATE exams SET full_score = ?, pass_score = ?, excellent_score = ?, updated_at = CURRENT_TIMESTAMP
		 WHERE id = ? AND user_id = ?`,
		e.FullScore, e.PassScore, e.ExcellentScore, e.ID, e.UserID)
	return err
}

func (s *SQLite) DeleteExam(userID, examID int64) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`DELETE FROM exam_scores WHERE exam_id = ?`, examID); err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM exams WHERE id = ? AND user_id = ?`, examID, userID); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *SQLite) GetExamScores(examID int64) ([]model.ExamScore, error) {
	rows, err := s.db.Query(
		`SELECT id, exam_id, student_name, score, updated_at FROM exam_scores WHERE exam_id = ?`, examID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []model.ExamScore
	for rows.Next() {
		var es model.ExamScore
		if err := rows.Scan(&es.ID, &es.ExamID, &es.StudentName, &es.Score, &es.UpdatedAt); err != nil {
			continue
		}
		list = append(list, es)
	}
	return list, nil
}

func (s *SQLite) UpsertExamScore(userID, examID int64, studentName string, score float64) error {
	_, err := s.db.Exec(
		`INSERT INTO exam_scores (exam_id, user_id, student_name, score, updated_at)
		 VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
		 ON CONFLICT(exam_id, student_name) DO UPDATE SET
			score=excluded.score, updated_at=CURRENT_TIMESTAMP`,
		examID, userID, studentName, score)
	return err
}

func (s *SQLite) BatchUpsertExamScores(userID, examID int64, scores []model.ExamScore) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	for _, sc := range scores {
		if _, err := tx.Exec(
			`INSERT INTO exam_scores (exam_id, user_id, student_name, score, updated_at)
			 VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
			 ON CONFLICT(exam_id, student_name) DO UPDATE SET
				score=excluded.score, updated_at=CURRENT_TIMESTAMP`,
			examID, userID, sc.StudentName, sc.Score); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *SQLite) DeleteExamScore(examID int64, studentName string) error {
	_, err := s.db.Exec(`DELETE FROM exam_scores WHERE exam_id = ? AND student_name = ?`, examID, studentName)
	return err
}

// ============ 考勤 ============

func (s *SQLite) GetAttendance(userID int64, classID, date string) ([]model.AttendanceRecord, error) {
	rows, err := s.db.Query(
		`SELECT id, user_id, class_id, date, student_name, status, remark, updated_at
		 FROM attendance_records WHERE user_id = ? AND class_id = ? AND date = ?
		 ORDER BY student_name ASC`, userID, classID, date)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []model.AttendanceRecord
	for rows.Next() {
		var r model.AttendanceRecord
		if err := rows.Scan(&r.ID, &r.UserID, &r.ClassID, &r.Date, &r.StudentName, &r.Status, &r.Remark, &r.UpdatedAt); err != nil {
			continue
		}
		list = append(list, r)
	}
	return list, nil
}

func (s *SQLite) ListAttendanceDates(userID int64, classID string) ([]string, error) {
	rows, err := s.db.Query(
		`SELECT DISTINCT date FROM attendance_records WHERE user_id = ? AND class_id = ? ORDER BY date DESC`,
		userID, classID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []string
	for rows.Next() {
		var d string
		if err := rows.Scan(&d); err != nil {
			continue
		}
		list = append(list, d)
	}
	return list, nil
}

func (s *SQLite) UpsertAttendance(r *model.AttendanceRecord) error {
	_, err := s.db.Exec(
		`INSERT INTO attendance_records (user_id, class_id, date, student_name, status, remark, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		 ON CONFLICT(user_id, class_id, date, student_name) DO UPDATE SET
			status=excluded.status, remark=excluded.remark, updated_at=CURRENT_TIMESTAMP`,
		r.UserID, r.ClassID, r.Date, r.StudentName, r.Status, r.Remark)
	return err
}

func (s *SQLite) BatchUpsertAttendance(records []model.AttendanceRecord) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, r := range records {
		if _, err := tx.Exec(
			`INSERT INTO attendance_records (user_id, class_id, date, student_name, status, remark, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
			 ON CONFLICT(user_id, class_id, date, student_name) DO UPDATE SET
				status=excluded.status, remark=excluded.remark, updated_at=CURRENT_TIMESTAMP`,
			r.UserID, r.ClassID, r.Date, r.StudentName, r.Status, r.Remark); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *SQLite) DeleteAttendanceDate(userID int64, classID, date string) error {
	_, err := s.db.Exec(
		`DELETE FROM attendance_records WHERE user_id = ? AND class_id = ? AND date = ?`,
		userID, classID, date)
	return err
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
