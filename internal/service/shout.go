package service

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"math/big"
	"runtime/debug"
	"strings"
	"sync"
	"time"

	"kebiao/internal/database"
	"kebiao/internal/model"
)

type ShoutService struct {
	db       *database.SQLite
	mu       sync.Mutex
	lastSeen map[string]time.Time
}

func NewShoutService(db *database.SQLite) *ShoutService {
	return &ShoutService{
		db:       db,
		lastSeen: make(map[string]time.Time),
	}
}

const shoutCodeChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

func randomShoutCode(n int) string {
	b := make([]byte, n)
	for i := range b {
		idx, err := rand.Int(rand.Reader, big.NewInt(int64(len(shoutCodeChars))))
		if err != nil {
			b[i] = 'A'
			continue
		}
		b[i] = shoutCodeChars[idx.Int64()]
	}
	return string(b)
}

func randomShoutToken(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(b)
}

// ============ 大屏在线状态 ============

func (s *ShoutService) touchRoom(roomKey string) {
	if s.lastSeen == nil {
		s.lastSeen = make(map[string]time.Time)
	}
	s.mu.Lock()
	s.lastSeen[roomKey] = time.Now()
	s.mu.Unlock()
}

func (s *ShoutService) IsRoomOnline(roomKey string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	t, ok := s.lastSeen[roomKey]
	if !ok {
		return false
	}
	return time.Since(t) < 10*time.Second
}

// ListRooms 我创建 + 我加入的所有教室
func (s *ShoutService) ListRooms(userID int64) ([]model.ShoutRoom, error) {
	rooms, err := s.db.GetShoutRoomsByUser(userID)
	if err != nil {
		return nil, err
	}
	for i := range rooms {
		r := &rooms[i]
		r.IsOwner = r.UserID == userID
		if r.IsOwner {
			r.Role = "班主任"
		} else if m, err := s.db.GetShoutMember(r.RoomKey, userID); err == nil {
			r.Role = m.Role
			if r.Role == "" {
				r.Role = "任课老师"
			}
		}
		members, _ := s.db.GetShoutMembers(r.RoomKey)
		r.MemberCount = len(members)
	}
	return rooms, nil
}

func (s *ShoutService) CreateRoom(userID int64, username, name, classID string) (*model.ShoutRoom, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, errors.New("请填写教室名称")
	}
	if len([]rune(name)) > 30 {
		return nil, errors.New("教室名称不能超过 30 个字")
	}

	var roomKey string
	for i := 0; i < 40; i++ {
		k := randomShoutCode(6)
		if _, err := s.db.GetShoutRoomByKey(k); err != nil {
			roomKey = k
			break
		}
	}
	if roomKey == "" {
		return nil, errors.New("生成教室码失败，请稍后重试")
	}

	room := &model.ShoutRoom{
		UserID:       userID,
		RoomKey:      roomKey,
		DisplayToken: randomShoutToken(24),
		Name:         name,
		ClassID:      strings.TrimSpace(classID),
	}
	if err := s.db.CreateShoutRoom(room); err != nil {
		return nil, err
	}

	_ = s.db.AddShoutMember(&model.ShoutMember{
		RoomKey:  room.RoomKey,
		UserID:   userID,
		Username: username,
		Role:     "班主任",
	})

	room.IsOwner = true
	room.Role = "班主任"
	room.MemberCount = 1
	return room, nil
}

func (s *ShoutService) GetRoom(userID int64, roomKey string) (*model.ShoutRoom, error) {
	room, err := s.db.GetShoutRoomByKey(roomKey)
	if err != nil {
		return nil, errors.New("教室不存在")
	}
	room.IsOwner = room.UserID == userID
	if room.IsOwner {
		room.Role = "班主任"
	} else {
		m, err := s.db.GetShoutMember(roomKey, userID)
		if err != nil {
			return nil, errors.New("你不在该教室中")
		}
		room.Role = m.Role
		if room.Role == "" {
			room.Role = "任课老师"
		}
	}
	members, _ := s.db.GetShoutMembers(roomKey)
	room.MemberCount = len(members)
	return room, nil
}

