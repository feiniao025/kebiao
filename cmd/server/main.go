package main

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"time"

	"github.com/gin-gonic/gin"

	"kebiao/internal/config"
	"kebiao/internal/database"
	"kebiao/internal/handler"
	"kebiao/internal/middleware"
	"kebiao/internal/service"
)

// ============================================================
// ★ TTS 反向代理配置
// 支持管理员在后台配置「多行」接口，每行一个：
//   https://xxx/v1/audio/speech
//   https://yyy/v1/audio/speech|API_KEY
// # 开头为注释，空行忽略。
// 请求时按行「轮询」，失败自动切换下一个；全部失败返回 502。
// 若后台为空，则使用 defaultTTSEndpoints 兜底。
// ============================================================

type ttsEndpoint struct {
	URL string
	Key string
}

var defaultTTSEndpoints = []ttsEndpoint{
	{URL: "https://tts.wangwangit.com/v1/audio/speech"},
}

var ttsCounter uint64

func parseTTSEndpoints(raw string) []ttsEndpoint {
	var out []ttsEndpoint
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "|", 2)
		ep := ttsEndpoint{URL: strings.TrimSpace(parts[0])}
		if len(parts) == 2 {
			ep.Key = strings.TrimSpace(parts[1])
		}
		if ep.URL != "" {
			out = append(out, ep)
		}
	}
	return out
}

