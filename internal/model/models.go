package model

import "time"

type User struct {
	ID          int64      `json:"id"`
	Username    string     `json:"username"`
	Password    string     `json:"-"`
	IsAdmin     bool       `json:"is_admin"`
	CreatedAt   time.Time  `json:"created_at"`
	LastLoginAt *time.Time `json:"last_login_at,omitempty"`
}

type ScheduleCell struct {
	ID         int64     `json:"id"`
	UserID     int64     `json:"user_id"`
	ClassID    string    `json:"class_id"`
	CellIndex  int       `json:"cell_index"`
	CellType   string    `json:"cell_type"`
	Subject    string    `json:"subject"`
	Teacher    string    `json:"teacher"`
	PeriodName string    `json:"period_name"`
	PeriodTime string    `json:"period_time"`
	BgColor    string    `json:"bg_color"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type Student struct {
	ID        int64     `json:"id"`
	UserID    int64     `json:"user_id"`
	SeatRow   int       `json:"seat_row"`
	SeatCol   int       `json:"seat_col"`
	Name      string    `json:"name"`
	Gender    string    `json:"gender"`
	IDCard    string    `json:"id_card"`
	Tel1      string    `json:"tel1"`
	Tel2      string    `json:"tel2"`
	Address   string    `json:"address"`
	UpdatedAt time.Time `json:"updated_at"`
}

type SeatConfig struct {
	ID        int64     `json:"id"`
	UserID    int64     `json:"user_id"`
	Rows      int       `json:"rows"`
	Cols      int       `json:"cols"`
	Order     string    `json:"order"`
	Aisle     string    `json:"aisle"` // 过道格式，如 "3+2+3"；空串表示无过道
	UpdatedAt time.Time `json:"updated_at"`
}

type UserPreference struct {
	ID             int64     `json:"id"`
	UserID         int64     `json:"user_id"`
	Theme          string    `json:"theme"`
	ScheduleFilter string    `json:"schedule_filter"`
	WeekHighlight  bool      `json:"week_highlight"`
	SeatDragOn     bool      `json:"seat_drag_on"`
	SeatPersonOn   bool      `json:"seat_person_on"`
	ActiveTab      string    `json:"active_tab"`
	EditOn23       bool      `json:"edit_on_23"`
	EditOn22       bool      `json:"edit_on_22"`
	UpdatedAt      time.Time `json:"updated_at"`
}

type SupabaseConfig struct {
	Enabled            bool   `json:"enabled"`
	URL                string `json:"url"`
	APIKey             string `json:"api_key"`
	SyncInterval       int    `json:"sync_interval"`
	RegistrationLocked bool   `json:"registration_locked"`
}

type SyncStatus struct {
	LastSyncAt  *time.Time `json:"last_sync_at"`
	LastSyncOK  bool       `json:"last_sync_ok"`
	LastError   string     `json:"last_error"`
	PendingPush int        `json:"pending_push"`
}

type Class struct {
	ID          int64     `json:"id"`
	UserID      int64     `json:"user_id"`
	ClassID     string    `json:"class_id"`
	Name        string    `json:"name"`
	Badge       string    `json:"badge"`
	Grade       int       `json:"grade"`
	ClassNum    int       `json:"class_num"`
	PeriodCount int       `json:"period_count"`
	SortOrder   int       `json:"sort_order"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type SystemConfig struct {
	LoginNotice string    `json:"login_notice"`
	UpdatedAt   time.Time `json:"updated_at"`
}