func (s *ShoutService) UpdateRoom(userID int64, roomKey, name, classID string) error {
	room, err := s.db.GetShoutRoomByKey(roomKey)
	if err != nil {
		return errors.New("教室不存在")
	}
	if room.UserID != userID {
		return errors.New("只有班主任可以修改教室信息")
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return errors.New("请填写教室名称")
	}
	if len([]rune(name)) > 30 {
		return errors.New("教室名称不能超过 30 个字")
	}
	room.Name = name
	room.ClassID = strings.TrimSpace(classID)
	return s.db.UpdateShoutRoom(room)
}

func (s *ShoutService) DeleteRoom(userID int64, roomKey string) error {
	room, err := s.db.GetShoutRoomByKey(roomKey)
	if err != nil {
		return errors.New("教室不存在")
	}
	if room.UserID != userID {
		return errors.New("只有班主任可以删除教室")
	}
	return s.db.DeleteShoutRoom(roomKey)
}

func (s *ShoutService) RegenerateDisplayToken(userID int64, roomKey string) (string, error) {
	room, err := s.db.GetShoutRoomByKey(roomKey)
	if err != nil {
		return "", errors.New("教室不存在")
	}
	if room.UserID != userID {
		return "", errors.New("只有班主任可以重置大屏地址")
	}
	token := randomShoutToken(24)
	if err := s.db.UpdateShoutRoomToken(roomKey, token); err != nil {
		return "", err
	}
	return token, nil
}

func (s *ShoutService) RegenerateRoomKey(userID int64, roomKey string) (string, error) {
	room, err := s.db.GetShoutRoomByKey(roomKey)
	if err != nil {
		return "", errors.New("教室不存在")
	}
	if room.UserID != userID {
		return "", errors.New("只有班主任可以重置教室码")
	}

	var newKey string
	for i := 0; i < 40; i++ {
		k := randomShoutCode(6)
		if _, err := s.db.GetShoutRoomByKey(k); err != nil {
			newKey = k
			break
		}
	}
	if newKey == "" {
		return "", errors.New("生成教室码失败，请稍后重试")
	}

	if err := s.db.RegenerateShoutRoomKey(roomKey, newKey); err != nil {
		return "", err
	}
	return newKey, nil
}

func (s *ShoutService) JoinRoom(userID int64, username, roomKey, subject string) (*model.ShoutRoom, error) {
	roomKey = strings.ToUpper(strings.TrimSpace(roomKey))
	if roomKey == "" {
		return nil, errors.New("请输入教室码")
	}
	room, err := s.db.GetShoutRoomByKey(roomKey)
	if err != nil {
		return nil, errors.New("教室码不存在，请向班主任确认")
	}
	if room.UserID == userID {
		return room, nil
	}
	if _, err := s.db.GetShoutMember(roomKey, userID); err == nil {
		return room, nil
	}
	m := &model.ShoutMember{
		RoomKey:  roomKey,
		UserID:   userID,
		Username: username,
		Role:     "任课老师",
		Subject:  strings.TrimSpace(subject),
	}
	if err := s.db.AddShoutMember(m); err != nil {
		return nil, err
	}
	return room, nil
}

func (s *ShoutService) ListMembers(userID int64, roomKey string) ([]model.ShoutMember, error) {
	if _, err := s.GetRoom(userID, roomKey); err != nil {
		return nil, err
	}
	return s.db.GetShoutMembers(roomKey)
}

func (s *ShoutService) RemoveMember(userID int64, roomKey, username string) error {
	room, err := s.db.GetShoutRoomByKey(roomKey)
	if err != nil {
		return errors.New("教室不存在")
	}
	if room.UserID != userID {
		return errors.New("只有班主任可以移除成员")
	}
	members, err := s.db.GetShoutMembers(roomKey)
	if err != nil {
		return err
	}
	for _, m := range members {
		if m.Username == username {
			if m.Role == "班主任" {
				return errors.New("不能移除班主任")
			}
			return s.db.RemoveShoutMember(roomKey, m.UserID)
		}
	}
	return errors.New("成员不存在")
}

