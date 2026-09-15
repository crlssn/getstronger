package db_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/config"
	"github.com/crlssn/getstronger/server/db"
)

// sql.Open does not dial, so New hands back a handle with no database behind
// it; the connection is made by the lifecycle hook that pings it.
func TestNewOpensAHandleWithoutDialing(t *testing.T) {
	t.Parallel()

	handle, err := db.New(localConfig(), &config.DBPool{MaxOpenConns: 8, MaxIdleConns: 8, ConnMaxLifetime: time.Minute})
	require.NoError(t, err)
	require.NotNil(t, handle)
	require.NoError(t, handle.Close())
}

// The open ceiling is the only pool limit sql.DB reports without a database
// behind it; module_test.go exercises the idle and lifetime limits against one.
func TestNewBoundsOpenConnections(t *testing.T) {
	t.Parallel()

	handle, err := db.New(localConfig(), &config.DBPool{MaxOpenConns: 3, MaxIdleConns: 2, ConnMaxLifetime: time.Minute})
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, handle.Close()) })

	require.Equal(t, 3, handle.Stats().MaxOpenConnections)
}

func localConfig() *config.Config {
	return &config.Config{
		Environment: config.EnvironmentLocal,
		DB: config.DB{
			Host:     "database.example.com",
			Port:     "5432",
			Name:     "getstronger",
			User:     "user",
			Password: "password",
		},
	}
}
