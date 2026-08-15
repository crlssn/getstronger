package main

import (
	"testing"

	"github.com/stretchr/testify/require"
	"go.uber.org/fx"
)

func TestWireup(t *testing.T) {
	t.Parallel()
	require.NoError(t, fx.ValidateApp(options()...))
}

func TestLoadEnvironmentAllowsMissingFile(t *testing.T) {
	t.Setenv("ENV", "production")
	t.Chdir(t.TempDir())

	require.NoError(t, loadEnvironment())
}

func TestLoadEnvironmentRequiresFileWithoutInjectedEnvironment(t *testing.T) {
	t.Setenv("ENV", "")
	t.Chdir(t.TempDir())

	require.ErrorContains(t, loadEnvironment(), "failed to load .env file")
}
