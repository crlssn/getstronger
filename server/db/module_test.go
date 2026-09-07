package db_test

import (
	"context"
	"database/sql"
	"testing"

	"github.com/stretchr/testify/require"
	"go.uber.org/fx"

	"github.com/crlssn/getstronger/server/db"
)

// The module's whole job is the lifecycle around the handle: nothing dials
// until OnStart pings, and OnStop closes. Only a real database shows both.
func TestModulePingsOnStartAndClosesOnStop(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	var handle *sql.DB
	app := fx.New(
		db.Module(),
		fx.Supply(testConfig),
		fx.Populate(&handle),
		fx.NopLogger,
	)
	require.NoError(t, app.Err())
	require.NoError(t, app.Start(ctx))
	require.NoError(t, handle.PingContext(ctx))

	require.NoError(t, app.Stop(ctx))
	require.ErrorContains(t, handle.PingContext(ctx), "database is closed")
}
