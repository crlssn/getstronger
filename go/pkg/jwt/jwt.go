package jwt

import (
	"context"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"go.uber.org/zap"
)

type Claims struct {
	UserID string `json:"user_id"`
	jwt.RegisteredClaims
}

type Secrets struct {
	AccessKey  []byte
	RefreshKey []byte
}

func (s Secrets) ResolveKey(tokenType TokenType) []byte {
	switch tokenType {
	case TokenTypeAccess:
		return s.AccessKey
	case TokenTypeRefresh:
		return s.RefreshKey
	default:
		return nil
	}
}

type Manager struct {
	Log       *zap.Logger
	Secrets   Secrets
	Validator *jwt.Validator
}

func NewManager(accessKey, refreshKey []byte) *Manager {
	return &Manager{
		Secrets: Secrets{
			AccessKey:  accessKey,
			RefreshKey: refreshKey,
		},
		Validator: jwt.NewValidator(
			jwt.WithLeeway(5 * time.Second),
		),
	}
}

type TokenType string

func (tt TokenType) Validate() bool {
	switch tt {
	case TokenTypeAccess, TokenTypeRefresh:
		return true
	default:
		return false
	}
}

func (tt TokenType) String() string {
	return string(tt)
}

const (
	TokenTypeAccess  TokenType = "access_token"
	TokenTypeRefresh TokenType = "refresh_token"
)

const (
	expiryTimeAccess  = 15 * time.Minute
	ExpiryTimeRefresh = 30 * 24 * time.Hour
)

func (m *Manager) CreateToken(userID string, tokenType TokenType) (string, error) {
	if !tokenType.Validate() {
		return "", fmt.Errorf("unexpected token type: %v", tokenType)
	}

	now := time.Now().UTC()

	expiryTime := expiryTimeAccess
	if tokenType == TokenTypeRefresh {
		expiryTime = ExpiryTimeRefresh
	}

	claims := &Claims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(expiryTime)),
			IssuedAt:  jwt.NewNumericDate(now),
			Subject:   tokenType.String(),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(m.Secrets.ResolveKey(tokenType))
}

var ErrInvalidToken = fmt.Errorf("invalid token")

func (m *Manager) ClaimsFromToken(token string, tokenType TokenType) (*Claims, error) {
	if !tokenType.Validate() {
		return nil, fmt.Errorf("unexpected token type: %v", tokenType)
	}

	claims := new(Claims)
	t, err := jwt.ParseWithClaims(token, claims, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}

		subject, err := token.Claims.GetSubject()
		if err != nil {
			return nil, fmt.Errorf("getting subject: %w", err)
		}

		if subject != tokenType.String() {
			return nil, fmt.Errorf("unexpected subject: %v", subject)
		}

		return m.Secrets.ResolveKey(tokenType), nil
	}, jwt.WithLeeway(5*time.Second))
	if err != nil {
		return nil, fmt.Errorf("token parsing: %w", err)
	}

	if !t.Valid {
		return nil, ErrInvalidToken
	}

	return claims, nil
}

func (m *Manager) ValidateAccessToken(token string) error {
	claims, err := m.ClaimsFromToken(token, TokenTypeAccess)
	if err != nil {
		return fmt.Errorf("parsing claims: %w", err)
	}

	if err = m.ValidateClaims(claims); err != nil {
		return fmt.Errorf("validating claims: %w", err)
	}

	return nil
}

func (m *Manager) ValidateClaims(claims *Claims) error {
	return m.Validator.Validate(claims)
}

type contextKey string

const (
	ContextKeyUserID       contextKey = "userID"
	ContextKeyRefreshToken contextKey = "refreshToken"
)

// MustExtractUserID can safely be used in auth protected endpoints.
func MustExtractUserID(ctx context.Context) string {
	id, ok := ctx.Value(ContextKeyUserID).(string)
	if !ok {
		panic("user ID not found in context")
	}
	return id
}
