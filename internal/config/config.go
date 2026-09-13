package config

import (
	"os"
	"path/filepath"
	"strconv"
)

type Config struct {
	Server     ServerConfig
	Supabase   SupabaseConfig
	SupabaseDB *SupabaseDBConfig
}

type ServerConfig struct {
	Port      string
	JWTSecret string
	DataDir   string
}

type SupabaseConfig struct {
	Enabled      bool
	URL          string
	APIKey       string
	SyncInterval int
}

type SupabaseDBConfig struct {
	Enabled bool
	Host    string
	Port    int
	Name    string
	User    string
	Pass    string
}

func Default() *Config {
	return &Config{
		Server: ServerConfig{
			Port:      getEnv("PORT", "8080"),
			JWTSecret: getEnv("JWT_SECRET", "change-me-in-production"),
			DataDir:   getEnv("DATA_DIR", "./data"),
		},
		Supabase: SupabaseConfig{
			Enabled:      false,
			URL:           "",
			APIKey:        "",
			SyncInterval:  300,
		},
	}
}

func (c *Config) SQLitePath() string {
	return filepath.Join(c.Server.DataDir, "kebiao.db")
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return fallback
}

func getEnvBool(key string, fallback bool) bool {
	if v := os.Getenv(key); v != "" {
		switch v {
		case "1", "true", "TRUE", "True":
			return true
		case "0", "false", "FALSE", "False":
			return false
		}
	}
	return fallback
}
