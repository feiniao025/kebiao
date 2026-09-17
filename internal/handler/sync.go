package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"kebiao/internal/service"
)

type SyncHandler struct {
	svc *service.SyncService
}

func NewSyncHandler(svc *service.SyncService) *SyncHandler {
	return &SyncHandler{svc: svc}
}

func (h *SyncHandler) GetStatus(c *gin.Context) {
	status, err := h.svc.GetStatus()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取同步状态失败"})
		return
	}
	c.JSON(http.StatusOK, status)
}

func (h *SyncHandler) Push(c *gin.Context) {
	userID := c.GetInt64("user_id")
	username := c.GetString("username")
	if err := h.svc.Push(userID, username); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "数据已推送到云端"})
}

func (h *SyncHandler) Pull(c *gin.Context) {
	userID := c.GetInt64("user_id")
	if err := h.svc.Pull(userID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "云端数据已拉取到本地"})
}

func (h *SyncHandler) Test(c *gin.Context) {
	if err := h.svc.TestConnection(); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Supabase 连接正常"})
}
