package jwt_test

import (
	"testing"
	"time"

	jwtlib "github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/jwt"
)

func TestGenerateTokens(t *testing.T) {
	t.Parallel()
	userID := "123"
	now := time.Now().UTC()

	m := jwt.NewIssuer([]byte("access_key"), []byte("refresh_key"))

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

	m = jwt.NewIssuer([]byte("access_key2"), []byte("refresh_key2"))

	_, err = m.ClaimsFromToken(accessToken, jwt.TokenTypeAccess)
	require.Error(t, err)
	require.Equal(t, "token parsing: token signature is invalid: signature is invalid", err.Error())

	_, err = m.ClaimsFromToken(refreshToken, jwt.TokenTypeRefresh)
	require.Error(t, err)
	require.Equal(t, "token parsing: token signature is invalid: signature is invalid", err.Error())
}

// A type that is neither of the two is not signed with a fallback key and does
// not get a fallback lifetime: both answer with a value nothing can use.
func TestUnknownTokenTypeResolvesToNothing(t *testing.T) {
	t.Parallel()
	unknown := jwt.TokenType("session_token")

	require.False(t, unknown.Validate())
	require.Equal(t, time.Duration(-1), unknown.ExpiryTime())

	secrets := jwt.Secrets{AccessKey: []byte("access_key"), RefreshKey: []byte("refresh_key")}
	require.Nil(t, secrets.ResolveKey(unknown))
	require.Equal(t, secrets.AccessKey, secrets.ResolveKey(jwt.TokenTypeAccess))
	require.Equal(t, secrets.RefreshKey, secrets.ResolveKey(jwt.TokenTypeRefresh))
}

func TestMustCreateTokenPanicsOnAnUnknownType(t *testing.T) {
	t.Parallel()
	issuer := jwt.NewIssuer([]byte("access_key"), []byte("refresh_key"))

	require.Panics(t, func() {
		issuer.MustCreateToken("123", jwt.TokenType("session_token"))
	})
}

func TestValidateClaimsRejectsAnExpiredToken(t *testing.T) {
	t.Parallel()
	issuer := jwt.NewIssuer([]byte("access_key"), []byte("refresh_key"))

	expired := &jwt.Claims{
		UserID: "123",
		RegisteredClaims: jwtlib.RegisteredClaims{
			ExpiresAt: jwtlib.NewNumericDate(time.Now().UTC().Add(-jwt.ExpiryTimeAccess)),
			IssuedAt:  jwtlib.NewNumericDate(time.Now().UTC().Add(-2 * jwt.ExpiryTimeAccess)),
			Subject:   jwt.TokenTypeAccess.String(),
		},
	}
	require.Error(t, issuer.ValidateClaims(expired))

	live := &jwt.Claims{
		UserID: "123",
		RegisteredClaims: jwtlib.RegisteredClaims{
			ExpiresAt: jwtlib.NewNumericDate(time.Now().UTC().Add(jwt.ExpiryTimeAccess)),
			IssuedAt:  jwtlib.NewNumericDate(time.Now().UTC()),
			Subject:   jwt.TokenTypeAccess.String(),
		},
	}
	require.NoError(t, issuer.ValidateClaims(live))
}

// A token signed with something other than HMAC is refused by the key function
// before its signature is ever checked.
func TestClaimsFromTokenRejectsAnUnexpectedSigningMethod(t *testing.T) {
	t.Parallel()
	issuer := jwt.NewIssuer([]byte("access_key"), []byte("refresh_key"))

	unsigned, err := jwtlib.NewWithClaims(jwtlib.SigningMethodNone, &jwt.Claims{
		UserID: "123",
		RegisteredClaims: jwtlib.RegisteredClaims{
			ExpiresAt: jwtlib.NewNumericDate(time.Now().UTC().Add(jwt.ExpiryTimeAccess)),
			Subject:   jwt.TokenTypeAccess.String(),
		},
	}).SignedString(jwtlib.UnsafeAllowNoneSignatureType)
	require.NoError(t, err)

	_, err = issuer.ClaimsFromToken(unsigned, jwt.TokenTypeAccess)
	require.ErrorContains(t, err, "unexpected signing method")
}

// A token carrying no subject cannot say which key it was signed with.
func TestClaimsFromTokenRejectsATokenWithoutASubject(t *testing.T) {
	t.Parallel()
	issuer := jwt.NewIssuer([]byte("access_key"), []byte("refresh_key"))

	subjectless, err := jwtlib.NewWithClaims(jwtlib.SigningMethodHS256, jwtlib.MapClaims{
		"userId": "123",
		"exp":    time.Now().UTC().Add(jwt.ExpiryTimeAccess).Unix(),
	}).SignedString([]byte("access_key"))
	require.NoError(t, err)

	_, err = issuer.ClaimsFromToken(subjectless, jwt.TokenTypeAccess)
	require.Error(t, err)
}
