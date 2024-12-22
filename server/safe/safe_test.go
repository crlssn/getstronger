package safe_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/safe"
)

func TestIntFromFloat64(t *testing.T) {
	require.Equal(t, int32(1), safe.Int32FromFloat64(0.5))
	require.Equal(t, int32(0), safe.Int32FromFloat64(0.25))
	require.Equal(t, int32(0), safe.Int32FromFloat64(-0.25))
	require.Equal(t, int32(-1), safe.Int32FromFloat64(-0.5))
	require.Equal(t, int32(100), safe.Int32FromFloat64(99.99999))
	require.Equal(t, int32(-1), safe.Int32FromFloat64(-1.23456789))
}
