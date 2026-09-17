package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"kebiao/internal/model"
	"kebiao/internal/service"
)

type StudentHandler struct {
	svc *service.StudentService
}

func NewStudentHandler(svc *service.StudentService) *StudentHandler {
	return &StudentHandler{svc: svc}
}

// ============ 花名册 ============

func (h *StudentHandler) ListRoster(c *gin.Context) {
	userID := c.GetInt64("user_id")
	classID := c.Query("class_id")
	list, err := h.svc.ListRoster(userID, classID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取花名册失败"})
		return
	}
	if list == nil {
		list = []model.RosterStudent{}
	}
	c.JSON(http.StatusOK, gin.H{"students": list})
}

type rosterReq struct {
	ClassID string `json:"class_id" binding:"required"`
	Name    string `json:"name" binding:"required"`
	Gender  string `json:"gender"`
	IDCard  string `json:"id_card"`
	Tel1    string `json:"tel1"`
	Tel2    string `json:"tel2"`
	Address string `json:"address"`
}

func (h *StudentHandler) UpsertRoster(c *gin.Context) {
	var req rosterReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数不完整"})
		return
	}
	userID := c.GetInt64("user_id")
	r := &model.RosterStudent{
		ClassID: req.ClassID,
		Name:    req.Name,
		Gender:  req.Gender,
		IDCard:  req.IDCard,
		Tel1:    req.Tel1,
		Tel2:    req.Tel2,
		Address: req.Address,
	}
	if err := h.svc.UpsertRoster(userID, r); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"student": r})
}

func (h *StudentHandler) DeleteRoster(c *gin.Context) {
	userID := c.GetInt64("user_id")
	classID := c.Query("class_id")
	name := c.Query("name")
	if classID == "" || name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少参数"})
		return
	}
	if err := h.svc.DeleteRoster(userID, classID, name); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已删除"})
}

type moveRosterReq struct {
	FromClassID string `json:"from_class_id" binding:"required"`
	ToClassID   string `json:"to_class_id" binding:"required"`
}

func (h *StudentHandler) MoveRosterClass(c *gin.Context) {
	var req moveRosterReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数不完整"})
		return
	}
	userID := c.GetInt64("user_id")
	if err := h.svc.MoveRosterClass(userID, req.FromClassID, req.ToClassID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已迁移"})
}

// ============ 成绩 ============

func (h *StudentHandler) ListExams(c *gin.Context) {
	userID := c.GetInt64("user_id")
	classID := c.Query("class_id")
	list, err := h.svc.ListExams(userID, classID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取考试列表失败"})
		return
	}
	if list == nil {
		list = []model.Exam{}
	}
	c.JSON(http.StatusOK, gin.H{"exams": list})
}

type examReq struct {
	ClassID        string `json:"class_id" binding:"required"`
	Subject        string `json:"subject" binding:"required"`
	Name           string `json:"name" binding:"required"`
	FullScore      int    `json:"full_score"`
	PassScore      int    `json:"pass_score"`
	MediumScore    int    `json:"medium_score"`
	GoodScore      int    `json:"good_score"`
	ExcellentScore int    `json:"excellent_score"`
}

func (h *StudentHandler) CreateExam(c *gin.Context) {
	var req examReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数不完整"})
		return
	}
	userID := c.GetInt64("user_id")
	e, err := h.svc.GetOrCreateExam(userID, req.ClassID, req.Subject, req.Name,
		req.FullScore, req.PassScore, req.MediumScore, req.GoodScore, req.ExcellentScore)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"exam": e})
}

func (h *StudentHandler) UpdateExam(c *gin.Context) {
	examID, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	if examID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的考试ID"})
		return
	}
	var req examReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数不完整"})
		return
	}
	userID := c.GetInt64("user_id")
	e := &model.Exam{
		ID:             examID,
		ClassID:        req.ClassID,
		Subject:        req.Subject,
		Name:           req.Name,
		FullScore:      req.FullScore,
		PassScore:      req.PassScore,
		MediumScore:    req.MediumScore,
		GoodScore:      req.GoodScore,
		ExcellentScore: req.ExcellentScore,
	}
	if err := h.svc.UpdateExam(userID, e); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"exam": e})
}

func (h *StudentHandler) DeleteExam(c *gin.Context) {
	examID, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	if examID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的考试ID"})
		return
	}
	userID := c.GetInt64("user_id")
	if err := h.svc.DeleteExam(userID, examID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已删除"})
}

