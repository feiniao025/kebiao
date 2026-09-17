package service

import (
	"fmt"
	"strings"

	"kebiao/internal/database"
	"kebiao/internal/model"
)

type StudentService struct {
	db *database.SQLite
}

func NewStudentService(db *database.SQLite) *StudentService {
	return &StudentService{db: db}
}

// ============ 花名册 ============

func (s *StudentService) ListRoster(userID int64, classID string) ([]model.RosterStudent, error) {
	return s.db.GetRosterStudents(userID, classID)
}

func (s *StudentService) UpsertRoster(userID int64, r *model.RosterStudent) error {
	r.UserID = userID
	if strings.TrimSpace(r.Name) == "" {
		return fmt.Errorf("姓名不能为空")
	}
	if r.ClassID == "" {
		return fmt.Errorf("请先选择班级")
	}
	return s.db.UpsertRosterStudent(r)
}

func (s *StudentService) DeleteRoster(userID int64, classID, name string) error {
	return s.db.DeleteRosterStudent(userID, classID, name)
}

func (s *StudentService) MoveRosterClass(userID int64, fromClassID, toClassID string) error {
	if fromClassID == "" || toClassID == "" {
		return fmt.Errorf("参数不完整")
	}
	return s.db.MoveRosterClass(userID, fromClassID, toClassID)
}

// ============ 成绩 ============

func (s *StudentService) ListExams(userID int64, classID string) ([]model.Exam, error) {
	return s.db.GetExams(userID, classID)
}

func (s *StudentService) GetExamWithScores(userID, examID int64) (*model.Exam, []model.ExamScore, error) {
	e, err := s.db.GetExamByID(userID, examID)
	if err != nil {
		return nil, nil, err
	}
	scores, err := s.db.GetExamScores(examID)
	if err != nil {
		return e, nil, err
	}
	return e, scores, nil
}

func (s *StudentService) GetOrCreateExam(userID int64, classID, subject, name string, fullScore, passScore, excellentScore int) (*model.Exam, error) {
	e, err := s.db.GetExamByName(userID, classID, subject, name)
	if err == nil {
		return e, nil
	}
	if fullScore <= 0 {
		fullScore = 100
	}
	if passScore <= 0 {
		passScore = 75
	}
	if excellentScore <= 0 {
		excellentScore = 100
	}
	e = &model.Exam{
		UserID:         userID,
		ClassID:        classID,
		Subject:        subject,
		Name:           name,
		FullScore:      fullScore,
		PassScore:      passScore,
		ExcellentScore: excellentScore,
	}
	if err := s.db.CreateExam(e); err != nil {
		return nil, err
	}
	return e, nil
}

func (s *StudentService) UpdateExam(userID int64, e *model.Exam) error {
	if e.FullScore <= 0 {
		e.FullScore = 100
	}
	if e.PassScore <= 0 {
		e.PassScore = 75
	}
	if e.ExcellentScore <= 0 {
		e.ExcellentScore = 100
	}
	e.UserID = userID
	return s.db.UpdateExam(e)
}

func (s *StudentService) DeleteExam(userID, examID int64) error {
	return s.db.DeleteExam(userID, examID)
}

func (s *StudentService) SaveScores(userID, examID int64, scores []model.ExamScore) error {
	if len(scores) == 0 {
		return nil
	}
	return s.db.BatchUpsertExamScores(userID, examID, scores)
}

