package middleware

import (
	"compress/gzip"
	"strings"

	"github.com/gin-gonic/gin"
)

// gzipWriter 包装 gin.ResponseWriter，把写入的字节流经过 gzip 压缩后再发送
type gzipWriter struct {
	gin.ResponseWriter
	writer *gzip.Writer
}

func (g *gzipWriter) Write(data []byte) (int, error) {
	return g.writer.Write(data)
}

func (g *gzipWriter) WriteString(s string) (int, error) {
	return g.writer.Write([]byte(s))
}

// GzipMiddleware 对 JS/CSS/HTML/JSON 响应启用 gzip 压缩
// 说明：直接使用标准库 compress/gzip，无需第三方依赖，兼容 Go 1.22
func GzipMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 1) 客户端不支持 gzip，跳过
		if !strings.Contains(c.Request.Header.Get("Accept-Encoding"), "gzip") {
			c.Next()
			return
		}

		// 2) 排除流式/特殊接口（避免压缩破坏协议）
		path := c.Request.URL.Path
		if strings.HasPrefix(path, "/api/sync/") {
			c.Next()
			return
		}

		// 3) 只压缩文本类资源
		shouldCompress := strings.HasPrefix(path, "/js/") ||
			strings.HasPrefix(path, "/static/") ||
			strings.HasPrefix(path, "/api/") ||
			path == "/" || path == "/index.html"

		if !shouldCompress {
			c.Next()
			return
		}

		// 4) 创建 gzip writer
		gz, err := gzip.NewWriterLevel(c.Writer, gzip.DefaultCompression)
		if err != nil {
			c.Next()
			return
		}
		defer gz.Close()

		// 5) 设置响应头
		c.Writer.Header().Del("Content-Length") // 压缩后长度会变，必须删除
		c.Writer.Header().Set("Content-Encoding", "gzip")
		c.Writer.Header().Add("Vary", "Accept-Encoding")

		// 6) 替换 ResponseWriter
		gzw := &gzipWriter{ResponseWriter: c.Writer, writer: gz}
		c.Writer = gzw

		c.Next()

		// 7) 确保 gzip flush（defer 已处理）
	}
}