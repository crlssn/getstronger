package distanceunit_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/distanceunit"
)

func TestConversions(t *testing.T) {
	t.Parallel()

	require.InDelta(t, 10.0, distanceunit.ToKilometers(10, string(distanceunit.Kilometers)), 0.001)
	require.InEpsilon(t, 16.09, distanceunit.ToKilometers(10, string(distanceunit.Miles)), 0.001)
	require.InEpsilon(t, 10.0, distanceunit.FromKilometers(16.09, string(distanceunit.Miles)), 0.001)
}

func TestNormalizeDefaultsToKilometers(t *testing.T) {
	t.Parallel()

	require.Equal(t, distanceunit.Kilometers, distanceunit.Normalize(""))
	require.Equal(t, distanceunit.Kilometers, distanceunit.Normalize("yd"))
	require.Equal(t, distanceunit.Miles, distanceunit.Normalize("mi"))
}
