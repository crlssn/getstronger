package jwt

import (
	"github.com/stretchr/testify/require"
	"testing"
	"time"
)

func TestGenerateTokens(t *testing.T) {
	userID := "123"
	now := time.Now().UTC()

	m := NewManager([]byte("access_key"), []byte("refresh_key"))

	accessToken, err := m.CreateToken(userID, TokenTypeAccess)
	require.NoError(t, err)
	require.NotEmpty(t, accessToken)

	refreshToken, err := m.CreateToken(userID, TokenTypeRefresh)
	require.NoError(t, err)
	require.NotEmpty(t, refreshToken)

	claims, err := m.ClaimsFromToken(accessToken, TokenTypeAccess)
	require.NoError(t, err)
	require.Equal(t, userID, claims.UserID)
	require.True(t, claims.ExpiresAt.After(now.Add(expiryTimeAccess-time.Second)))
	require.True(t, claims.ExpiresAt.Before(now.Add(expiryTimeAccess+time.Second)))

	claims, err = m.ClaimsFromToken(refreshToken, TokenTypeRefresh)
	require.NoError(t, err)
	require.Equal(t, userID, claims.UserID)
	require.True(t, claims.ExpiresAt.After(now.Add(expiryTimeRefresh-time.Second)))
	require.True(t, claims.ExpiresAt.Before(now.Add(expiryTimeRefresh+time.Second)))

	_, err = m.CreateToken(userID, "")
	require.Error(t, err)
	require.Equal(t, "unexpected token type: ", err.Error())

	_, err = m.ClaimsFromToken(accessToken, "")
	require.Error(t, err)
	require.Equal(t, "unexpected token type: ", err.Error())

	_, err = m.ClaimsFromToken(accessToken, TokenTypeRefresh)
	require.Error(t, err)
	require.Equal(t, "token parsing: token is unverifiable: error while executing keyfunc: unexpected subject: access_token", err.Error())

	_, err = m.ClaimsFromToken(refreshToken, TokenTypeAccess)
	require.Error(t, err)
	require.Equal(t, "token parsing: token is unverifiable: error while executing keyfunc: unexpected subject: refresh_token", err.Error())

	m2 := NewManager([]byte("access_key2"), []byte("refresh_key2"))

	_, err = m2.ClaimsFromToken(accessToken, TokenTypeAccess)
	require.Error(t, err)
	require.Equal(t, "token parsing: token signature is invalid: signature is invalid", err.Error())

	_, err = m2.ClaimsFromToken(refreshToken, TokenTypeRefresh)
	require.Error(t, err)
	require.Equal(t, "token parsing: token signature is invalid: signature is invalid", err.Error())
}