// ============ 发送消息 ============

// normalizeMsgType 统一校验消息类型，非法值回落到 text
func normalizeMsgType(msgType string) string {
	switch msgType {
	case "notice", "urgent", "image":
		return msgType
	default:
		return "text"
	}
}

// validateShoutContent 内容长度 / 图片大小校验
func validateShoutContent(content, msgType string) error {
	if msgType == "image" {
		// dataURL 上限约 3MB，客户端已压缩到 1280px/0.82 质量，通常远小于此
		if len(content) > 3*1024*1024 {
			return errors.New("图片过大，请压缩后重试")
		}
		return nil
	}
	if len([]rune(content)) > 500 {
		return errors.New("内容不能超过 500 个字")
	}
	return nil
}

func (s *ShoutService) SendMessage(userID int64, username, roomKey, content, msgType string, duration int) (*model.ShoutMessage, error) {
	content = strings.TrimSpace(content)
	if content == "" {
		return nil, errors.New("请输入要发送的内容")
	}

	msgType = normalizeMsgType(msgType)
	if err := validateShoutContent(content, msgType); err != nil {
		return nil, err
	}

	room, err := s.db.GetShoutRoomByKey(roomKey)
	if err != nil {
		return nil, errors.New("教室不存在")
	}

	role := ""
	if room.UserID == userID {
		role = "班主任"
	} else {
		m, err := s.db.GetShoutMember(roomKey, userID)
		if err != nil {
			return nil, errors.New("你不在该教室中，无法发送")
		}
		role = m.Role
		if role == "" {
			role = "任课老师"
		}
	}

	if duration <= 0 {
		duration = 20
	}
	if duration < 5 {
		duration = 5
	}
	if duration > 600 {
		duration = 600
	}

	m := &model.ShoutMessage{
		RoomKey:    roomKey,
		SenderID:   userID,
		SenderName: username,
		SenderRole: role,
		Content:    content,
		MsgType:    msgType,
		Duration:   duration,
	}
	if err := s.db.AddShoutMessage(m); err != nil {
		return nil, err
	}
	_ = s.db.CleanupShoutMessages(roomKey)
	return m, nil
}

func (s *ShoutService) PollMessages(userID int64, roomKey string, sinceID int64) ([]model.ShoutMessage, error) {
	if _, err := s.GetRoom(userID, roomKey); err != nil {
		return nil, err
	}
	return s.db.GetShoutMessages(roomKey, sinceID, 50)
}

func (s *ShoutService) FeedByToken(token string, sinceID int64) ([]model.ShoutMessage, *model.ShoutRoom, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return nil, nil, errors.New("缺少 token")
	}
	room, err := s.db.GetShoutRoomByDisplayToken(token)
	if err != nil {
		return nil, nil, errors.New("教室不存在或地址已失效")
	}

	s.touchRoom(room.RoomKey)

	msgs, err := s.db.GetShoutMessages(room.RoomKey, sinceID, 50)
	if err != nil {
		return nil, nil, err
	}
	return msgs, room, nil
}

func (s *ShoutService) GetMyMessages(userID int64, limit int) ([]model.ShoutMessage, error) {
	if limit <= 0 {
		limit = 200
	}
	return s.db.GetShoutMessagesBySender(userID, limit)
}

func (s *ShoutService) DeleteMessage(userID, msgID int64) error {
	return s.db.DeleteShoutMessageBySender(userID, msgID)
}

// ============ 定时喊话 ============

