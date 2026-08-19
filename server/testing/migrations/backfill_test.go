// Package migrations_test covers migration backfills that the regular suites
// cannot reach: they run against a schema where every migration has already
// been applied, while a backfill only acts on data that predates its
// migration. The test here boots a database with the migrations up to the one
// under test, seeds it, and lets the remaining migration run against that
// state.
package migrations_test

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib" // Register pgx driver
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

// The fixture recreates the three shapes of pre-migration data: a routine
// whose exercise_order is populated, one whose order is '[]', and one whose
// order covers only some of its exercises and contains a stale ID.
const fixture036 = `
INSERT INTO public.auth (id, email, password)
VALUES ('aaaaaaaa-0000-4000-8000-000000000001', 'backfill@getstronger.test', ''::bytea);

INSERT INTO public.users (id, auth_id, first_name, last_name)
VALUES ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'Back', 'Fill');

INSERT INTO public.exercises (id, user_id, title)
VALUES
    -- Ordered routine: titles deliberately disagree with the recorded order.
    ('00000000-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 'Charlie'),
    ('00000000-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000001', 'Alpha'),
    ('00000000-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000001', 'Bravo'),
    -- Empty-order routine: duplicate titles force the ID tiebreak.
    ('00000000-0000-4000-8000-000000000101', 'bbbbbbbb-0000-4000-8000-000000000001', 'Squats'),
    ('00000000-0000-4000-8000-000000000102', 'bbbbbbbb-0000-4000-8000-000000000001', 'Deadlifts'),
    ('00000000-0000-4000-8000-000000000103', 'bbbbbbbb-0000-4000-8000-000000000001', 'Squats'),
    -- Partial-order routine.
    ('00000000-0000-4000-8000-000000000201', 'bbbbbbbb-0000-4000-8000-000000000001', 'Zulu'),
    ('00000000-0000-4000-8000-000000000202', 'bbbbbbbb-0000-4000-8000-000000000001', 'Mike');

INSERT INTO public.routines (id, user_id, title, exercise_order)
VALUES
    ('cccccccc-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 'Ordered',
     '["00000000-0000-4000-8000-000000000003", "00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"]'),
    ('cccccccc-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000001', 'Empty', '[]'),
    ('cccccccc-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000001', 'Partial',
     '["99999999-9999-4999-8999-999999999999", "00000000-0000-4000-8000-000000000202"]');

INSERT INTO public.exercises_routines (routine_id, exercise_id)
VALUES
    ('cccccccc-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001'),
    ('cccccccc-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'),
    ('cccccccc-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003'),
    ('cccccccc-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000101'),
    ('cccccccc-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000102'),
    ('cccccccc-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000103'),
    ('cccccccc-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000201'),
    ('cccccccc-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000202');
`

func TestMigration036BackfillsPositions(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	// The fixture is named so the container's init runs it after migration 035
	// and before 036, which then backfills it like it would production data.
	fixturePath := filepath.Join(t.TempDir(), "035_zz_backfill_fixture.sql")
	require.NoError(t, os.WriteFile(fixturePath, []byte(fixture036), 0o600))

	scripts := migrationsThrough(t, "036")
	scripts = append(scripts, fixturePath)

	container, err := postgres.Run(
		ctx, "postgres:16.4-alpine",
		postgres.WithInitScripts(scripts...),
		postgres.WithDatabase("test-db"),
		postgres.WithUsername("postgres"),
		postgres.WithPassword("postgres"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).WithStartupTimeout(time.Minute),
		),
	)
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, container.Terminate(ctx)) })

	connection, err := container.ConnectionString(ctx, "sslmode=disable")
	require.NoError(t, err)

	db, err := sql.Open("pgx", connection)
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, db.Close()) })

	orderOf := func(routineID string) []string {
		rows, err := db.QueryContext(ctx, `
			SELECT exercise_id::text
			FROM public.exercises_routines
			WHERE routine_id = $1
			ORDER BY position, exercise_id`, routineID)
		require.NoError(t, err)
		defer func() { require.NoError(t, rows.Close()) }()

		var ids []string
		for rows.Next() {
			var id string
			require.NoError(t, rows.Scan(&id))
			ids = append(ids, id)
		}
		require.NoError(t, rows.Err())
		return ids
	}

	// A populated exercise_order survives exactly, regardless of titles.
	require.Equal(t, []string{
		"00000000-0000-4000-8000-000000000003",
		"00000000-0000-4000-8000-000000000001",
		"00000000-0000-4000-8000-000000000002",
	}, orderOf("cccccccc-0000-4000-8000-000000000001"))

	// An empty order falls back to title then ID, the order those routines
	// already rendered with.
	require.Equal(t, []string{
		"00000000-0000-4000-8000-000000000102", // Deadlifts
		"00000000-0000-4000-8000-000000000101", // Squats, lower ID
		"00000000-0000-4000-8000-000000000103", // Squats, higher ID
	}, orderOf("cccccccc-0000-4000-8000-000000000002"))

	// A partial order keeps its listed exercises first — the stale ID is
	// skipped — and appends the omitted ones after them.
	require.Equal(t, []string{
		"00000000-0000-4000-8000-000000000202", // Mike, listed
		"00000000-0000-4000-8000-000000000201", // Zulu, appended
	}, orderOf("cccccccc-0000-4000-8000-000000000003"))

	var nullCount int
	require.NoError(t, db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM public.exercises_routines WHERE position IS NULL`).Scan(&nullCount))
	require.Zero(t, nullCount)

	var exerciseOrderExists bool
	require.NoError(t, db.QueryRowContext(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_schema = 'public' AND table_name = 'routines' AND column_name = 'exercise_order'
		)`).Scan(&exerciseOrderExists))
	require.False(t, exerciseOrderExists, "routines.exercise_order should have been dropped")
}

// migrationsThrough returns the paths of every up migration whose number is at
// most last, sorted so the container applies them in order.
func migrationsThrough(t *testing.T, last string) []string {
	t.Helper()

	baseDir := filepath.Join(mustFindProjectRoot(t), "database/migrations")
	entries, err := os.ReadDir(baseDir)
	require.NoError(t, err)

	var files []string
	for _, entry := range entries {
		name := entry.Name()
		if !strings.HasSuffix(name, ".up.sql") {
			continue
		}
		if strings.SplitN(name, "_", 2)[0] > last {
			continue
		}
		files = append(files, filepath.Join(baseDir, name))
	}
	sort.Strings(files)
	require.NotEmpty(t, files)
	return files
}

func mustFindProjectRoot(t *testing.T) string {
	t.Helper()

	currentDir, err := os.Getwd()
	require.NoError(t, err)
	for currentDir != "/" {
		if _, err = os.Stat(filepath.Join(currentDir, "go.mod")); err == nil {
			return currentDir
		}
		currentDir = filepath.Dir(currentDir)
	}
	t.Fatal("project root not found")
	return ""
}
