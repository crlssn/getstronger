package weightunit_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/weightunit"
)

func TestConversions(t *testing.T) {
	t.Parallel()

	require.InDelta(t, 100.0, weightunit.ToKilograms(100, string(weightunit.Kilograms)), 0.001)
	require.InEpsilon(t, 45.36, weightunit.ToKilograms(100, string(weightunit.Pounds)), 0.001)
	require.InEpsilon(t, 100.0, weightunit.FromKilograms(45.36, string(weightunit.Pounds)), 0.001)
}

func TestNormalizeDefaultsToKilograms(t *testing.T) {
	t.Parallel()

	require.Equal(t, weightunit.Kilograms, weightunit.Normalize(""))
	require.Equal(t, weightunit.Kilograms, weightunit.Normalize("stone"))
	require.Equal(t, weightunit.Pounds, weightunit.Normalize("lb"))
}
