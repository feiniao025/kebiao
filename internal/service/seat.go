package service

import (
	"fmt"
	"strconv"
	"strings"

	"kebiao/internal/database"
	"kebiao/internal/model"
)

type SeatService struct {
	db *database.SQLite
}

func NewSeatService(db *database.SQLite) *SeatService {
	return &SeatService{db: db}
}

func (s *SeatService) GetSeatConfig(userID int64) (*model.SeatConfig, error) {
	return s.db.GetSeatConfig(userID)
}

func (s *SeatService) GetStudents(userID int64) ([]model.Student, error) {
	return s.db.GetStudents(userID)
}

func (s *SeatService) UpsertStudent(userID int64, row, col int, st *model.Student) error {
	st.UserID = userID
	st.SeatRow = row
	st.SeatCol = col
	return s.db.UpsertStudent(st)
}

func (s *SeatService) DeleteStudent(userID int64, row, col int) error {
	return s.db.DeleteStudent(userID, row, col)
}

func (s *SeatService) Swap(userID int64, r1, c1, r2, c2 int) error {
	return s.db.SwapStudents(userID, r1, c1, r2, c2)
}

// Resize 调整座位表行列，不删除任何学生
func (s *SeatService) Resize(userID int64, rows, cols int) error {
	if rows < 2 || rows > 12 || cols < 2 || cols > 10 {
		return fmt.Errorf("行列数超出范围 (行2-12, 列2-10)")
	}

	oldConfig, _ := s.db.GetSeatConfig(userID)
	oldRows := 7
	oldCols := 8
	oldOrder := "asc"
	if oldConfig != nil {
		oldRows = oldConfig.Rows
		oldCols = oldConfig.Cols
		if oldConfig.Order != "" {
			oldOrder = oldConfig.Order
		}
	}

	studentsList, err := s.db.GetStudents(userID)
	if err != nil {
		return err
	}

	seatMap := map[[2]int]model.Student{}
	count := 0
	for _, st := range studentsList {
		if st.Name == "" {
			continue
		}
		count++
		seatMap[[2]int{st.SeatRow, st.SeatCol}] = st
	}

	if count == 0 {
		if err := s.db.UpdateSeatConfig(userID, rows, cols, oldOrder); err != nil {
			return err
		}
		// 列数变化时清空过道
		if cols != oldCols {
			_ = s.db.UpdateSeatAisle(userID, "")
		}
		return nil
	}

	if rows*cols < count {
		return fmt.Errorf("座位不足：当前 %d 名学生，%d×%d 只能容纳 %d 人", count, rows, cols, rows*cols)
	}

	newStudents := make([]model.Student, 0, count)
	placed := map[[2]int]bool{}
	var overflow []model.Student

	for r := 0; r < oldRows; r++ {
		for c := 0; c < oldCols; c++ {
			st, ok := seatMap[[2]int{r, c}]
			if !ok {
				continue
			}
			if r < rows && c < cols {
				st.SeatRow = r
				st.SeatCol = c
				newStudents = append(newStudents, st)
				placed[[2]int{r, c}] = true
			} else {
				overflow = append(overflow, st)
			}
		}
	}

	for _, st := range overflow {
		found := false
		for r := 0; r < rows && !found; r++ {
			for c := 0; c < cols; c++ {
				if !placed[[2]int{r, c}] {
					st.SeatRow = r
					st.SeatCol = c
					newStudents = append(newStudents, st)
					placed[[2]int{r, c}] = true
					found = true
					break
				}
			}
		}
		if !found {
			return fmt.Errorf("座位不足：无法为全部 %d 名学生分配位置", count)
		}
	}

	if err := s.db.ReplaceAllStudents(userID, newStudents); err != nil {
		return err
	}
	if err := s.db.UpdateSeatConfig(userID, rows, cols, oldOrder); err != nil {
		return err
	}
	// 列数变化时清空过道
	if cols != oldCols {
		_ = s.db.UpdateSeatAisle(userID, "")
	}
	return nil
}

func (s *SeatService) SetOrder(userID int64, order string) error {
	sc, err := s.db.GetSeatConfig(userID)
	if err != nil {
		return err
	}
	return s.db.UpdateSeatConfig(userID, sc.Rows, sc.Cols, order)
}

// SetAisle 设置过道格式
func (s *SeatService) SetAisle(userID int64, aisle string) error {
	sc, err := s.db.GetSeatConfig(userID)
	if err != nil {
		return err
	}

	aisle = strings.TrimSpace(aisle)

	// 空串表示取消过道
	if aisle == "" {
		return s.db.UpdateSeatAisle(userID, "")
	}

	parts := strings.Split(aisle, "+")
	if len(parts) < 2 {
		return fmt.Errorf("至少需要 2 段，如 3+5")
	}
	sum := 0
	norm := make([]string, 0, len(parts))
	for _, p := range parts {
		n, err := strconv.Atoi(strings.TrimSpace(p))
		if err != nil || n < 1 || n > 100 {
			return fmt.Errorf("每段需为 1-100 之间的数字")
		}
		sum += n
		norm = append(norm, strconv.Itoa(n))
	}
	if sum != sc.Cols {
		return fmt.Errorf("段数之和 %d 与列数 %d 不一致", sum, sc.Cols)
	}
	return s.db.UpdateSeatAisle(userID, strings.Join(norm, "+"))
}