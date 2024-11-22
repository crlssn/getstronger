package jwt

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"go.uber.org/zap"
)

type Claims struct {
	UserID string `json:"userId"`
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

const jwtLeeway = 5 * time.Second

func NewManager(accessKey, refreshKey []byte) *Manager {
	return &Manager{
		Secrets: Secrets{
			AccessKey:  accessKey,
			RefreshKey: refreshKey,
		},
		Validator: jwt.NewValidator(
			jwt.WithLeeway(jwtLeeway),
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

func (tt TokenType) ExpiryTime() time.Duration {
	switch tt {
	case TokenTypeAccess:
		return expiryTimeAccess
	case TokenTypeRefresh:
		return ExpiryTimeRefresh
	default:
		return -1
	}
}

const (
	TokenTypeAccess  TokenType = "access_token"
	TokenTypeRefresh TokenType = "refresh_token"
)

const (
	expiryTimeAccess  = 15 * time.Minute
	ExpiryTimeRefresh = 30 * 24 * time.Hour
)

var errUnexpectedTokenType = errors.New("unexpected token type")

func (m *Manager) CreateToken(userID string, tokenType TokenType) (string, error) {
	if !tokenType.Validate() {
		return "", fmt.Errorf("%w: %v", errUnexpectedTokenType, tokenType)
	}

	now := time.Now().UTC()
	claims := &Claims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(tokenType.ExpiryTime())),
			IssuedAt:  jwt.NewNumericDate(now),
			Subject:   tokenType.String(),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(m.Secrets.ResolveKey(tokenType))
	if err != nil {
		return "", fmt.Errorf("signing token: %w", err)
	}

	return tokenString, nil
}

var (
	ErrInvalidToken            = fmt.Errorf("invalid token")
	ErrUnexpectedSubject       = errors.New("unexpected subject")
	ErrUnexpectedSigningMethod = errors.New("unexpected signing method")
	ErrUnexpectedTokenType     = errors.New("unexpected token type")
)

func (m *Manager) ClaimsFromToken(token string, tokenType TokenType) (*Claims, error) {
	if !tokenType.Validate() {
		return nil, fmt.Errorf("%w: %v", ErrUnexpectedTokenType, tokenType)
	}

	claims := new(Claims)
	t, err := jwt.ParseWithClaims(token, claims, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("%w: %v", ErrUnexpectedSigningMethod, token.Header["alg"])
		}

		subject, err := token.Claims.GetSubject()
		if err != nil {
			return nil, fmt.Errorf("getting subject: %w", err)
		}

		if subject != tokenType.String() {
			return nil, fmt.Errorf("%w: %v", ErrUnexpectedSubject, subject)
		}

		return m.Secrets.ResolveKey(tokenType), nil
	}, jwt.WithLeeway(jwtLeeway))
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
	if err := m.Validator.Validate(claims); err != nil {
		return fmt.Errorf("claims validation: %w", err)
	}
	return nil
}
