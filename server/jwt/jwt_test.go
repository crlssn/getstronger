package jwt_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/jwt"
)

func TestGenerateTokens(t *testing.T) {
	t.Parallel()
	userID := "123"
	now := time.Now().UTC()

	m := jwt.NewManager([]byte("access_key"), []byte("refresh_key"))

	accessToken := m.MustCreateToken(userID, jwt.TokenTypeAccess)
	require.NotEmpty(t, accessToken)

	refreshToken := m.MustCreateToken(userID, jwt.TokenTypeRefresh)
	require.NotEmpty(t, refreshToken)

	claims, err := m.ClaimsFromToken(accessToken, jwt.TokenTypeAccess)
	require.NoError(t, err)
	require.Equal(t, userID, claims.UserID)
	require.True(t, claims.ExpiresAt.After(now.Add(jwt.ExpiryTimeAccess-time.Second)))
	require.True(t, claims.ExpiresAt.Before(now.Add(jwt.ExpiryTimeAccess+time.Second)))

	claims, err = m.ClaimsFromToken(refreshToken, jwt.TokenTypeRefresh)
	require.NoError(t, err)
	require.Equal(t, userID, claims.UserID)
	require.True(t, claims.ExpiresAt.After(now.Add(jwt.ExpiryTimeRefresh-time.Second)))
	require.True(t, claims.ExpiresAt.Before(now.Add(jwt.ExpiryTimeRefresh+time.Second)))

	_, err = m.CreateToken(userID, "")
	require.Error(t, err)
	require.Equal(t, "unexpected token type: ", err.Error())

	_, err = m.ClaimsFromToken(accessToken, "")
	require.Error(t, err)
	require.Equal(t, "unexpected token type: ", err.Error())

	_, err = m.ClaimsFromToken(accessToken, jwt.TokenTypeRefresh)
	require.Error(t, err)
	require.Equal(t, "token parsing: token is unverifiable: error while executing keyfunc: unexpected subject: access_token", err.Error())

	_, err = m.ClaimsFromToken(refreshToken, jwt.TokenTypeAccess)
	require.Error(t, err)
	require.Equal(t, "token parsing: token is unverifiable: error while executing keyfunc: unexpected subject: refresh_token", err.Error())

	m = jwt.NewManager([]byte("access_key2"), []byte("refresh_key2"))

	_, err = m.ClaimsFromToken(accessToken, jwt.TokenTypeAccess)
	require.Error(t, err)
	require.Equal(t, "token parsing: token signature is invalid: signature is invalid", err.Error())

	_, err = m.ClaimsFromToken(refreshToken, jwt.TokenTypeRefresh)
	require.Error(t, err)
	require.Equal(t, "token parsing: token signature is invalid: signature is invalid", err.Error())
}
