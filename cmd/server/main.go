package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"

	"kebiao/internal/config"
	"kebiao/internal/database"
	"kebiao/internal/handler"
	"kebiao/internal/middleware"
	"kebiao/internal/service"
)

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

	authHandler := handler.NewAuthHandler(authSvc, db)
	scheduleHandler := handler.NewScheduleHandler(scheduleSvc)
	seatHandler := handler.NewSeatHandler(seatSvc)
	adminHandler := handler.NewAdminHandler(db, authSvc, sb)
	syncHandler := handler.NewSyncHandler(syncSvc)
	studentHandler := handler.NewStudentHandler(studentSvc)

	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()

	// ============ 1) Gzip 压缩（自研中间件，无第三方依赖） ============
	r.Use(middleware.GzipMiddleware())

	// ============ CSP 安全策略中间件 ============
	r.Use(func(c *gin.Context) {
		c.Header("Content-Security-Policy", "default-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdn.bootcdn.net; img-src 'self' data: blob:;")
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
		r.StaticFile("/favicon.ico", filepath.Join(webDir, "favicon.ico"))
	} else {
		log.Printf("warning: web directory not found at %s, frontend will not be served", webDir)
	}

	api := r.Group("/api")
	{
		api.GET("/schedule/default", scheduleHandler.GetDefault)
		api.GET("/config", authHandler.GetPublicSystemConfig)

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

			stu.GET("/attendance", studentHandler.ListAttendance)
			stu.GET("/attendance/dates", studentHandler.ListAttendanceDates)
			stu.GET("/attendance/summary", studentHandler.AttendanceSummary)
			stu.POST("/attendance", studentHandler.SaveAttendance)
			stu.DELETE("/attendance", studentHandler.DeleteAttendance)
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