func (s *ShoutService) ScheduleMessage(userID int64, roomKey, content, msgType string, duration int, sendAtMs int64) (*model.ShoutScheduled, error) {
	content = strings.TrimSpace(content)
	if content == "" {
		return nil, errors.New("请输入要发送的内容")
	}

	msgType = normalizeMsgType(msgType)
	if err := validateShoutContent(content, msgType); err != nil {
		return nil, err
	}

	room, err := s.db.GetShoutRoomByKey(roomKey)
	if err != nil {
		return nil, errors.New("教室不存在")
	}
	if room.UserID != userID {
		if _, err := s.db.GetShoutMember(roomKey, userID); err != nil {
			return nil, errors.New("你不在该教室中，无法发送")
		}
	}

	if duration <= 0 {
		duration = 20
	}
	if duration < 5 {
		duration = 5
	}
	if duration > 600 {
		duration = 600
	}

	nowMs := time.Now().UnixMilli()
	if sendAtMs <= nowMs+1000 {
		return nil, errors.New("定时时间必须晚于当前时间 1 秒以上")
	}
	if sendAtMs > nowMs+30*24*3600*1000 {
		return nil, errors.New("定时时间不能超过 30 天")
	}

	m := &model.ShoutScheduled{
		UserID:   userID,
		RoomKey:  roomKey,
		Content:  content,
		MsgType:  msgType,
		Duration: duration,
		SendAtMs: sendAtMs,
		Status:   "pending",
	}
	if err := s.db.CreateShoutScheduled(m); err != nil {
		return nil, err
	}
	log.Printf("[shout-scheduler] task %d scheduled at %d (room=%s user=%d)",
		m.ID, m.SendAtMs, m.RoomKey, m.UserID)
	return m, nil
}

func (s *ShoutService) ListScheduled(userID int64, limit int) ([]model.ShoutScheduled, error) {
	return s.db.ListShoutScheduledByUser(userID, limit)
}

func (s *ShoutService) CancelScheduled(userID, id int64) error {
	return s.db.CancelShoutScheduled(userID, id)
}

// StartScheduler 启动后台调度器：每秒扫描一次，到点自动发送
func (s *ShoutService) StartScheduler() {
	go func() {
		s.safeDispatch()

		ticker := time.NewTicker(1 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			s.safeDispatch()
		}
	}()
	log.Printf("[shout-scheduler] scheduler started")
}

func (s *ShoutService) safeDispatch() {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[shout-scheduler] panic recovered: %v\n%s", r, debug.Stack())
		}
	}()
	s.dispatchDueScheduled()
}

func (s *ShoutService) dispatchDueScheduled() {
	now := time.Now().UnixMilli()

	list, err := s.db.ListDueShoutScheduled(now)
	if err != nil {
		log.Printf("[shout-scheduler] ListDueShoutScheduled err: %v", err)
		return
	}
	if len(list) == 0 {
		return
	}
	log.Printf("[shout-scheduler] %d due task(s) found at %d", len(list), now)

	for _, sc := range list {
		room, err := s.db.GetShoutRoomByKey(sc.RoomKey)
		if err != nil {
			log.Printf("[shout-scheduler] room %s gone, task %d failed", sc.RoomKey, sc.ID)
			_ = s.db.MarkShoutScheduledFailed(sc.ID, "教室已不存在")
			continue
		}

		senderName := "系统"
		if u, err := s.db.GetUserByID(sc.UserID); err == nil && u.Username != "" {
			senderName = u.Username
		}

		role := "任课老师"
		if room.UserID == sc.UserID {
			role = "班主任"
		} else if m, err := s.db.GetShoutMember(sc.RoomKey, sc.UserID); err == nil && m.Role != "" {
			role = m.Role
		}

		msg := &model.ShoutMessage{
			RoomKey:    sc.RoomKey,
			SenderID:   sc.UserID,
			SenderName: senderName,
			SenderRole: role,
			Content:    sc.Content,
			MsgType:    sc.MsgType,
			Duration:   sc.Duration,
		}
		if err := s.db.AddShoutMessage(msg); err != nil {
			log.Printf("[shout-scheduler] AddShoutMessage task %d failed: %v", sc.ID, err)
			_ = s.db.MarkShoutScheduledFailed(sc.ID, err.Error())
			continue
		}
		_ = s.db.CleanupShoutMessages(sc.RoomKey)

		if err := s.db.MarkShoutScheduledSent(sc.ID); err != nil {
			log.Printf("[shout-scheduler] MarkSent task %d failed: %v", sc.ID, err)
			continue
		}
		log.Printf("[shout-scheduler] task %d sent to room %s (by %s)", sc.ID, sc.RoomKey, senderName)
	}
}