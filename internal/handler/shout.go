package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"kebiao/internal/model"
	"kebiao/internal/service"
)

type ShoutHandler struct {
	svc *service.ShoutService
}

func NewShoutHandler(svc *service.ShoutService) *ShoutHandler {
	return &ShoutHandler{svc: svc}
}

// ---------- 教室列表 / 创建 / 详情 ----------

func (h *ShoutHandler) ListRooms(c *gin.Context) {
	userID := c.GetInt64("user_id")
	rooms, err := h.svc.ListRooms(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if rooms == nil {
		rooms = []model.ShoutRoom{}
	}
	c.JSON(http.StatusOK, gin.H{"rooms": rooms})
}

type createShoutRoomReq struct {
	Name    string `json:"name" binding:"required"`
	ClassID string `json:"class_id"`
}

func (h *ShoutHandler) CreateRoom(c *gin.Context) {
	var req createShoutRoomReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请填写教室名称"})
		return
	}
	userID := c.GetInt64("user_id")
	username := c.GetString("username")
	room, err := h.svc.CreateRoom(userID, username, req.Name, req.ClassID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"room": room})
}

func (h *ShoutHandler) GetRoom(c *gin.Context) {
	userID := c.GetInt64("user_id")
	room, err := h.svc.GetRoom(userID, c.Param("key"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"room": room})
}

type updateShoutRoomReq struct {
	Name    string `json:"name" binding:"required"`
	ClassID string `json:"class_id"`
}

func (h *ShoutHandler) UpdateRoom(c *gin.Context) {
	var req updateShoutRoomReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数不完整"})
		return
	}
	userID := c.GetInt64("user_id")
	if err := h.svc.UpdateRoom(userID, c.Param("key"), req.Name, req.ClassID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已更新"})
}

func (h *ShoutHandler) DeleteRoom(c *gin.Context) {
	userID := c.GetInt64("user_id")
	if err := h.svc.DeleteRoom(userID, c.Param("key")); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已删除"})
}

func (h *ShoutHandler) RegenerateToken(c *gin.Context) {
	userID := c.GetInt64("user_id")
	token, err := h.svc.RegenerateDisplayToken(userID, c.Param("key"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"display_token": token})
}

// RegenerateRoomKey 重置教室码
func (h *ShoutHandler) RegenerateRoomKey(c *gin.Context) {
	userID := c.GetInt64("user_id")
	newKey, err := h.svc.RegenerateRoomKey(userID, c.Param("key"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"room_key": newKey})
}

// ---------- 在线状态 ----------

func (h *ShoutHandler) Status(c *gin.Context) {
	userID := c.GetInt64("user_id")
	roomKey := c.Param("key")

	if _, err := h.svc.GetRoom(userID, roomKey); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"online": h.svc.IsRoomOnline(roomKey),
	})
}

// ---------- 加入 / 成员 ----------

type joinShoutReq struct {
	RoomKey string `json:"room_key" binding:"required"`
	Subject string `json:"subject"`
}

func (h *ShoutHandler) JoinRoom(c *gin.Context) {
	var req joinShoutReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入教室码"})
		return
	}
	userID := c.GetInt64("user_id")
	username := c.GetString("username")
	room, err := h.svc.JoinRoom(userID, username, req.RoomKey, req.Subject)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"room": room})
}

func (h *ShoutHandler) ListMembers(c *gin.Context) {
	userID := c.GetInt64("user_id")
	members, err := h.svc.ListMembers(userID, c.Param("key"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if members == nil {
		members = []model.ShoutMember{}
	}
	c.JSON(http.StatusOK, gin.H{"members": members})
}

func (h *ShoutHandler) RemoveMember(c *gin.Context) {
	userID := c.GetInt64("user_id")
	if err := h.svc.RemoveMember(userID, c.Param("key"), c.Param("username")); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已移除"})
}

// ---------- 发送 / 拉取 ----------

type sendShoutReq struct {
	Content  string `json:"content" binding:"required"`
	MsgType  string `json:"msg_type"`
	Duration int    `json:"duration"`
}

func (h *ShoutHandler) Send(c *gin.Context) {
	var req sendShoutReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入内容"})
		return
	}
	userID := c.GetInt64("user_id")
	username := c.GetString("username")
	msg, err := h.svc.SendMessage(userID, username, c.Param("key"),
		req.Content, req.MsgType, req.Duration)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已发送", "msg": msg})
}

func (h *ShoutHandler) Poll(c *gin.Context) {
	userID := c.GetInt64("user_id")
	since, _ := strconv.ParseInt(c.Query("since"), 10, 64)
	msgs, err := h.svc.PollMessages(userID, c.Param("key"), since)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if msgs == nil {
		msgs = []model.ShoutMessage{}
	}
	c.JSON(http.StatusOK, gin.H{"messages": msgs})
}

// GetMyMessages 我在各教室中发出的全部消息（用于「发送记录」页）
func (h *ShoutHandler) GetMyMessages(c *gin.Context) {
	userID := c.GetInt64("user_id")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "200"))
	msgs, err := h.svc.GetMyMessages(userID, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if msgs == nil {
		msgs = []model.ShoutMessage{}
	}
	c.JSON(http.StatusOK, gin.H{"messages": msgs})
}

// ★ 新增：删除我发过的某条消息
func (h *ShoutHandler) DeleteMessage(c *gin.Context) {
	userID := c.GetInt64("user_id")
	msgID, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	if msgID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的消息ID"})
		return
	}
	if err := h.svc.DeleteMessage(userID, msgID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已删除"})
}

// ---------- 大屏端（公开，凭 token） ----------

func (h *ShoutHandler) DisplayFeed(c *gin.Context) {
	token := c.Query("token")
	since, _ := strconv.ParseInt(c.Query("since"), 10, 64)

	msgs, room, err := h.svc.FeedByToken(token, since)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if msgs == nil {
		msgs = []model.ShoutMessage{}
	}
	c.JSON(http.StatusOK, gin.H{
		"room": gin.H{
			"name":     room.Name,
			"room_key": room.RoomKey,
			"class_id": room.ClassID,
		},
		"messages":    msgs,
		"server_time": time.Now(),
	})
}