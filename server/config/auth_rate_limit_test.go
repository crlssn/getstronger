package config_test

import (
	"testing"
	"time"

	"github.com/crlssn/getstronger/server/config"
	"github.com/stretchr/testify/require"
)

func TestAuthRateLimitConfig(t *testing.T) {
	for _, name := range []string{"AUTH_RATE_SOURCE_ATTEMPTS", "AUTH_RATE_ACCOUNT_ATTEMPTS", "AUTH_RATE_SOURCE_WINDOW", "AUTH_RATE_ACCOUNT_WINDOW", "AUTH_RATE_TRUSTED_PROXIES"} {
		t.Setenv(name, "")
	}
	c, err := config.NewAuthRateLimit()
	require.NoError(t, err)
	require.Equal(t, 120, c.SourceAttempts)
	require.Equal(t, 10, c.AccountAttempts)
	require.Equal(t, 15*time.Minute, c.AccountWindow)
	require.Empty(t, c.TrustedProxies)
	t.Setenv("AUTH_RATE_SOURCE_ATTEMPTS", "2")
	t.Setenv("AUTH_RATE_ACCOUNT_WINDOW", "30s")
	t.Setenv("AUTH_RATE_TRUSTED_PROXIES", "10.0.0.0/24, ::1/128")
	c, err = config.NewAuthRateLimit()
	require.NoError(t, err)
	require.Equal(t, 2, c.SourceAttempts)
	require.Equal(t, 30*time.Second, c.AccountWindow)
	require.Len(t, c.TrustedProxies, 2)
	for _, tc := range []struct{ name, value string }{
		{"AUTH_RATE_SOURCE_ATTEMPTS", "0"},
		{"AUTH_RATE_ACCOUNT_ATTEMPTS", "-1"},
		{"AUTH_RATE_SOURCE_ATTEMPTS", "abc"},
		{"AUTH_RATE_SOURCE_WINDOW", "0s"},
		{"AUTH_RATE_ACCOUNT_WINDOW", "oops"},
		{"AUTH_RATE_TRUSTED_PROXIES", "not-a-network"},
	} {
		t.Run(tc.name+tc.value, func(t *testing.T) {
			t.Setenv(tc.name, tc.value)
			_, err := config.NewAuthRateLimit()
			require.Error(t, err)
		})
	}
}
