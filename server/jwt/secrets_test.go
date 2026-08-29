package jwt_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/jwt"
)

func TestSecretsValidate(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		secrets  jwt.Secrets
		expected error
	}{
		{
			name:    "two distinct keys",
			secrets: jwt.Secrets{AccessKey: []byte("access_key"), RefreshKey: []byte("refresh_key")},
		},
		{
			name:     "no access key",
			secrets:  jwt.Secrets{RefreshKey: []byte("refresh_key")},
			expected: jwt.ErrMissingSigningKey,
		},
		{
			name:     "no refresh key",
			secrets:  jwt.Secrets{AccessKey: []byte("access_key")},
			expected: jwt.ErrMissingSigningKey,
		},
		{
			name:     "empty rather than absent",
			secrets:  jwt.Secrets{AccessKey: []byte(""), RefreshKey: []byte("refresh_key")},
			expected: jwt.ErrMissingSigningKey,
		},
		{
			name:     "one key serving both",
			secrets:  jwt.Secrets{AccessKey: []byte("key"), RefreshKey: []byte("key")},
			expected: jwt.ErrSharedSigningKey,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			err := test.secrets.Validate()
			if test.expected != nil {
				require.ErrorIs(t, err, test.expected)
				return
			}

			require.NoError(t, err)
		})
	}
}

// A key that is missing resolves to nothing, and HS256 signs happily with
// nothing: the token below verifies against an unset key, which is what makes
// booting without one a forgeable session for every account.
func TestAnUnsetKeySignsAndVerifiesAnyway(t *testing.T) {
	t.Parallel()

	issuer := jwt.NewIssuer(nil, []byte("refresh_key"))

	token, err := issuer.CreateToken("123", jwt.TokenTypeAccess)
	require.NoError(t, err)

	claims, err := issuer.ClaimsFromToken(token, jwt.TokenTypeAccess)
	require.NoError(t, err)
	require.Equal(t, "123", claims.UserID)
}
