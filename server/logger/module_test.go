package logger_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
	"go.uber.org/fx"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/logger"
)

// The module provides the config and the logger built from it, so the only way
// to see either is to let fx build the graph.
func TestModuleProvidesAProductionLogger(t *testing.T) {
	t.Parallel()

	var (
		built  *zap.Logger
		config zap.Config
	)

	app := fx.New(
		logger.Module(),
		fx.Populate(&built, &config),
		fx.NopLogger,
	)
	require.NoError(t, app.Err())
	require.NoError(t, app.Start(context.Background()))
	t.Cleanup(func() {
		require.NoError(t, app.Stop(context.Background()))
	})

	require.NotNil(t, built)
	require.Equal(t, "json", config.Encoding)
	require.False(t, config.Development)
	require.Equal(t, zap.InfoLevel, config.Level.Level())
}
