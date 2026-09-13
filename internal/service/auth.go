package service

import (
	"errors"
	"fmt"
	"regexp"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"

	"kebiao/internal/database"
	"kebiao/internal/model"
)

type AuthService struct {
	db        *database.SQLite
	jwtSecret string
}

func NewAuthService(db *database.SQLite, jwtSecret string) *AuthService {
	return &AuthService{db: db, jwtSecret: jwtSecret}
}

type Claims struct {
	UserID   int64  `json:"user_id"`
	Username string `json:"username"`
	IsAdmin  bool   `json:"is_admin"`
	jwt.RegisteredClaims
}

func (s *AuthService) Register(username, password string) (string, error) {
	if !isValidUsername(username) {
		return "", errors.New("用户名需为 3-20 位的字母/数字/下划线")
	}
	if len(password) < 6 || len(password) > 32 {
		return "", errors.New("密码需为 6-32 字符")
	}

	count, _ := s.db.UserCount()
	isFirst := count == 0

	if !isFirst {
		if cfg, err := s.db.GetSupabaseConfig(); err == nil && cfg != nil && cfg.RegistrationLocked {
			return "", errors.New("管理员已关闭新用户注册")
		}
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", fmt.Errorf("hash password: %w", err)
	}

	user := &model.User{
		Username: username,
		Password: string(hashed),
		IsAdmin:  isFirst,
	}
	if err := s.db.CreateUser(user); err != nil {
		return "", errors.New("该用户名已被注册")
	}

	// 注册即登录，记录首次登录时间
	_ = s.db.UpdateLastLogin(user.ID, time.Now())

	return s.generateToken(user)
}

func (s *AuthService) Login(username, password string) (string, error) {
	user, err := s.db.GetUserByUsername(username)
	if err != nil {
		return "", errors.New("用户名不存在")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(password)); err != nil {
		return "", errors.New("密码错误")
	}

	// 记录本次登录时间
	_ = s.db.UpdateLastLogin(user.ID, time.Now())

	return s.generateToken(user)
}

func (s *AuthService) ChangePassword(userID int64, oldPwd, newPwd string) error {
	if len(newPwd) < 6 || len(newPwd) > 32 {
		return errors.New("新密码需为 6-32 字符")
	}
	user, err := s.db.GetUserByID(userID)
	if err != nil {
		return errors.New("用户不存在")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(oldPwd)); err != nil {
		return errors.New("当前密码错误")
	}
	hashed, err := bcrypt.GenerateFromPassword([]byte(newPwd), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	return s.db.UpdateUserPassword(userID, string(hashed))
}

func (s *AuthService) ResetPassword(userID int64, newPwd string) error {
	if len(newPwd) < 6 || len(newPwd) > 32 {
		return errors.New("密码需为 6-32 字符")
	}
	hashed, err := bcrypt.GenerateFromPassword([]byte(newPwd), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	return s.db.UpdateUserPassword(userID, string(hashed))
}

func (s *AuthService) generateToken(user *model.User) (string, error) {
	claims := &Claims{
		UserID:   user.ID,
		Username: user.Username,
		IsAdmin:  user.IsAdmin,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(7 * 24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.jwtSecret))
}

func (s *AuthService) ParseToken(tokenStr string) (*Claims, error) {
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
		return []byte(s.jwtSecret), nil
	})
	if err != nil || !token.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}

func isValidUsername(s string) bool {
	matched, _ := regexp.MatchString(`^[A-Za-z0-9_]{3,20}$`, s)
	return matched
}