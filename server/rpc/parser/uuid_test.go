package parser_test

import (
	"testing"

	"github.com/gofrs/uuid/v5"
	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/rpc/parser"
)

func TestUUIDReadsARowID(t *testing.T) {
	t.Parallel()

	id := uuid.Must(uuid.NewV4())

	parsed, err := parser.UUID(id.String())
	require.NoError(t, err)
	require.Equal(t, id, parsed)
}

// A field the schema forgot to constrain must not read as the nil UUID: that
// names no row, and every read for it would come back empty rather than wrong.
func TestUUIDRejectsWhatIsNotARowID(t *testing.T) {
	t.Parallel()

	for _, value := range []string{"", "123", "not-a-uuid"} {
		parsed, err := parser.UUID(value)
		require.ErrorIs(t, err, parser.ErrNotAUUID)
		require.True(t, parsed.IsNil())
	}
}

func TestUUIDsRejectsTheWholeFieldForOneBadValue(t *testing.T) {
	t.Parallel()

	first := uuid.Must(uuid.NewV4())
	second := uuid.Must(uuid.NewV4())

	parsed, err := parser.UUIDs([]string{first.String(), second.String()})
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{first, second}, parsed)

	_, err = parser.UUIDs([]string{first.String(), "123"})
	require.ErrorIs(t, err, parser.ErrNotAUUID)
}

// An optional reference says nothing by being empty, which is not the same as
// saying something unreadable.
func TestOptionalUUIDReadsAnAbsentFieldAsNoRow(t *testing.T) {
	t.Parallel()

	parsed, err := parser.OptionalUUID("")
	require.NoError(t, err)
	require.True(t, parsed.IsNil())

	_, err = parser.OptionalUUID("123")
	require.Error(t, err)
}