func (h *StudentHandler) GetExamDetail(c *gin.Context) {
	examID, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	if examID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的考试ID"})
		return
	}
	userID := c.GetInt64("user_id")
	e, scores, err := h.svc.GetExamWithScores(userID, examID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "考试不存在"})
		return
	}
	stats, _ := h.svc.GetExamStats(userID, examID)
	if scores == nil {
		scores = []model.ExamScore{}
	}
	c.JSON(http.StatusOK, gin.H{
		"exam":   e,
		"scores": scores,
		"stats":  stats,
	})
}

// 获取学生历次成绩
func (h *StudentHandler) GetStudentHistory(c *gin.Context) {
	userID := c.GetInt64("user_id")
	name := c.Query("name")
	subject := c.Query("subject")
	if name == "" || subject == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少参数"})
		return
	}
	history, err := h.svc.GetStudentHistory(userID, name, subject)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取历史成绩失败"})
		return
	}
	if history == nil {
		history = []model.StudentHistoryItem{}
	}
	c.JSON(http.StatusOK, gin.H{"history": history})
}

type scoreItem struct {
	StudentName string  `json:"student_name"`
	Score       float64 `json:"score"`
}

type saveScoresReq struct {
	Scores []scoreItem `json:"scores" binding:"required"`
}

func (h *StudentHandler) SaveScores(c *gin.Context) {
	examID, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	if examID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的考试ID"})
		return
	}
	var req saveScoresReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数不完整"})
		return
	}
	userID := c.GetInt64("user_id")
	items := make([]model.ExamScore, 0, len(req.Scores))
	for _, s := range req.Scores {
		if s.StudentName == "" {
			continue
		}
		items = append(items, model.ExamScore{
			StudentName: s.StudentName,
			Score:       s.Score,
		})
	}
	if err := h.svc.SaveScores(userID, examID, items); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存失败"})
		return
	}
	stats, _ := h.svc.GetExamStats(userID, examID)
	c.JSON(http.StatusOK, gin.H{"message": "已保存", "stats": stats})
}

// ============ 考勤 ============

func (h *StudentHandler) ListAttendance(c *gin.Context) {
	userID := c.GetInt64("user_id")
	classID := c.Query("class_id")
	date := c.Query("date")
	if classID == "" || date == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少班级或日期"})
		return
	}
	list, err := h.svc.ListAttendance(userID, classID, date)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取考勤失败"})
		return
	}
	if list == nil {
		list = []model.AttendanceRecord{}
	}
	c.JSON(http.StatusOK, gin.H{"records": list})
}

func (h *StudentHandler) ListAttendanceDates(c *gin.Context) {
	userID := c.GetInt64("user_id")
	classID := c.Query("class_id")
	if classID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少班级"})
		return
	}
	dates, err := h.svc.ListAttendanceDates(userID, classID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取日期失败"})
		return
	}
	if dates == nil {
		dates = []string{}
	}
	c.JSON(http.StatusOK, gin.H{"dates": dates})
}

type attendanceItem struct {
	StudentName string `json:"student_name"`
	Status      string `json:"status"`
	Remark      string `json:"remark"`
}

type saveAttendanceReq struct {
	ClassID string           `json:"class_id" binding:"required"`
	Date    string           `json:"date" binding:"required"`
	Items   []attendanceItem `json:"items" binding:"required"`
}

func (h *StudentHandler) SaveAttendance(c *gin.Context) {
	var req saveAttendanceReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数不完整"})
		return
	}
	userID := c.GetInt64("user_id")
	records := make([]model.AttendanceRecord, 0, len(req.Items))
	for _, it := range req.Items {
		if it.StudentName == "" {
			continue
		}
		status := it.Status
		if status == "" {
			status = "出勤"
		}
		records = append(records, model.AttendanceRecord{
			UserID:      userID,
			ClassID:     req.ClassID,
			Date:        req.Date,
			StudentName: it.StudentName,
			Status:      status,
			Remark:      it.Remark,
		})
	}
	if err := h.svc.SaveAttendance(records); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已保存"})
}

func (h *StudentHandler) DeleteAttendance(c *gin.Context) {
	userID := c.GetInt64("user_id")
	classID := c.Query("class_id")
	date := c.Query("date")
	if classID == "" || date == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少参数"})
		return
	}
	if err := h.svc.DeleteAttendance(userID, classID, date); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已删除"})
}

func (h *StudentHandler) AttendanceSummary(c *gin.Context) {
	userID := c.GetInt64("user_id")
	classID := c.Query("class_id")
	date := c.Query("date")
	if classID == "" || date == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少参数"})
		return
	}
	sum, err := h.svc.GetAttendanceSummary(userID, classID, date)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取汇总失败"})
		return
	}
	c.JSON(http.StatusOK, sum)
}