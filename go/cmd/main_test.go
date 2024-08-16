package main

import (
	"github.com/stretchr/testify/require"
	"go.uber.org/fx"
	"testing"
)

func TestWireup(t *testing.T) {
	require.NoError(t, fx.ValidateApp(options()...))
}
