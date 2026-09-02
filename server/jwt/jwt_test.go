package jwt_test

import (
	"testing"
	"time"

	"github.com/gofrs/uuid/v5"
	jwtlib "github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/jwt"
)

func TestGenerateTokens(t *testing.T) {
	t.Parallel()
	userID := uuid.Must(uuid.NewV4())
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
		issuer.MustCreateToken(uuid.Must(uuid.NewV4()), jwt.TokenType("session_token"))
	})
}

func TestValidateClaimsRejectsAnExpiredToken(t *testing.T) {
	t.Parallel()
	issuer := jwt.NewIssuer([]byte("access_key"), []byte("refresh_key"))

	expired := &jwt.Claims{
		UserID: uuid.Must(uuid.NewV4()),
		RegisteredClaims: jwtlib.RegisteredClaims{
			ExpiresAt: jwtlib.NewNumericDate(time.Now().UTC().Add(-jwt.ExpiryTimeAccess)),
			IssuedAt:  jwtlib.NewNumericDate(time.Now().UTC().Add(-2 * jwt.ExpiryTimeAccess)),
			Subject:   jwt.TokenTypeAccess.String(),
		},
	}
	require.Error(t, issuer.ValidateClaims(expired))

	live := &jwt.Claims{
		UserID: uuid.Must(uuid.NewV4()),
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
		UserID: uuid.Must(uuid.NewV4()),
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

// The identity a token carries is a row's primary key, so a claim that is not
// one names no account. Letting it through hands every layer below a string it
// cannot use, and the store would read it as the zero UUID.
func TestClaimsFromTokenRejectsANonUUIDUserID(t *testing.T) {
	t.Parallel()
	issuer := jwt.NewIssuer([]byte("access_key"), []byte("refresh_key"))

	for _, claim := range []any{"123", ""} {
		token, err := jwtlib.NewWithClaims(jwtlib.SigningMethodHS256, jwtlib.MapClaims{
			"userId": claim,
			"sub":    jwt.TokenTypeAccess.String(),
			"exp":    time.Now().UTC().Add(jwt.ExpiryTimeAccess).Unix(),
		}).SignedString([]byte("access_key"))
		require.NoError(t, err)

		_, err = issuer.ClaimsFromToken(token, jwt.TokenTypeAccess)
		require.Error(t, err)
	}
}

// A token with no identity at all reads as the zero UUID rather than as an
// absent one, so the absence has to be rejected by name.
func TestClaimsFromTokenRejectsAMissingUserID(t *testing.T) {
	t.Parallel()
	issuer := jwt.NewIssuer([]byte("access_key"), []byte("refresh_key"))

	token, err := jwtlib.NewWithClaims(jwtlib.SigningMethodHS256, jwtlib.MapClaims{
		"sub": jwt.TokenTypeAccess.String(),
		"exp": time.Now().UTC().Add(jwt.ExpiryTimeAccess).Unix(),
	}).SignedString([]byte("access_key"))
	require.NoError(t, err)

	_, err = issuer.ClaimsFromToken(token, jwt.TokenTypeAccess)
	require.ErrorIs(t, err, jwt.ErrMissingUserID)
}
