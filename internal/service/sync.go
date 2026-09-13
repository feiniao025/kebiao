package service

import (
	"fmt"

	"kebiao/internal/database"
	"kebiao/internal/model"
)

type SyncService struct {
	db     *database.SQLite
	sb     *database.Supabase
}

func NewSyncService(db *database.SQLite, sb *database.Supabase) *SyncService {
	return &SyncService{db: db, sb: sb}
}

func (s *SyncService) GetStatus() (*model.SyncStatus, error) {
	status, err := s.db.GetSyncStatus()
	if err != nil {
		return nil, err
	}
	status.PendingPush = 0
	return status, nil
}

func (s *SyncService) Push(userID int64, username string) error {
	if err := s.sb.ReloadConfig(); err != nil {
		return err
	}
	if !s.sb.IsEnabled() {
		return fmt.Errorf("Supabase 云同步未启用，请联系管理员配置")
	}
	if err := s.sb.PushAll(userID, username); err != nil {
		s.db.AddSyncLog("push", "failed", err.Error())
		return err
	}
	return nil
}

func (s *SyncService) Pull(userID int64) error {
	if err := s.sb.ReloadConfig(); err != nil {
		return err
	}
	if !s.sb.IsEnabled() {
		return fmt.Errorf("Supabase 云同步未启用，请联系管理员配置")
	}
	if err := s.sb.PullAll(userID); err != nil {
		s.db.AddSyncLog("pull", "failed", err.Error())
		return err
	}
	return nil
}

func (s *SyncService) TestConnection() error {
	if err := s.sb.ReloadConfig(); err != nil {
		return err
	}
	return s.sb.TestConnection()
}
