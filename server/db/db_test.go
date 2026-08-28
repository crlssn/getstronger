package db

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/config"
)

func TestConnectionSSLMode(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		environment config.Environment
		sslMode     string
	}{
		{
			name:        "production requires TLS",
			environment: "production",
			sslMode:     "require",
		},
		{
			name:        "local disables TLS",
			environment: config.EnvironmentLocal,
			sslMode:     "disable",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			c := &config.Config{
				Environment: tt.environment,
				DB: config.DB{
					Host:     "database.example.com",
					Port:     "5432",
					Name:     "getstronger",
					User:     "user",
					Password: "password",
				},
			}

			require.Equal(
				t,
				"postgresql://user:password@database.example.com:5432/getstronger?sslmode="+tt.sslMode,
				connection(c),
			)
		})
	}
}

// sql.Open does not dial, so New hands back a handle with no database behind
// it; the connection is made by the lifecycle hook that pings it.
func TestNewOpensAHandleWithoutDialing(t *testing.T) {
	t.Parallel()

	handle, err := New(&config.Config{
		Environment: config.EnvironmentLocal,
		DB: config.DB{
			Host:     "database.example.com",
			Port:     "5432",
			Name:     "getstronger",
			User:     "user",
			Password: "password",
		},
	})
	require.NoError(t, err)
	require.NotNil(t, handle)
	require.NoError(t, handle.Close())
}
