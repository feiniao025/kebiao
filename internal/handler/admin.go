package handler

import (
	"net/http"
	"regexp"

	"github.com/gin-gonic/gin"

	"kebiao/internal/database"
	"kebiao/internal/model"
	"kebiao/internal/service"
)

type AdminHandler struct {
	db      *database.SQLite
	authSvc *service.AuthService
	sb      *database.Supabase
}

func NewAdminHandler(db *database.SQLite, authSvc *service.AuthService, sb *database.Supabase) *AdminHandler {
	return &AdminHandler{db: db, authSvc: authSvc, sb: sb}
}

func (h *AdminHandler) ListUsers(c *gin.Context) {
	users, err := h.db.GetAllUsers()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取用户列表失败"})
		return
	}

	type userSummary struct {
		ID          int64  `json:"id"`
		Username    string `json:"username"`
		IsAdmin     bool   `json:"is_admin"`
		CreatedAt   string `json:"created_at"`
		SeatCount   int    `json:"seat_count"`
		MaleCount   int    `json:"male_count"`
		FemaleCount int    `json:"female_count"`
		CellCount   int    `json:"cell_count"`
		ClassCount  int    `json:"class_count"`
	}
	var list []userSummary
	for _, u := range users {
		students, _ := h.db.GetStudents(u.ID)
		cells, _ := h.db.GetScheduleCells(u.ID)
		classes, _ := h.db.GetClasses(u.ID)
		seatCount, maleCount, femaleCount := 0, 0, 0
		for _, s := range students {
			if s.Name != "" {
				seatCount++
				if s.Gender == "男" {
					maleCount++
				} else if s.Gender == "女" {
					femaleCount++
				}
			}
		}
		list = append(list, userSummary{
			ID:          u.ID,
			Username:    u.Username,
			IsAdmin:     u.IsAdmin,
			CreatedAt:   u.CreatedAt.Format("2006-01-02 15:04:05"),
			SeatCount:   seatCount,
			MaleCount:   maleCount,
			FemaleCount: femaleCount,
			CellCount:   len(cells),
			ClassCount:  len(classes),
		})
	}
	if list == nil {
		list = []userSummary{}
	}
	c.JSON(http.StatusOK, gin.H{"users": list})
}

func (h *AdminHandler) GetUserDetail(c *gin.Context) {
	username := c.Param("username")
	user, err := h.db.GetUserByUsername(username)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}
	students, _ := h.db.GetStudents(user.ID)
	cells, _ := h.db.GetScheduleCells(user.ID)
	prefs, _ := h.db.GetPreferences(user.ID)
	sc, err := h.db.GetSeatConfig(user.ID)
	if err != nil || sc == nil {
		sc = &model.SeatConfig{UserID: user.ID, Rows: 7, Cols: 8, Order: "asc", Aisle: ""}
	}
	classes, _ := h.db.GetClasses(user.ID)

	if classes == nil { classes = []model.Class{} }
	if students == nil { students = []model.Student{} }
	if cells == nil { cells = []model.ScheduleCell{} }

	seatCount, maleCount, femaleCount := 0, 0, 0
	for _, s := range students {
		if s.Name != "" {
			seatCount++
			if s.Gender == "男" { maleCount++ } else if s.Gender == "女" { femaleCount++ }
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"user":         user,
		"seat_count":   seatCount,
		"male_count":   maleCount,
		"female_count": femaleCount,
		"cell_count":   len(cells),
		"students":     students,
		"cells":        cells,
		"preferences":  prefs,
		"seat_config":  sc,
		"classes":      classes,
	})
}

type resetPwdReq struct {
	NewPassword string `json:"new_password" binding:"required"`
}

func (h *AdminHandler) ResetUserPassword(c *gin.Context) {
	username := c.Param("username")
	user, err := h.db.GetUserByUsername(username)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}
	var req resetPwdReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数不完整"})
		return
	}
	if err := h.authSvc.ResetPassword(user.ID, req.NewPassword); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "密码已重置"})
}

