# 课表座位管理系统

基于 Go + SQLite + Supabase 的课程表与座位表管理系统，支持多端数据云同步，Docker 一键部署。

## 功能

- 班级管理（用户自定义增删改班级，含年级/班号/徽标/排序）
- 课程表管理（默认 8 节 × 5 天，按班级独立配置）
- 座位表管理（拖拽换座、增删改学生、行列调整）
- 用户系统（注册/登录，首个用户自动成为管理员）
- 主题切换（浅色/深色）
- 导出图片
- SQLite 本地存储 + Supabase 云端双向同步
- 管理员可配置 Supabase 连接
- Docker 一键部署

## 项目结构

```
kebiao/
├── cmd/server/main.go          # 程序入口
├── internal/
│   ├── config/                 # 配置管理
│   ├── database/
│   │   ├── sqlite.go           # SQLite 数据层
│   │   └── supabase.go         # Supabase 云同步
│   ├── handler/                # HTTP API 处理器
│   │   ├── auth.go             # 认证
│   │   ├── schedule.go         # 课表
│   │   ├── seat.go             # 座位
│   │   ├── admin.go            # 管理员
│   │   └── sync.go             # 云同步
│   ├── middleware/             # JWT 中间件
│   ├── model/                  # 数据模型
│   └── service/                # 业务逻辑
│       ├── auth.go             # 认证服务
│       ├── schedule.go         # 课表服务
│       ├── seat.go             # 座位服务
│       ├── sync.go             # 同步服务
│       └── defaults.go         # 默认课表数据
├── web/                        # 前端（纯客户端，无硬编码数据）
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── api.js              # API 客户端
│       └── app.js              # 主逻辑
├── Dockerfile
├── docker-compose.yml
├── go.mod
└── config.example.yaml         # 配置参考
```

## Docker 部署（推荐）

```bash
# 一键启动
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止
docker-compose down
```

访问 http://localhost:8080 即可使用。

### 自定义配置

修改 `docker-compose.yml` 中的环境变量：

```yaml
environment:
  - PORT=8080
  - JWT_SECRET=your-secret-key    # 修改 JWT 密钥
  - DATA_DIR=/app/data
```

## 本地开发

```bash
# 安装依赖
go mod tidy

# 运行
go run ./cmd/server

# 构建
go build -o kebiao ./cmd/server
./kebiao
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| PORT | 8080 | 服务端口 |
| JWT_SECRET | change-me-in-production | JWT 密钥 |
| DATA_DIR | ./data | 数据目录 |

## Supabase 云同步配置

1. 注册并登录后，首个用户自动成为管理员
2. 进入「我的」→「☁️ Supabase配置」
3. 在 [Supabase](https://supabase.com) 创建项目
4. 点击「📋 获取建表SQL」，在 Supabase SQL Editor 中执行
5. 填入 Supabase URL 和 API Key，保存
6. 点击「🧪 测试连接」验证
7. 在「更多」面板中点击「⬆️ 推送」/「⬇️ 拉取」同步数据

## API 接口

### 认证
- `POST /api/auth/register` - 注册
- `POST /api/auth/login` - 登录
- `GET /api/auth/me` - 当前用户信息
- `PUT /api/auth/password` - 修改密码
- `GET/PUT /api/auth/preferences` - 用户偏好

### 班级
- `GET /api/classes` - 班级列表
- `POST /api/classes` - 创建班级
- `PUT /api/classes/:class_id` - 更新班级
- `DELETE /api/classes/:class_id` - 删除班级

### 课表
- `GET /api/schedule/default` - 默认课表（公开）
- `GET /api/schedule` - 用户课表自定义
- `PUT /api/schedule/cell` - 保存单元格
- `POST /api/schedule/batch` - 批量保存

### 座位
- `GET /api/seat` - 座位数据
- `PUT /api/seat/student` - 更新学生
- `DELETE /api/seat/student` - 删除学生
- `POST /api/seat/swap` - 交换座位
- `POST /api/seat/resize` - 调整行列
- `POST /api/seat/order` - 设置排序

### 云同步
- `GET /api/sync/status` - 同步状态
- `POST /api/sync/push` - 推送到云端
- `POST /api/sync/pull` - 拉取云端数据
- `POST /api/sync/test` - 测试连接

### 管理员
- `GET /api/admin/users` - 用户列表
- `GET /api/admin/users/:username` - 用户详情
- `POST /api/admin/users/:username/reset-password` - 重置密码
- `DELETE /api/admin/users/:username/data` - 清空数据
- `DELETE /api/admin/users/:username` - 删除用户
- `GET/PUT /api/admin/supabase` - Supabase 配置
- `POST /api/admin/supabase/test` - 测试 Supabase
- `GET /api/admin/supabase/schema` - 获取建表 SQL

### 其他
- `GET /health` - 健康检查
