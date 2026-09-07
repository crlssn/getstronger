package config_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/config"
)

func TestDBPoolConfig(t *testing.T) {
	for _, name := range []string{"DB_MAX_OPEN_CONNS", "DB_MAX_IDLE_CONNS", "DB_CONN_MAX_LIFETIME"} {
		t.Setenv(name, "")
	}
	p, err := config.NewDBPool()
	require.NoError(t, err)
	require.Equal(t, 8, p.MaxOpenConns)
	require.Equal(t, 8, p.MaxIdleConns)
	require.Equal(t, 5*time.Minute, p.ConnMaxLifetime)

	t.Setenv("DB_MAX_OPEN_CONNS", "20")
	t.Setenv("DB_MAX_IDLE_CONNS", "4")
	t.Setenv("DB_CONN_MAX_LIFETIME", "90s")
	p, err = config.NewDBPool()
	require.NoError(t, err)
	require.Equal(t, 20, p.MaxOpenConns)
	require.Equal(t, 4, p.MaxIdleConns)
	require.Equal(t, 90*time.Second, p.ConnMaxLifetime)

	for _, tc := range []struct{ name, value string }{
		{"DB_MAX_OPEN_CONNS", "0"},
		{"DB_MAX_OPEN_CONNS", "-1"},
		{"DB_MAX_OPEN_CONNS", "abc"},
		{"DB_MAX_IDLE_CONNS", "0"},
		{"DB_CONN_MAX_LIFETIME", "0s"},
		{"DB_CONN_MAX_LIFETIME", "oops"},
	} {
		t.Run(tc.name+tc.value, func(t *testing.T) {
			t.Setenv(tc.name, tc.value)
			_, err := config.NewDBPool()
			require.Error(t, err)
		})
	}
}

// database/sql silently clamps the idle count to the open count, so a pool
// asked to keep more warm than it may open is a typo rather than a policy.
func TestDBPoolRejectsMoreIdleThanOpen(t *testing.T) {
	t.Setenv("DB_MAX_OPEN_CONNS", "4")
	t.Setenv("DB_MAX_IDLE_CONNS", "5")
	_, err := config.NewDBPool()
	require.Error(t, err)
}
