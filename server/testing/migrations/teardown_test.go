package migrations_test

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	_ "github.com/jackc/pgx/v5/stdlib" // Register pgx driver
	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/testing/container"
)

// leftBehind names every relation, routine and type still in the public
// schema. Extension members are left out: the teardown keeps uuid-ossp and
// pg_trgm installed, and each up migration creates them IF NOT EXISTS.
const leftBehind = `
SELECT kind || ' ' || name
FROM (
    SELECT 'relation' AS kind, c.relname AS name, c.oid, 'pg_class'::regclass AS class
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm', 'S')
    UNION ALL
    SELECT 'function', p.proname, p.oid, 'pg_proc'::regclass
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
    UNION ALL
    SELECT 'type', t.typname, t.oid, 'pg_type'::regclass
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typtype IN ('e', 'd')
) objects
WHERE NOT EXISTS (
    SELECT 1 FROM pg_depend d
    WHERE d.classid = objects.class AND d.objid = objects.oid AND d.deptype = 'e'
)
ORDER BY 1`

// TestTeardownLetsEveryMigrationReplay holds 001_schema.down.sql to the job
// db:reset gives it: after it runs, nothing the migrations created is left, so
// replaying them from the first succeeds. An object the teardown forgets makes
// the migration that creates it fail on the replay, halfway through the rebuild
// the teardown exists to make possible.
func TestTeardownLetsEveryMigrationReplay(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	c := container.NewContainer(ctx)
	t.Cleanup(func() { require.NoError(t, c.Terminate(ctx)) })

	migrations := filepath.Join(mustFindProjectRoot(t), "database/migrations")
	applyInOneTransaction(ctx, t, c.DB, filepath.Join(migrations, "001_schema.down.sql"))

	rows, err := c.DB.QueryContext(ctx, leftBehind)
	require.NoError(t, err)
	defer func() { require.NoError(t, rows.Close()) }()

	var survivors []string
	for rows.Next() {
		var name string
		require.NoError(t, rows.Scan(&name))
		survivors = append(survivors, name)
	}
	require.NoError(t, rows.Err())
	require.Empty(t, survivors, "objects the teardown left behind")

	// Every up migration: none is numbered anywhere near the bound.
	for _, path := range migrationsThrough(t, "999") {
		applyInOneTransaction(ctx, t, c.DB, path)
	}
}

// applyInOneTransaction runs a migration file the way golang-migrate does:
// the whole file as one statement, inside one transaction.
func applyInOneTransaction(ctx context.Context, t *testing.T, db *sql.DB, path string) {
	t.Helper()

	script, err := os.ReadFile(path)
	require.NoError(t, err)

	tx, err := db.BeginTx(ctx, nil)
	require.NoError(t, err)

	if _, err = tx.ExecContext(ctx, string(script)); err != nil {
		require.NoError(t, tx.Rollback())
		require.NoErrorf(t, err, "apply %s", filepath.Base(path))
	}
	require.NoError(t, tx.Commit())
}
