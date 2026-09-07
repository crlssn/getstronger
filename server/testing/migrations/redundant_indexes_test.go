package migrations_test

import (
	"context"
	"testing"

	_ "github.com/jackc/pgx/v5/stdlib" // Register pgx driver
	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/testing/container"
)

// duplicatedIndexes names every index whose key columns are the leading
// columns of a wider index on the same table. A lookup the narrow one answers
// the wide one answers too, from the same first columns in the same order, so
// the narrow one only costs a write per row and a page of cache.
//
// Only a non-unique index can be redundant this way: a unique one on fewer
// columns forbids duplicates the wider one allows, which is a rule rather than
// a lookup. Partial and expression indexes are left out of both sides — the
// first holds only the rows its predicate admits, and the second is not a
// prefix of anything in column terms.
const duplicatedIndexes = `
SELECT t.relname || '.' || narrow.relname || ' is covered by ' || wide.relname
FROM pg_index n
JOIN pg_class narrow ON narrow.oid = n.indexrelid
JOIN pg_class t ON t.oid = n.indrelid
JOIN pg_namespace ns ON ns.oid = t.relnamespace
JOIN pg_index w ON w.indrelid = n.indrelid AND w.indexrelid <> n.indexrelid
JOIN pg_class wide ON wide.oid = w.indexrelid
WHERE ns.nspname = 'public'
  AND n.indisvalid AND w.indisvalid
  AND n.indpred IS NULL AND w.indpred IS NULL
  AND n.indexprs IS NULL AND w.indexprs IS NULL
  AND NOT n.indisunique
  AND n.indnkeyatts < w.indnkeyatts
  AND (w.indkey::int2[])[0:n.indnkeyatts - 1] = (n.indkey::int2[])[0:n.indnkeyatts - 1]
ORDER BY 1`

// TestNoIndexDuplicatesAnother holds the schema to the rule that an index earns
// its place by answering something no other index does. Widening an index is
// the usual way one stops doing that: the narrow index it grew from is still
// there, still written to, and never chosen again.
func TestNoIndexDuplicatesAnother(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	c := container.NewContainer(ctx)
	t.Cleanup(func() { require.NoError(t, c.Terminate(ctx)) })

	rows, err := c.DB.QueryContext(ctx, duplicatedIndexes)
	require.NoError(t, err)
	defer func() { require.NoError(t, rows.Close()) }()

	var duplicated []string
	for rows.Next() {
		var name string
		require.NoError(t, rows.Scan(&name))
		duplicated = append(duplicated, name)
	}
	require.NoError(t, rows.Err())

	require.Empty(t, duplicated, "indexes a wider index already answers")
}

// TestAuthAddressUniquenessIsCaseInsensitive pins which rule refuses a second
// account for one mailbox. Two rows cannot share a lowercase form without
// sharing the exact form, so a unique index on email guarantees nothing the
// one on lower(email) does not — and the exact duplicate below is the case
// where both would fire, which is what makes it worth asserting on the name.
func TestAuthAddressUniquenessIsCaseInsensitive(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	c := container.NewContainer(ctx)
	t.Cleanup(func() { require.NoError(t, c.Terminate(ctx)) })

	_, err := c.DB.ExecContext(ctx, `
		INSERT INTO public.auth (id, email, password)
		VALUES ('aaaaaaaa-0000-4000-8000-000000000401', 'dupe@example.com', ''::bytea)`)
	require.NoError(t, err)

	_, err = c.DB.ExecContext(ctx, `
		INSERT INTO public.auth (id, email, password)
		VALUES ('aaaaaaaa-0000-4000-8000-000000000402', 'dupe@example.com', ''::bytea)`)
	require.ErrorContains(t, err, "idx_auth_email_lower")
}
