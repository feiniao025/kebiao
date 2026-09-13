package database

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"kebiao/internal/model"
)

type Supabase struct {
	config *model.SupabaseConfig
	db     *SQLite
	client *http.Client
}

func NewSupabase(db *SQLite) *Supabase {
	cfg, _ := db.GetSupabaseConfig()
	if cfg == nil {
		cfg = &model.SupabaseConfig{}
	}
	return &Supabase{
		config: cfg,
		db:     db,
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

func (sb *Supabase) ReloadConfig() error {
	cfg, err := sb.db.GetSupabaseConfig()
	if err != nil {
		return err
	}
	sb.config = cfg
	return nil
}

func (sb *Supabase) IsEnabled() bool {
	return sb.config != nil && sb.config.Enabled && sb.config.URL != "" && sb.config.APIKey != ""
}

func (sb *Supabase) TestConnection() error {
	if sb.config.URL == "" || sb.config.APIKey == "" {
		return fmt.Errorf("Supabase URL 或 API Key 未配置")
	}
	// 用 cloud_users 探测（表名与 schema 一致）
	url := sb.config.URL + "/rest/v1/cloud_users?select=id&limit=1"
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("apikey", sb.config.APIKey)
	req.Header.Set("Authorization", "Bearer "+sb.config.APIKey)

	resp, err := sb.client.Do(req)
	if err != nil {
		return fmt.Errorf("连接失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(body))
	}
	return nil
}

func (sb *Supabase) request(method, path string, body interface{}) ([]byte, error) {
	if !sb.IsEnabled() {
		return nil, fmt.Errorf("Supabase 未启用")
	}

	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		bodyReader = bytes.NewReader(data)
	}

	url := sb.config.URL + path
	req, err := http.NewRequest(method, url, bodyReader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("apikey", sb.config.APIKey)
	req.Header.Set("Authorization", "Bearer "+sb.config.APIKey)
	req.Header.Set("Content-Type", "application/json")

	// POST 请求走 upsert（存在则更新），避免 409 duplicate key
	if method == "POST" {
		req.Header.Set("Prefer", "return=representation,resolution=merge-duplicates")
	} else {
		req.Header.Set("Prefer", "return=representation")
	}

	resp, err := sb.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(respBody))
	}
	return respBody, nil
}

// PushAll uploads all local user data to Supabase
func (sb *Supabase) PushAll(userID int64, username string) error {
	if !sb.IsEnabled() {
		return fmt.Errorf("Supabase 未启用")
	}

	// Push user record
	userRow := map[string]interface{}{
		"id":         userID,
		"username":   username,
		"updated_at": time.Now().Format(time.RFC3339),
	}
	if _, err := sb.request("POST", "/rest/v1/cloud_users?on_conflict=id", userRow); err != nil {
		return fmt.Errorf("push user: %w", err)
	}

	// Push schedule cells
	cells, err := sb.db.GetScheduleCells(userID)
	if err != nil {
		return err
	}
	if len(cells) > 0 {
		cellRows := make([]map[string]interface{}, len(cells))
		for i, c := range cells {
			cellRows[i] = map[string]interface{}{
				"user_id":     userID,
				"class_id":    c.ClassID,
				"cell_index":  c.CellIndex,
				"cell_type":   c.CellType,
				"subject":     c.Subject,
				"teacher":     c.Teacher,
				"period_name": c.PeriodName,
				"period_time": c.PeriodTime,
				"bg_color":    c.BgColor,
				"updated_at":  time.Now().Format(time.RFC3339),
			}
		}
		if _, err := sb.request("POST", "/rest/v1/cloud_schedule_cells?on_conflict=user_id,class_id,cell_index", cellRows); err != nil {
			return fmt.Errorf("push schedule: %w", err)
		}
	}

	// Push students
	students, err := sb.db.GetStudents(userID)
	if err != nil {
		return err
	}
	if len(students) > 0 {
		studentRows := make([]map[string]interface{}, len(students))
		for i, st := range students {
			studentRows[i] = map[string]interface{}{
				"user_id":    userID,
				"seat_row":   st.SeatRow,
				"seat_col":   st.SeatCol,
				"name":       st.Name,
				"gender":     st.Gender,
				"id_card":    st.IDCard,
				"tel1":       st.Tel1,
				"tel2":       st.Tel2,
				"address":    st.Address,
				"updated_at": time.Now().Format(time.RFC3339),
			}
		}
		if _, err := sb.request("POST", "/rest/v1/cloud_students?on_conflict=user_id,seat_row,seat_col", studentRows); err != nil {
			return fmt.Errorf("push students: %w", err)
		}
	}

	// Push seat config
	sc, err := sb.db.GetSeatConfig(userID)
	if err != nil {
		return err
	}
	scRow := map[string]interface{}{
		"user_id":    userID,
		"rows":       sc.Rows,
		"cols":       sc.Cols,
		"order":      sc.Order,
		"updated_at": time.Now().Format(time.RFC3339),
	}
	if _, err := sb.request("POST", "/rest/v1/cloud_seat_configs?on_conflict=user_id", scRow); err != nil {
		return fmt.Errorf("push seat config: %w", err)
	}

	// Push preferences
	prefs, err := sb.db.GetPreferences(userID)
	if err == nil && prefs != nil {
		prefRow := map[string]interface{}{
			"user_id":         userID,
			"theme":           prefs.Theme,
			"schedule_filter": prefs.ScheduleFilter,
			"week_highlight":  prefs.WeekHighlight,
			"seat_drag_on":    prefs.SeatDragOn,
			"seat_person_on":  prefs.SeatPersonOn,
			"active_tab":      prefs.ActiveTab,
			"edit_on_23":      prefs.EditOn23,
			"edit_on_22":      prefs.EditOn22,
			"updated_at":      time.Now().Format(time.RFC3339),
		}
		if _, err := sb.request("POST", "/rest/v1/cloud_user_preferences?on_conflict=user_id", prefRow); err != nil {
			return fmt.Errorf("push preferences: %w", err)
		}
	}

	sb.db.AddSyncLog("push", "success", "")
	return nil
}

// PullAll downloads all cloud data for a user and replaces local data
func (sb *Supabase) PullAll(userID int64) error {
	if !sb.IsEnabled() {
		return fmt.Errorf("Supabase 未启用")
	}

	// Pull schedule cells
	cellData, err := sb.request("GET", fmt.Sprintf("/rest/v1/cloud_schedule_cells?user_id=eq.%d", userID), nil)
	if err != nil {
		return fmt.Errorf("pull schedule: %w", err)
	}
	var cells []model.ScheduleCell
	if err := json.Unmarshal(cellData, &cells); err != nil {
		return fmt.Errorf("parse schedule: %w", err)
	}
	if err := sb.db.ReplaceAllScheduleCells(userID, cells); err != nil {
		return fmt.Errorf("replace schedule: %w", err)
	}

	// Pull students
	studentData, err := sb.request("GET", fmt.Sprintf("/rest/v1/cloud_students?user_id=eq.%d", userID), nil)
	if err != nil {
		return fmt.Errorf("pull students: %w", err)
	}
	var students []model.Student
	if err := json.Unmarshal(studentData, &students); err != nil {
		return fmt.Errorf("parse students: %w", err)
	}
	if err := sb.db.ReplaceAllStudents(userID, students); err != nil {
		return fmt.Errorf("replace students: %w", err)
	}

	// Pull seat config
	scData, err := sb.request("GET", fmt.Sprintf("/rest/v1/cloud_seat_configs?user_id=eq.%d", userID), nil)
	if err != nil {
		return fmt.Errorf("pull seat config: %w", err)
	}
	var scs []model.SeatConfig
	if err := json.Unmarshal(scData, &scs); err != nil {
		return fmt.Errorf("parse seat config: %w", err)
	}
	if len(scs) > 0 {
		sb.db.UpdateSeatConfig(userID, scs[0].Rows, scs[0].Cols, scs[0].Order)
	}

	// Pull preferences
	prefData, err := sb.request("GET", fmt.Sprintf("/rest/v1/cloud_user_preferences?user_id=eq.%d", userID), nil)
	if err != nil {
		return fmt.Errorf("pull preferences: %w", err)
	}
	var prefs []model.UserPreference
	if err := json.Unmarshal(prefData, &prefs); err != nil {
		return fmt.Errorf("parse preferences: %w", err)
	}
	if len(prefs) > 0 {
		sb.db.UpsertPreferences(&prefs[0])
	}

	sb.db.AddSyncLog("pull", "success", "")
	return nil
}

// GetSQL returns the SQL schema for Supabase tables
func SupabaseSchemaSQL() string {
	return `-- Supabase 云同步表结构
-- 在 Supabase SQL Editor 中执行

CREATE TABLE IF NOT EXISTS cloud_users (
    id BIGINT PRIMARY KEY,
    username TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cloud_schedule_cells (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES cloud_users(id) ON DELETE CASCADE,
    class_id TEXT NOT NULL,
    cell_index INTEGER NOT NULL,
    cell_type TEXT NOT NULL,
    subject TEXT DEFAULT '',
    teacher TEXT DEFAULT '',
    period_name TEXT DEFAULT '',
    period_time TEXT DEFAULT '',
    bg_color TEXT DEFAULT '0',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, class_id, cell_index)
);

CREATE TABLE IF NOT EXISTS cloud_students (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES cloud_users(id) ON DELETE CASCADE,
    seat_row INTEGER NOT NULL,
    seat_col INTEGER NOT NULL,
    name TEXT DEFAULT '',
    gender TEXT DEFAULT '',
    id_card TEXT DEFAULT '',
    tel1 TEXT DEFAULT '',
    tel2 TEXT DEFAULT '',
    address TEXT DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, seat_row, seat_col)
);

CREATE TABLE IF NOT EXISTS cloud_seat_configs (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT UNIQUE NOT NULL REFERENCES cloud_users(id) ON DELETE CASCADE,
    rows INTEGER DEFAULT 7,
    cols INTEGER DEFAULT 8,
    "order" TEXT DEFAULT 'asc',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cloud_user_preferences (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT UNIQUE NOT NULL REFERENCES cloud_users(id) ON DELETE CASCADE,
    theme TEXT DEFAULT 'light',
    schedule_filter TEXT DEFAULT 'all',
    week_highlight BOOLEAN DEFAULT TRUE,
    seat_drag_on BOOLEAN DEFAULT FALSE,
    seat_person_on BOOLEAN DEFAULT FALSE,
    active_tab TEXT DEFAULT 'schedule',
    edit_on_23 BOOLEAN DEFAULT FALSE,
    edit_on_22 BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 启用 RLS (Row Level Security)
ALTER TABLE cloud_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE cloud_schedule_cells ENABLE ROW LEVEL SECURITY;
ALTER TABLE cloud_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE cloud_seat_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cloud_user_preferences ENABLE ROW LEVEL SECURITY;

-- 允许认证用户访问 (使用 service_role key 可绕过 RLS)
CREATE POLICY "Allow all for authenticated" ON cloud_users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON cloud_schedule_cells FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON cloud_students FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON cloud_seat_configs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON cloud_user_preferences FOR ALL USING (true) WITH CHECK (true);
`
}