func main() {
	cfg := config.Default()

	if err := os.MkdirAll(cfg.Server.DataDir, 0755); err != nil {
		log.Fatalf("create data dir: %v", err)
	}

	db, err := database.NewSQLite(cfg.SQLitePath())
	if err != nil {
		log.Fatalf("init sqlite: %v", err)
	}
	defer db.Close()

	sb := database.NewSupabase(db)

	authSvc := service.NewAuthService(db, cfg.Server.JWTSecret)
	scheduleSvc := service.NewScheduleService(db)
	seatSvc := service.NewSeatService(db)
	syncSvc := service.NewSyncService(db, sb)
	studentSvc := service.NewStudentService(db)
	shoutSvc := service.NewShoutService(db)
	shoutSvc.StartScheduler() // ★ 启动服务端定时调度器

	authHandler := handler.NewAuthHandler(authSvc, db)
	scheduleHandler := handler.NewScheduleHandler(scheduleSvc)
	seatHandler := handler.NewSeatHandler(seatSvc)
	adminHandler := handler.NewAdminHandler(db, authSvc, sb)
	syncHandler := handler.NewSyncHandler(syncSvc)
	studentHandler := handler.NewStudentHandler(studentSvc)
	shoutHandler := handler.NewShoutHandler(shoutSvc)

	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()

	// ============ 1) Gzip 压缩（自研中间件，无第三方依赖） ============
	r.Use(middleware.GzipMiddleware())

	// ============ CSP 安全策略中间件 ============
	r.Use(func(c *gin.Context) {
		c.Header("Content-Security-Policy",
			"default-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdn.bootcdn.net; "+
				"img-src 'self' data: blob:; "+
				"media-src 'self' blob: data:; "+
				"connect-src 'self' https://cdn.jsdelivr.net https://cdn.bootcdn.net;")
		c.Next()
	})

	// ============ 2) 静态资源长缓存：JS/CSS 一年 ============
	r.Use(func(c *gin.Context) {
		p := c.Request.URL.Path
		if strings.HasPrefix(p, "/js/") || strings.HasPrefix(p, "/static/") {
			c.Header("Cache-Control", "public, max-age=31536000, immutable")
		}
		c.Next()
	})

	webDir := getWebDir()
	if _, err := os.Stat(webDir); err == nil {
		r.Static("/static", filepath.Join(webDir, "css"))
		r.Static("/js", filepath.Join(webDir, "js"))
		r.StaticFile("/", filepath.Join(webDir, "index.html"))
		r.StaticFile("/index.html", filepath.Join(webDir, "index.html"))
		r.StaticFile("/display.html", filepath.Join(webDir, "display.html"))
		r.StaticFile("/favicon.svg", filepath.Join(webDir, "static", "favicon.svg"))
	} else {
		log.Printf("warning: web directory not found at %s, frontend will not be served", webDir)
	}

	api := r.Group("/api")
	{
		api.GET("/schedule/default", scheduleHandler.GetDefault)
		api.GET("/config", authHandler.GetPublicSystemConfig)

		// ★ 大屏公开 TTS 反代（同源，绕过 CSP 和 CORS），支持多接口轮询
		api.POST("/tts", ttsProxyHandler(db))

		// ============ 大屏接收端（公开，凭 display_token） ============
		api.GET("/shout/feed", shoutHandler.DisplayFeed)

		auth := api.Group("/auth")
		{
			auth.POST("/register", authHandler.Register)
			auth.POST("/login", authHandler.Login)
		}

		authProtected := api.Group("/auth")
		authProtected.Use(middleware.AuthRequired(authSvc))
		{
			authProtected.GET("/me", authHandler.Me)
			authProtected.PUT("/password", authHandler.ChangePassword)
			authProtected.GET("/preferences", authHandler.GetPreferences)
			authProtected.PUT("/preferences", authHandler.UpdatePreferences)
		}

		sched := api.Group("/schedule")
		sched.Use(middleware.AuthRequired(authSvc))
		{
			sched.GET("", scheduleHandler.GetCells)
			sched.PUT("/cell", scheduleHandler.UpsertCell)
			sched.POST("/batch", scheduleHandler.BatchUpsert)
		}

		cls := api.Group("/classes")
		cls.Use(middleware.AuthRequired(authSvc))
		{
			cls.GET("", scheduleHandler.ListClasses)
			cls.POST("", scheduleHandler.CreateClass)
			cls.PUT("/order", scheduleHandler.UpdateClassOrder)
			cls.PUT("/:class_id", scheduleHandler.UpdateClass)
			cls.DELETE("/:class_id", scheduleHandler.DeleteClass)
		}

		seat := api.Group("/seat")
		seat.Use(middleware.AuthRequired(authSvc))
		{
			seat.GET("", seatHandler.GetSeat)
			seat.PUT("/student", seatHandler.UpdateStudent)
			seat.DELETE("/student", seatHandler.DeleteStudent)
			seat.POST("/swap", seatHandler.Swap)
			seat.POST("/resize", seatHandler.Resize)
			seat.POST("/order", seatHandler.SetOrder)
			seat.POST("/aisle", seatHandler.SetAisle)
		}

		sync := api.Group("/sync")
		sync.Use(middleware.AuthRequired(authSvc))
		{
			sync.GET("/status", syncHandler.GetStatus)
			sync.POST("/push", syncHandler.Push)
			sync.POST("/pull", syncHandler.Pull)
			sync.POST("/test", syncHandler.Test)
		}

		stu := api.Group("/students")
		stu.Use(middleware.AuthRequired(authSvc))
		{
			stu.GET("/roster", studentHandler.ListRoster)
			stu.POST("/roster", studentHandler.UpsertRoster)
			stu.DELETE("/roster", studentHandler.DeleteRoster)
			stu.POST("/roster/move", studentHandler.MoveRosterClass)

			stu.GET("/exams", studentHandler.ListExams)
			stu.POST("/exams", studentHandler.CreateExam)
			stu.GET("/exams/history", studentHandler.GetStudentHistory)
			stu.GET("/exams/:id", studentHandler.GetExamDetail)
			stu.PUT("/exams/:id", studentHandler.UpdateExam)
			stu.DELETE("/exams/:id", studentHandler.DeleteExam)
			stu.PUT("/exams/:id/scores", studentHandler.SaveScores)
			stu.PUT("/exams/:id/rank-order", studentHandler.SetRankOrder)

			stu.GET("/attendance", studentHandler.ListAttendance)
			stu.GET("/attendance/dates", studentHandler.ListAttendanceDates)
			stu.GET("/attendance/summary", studentHandler.AttendanceSummary)
			stu.GET("/attendance/monthly", studentHandler.GetStudentMonthlyAttendance)
			stu.POST("/attendance", studentHandler.SaveAttendance)
			stu.DELETE("/attendance", studentHandler.DeleteAttendance)
		}

		// ============ 远程喊话（教师端，需登录） ============
		shout := api.Group("/shout")
		shout.Use(middleware.AuthRequired(authSvc))
		{
			shout.GET("/rooms", shoutHandler.ListRooms)
			shout.POST("/rooms", shoutHandler.CreateRoom)
			shout.POST("/join", shoutHandler.JoinRoom)
			shout.GET("/rooms/:key", shoutHandler.GetRoom)
			shout.PUT("/rooms/:key", shoutHandler.UpdateRoom)
			shout.DELETE("/rooms/:key", shoutHandler.DeleteRoom)
			shout.POST("/rooms/:key/token", shoutHandler.RegenerateToken)
			shout.POST("/rooms/:key/regenerate-key", shoutHandler.RegenerateRoomKey)
			shout.GET("/rooms/:key/members", shoutHandler.ListMembers)
			shout.DELETE("/rooms/:key/members/:username", shoutHandler.RemoveMember)
			shout.POST("/rooms/:key/send", shoutHandler.Send)
			shout.GET("/rooms/:key/messages", shoutHandler.Poll)
			shout.GET("/rooms/:key/status", shoutHandler.Status)
			shout.POST("/rooms/:key/schedule", shoutHandler.ScheduleMessage)
			shout.GET("/scheduled", shoutHandler.ListScheduled)
			shout.DELETE("/scheduled/:id", shoutHandler.CancelScheduled)
			shout.GET("/messages", shoutHandler.GetMyMessages)
			shout.DELETE("/messages/:id", shoutHandler.DeleteMessage)
		}

		admin := api.Group("/admin")
		admin.Use(middleware.AuthRequired(authSvc), middleware.AdminRequired())
		{
			admin.GET("/users", adminHandler.ListUsers)
			admin.GET("/users/:username", adminHandler.GetUserDetail)
			admin.PUT("/users/:username", adminHandler.UpdateUser)
			admin.POST("/users/:username/reset-password", adminHandler.ResetUserPassword)
			admin.DELETE("/users/:username/data", adminHandler.ClearUserData)
			admin.DELETE("/users/:username", adminHandler.DeleteUser)
			admin.GET("/supabase", adminHandler.GetSupabaseConfig)
			admin.PUT("/supabase", adminHandler.UpdateSupabaseConfig)
			admin.POST("/supabase/test", adminHandler.TestSupabase)
			admin.GET("/supabase/schema", adminHandler.GetSchemaSQL)
			admin.GET("/system/config", adminHandler.GetSystemConfig)
			admin.PUT("/system/config", adminHandler.UpdateSystemConfig)
		}
	}

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	port := cfg.Server.Port
	addr := fmt.Sprintf(":%s", port)
	log.Printf("Server starting on http://0.0.0.0:%s", port)
	log.Printf("SQLite database: %s", cfg.SQLitePath())
	if err := r.Run(addr); err != nil {
		log.Fatalf("server error: %v", err)
	}
}

