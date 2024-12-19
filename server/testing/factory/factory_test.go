package factory_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/testing/factory"
)

func TestUUID(t *testing.T) {
	t.Parallel()

	require.Equal(t, "00000000-0000-0000-0000-000000000000", factory.UUID(0))
	require.Equal(t, "11111111-1111-1111-1111-111111111111", factory.UUID(1))
}