type updateUserReq struct {
	NewUsername string `json:"new_username"`
	NewPassword string `json:"new_password"`
}

func isValidAdminUsername(s string) bool {
	matched, _ := regexp.MatchString(`^[A-Za-z0-9_]{3,20}$`, s)
	return matched
}

func (h *AdminHandler) UpdateUser(c *gin.Context) {
	username := c.Param("username")
	user, err := h.db.GetUserByUsername(username)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}

	var req updateUserReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	changed := false

	if req.NewUsername != "" && req.NewUsername != user.Username {
		if !isValidAdminUsername(req.NewUsername) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "用户名需为 3-20 位的字母/数字/下划线"})
			return
		}
		if _, err := h.db.GetUserByUsername(req.NewUsername); err == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "该用户名已被占用"})
			return
		}
		if err := h.db.UpdateUsername(user.ID, req.NewUsername); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "修改用户名失败"})
			return
		}
		changed = true
	}

	if req.NewPassword != "" {
		if len(req.NewPassword) < 6 || len(req.NewPassword) > 32 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "密码需为 6-32 字符"})
			return
		}
		if err := h.authSvc.ResetPassword(user.ID, req.NewPassword); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "修改密码失败"})
			return
		}
		changed = true
	}

	if !changed {
		c.JSON(http.StatusBadRequest, gin.H{"error": "未做任何修改"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已更新"})
}

func (h *AdminHandler) ClearUserData(c *gin.Context) {
	username := c.Param("username")
	user, err := h.db.GetUserByUsername(username)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}
	if err := h.db.ClearUserData(user.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "清空失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "数据已清空"})
}

func (h *AdminHandler) DeleteUser(c *gin.Context) {
	username := c.Param("username")
	currentUsername := c.GetString("username")
	if username == currentUsername {
		c.JSON(http.StatusBadRequest, gin.H{"error": "不能删除当前登录的账户"})
		return
	}
	user, err := h.db.GetUserByUsername(username)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}
	if err := h.db.DeleteUser(user.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "用户已删除"})
}

func (h *AdminHandler) GetSupabaseConfig(c *gin.Context) {
	cfg, err := h.db.GetSupabaseConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取配置失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"enabled":             cfg.Enabled,
		"url":                 cfg.URL,
		"api_key":             cfg.APIKey,
		"sync_interval":       cfg.SyncInterval,
		"registration_locked": cfg.RegistrationLocked,
	})
}

func (h *AdminHandler) UpdateSupabaseConfig(c *gin.Context) {
	var req model.SupabaseConfig
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数不完整"})
		return
	}
	if err := h.db.UpdateSupabaseConfig(&req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存配置失败"})
		return
	}
	if err := h.sb.ReloadConfig(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "重载配置失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Supabase 配置已更新"})
}

func (h *AdminHandler) TestSupabase(c *gin.Context) {
	if err := h.sb.ReloadConfig(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "重载配置失败"})
		return
	}
	if err := h.sb.TestConnection(); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "连接成功"})
}

func (h *AdminHandler) GetSchemaSQL(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"sql": database.SupabaseSchemaSQL()})
}

// ============ 系统配置（登录提示等） ============

func (h *AdminHandler) GetSystemConfig(c *gin.Context) {
	cfg, err := h.db.GetSystemConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取配置失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"login_notice": cfg.LoginNotice,
	})
}

type updateSystemConfigReq struct {
	LoginNotice string `json:"login_notice"`
}

func (h *AdminHandler) UpdateSystemConfig(c *gin.Context) {
	var req updateSystemConfigReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数不完整"})
		return
	}
	cfg := &model.SystemConfig{LoginNotice: req.LoginNotice}
	if err := h.db.UpdateSystemConfig(cfg); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已保存"})
}