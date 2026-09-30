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

// ============ 花名册 ============

type RosterStudent struct {
	ID        int64     `json:"id"`
	UserID    int64     `json:"user_id"`
	ClassID   string    `json:"class_id"`
	Name      string    `json:"name"`
	Gender    string    `json:"gender"`
	IDCard    string    `json:"id_card"`
	Tel1      string    `json:"tel1"`
	Tel2      string    `json:"tel2"`
	Address   string    `json:"address"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ============ 成绩 ============

type Exam struct {
	ID             int64       `json:"id"`
	UserID         int64       `json:"user_id"`
	ClassID        string      `json:"class_id"`
	Subject        string      `json:"subject"`
	Name           string      `json:"name"`
	FullScore      int         `json:"full_score"`
	PassScore      int         `json:"pass_score"`
	MediumScore    int         `json:"medium_score"`
	GoodScore      int         `json:"good_score"`
	ExcellentScore int         `json:"excellent_score"`
	CreatedAt      time.Time   `json:"created_at"`
	UpdatedAt      time.Time   `json:"updated_at"`
	Scores         []ExamScore `json:"scores,omitempty"`
}

type ExamScore struct {
	ID          int64     `json:"id"`
	ExamID      int64     `json:"exam_id"`
	StudentName string    `json:"student_name"`
	Score       float64   `json:"score"`
	Absent      bool      `json:"absent"`      // 新增
	SortOrder   int       `json:"sort_order"`  // 新增
	UpdatedAt   time.Time `json:"updated_at"`
}

type ExamStats struct {
	Count          int            `json:"count"`            // 已录人数
	AbsentCount    int            `json:"absent_count"`   	// 新增
	Average        float64        `json:"average"`          // 平均分
	FullScore      int            `json:"full_score"`       // 满分
	PassRate       float64        `json:"pass_rate"`        // 及格率百分比
	PassCount      int            `json:"pass_count"`       // 及格人数
	PassLine       int            `json:"pass_line"`        // 及格线
	ExcellentRate  float64        `json:"excellent_rate"`   // 优秀率百分比
	ExcellentCount int            `json:"excellent_count"`  // 优秀人数
	ExcellentLine  int            `json:"excellent_line"`   // 优秀线
	MaxScore       float64        `json:"max_score"`        // 最高分
	MinScore       float64        `json:"min_score"`        // 最低分
	Distribution   map[string]int `json:"distribution"`     // 分数段分布
}

type StudentHistoryItem struct {
	ExamName  string  `json:"exam_name"`
	Date      string  `json:"date"`
	Score     float64 `json:"score"`
	FullScore int     `json:"full_score"`
}

// ============ 考勤 ============

type AttendanceRecord struct {
	ID          int64     `json:"id"`
	UserID      int64     `json:"user_id"`
	ClassID     string    `json:"class_id"`
	Date        string    `json:"date"`
	StudentName string    `json:"student_name"`
	Status      string    `json:"status"` // 出勤 / 缺勤 / 迟到 / 请假
	Remark      string    `json:"remark"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type AttendanceSummary struct {
	Date     string `json:"date"`
	ClassID  string `json:"class_id"`
	Total    int    `json:"total"`
	Present  int    `json:"present"`
	Absent   int    `json:"absent"`
	Late     int    `json:"late"`
	Leave    int    `json:"leave"`
}

// ============ 远程喊话 ============

type ShoutRoom struct {
	ID           int64     `json:"id"`
	UserID       int64     `json:"user_id"`       // 创建者（班主任）
	RoomKey      string    `json:"room_key"`      // 6 位加入码
	DisplayToken string    `json:"display_token"` // 大屏接收 token
	Name         string    `json:"name"`
	ClassID      string    `json:"class_id"`
	CreatedAt    time.Time `json:"created_at"`

	// 运行时补充
	Role        string `json:"role,omitempty"`
	MemberCount int    `json:"member_count"`
	IsOwner     bool   `json:"is_owner"`
}

type ShoutMember struct {
	ID        int64     `json:"id"`
	RoomKey   string    `json:"room_key"`
	UserID    int64     `json:"user_id"`
	Username  string    `json:"username"`
	Role      string    `json:"role"`    // 班主任 / 任课老师
	Subject   string    `json:"subject"` // 任教科目（选填）
	CreatedAt time.Time `json:"created_at"`
}

type ShoutMessage struct {
	ID         int64     `json:"id"`
	RoomKey    string    `json:"room_key"`
	SenderID   int64     `json:"sender_id"`
	SenderName string    `json:"sender_name"`
	SenderRole string    `json:"sender_role"`
	Content    string    `json:"content"`
	MsgType    string    `json:"msg_type"` // text / notice / urgent
	Duration   int       `json:"duration"` // 弹屏停留秒数
	CreatedAt  time.Time `json:"created_at"`
}

// ============ 定时喊话 ============

type ShoutScheduled struct {
	ID        int64      `json:"id"`
	UserID    int64      `json:"user_id"`
	RoomKey   string     `json:"room_key"`
	Content   string     `json:"content"`
	MsgType   string     `json:"msg_type"`
	Duration  int        `json:"duration"`
	SendAtMs  int64      `json:"send_at_ms"`  // 触发时刻（Unix 毫秒）
	Status    string     `json:"status"`      // pending / sent / failed / cancelled
	ErrorMsg  string     `json:"error_msg"`
	CreatedAt time.Time  `json:"created_at"`
	SentAt    *time.Time `json:"sent_at,omitempty"`
}