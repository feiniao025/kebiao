package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"kebiao/internal/model"
	"kebiao/internal/service"
)

type SeatHandler struct {
	svc *service.SeatService
}

func NewSeatHandler(svc *service.SeatService) *SeatHandler {
	return &SeatHandler{svc: svc}
}

func (h *SeatHandler) GetSeat(c *gin.Context) {
	userID := c.GetInt64("user_id")
	config, err := h.svc.GetSeatConfig(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取座位配置失败"})
		return
	}
	students, err := h.svc.GetStudents(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取学生数据失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"rows":     config.Rows,
		"cols":     config.Cols,
		"order":    config.Order,
		"aisle":    config.Aisle,
		"students": students,
	})
}

type updateStudentReq struct {
	SeatRow *int   `json:"seat_row"`
	SeatCol *int   `json:"seat_col"`
	Name    string `json:"name"`
	Gender  string `json:"gender"`
	IDCard  string `json:"id_card"`
	Tel1    string `json:"tel1"`
	Tel2    string `json:"tel2"`
	Address string `json:"address"`
}

func (h *SeatHandler) UpdateStudent(c *gin.Context) {
	var req updateStudentReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误: " + err.Error()})
		return
	}
	if req.SeatRow == nil || req.SeatCol == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少座位位置"})
		return
	}
	userID := c.GetInt64("user_id")
	st := &model.Student{
		Name:    req.Name,
		Gender:  req.Gender,
		IDCard:  req.IDCard,
		Tel1:    req.Tel1,
		Tel2:    req.Tel2,
		Address: req.Address,
	}
	if err := h.svc.UpsertStudent(userID, *req.SeatRow, *req.SeatCol, st); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已保存"})
}

type deleteStudentReq struct {
	SeatRow *int `json:"seat_row"`
	SeatCol *int `json:"seat_col"`
}

func (h *SeatHandler) DeleteStudent(c *gin.Context) {
	var req deleteStudentReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误: " + err.Error()})
		return
	}
	if req.SeatRow == nil || req.SeatCol == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少座位位置"})
		return
	}
	userID := c.GetInt64("user_id")
	if err := h.svc.DeleteStudent(userID, *req.SeatRow, *req.SeatCol); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已删除"})
}

type swapReq struct {
	Row1 *int `json:"row1"`
	Col1 *int `json:"col1"`
	Row2 *int `json:"row2"`
	Col2 *int `json:"col2"`
}

func (h *SeatHandler) Swap(c *gin.Context) {
	var req swapReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误: " + err.Error()})
		return
	}
	if req.Row1 == nil || req.Col1 == nil || req.Row2 == nil || req.Col2 == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少座位位置"})
		return
	}
	userID := c.GetInt64("user_id")
	if err := h.svc.Swap(userID, *req.Row1, *req.Col1, *req.Row2, *req.Col2); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "交换失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已交换"})
}

type resizeReq struct {
	Rows int `json:"rows" binding:"required"`
	Cols int `json:"cols" binding:"required"`
}

func (h *SeatHandler) Resize(c *gin.Context) {
	var req resizeReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数不完整"})
		return
	}
	userID := c.GetInt64("user_id")
	if err := h.svc.Resize(userID, req.Rows, req.Cols); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已调整"})
}

type setOrderReq struct {
	Order string `json:"order" binding:"required"`
}

func (h *SeatHandler) SetOrder(c *gin.Context) {
	var req setOrderReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数不完整"})
		return
	}
	userID := c.GetInt64("user_id")
	if err := h.svc.SetOrder(userID, req.Order); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "设置失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已设置"})
}

type setAisleReq struct {
	Aisle string `json:"aisle"`
}

func (h *SeatHandler) SetAisle(c *gin.Context) {
	var req setAisleReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	userID := c.GetInt64("user_id")
	if err := h.svc.SetAisle(userID, req.Aisle); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已设置"})
}