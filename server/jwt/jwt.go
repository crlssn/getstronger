package jwt

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type Claims struct {
	jwt.RegisteredClaims

	UserID string `json:"userId"`
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

// Issuer signs the access and refresh tokens this server hands out, and reads
// back the ones presented to it. It is the only thing that holds the signing
// keys, and the only thing that says whether a token is still good.
type Issuer struct {
	Secrets   Secrets
	validator *jwt.Validator
}

// jwtLeeway forgives a little clock skew between the signer and the reader.
const jwtLeeway = 5 * time.Second

func NewIssuer(accessKey, refreshKey []byte) *Issuer {
	return &Issuer{
		Secrets: Secrets{
			AccessKey:  accessKey,
			RefreshKey: refreshKey,
		},
		validator: jwt.NewValidator(
			jwt.WithLeeway(jwtLeeway),
		),
	}
}

// ValidateClaims reports whether claims are still within the window they were
// issued for.
func (i *Issuer) ValidateClaims(claims *Claims) error {
	if err := i.validator.Validate(claims); err != nil {
		return fmt.Errorf("claims validate: %w", err)
	}

	return nil
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
		return ExpiryTimeAccess
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
	ExpiryTimeAccess  = 15 * time.Minute
	ExpiryTimeRefresh = 30 * 24 * time.Hour
)

var errUnexpectedTokenType = errors.New("unexpected token type")

func (i *Issuer) CreateToken(userID string, tokenType TokenType) (string, error) {
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
	tokenString, err := token.SignedString(i.Secrets.ResolveKey(tokenType))
	if err != nil {
		return "", fmt.Errorf("signing token: %w", err)
	}

	return tokenString, nil
}

func (i *Issuer) MustCreateToken(userID string, tokenType TokenType) string {
	token, err := i.CreateToken(userID, tokenType)
	if err != nil {
		panic(err)
	}

	return token
}

var (
	ErrInvalidToken            = fmt.Errorf("invalid token")
	ErrUnexpectedSubject       = errors.New("unexpected subject")
	ErrUnexpectedSigningMethod = errors.New("unexpected signing method")
	ErrUnexpectedTokenType     = errors.New("unexpected token type")
)

func (i *Issuer) ClaimsFromToken(token string, tokenType TokenType) (*Claims, error) {
	if !tokenType.Validate() {
		return nil, fmt.Errorf("%w: %v", ErrUnexpectedTokenType, tokenType)
	}

	claims := new(Claims)
	t, err := jwt.ParseWithClaims(token, claims, func(token *jwt.Token) (any, error) {
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

		return i.Secrets.ResolveKey(tokenType), nil
	}, jwt.WithLeeway(jwtLeeway))
	if err != nil {
		return nil, fmt.Errorf("token parsing: %w", err)
	}

	if !t.Valid {
		return nil, ErrInvalidToken
	}

	return claims, nil
}
