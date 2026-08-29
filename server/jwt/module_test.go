package jwt_test

import (
	"testing"

	"github.com/stretchr/testify/require"
	"go.uber.org/fx"

	"github.com/crlssn/getstronger/server/config"
	"github.com/crlssn/getstronger/server/jwt"
)

func TestModuleRejectsUnusableSigningKeys(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		accessKey  string
		refreshKey string
		expected   error
	}{
		{
			name:       "both keys set",
			accessKey:  "access-key",
			refreshKey: "refresh-key",
		},
		{
			name:       "access key unset",
			refreshKey: "refresh-key",
			expected:   jwt.ErrMissingSigningKey,
		},
		{
			name:      "refresh key unset",
			accessKey: "access-key",
			expected:  jwt.ErrMissingSigningKey,
		},
		{
			name:     "both keys unset",
			expected: jwt.ErrMissingSigningKey,
		},
		{
			name:       "one key serving both",
			accessKey:  "same-key",
			refreshKey: "same-key",
			expected:   jwt.ErrSharedSigningKey,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			c := &config.Config{JWT: config.JWT{
				AccessTokenKey:  test.accessKey,
				RefreshTokenKey: test.refreshKey,
			}}

			var issuer *jwt.Issuer
			err := fx.New(
				jwt.Module(),
				fx.Supply(c),
				fx.Populate(&issuer),
				fx.NopLogger,
			).Err()

			if test.expected != nil {
				require.ErrorIs(t, err, test.expected)
				require.Nil(t, issuer)
				return
			}

			require.NoError(t, err)
			require.NotNil(t, issuer)
		})
	}
}