func (s *StudentService) GetExamStats(userID, examID int64) (*model.ExamStats, error) {
	e, err := s.db.GetExamByID(userID, examID)
	if err != nil {
		return nil, err
	}
	scores, err := s.db.GetExamScores(examID)
	if err != nil {
		return nil, err
	}

	st := &model.ExamStats{
		FullScore:     e.FullScore,
		PassLine:      e.PassScore,
		ExcellentLine: e.ExcellentScore,
		Distribution:  make(map[string]int),
	}
	// 初始化分数段
	bands := []string{"<60", "60-69", "70-79", "80-89", "90-99", "100+"}
	for _, b := range bands {
		st.Distribution[b] = 0
	}

	if len(scores) == 0 {
		return st, nil
	}
	var sum float64
	st.MaxScore = scores[0].Score
	st.MinScore = scores[0].Score
	for _, s := range scores {
		sum += s.Score
		st.Count++
		if s.Score >= float64(e.PassScore) {
			st.PassCount++
		}
		if s.Score >= float64(e.ExcellentScore) {
			st.ExcellentCount++
		}
		if s.Score > st.MaxScore {
			st.MaxScore = s.Score
		}
		if s.Score < st.MinScore {
			st.MinScore = s.Score
		}
		
		// 分数段统计
		score := s.Score
		switch {
		case score < 60:
			st.Distribution["<60"]++
		case score < 70:
			st.Distribution["60-69"]++
		case score < 80:
			st.Distribution["70-79"]++
		case score < 90:
			st.Distribution["80-89"]++
		case score < 100:
			st.Distribution["90-99"]++
		default:
			st.Distribution["100+"]++
		}
	}
	st.Average = sum / float64(st.Count)
	if st.Count > 0 {
		st.PassRate = float64(st.PassCount) / float64(st.Count) * 100
		st.ExcellentRate = float64(st.ExcellentCount) / float64(st.Count) * 100
	}
	return st, nil
}

// 新增：获取学生某科目的历次成绩
func (s *StudentService) GetStudentHistory(userID int64, studentName, subject string) ([]model.StudentHistoryItem, error) {
	exams, err := s.db.GetExams(userID, "") // 获取所有考试
	if err != nil {
		return nil, err
	}
	var history []model.StudentHistoryItem
	for _, exam := range exams {
		if exam.Subject != subject {
			continue
		}
		// 查询该考试该学生的成绩
		scores, _ := s.db.GetExamScores(exam.ID)
		for _, sc := range scores {
			if sc.StudentName == studentName {
				history = append(history, model.StudentHistoryItem{
					ExamName:  exam.Name,
					Date:      exam.CreatedAt.Format("2006-01-02"),
					Score:     sc.Score,
					FullScore: exam.FullScore,
				})
				break
			}
		}
	}
	// 按时间排序
	for i := 0; i < len(history)-1; i++ {
		for j := i + 1; j < len(history); j++ {
			if history[i].Date > history[j].Date {
				history[i], history[j] = history[j], history[i]
			}
		}
	}
	return history, nil
}

// ============ 考勤 ============

func (s *StudentService) ListAttendance(userID int64, classID, date string) ([]model.AttendanceRecord, error) {
	return s.db.GetAttendance(userID, classID, date)
}

func (s *StudentService) ListAttendanceDates(userID int64, classID string) ([]string, error) {
	return s.db.ListAttendanceDates(userID, classID)
}

func (s *StudentService) SaveAttendance(records []model.AttendanceRecord) error {
	if len(records) == 0 {
		return nil
	}
	return s.db.BatchUpsertAttendance(records)
}

func (s *StudentService) DeleteAttendance(userID int64, classID, date string) error {
	return s.db.DeleteAttendanceDate(userID, classID, date)
}

// GetAttendanceSummary 聚合某天某班的考勤
func (s *StudentService) GetAttendanceSummary(userID int64, classID, date string) (*model.AttendanceSummary, error) {
	recs, err := s.db.GetAttendance(userID, classID, date)
	if err != nil {
		return nil, err
	}
	sum := &model.AttendanceSummary{Date: date, ClassID: classID}
	for _, r := range recs {
		sum.Total++
		switch r.Status {
		case "出勤":
			sum.Present++
		case "缺勤":
			sum.Absent++
		case "迟到":
			sum.Late++
		case "请假":
			sum.Leave++
		}
	}
	return sum, nil
}