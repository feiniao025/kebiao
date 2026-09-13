package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"kebiao/internal/database"
	"kebiao/internal/service"
)

type AuthHandler struct {
	authSvc *service.AuthService
	db      *database.SQLite
}

func NewAuthHandler(authSvc *service.AuthService, db *database.SQLite) *AuthHandler {
	return &AuthHandler{authSvc: authSvc, db: db}
}

type registerReq struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

func (h *AuthHandler) Register(c *gin.Context) {
	var req registerReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数不完整"})
		return
	}
	token, err := h.authSvc.Register(req.Username, req.Password)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": token, "message": "注册成功"})
}

type loginReq struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req loginReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数不完整"})
		return
	}
	token, err := h.authSvc.Login(req.Username, req.Password)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": token})
}

func (h *AuthHandler) Me(c *gin.Context) {
	userID := c.GetInt64("user_id")
	user, err := h.db.GetUserByID(userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}
	resp := gin.H{
		"id":         user.ID,
		"username":   user.Username,
		"is_admin":   user.IsAdmin,
		"created_at": user.CreatedAt,
	}
	if user.LastLoginAt != nil {
		resp["last_login_at"] = user.LastLoginAt
	}
	c.JSON(http.StatusOK, resp)
}

type changePwdReq struct {
	OldPassword string `json:"old_password" binding:"required"`
	NewPassword string `json:"new_password" binding:"required"`
}

func (h *AuthHandler) ChangePassword(c *gin.Context) {
	var req changePwdReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数不完整"})
		return
	}
	userID := c.GetInt64("user_id")
	if err := h.authSvc.ChangePassword(userID, req.OldPassword, req.NewPassword); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "密码已修改"})
}

func (h *AuthHandler) GetPreferences(c *gin.Context) {
	userID := c.GetInt64("user_id")
	prefs, err := h.db.GetPreferences(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取偏好失败"})
		return
	}
	c.JSON(http.StatusOK, prefs)
}

func (h *AuthHandler) UpdatePreferences(c *gin.Context) {
	userID := c.GetInt64("user_id")
	var prefs struct {
		Theme          *string `json:"theme"`
		ScheduleFilter *string `json:"schedule_filter"`
		WeekHighlight  *bool   `json:"week_highlight"`
		SeatDragOn     *bool   `json:"seat_drag_on"`
		SeatPersonOn   *bool   `json:"seat_person_on"`
		ActiveTab      *string `json:"active_tab"`
		EditOn23       *bool   `json:"edit_on_23"`
		EditOn22       *bool   `json:"edit_on_22"`
	}
	if err := c.ShouldBindJSON(&prefs); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数不完整"})
		return
	}

	current, err := h.db.GetPreferences(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取偏好失败"})
		return
	}
	current.UserID = userID

	if prefs.Theme != nil { current.Theme = *prefs.Theme }
	if prefs.ScheduleFilter != nil { current.ScheduleFilter = *prefs.ScheduleFilter }
	if prefs.WeekHighlight != nil { current.WeekHighlight = *prefs.WeekHighlight }
	if prefs.SeatDragOn != nil { current.SeatDragOn = *prefs.SeatDragOn }
	if prefs.SeatPersonOn != nil { current.SeatPersonOn = *prefs.SeatPersonOn }
	if prefs.ActiveTab != nil { current.ActiveTab = *prefs.ActiveTab }
	if prefs.EditOn23 != nil { current.EditOn23 = *prefs.EditOn23 }
	if prefs.EditOn22 != nil { current.EditOn22 = *prefs.EditOn22 }

	if err := h.db.UpsertPreferences(current); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存偏好失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已保存"})
}

// ============ 公开的站点配置（登录页读取） ============

func (h *AuthHandler) GetPublicSystemConfig(c *gin.Context) {
	cfg, err := h.db.GetSystemConfig()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"login_notice": ""})
		return
	}
	c.JSON(http.StatusOK, gin.H{"login_notice": cfg.LoginNotice})
}