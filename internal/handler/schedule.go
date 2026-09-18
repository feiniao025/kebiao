package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"kebiao/internal/model"
	"kebiao/internal/service"
)

type ScheduleHandler struct {
	svc *service.ScheduleService
}

func NewScheduleHandler(svc *service.ScheduleService) *ScheduleHandler {
	return &ScheduleHandler{svc: svc}
}

func (h *ScheduleHandler) GetDefault(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"periods": service.GetDefaultPeriods(),
		"legend":  service.GetDefaultLegend(),
	})
}

func (h *ScheduleHandler) GetCells(c *gin.Context) {
	userID := c.GetInt64("user_id")
	cells, err := h.svc.GetCells(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取课表数据失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"cells": cells})
}

type upsertCellReq struct {
	ClassID    string `json:"class_id" binding:"required"`
	CellIndex  int    `json:"cell_index"`
	CellType   string `json:"cell_type" binding:"required"`
	Subject    string `json:"subject"`
	Teacher    string `json:"teacher"`
	PeriodName string `json:"period_name"`
	PeriodTime string `json:"period_time"`
	BgColor    string `json:"bg_color"`
}

func (h *ScheduleHandler) UpsertCell(c *gin.Context) {
	var req upsertCellReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数不完整"})
		return
	}
	userID := c.GetInt64("user_id")
	if err := h.svc.UpsertCell(userID, req.ClassID, req.CellIndex, req.CellType, req.Subject, req.Teacher, req.PeriodName, req.PeriodTime, req.BgColor); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已保存"})
}

func (h *ScheduleHandler) BatchUpsert(c *gin.Context) {
	var req struct {
		Cells []upsertCellReq `json:"cells" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数不完整"})
		return
	}
	userID := c.GetInt64("user_id")
	for _, cell := range req.Cells {
		if err := h.svc.UpsertCell(userID, cell.ClassID, cell.CellIndex, cell.CellType, cell.Subject, cell.Teacher, cell.PeriodName, cell.PeriodTime, cell.BgColor); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "保存失败"})
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"message": "批量保存成功"})
}

// ============ 班级 CRUD ============

func (h *ScheduleHandler) ListClasses(c *gin.Context) {
	userID := c.GetInt64("user_id")
	classes, err := h.svc.GetClasses(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取班级列表失败"})
		return
	}
	if classes == nil {
		classes = []model.Class{}
	}
	c.JSON(http.StatusOK, gin.H{"classes": classes})
}

// createClassReq 同时用于创建与更新班级
// 如果 CustomName 非空，则忽略 ClassNum，使用自定义名称作为班级名
type createClassReq struct {
	Grade       int    `json:"grade" binding:"required"`
	ClassNum    int    `json:"class_num"`
	Badge       string `json:"badge"`
	PeriodCount int    `json:"period_count"`
	CustomName  string `json:"custom_name"`
}

func (h *ScheduleHandler) CreateClass(c *gin.Context) {
	var req createClassReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请填写年级和班级"})
		return
	}
	userID := c.GetInt64("user_id")
	cls, err := h.svc.CreateClass(userID, req.Grade, req.ClassNum, req.Badge, req.CustomName)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"class": cls})
}

func (h *ScheduleHandler) UpdateClass(c *gin.Context) {
	classID := c.Param("class_id")
	var req createClassReq
	if err := c.ShouldBindJSON(&req); err != nil {
		req = createClassReq{}
	}
	userID := c.GetInt64("user_id")

	// 计算新名称：优先自定义名称，其次由年级+班号格式化
	name := ""
	if req.CustomName != "" {
		name = req.CustomName
	} else if req.Grade >= 1 && req.ClassNum >= 1 {
		name = service.FormatClassName(req.Grade, req.ClassNum)
	}

	if err := h.svc.UpdateClass(userID, classID, name, req.Badge, req.PeriodCount); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已更新"})
}

func (h *ScheduleHandler) DeleteClass(c *gin.Context) {
	classID := c.Param("class_id")
	userID := c.GetInt64("user_id")
	if err := h.svc.DeleteClass(userID, classID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已删除"})
}

// UpdateClassOrder 批量更新班级顺序
type updateClassOrderReq struct {
	ClassIDs []string `json:"class_ids" binding:"required"`
}

func (h *ScheduleHandler) UpdateClassOrder(c *gin.Context) {
	var req updateClassOrderReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数不完整"})
		return
	}
	userID := c.GetInt64("user_id")
	if err := h.svc.UpdateClassOrder(userID, req.ClassIDs); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新顺序失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已更新"})
}