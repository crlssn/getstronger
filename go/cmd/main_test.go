package main

import (
	"testing"

	"github.com/stretchr/testify/require"
	"go.uber.org/fx"
)

func TestWireup(t *testing.T) {
	require.NoError(t, fx.ValidateApp(options()...))
}
