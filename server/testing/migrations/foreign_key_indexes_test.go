package migrations_test

import (
	"context"
	"testing"

	_ "github.com/jackc/pgx/v5/stdlib" // Register pgx driver
	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/testing/container"
)

// unindexedForeignKeys names every foreign key whose own columns are not the
// leading columns of some index on its table. Postgres indexes the referenced
// side of a reference automatically and the referencing side never, so this
// finds the side a cascading delete travels: without an index it reads the
// whole child table once per parent row deleted.
//
// The comparison is a set equality between the constraint's columns and the
// same number of leading index columns, which is what makes a wider index
// count and a differently ordered one not. A partial index does not count at
// all: it holds only the rows its predicate admits, and a cascade has to find
// the others too. plans hid behind exactly that — a unique user_id index
// WHERE active, which no lookup for a paused plan can use.
const unindexedForeignKeys = `
SELECT t.relname || '.' || c.conname
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE c.contype = 'f'
  AND n.nspname = 'public'
  AND NOT EXISTS (
    SELECT 1
    FROM pg_index i
    WHERE i.indrelid = c.conrelid
      AND i.indpred IS NULL
      AND i.indisvalid
      AND (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] @> c.conkey
      AND (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] <@ c.conkey
  )
ORDER BY 1`

// TestForeignKeysAreIndexed holds the schema to the rule that every foreign key
// is backed by an index. A new reference without one is cheap to add and only
// shows up later, as a delete that scans a table it never named.
func TestForeignKeysAreIndexed(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	c := container.NewContainer(ctx)
	t.Cleanup(func() { require.NoError(t, c.Terminate(ctx)) })

	rows, err := c.DB.QueryContext(ctx, unindexedForeignKeys)
	require.NoError(t, err)
	defer func() { require.NoError(t, rows.Close()) }()

	var unindexed []string
	for rows.Next() {
		var name string
		require.NoError(t, rows.Scan(&name))
		unindexed = append(unindexed, name)
	}
	require.NoError(t, rows.Err())

	require.Empty(t, unindexed, "foreign keys without a supporting index")
}
