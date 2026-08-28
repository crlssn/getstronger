package safe_test

import (
	"math"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/safe"
)

func TestIntFromFloat64(t *testing.T) {
	t.Parallel()
	require.Equal(t, int32(1), safe.Int32FromFloat64(0.5))
	require.Equal(t, int32(0), safe.Int32FromFloat64(0.25))
	require.Equal(t, int32(0), safe.Int32FromFloat64(-0.25))
	require.Equal(t, int32(-1), safe.Int32FromFloat64(-0.5))
	require.Equal(t, int32(100), safe.Int32FromFloat64(99.99999))
	require.Equal(t, int32(-1), safe.Int32FromFloat64(-1.23456789))
}

// The response fields are 32-bit, so a value that does not fit is clamped
// rather than wrapped: a silent wrap would report a huge count as a negative.
func TestInt32FromIntClampsToTheRange(t *testing.T) {
	t.Parallel()
	require.Equal(t, int32(math.MaxInt32), safe.Int32FromInt(math.MaxInt32+1))
	require.Equal(t, int32(math.MinInt32), safe.Int32FromInt(math.MinInt32-1))
	require.Equal(t, int32(math.MaxInt32), safe.Int32FromInt(math.MaxInt32))
	require.Equal(t, int32(math.MinInt32), safe.Int32FromInt(math.MinInt32))
	require.Equal(t, int32(42), safe.Int32FromInt(42))
}
