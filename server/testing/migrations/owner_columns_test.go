package migrations_test

import (
	"context"
	"testing"

	_ "github.com/jackc/pgx/v5/stdlib" // Register pgx driver
	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/testing/container"
)

// unreferencedOwnerColumns names every user_id column that does not carry a
// foreign key to the user it names. Ownership is what account deletion walks
// and what every read is scoped by, so a column holding an owner that the
// database will not vouch for is one the application alone keeps honest.
const unreferencedOwnerColumns = `
SELECT t.relname || '.' || a.attname
FROM pg_attribute a
JOIN pg_class t ON t.oid = a.attrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relkind = 'r'
  AND a.attname = 'user_id'
  AND a.attnum > 0
  AND NOT a.attisdropped
  AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = t.oid
      AND c.contype = 'f'
      AND a.attnum = ANY (c.conkey)
  )
ORDER BY 1`

// TestOwnerColumnsReferenceTheirOwner holds the schema to the rule that a row
// naming the athlete it belongs to says so with a foreign key. Every other
// owner column has carried one since account deletion became a cascade; a
// column that does not is invisible to that cascade and to the rule that every
// foreign key is indexed, so it is the one place a set can name nobody.
func TestOwnerColumnsReferenceTheirOwner(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	c := container.NewContainer(ctx)
	t.Cleanup(func() { require.NoError(t, c.Terminate(ctx)) })

	rows, err := c.DB.QueryContext(ctx, unreferencedOwnerColumns)
	require.NoError(t, err)
	defer func() { _ = rows.Close() }()

	var unreferenced []string
	for rows.Next() {
		var name string
		require.NoError(t, rows.Scan(&name))
		unreferenced = append(unreferenced, name)
	}
	require.NoError(t, rows.Err())

	require.Empty(t, unreferenced, "owner columns without a reference to their owner")
}
