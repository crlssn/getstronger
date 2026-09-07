package db_test

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/config"
	"github.com/crlssn/getstronger/server/db"
)

// sql.DB reports the idle and lifetime limits only as counts of the connections
// they closed, so only a real database shows either one taking effect.
func TestNewBoundsIdleConnections(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	handle, err := db.New(testConfig, &config.DBPool{MaxOpenConns: 3, MaxIdleConns: 1, ConnMaxLifetime: time.Hour})
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, handle.Close()) })

	conns := make([]*sql.Conn, 0, 3)
	for range 3 {
		conn, errConn := handle.Conn(ctx)
		require.NoError(t, errConn)
		conns = append(conns, conn)
	}
	for _, conn := range conns {
		require.NoError(t, conn.Close())
	}

	require.Equal(t, 1, handle.Stats().Idle)
	require.EqualValues(t, 2, handle.Stats().MaxIdleClosed)
}

func TestNewBoundsConnectionLifetime(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	lifetime := 50 * time.Millisecond
	handle, err := db.New(testConfig, &config.DBPool{MaxOpenConns: 2, MaxIdleConns: 2, ConnMaxLifetime: lifetime})
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, handle.Close()) })

	require.NoError(t, handle.PingContext(ctx))
	time.Sleep(2 * lifetime)
	require.NoError(t, handle.PingContext(ctx))

	require.Positive(t, handle.Stats().MaxLifetimeClosed)
}
