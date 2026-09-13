package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"kebiao/internal/service"
)

func AuthRequired(authSvc *service.AuthService) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "未登录"})
			return
		}
		token := strings.TrimPrefix(authHeader, "Bearer ")
		claims, err := authSvc.ParseToken(token)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "登录已过期，请重新登录"})
			return
		}
		c.Set("user_id", claims.UserID)
		c.Set("username", claims.Username)
		c.Set("is_admin", claims.IsAdmin)
		c.Next()
	}
}

func AdminRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		isAdmin, _ := c.Get("is_admin")
		if !isAdmin.(bool) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "需要管理员权限"})
			return
		}
		c.Next()
	}
}
