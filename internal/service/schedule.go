package service

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"kebiao/internal/database"
	"kebiao/internal/model"
)

type ScheduleService struct {
	db *database.SQLite
}

func NewScheduleService(db *database.SQLite) *ScheduleService {
	return &ScheduleService{db: db}
}

func (s *ScheduleService) GetCells(userID int64) ([]model.ScheduleCell, error) {
	return s.db.GetScheduleCells(userID)
}

func (s *ScheduleService) UpsertCell(userID int64, classID string, cellIndex int, cellType, subject, teacher, periodName, periodTime, bgColor string) error {
	cell := &model.ScheduleCell{
		UserID:     userID,
		ClassID:    classID,
		CellIndex:  cellIndex,
		CellType:   cellType,
		Subject:    subject,
		Teacher:    teacher,
		PeriodName: periodName,
		PeriodTime: periodTime,
		BgColor:    bgColor,
	}
	return s.db.UpsertScheduleCell(cell)
}

// ============ 年级 / 班级名称工具 ============

func GradeLabel(g int) string {
	if g >= 10 {
		return "高" + strconv.Itoa(g-9)
	}
	cn := []string{"", "一", "二", "三", "四", "五", "六", "七", "八", "九"}
	if g >= 1 && g <= 9 {
		return cn[g]
	}
	return strconv.Itoa(g)
}

func FormatClassName(grade, classNum int) string {
	return GradeLabel(grade) + "." + strconv.Itoa(classNum) + "班"
}

// ============ 班级管理 ============

func (s *ScheduleService) GetClasses(userID int64) ([]model.Class, error) {
	return s.db.GetClasses(userID)
}

// CreateClass 创建班级
//   - customName 为空：按年级+班号创建，class_num 必须 1-30，且同年级同班号唯一
//   - customName 非空：使用自定义名称创建，class_num 记为 0，班级名称全局唯一
func (s *ScheduleService) CreateClass(userID int64, grade, classNum int, badge, customName string) (*model.Class, error) {
	if grade < 1 || grade > 12 {
		return nil, fmt.Errorf("年级需在 1-12 之间")
	}

	existing, _ := s.db.GetClasses(userID)
	customName = strings.TrimSpace(customName)

	if customName == "" {
		if classNum < 1 || classNum > 30 {
			return nil, fmt.Errorf("班级需在 1-30 之间")
		}
		for _, c := range existing {
			if c.Grade == grade && c.ClassNum == classNum {
				return nil, fmt.Errorf("该班级已存在")
			}
		}
	} else {
		if len(customName) > 30 {
			return nil, fmt.Errorf("自定义名称不能超过 30 个字符")
		}
		for _, c := range existing {
			if c.Name == customName {
				return nil, fmt.Errorf("该班级名称已存在")
			}
		}
	}

	classID := "c_" + uuid.NewString()[:8]
	className := customName
	if className == "" {
		className = FormatClassName(grade, classNum)
	}

	cls := &model.Class{
		UserID:      userID,
		ClassID:     classID,
		Name:        className,
		Badge:       badge,
		Grade:       grade,
		ClassNum:    classNum,
		PeriodCount: len(defaultPeriods),
		SortOrder:   len(existing),
	}
	if err := s.db.CreateClass(cls); err != nil {
		return nil, fmt.Errorf("create class: %w", err)
	}

	// 初始化默认节次
	for i, p := range defaultPeriods {
		cell := &model.ScheduleCell{
			UserID:     userID,
			ClassID:    classID,
			CellIndex:  i * 6,
			CellType:   "period",
			PeriodName: p.Name,
			PeriodTime: p.Time,
			BgColor:    "0",
		}
		if err := s.db.UpsertScheduleCell(cell); err != nil {
			return nil, fmt.Errorf("init period: %w", err)
		}
	}
	return cls, nil
}

func (s *ScheduleService) UpdateClass(userID int64, classID, name, badge string, grade, classNum, periodCount int) error {
	cls, err := s.db.GetClassByClassID(userID, classID)
	if err != nil {
		return fmt.Errorf("class not found")
	}
	if name != "" {
		cls.Name = name
	}
	cls.Badge = badge
	if grade > 0 {
		cls.Grade = grade
	}
	// class_num 允许为 0（自定义班级）
	cls.ClassNum = classNum
	if periodCount > 0 {
		cls.PeriodCount = periodCount
	}
	return s.db.UpdateClass(cls)
}

func (s *ScheduleService) DeleteClass(userID int64, classID string) error {
	if err := s.db.DeleteClassCells(userID, classID); err != nil {
		return err
	}
	return s.db.DeleteClass(userID, classID)
}

// UpdateClassOrder 按 classIDs 的顺序更新每个班级的 sort_order
func (s *ScheduleService) UpdateClassOrder(userID int64, classIDs []string) error {
	for i, cid := range classIDs {
		cls, err := s.db.GetClassByClassID(userID, cid)
		if err != nil {
			continue
		}
		cls.SortOrder = i
		if err := s.db.UpdateClass(cls); err != nil {
			return err
		}
	}
	return nil
}

var _ = time.Now
