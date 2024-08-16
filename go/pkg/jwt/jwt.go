package jwt

import (
	"fmt"
	"github.com/golang-jwt/jwt/v5"
	"time"
)

type Claims struct {
	UserID string `json:"user_id"`
	jwt.RegisteredClaims
}

type Tokens struct {
	Access  string
	Refresh string
}

var accessSecret = []byte("very-secret-access-key")
var refreshSecret = []byte("very-secret-refresh-key")

func GenerateTokens(userID string) (*Tokens, error) {
	accessClaims := &Claims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(15 * time.Minute)),
		},
	}

	accessToken := jwt.NewWithClaims(jwt.SigningMethodHS256, accessClaims)
	accessTokenString, err := accessToken.SignedString(accessSecret)
	if err != nil {
		return nil, fmt.Errorf("access token signing: %w", err)
	}

	refreshClaims := &Claims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(7 * 24 * time.Hour)),
		},
	}

	refreshToken := jwt.NewWithClaims(jwt.SigningMethodHS256, refreshClaims)
	refreshTokenString, err := refreshToken.SignedString(refreshSecret)
	if err != nil {
		return nil, fmt.Errorf("refresh token signing: %w", err)
	}

	return &Tokens{
		Access:  accessTokenString,
		Refresh: refreshTokenString,
	}, nil
}

var ErrInvalidToken = fmt.Errorf("invalid token")

func ValidateToken(tokenString string, secret []byte) (*Claims, error) {
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
	})
	if err != nil {
		return nil, fmt.Errorf("token parsing: %w", err)
	}

	if !token.Valid {
		return nil, ErrInvalidToken
	}

	return claims, nil
}