// ============================================================
// ★ TTS 反向代理（多接口轮询 + 失败自动切换）
// ============================================================
func ttsProxyHandler(db *database.SQLite) gin.HandlerFunc {
	return func(c *gin.Context) {
		body, err := io.ReadAll(c.Request.Body)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "读取请求体失败"})
			return
		}

		// 从数据库读取管理员配置的接口列表
		endpoints := defaultTTSEndpoints
		if cfg, err := db.GetSystemConfig(); err == nil {
			if list := parseTTSEndpoints(cfg.TTSUpstreams); len(list) > 0 {
				endpoints = list
			}
		}
		if len(endpoints) == 0 {
			endpoints = defaultTTSEndpoints
		}

		// 轮询：原子自增取模，起点依次递推
		start := int(atomic.AddUint64(&ttsCounter, 1)-1) % len(endpoints)
		client := &http.Client{Timeout: 15 * time.Second}

		var lastErr error

		for i := 0; i < len(endpoints); i++ {
			ep := endpoints[(start+i)%len(endpoints)]

			ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
			req, err := http.NewRequestWithContext(ctx, "POST", ep.URL, bytes.NewReader(body))
			if err != nil {
				cancel()
				lastErr = err
				continue
			}
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Accept", "audio/*,application/json")
			if ep.Key != "" {
				req.Header.Set("Authorization", "Bearer "+ep.Key)
				req.Header.Set("X-API-Key", ep.Key)
			}

			resp, err := client.Do(req)
			if err != nil {
				cancel()
				lastErr = err
				continue
			}

			ct := resp.Header.Get("Content-Type")
			ctLower := strings.ToLower(ct)

			// 成功：返回音频（非 JSON）
			if resp.StatusCode >= 200 && resp.StatusCode < 300 &&
				!strings.Contains(ctLower, "application/json") {
				if ct == "" {
					ct = "application/octet-stream"
				}
				c.Header("Content-Type", ct)
				c.Header("Cache-Control", "no-store")
				c.Status(resp.StatusCode)
				_, _ = io.Copy(c.Writer, resp.Body)
				resp.Body.Close()
				cancel()
				return
			}

			// 失败：记录错误，尝试下一个
			errBody, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
			resp.Body.Close()
			cancel()
			lastErr = fmt.Errorf("endpoint %s: HTTP %d %s", ep.URL, resp.StatusCode, string(errBody))
		}

		msg := "所有 TTS 接口均不可用"
		if lastErr != nil {
			msg += ": " + lastErr.Error()
		}
		log.Printf("[tts-proxy] %s", msg)
		c.JSON(http.StatusBadGateway, gin.H{"error": msg})
	}
}

func getWebDir() string {
	if _, err := os.Stat("web"); err == nil {
		return "web"
	}
	exe, err := os.Executable()
	if err == nil {
		dir := filepath.Join(filepath.Dir(exe), "web")
		if _, err := os.Stat(dir); err == nil {
			return dir
		}
	}
	return "web"
}