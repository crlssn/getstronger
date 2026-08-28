package db_test

import (
	"context"
	"database/sql"
	"net/url"
	"testing"

	"github.com/stretchr/testify/require"
	"go.uber.org/fx"

	"github.com/crlssn/getstronger/server/config"
	"github.com/crlssn/getstronger/server/db"
	"github.com/crlssn/getstronger/server/testing/container"
)

// The module's whole job is the lifecycle around the handle: nothing dials
// until OnStart pings, and OnStop closes. Only a real database shows both.
func TestModulePingsOnStartAndClosesOnStop(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	c := container.NewContainer(ctx)
	t.Cleanup(func() {
		require.NoError(t, c.Terminate(ctx))
	})

	parsed, err := url.Parse(c.Connection)
	require.NoError(t, err)

	cfg := new(config.Config)
	cfg.Environment = config.EnvironmentLocal
	cfg.DB.Host = parsed.Hostname()
	cfg.DB.Port = parsed.Port()
	cfg.DB.Name = "test-db"
	cfg.DB.User = "postgres"
	cfg.DB.Password = "postgres"

	var handle *sql.DB
	app := fx.New(
		db.Module(),
		fx.Supply(cfg),
		fx.Populate(&handle),
		fx.NopLogger,
	)
	require.NoError(t, app.Err())
	require.NoError(t, app.Start(ctx))
	require.NoError(t, handle.PingContext(ctx))

	require.NoError(t, app.Stop(ctx))
	require.ErrorContains(t, handle.PingContext(ctx), "database is closed")
}
