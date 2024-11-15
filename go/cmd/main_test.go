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
