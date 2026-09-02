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

// Tonnage is weight times reps, both of which arrive from the client unbounded,
// so the volume reaching the 32-bit intensity field can be any float64 at all.
// Go leaves an out-of-range float conversion to the platform, which on amd64
// hands back the most negative int32 — a mistyped weight would report a session
// as -2147483648.
func TestInt32FromFloat64ClampsToTheRange(t *testing.T) {
	t.Parallel()
	require.Equal(t, int32(math.MaxInt32), safe.Int32FromFloat64(math.MaxInt32+1))
	require.Equal(t, int32(math.MinInt32), safe.Int32FromFloat64(math.MinInt32-1))
	require.Equal(t, int32(math.MaxInt32), safe.Int32FromFloat64(1e6*3000))
	require.Equal(t, int32(math.MaxInt32), safe.Int32FromFloat64(math.Inf(1)))
	require.Equal(t, int32(math.MinInt32), safe.Int32FromFloat64(math.Inf(-1)))

	// The rounding must not push a value that fits over the edge either.
	require.Equal(t, int32(math.MaxInt32), safe.Int32FromFloat64(math.MaxInt32))
	require.Equal(t, int32(math.MinInt32), safe.Int32FromFloat64(math.MinInt32))
}

// A number that is not a number is no measurement at all, so it reports none
// rather than whatever the platform makes of the conversion.
func TestInt32FromFloat64ReadsNaNAsZero(t *testing.T) {
	t.Parallel()
	require.Equal(t, int32(0), safe.Int32FromFloat64(math.NaN()))
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

// A lifetime total is counted as an int64 and reported in a 32-bit field.
func TestInt32FromInt64ClampsToTheRange(t *testing.T) {
	t.Parallel()

	require.Equal(t, int32(math.MaxInt32), safe.Int32FromInt64(math.MaxInt32+1))
	require.Equal(t, int32(math.MinInt32), safe.Int32FromInt64(math.MinInt32-1))
	require.Equal(t, int32(math.MaxInt32), safe.Int32FromInt64(math.MaxInt32))
	require.Equal(t, int32(math.MinInt32), safe.Int32FromInt64(math.MinInt32))
	require.Equal(t, int32(42), safe.Int32FromInt64(42))
}
