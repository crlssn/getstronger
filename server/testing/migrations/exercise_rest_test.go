package migrations_test

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib" // Register pgx driver
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

// The three shapes of pre-migration occurrence: one inheriting the library's
// rest, one that named its own, and one that turned the timer off. Only the
// first of them has anything to lose, and it is the routine nobody has edited
// since rests became a routine's business.
const fixture045 = `
INSERT INTO public.auth (id, email, password)
VALUES ('aaaaaaaa-0000-4000-8000-000000000401', 'rest@getstronger.test', ''::bytea);

INSERT INTO public.users (id, auth_id, name, username)
VALUES ('bbbbbbbb-0000-4000-8000-000000000401', 'aaaaaaaa-0000-4000-8000-000000000401', 'Res Ting', 'resting');

INSERT INTO public.exercises (id, user_id, title, rest_seconds)
VALUES
    ('00000000-0000-4000-8000-000000000401', 'bbbbbbbb-0000-4000-8000-000000000401', 'Deadlift', 180),
    ('00000000-0000-4000-8000-000000000402', 'bbbbbbbb-0000-4000-8000-000000000401', 'Plank', 0),
    ('00000000-0000-4000-8000-000000000403', 'bbbbbbbb-0000-4000-8000-000000000401', 'Curl', 60);

INSERT INTO public.routines (id, user_id, title)
VALUES ('cccccccc-0000-4000-8000-000000000401', 'bbbbbbbb-0000-4000-8000-000000000401', 'Rests');

INSERT INTO public.routine_groups (id, routine_id, position, mode)
VALUES ('dddddddd-0000-4000-8000-000000000401', 'cccccccc-0000-4000-8000-000000000401', 0, 'straight');

INSERT INTO public.exercises_routines (routine_id, exercise_id, group_id, position, rest_seconds)
VALUES
    -- Never edited since 044, so the library is still answering for it.
    ('cccccccc-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000401',
     'dddddddd-0000-4000-8000-000000000401', 1, NULL),
    -- Inheriting a library rest of nothing, which is still an answer.
    ('cccccccc-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000402',
     'dddddddd-0000-4000-8000-000000000401', 2, NULL),
    -- The routine's own answer, which the library never had a say in.
    ('cccccccc-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000403',
     'dddddddd-0000-4000-8000-000000000401', 3, 300);
`

func TestMigration045BackfillsOccurrenceRests(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	db := runMigration045(t, fixture045)

	restOf := func(exerciseID string) int {
		var seconds int
		require.NoError(t, db.QueryRowContext(ctx, `
			SELECT rest_seconds FROM public.exercises_routines WHERE exercise_id = $1`,
			exerciseID).Scan(&seconds))
		return seconds
	}

	// The routine rests exactly as long as it did before, including where
	// nobody ever edited it and where the library said not to rest at all.
	require.Equal(t, 180, restOf("00000000-0000-4000-8000-000000000401"))
	require.Equal(t, 0, restOf("00000000-0000-4000-8000-000000000402"))
	require.Equal(t, 300, restOf("00000000-0000-4000-8000-000000000403"))

	var restSecondsExists bool
	require.NoError(t, db.QueryRowContext(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_schema = 'public' AND table_name = 'exercises' AND column_name = 'rest_seconds'
		)`).Scan(&restSecondsExists))
	require.False(t, restSecondsExists, "exercises.rest_seconds should have been dropped")

	// Nothing inherits any more, so an occurrence that says nothing is the app
	// default rather than a question for somewhere else.
	_, err := db.ExecContext(ctx, `
		INSERT INTO public.exercises_routines (routine_id, exercise_id, group_id, position)
		VALUES ('cccccccc-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000401',
		        'dddddddd-0000-4000-8000-000000000401', 4)`)
	require.NoError(t, err)

	var seconds int
	require.NoError(t, db.QueryRowContext(ctx, `
		SELECT rest_seconds FROM public.exercises_routines WHERE position = 4`).Scan(&seconds))
	require.Equal(t, 90, seconds)
}

// runMigration045 boots a database whose init runs the fixture after migration
// 044 and before 045, so that 045 meets it as it would production data.
func runMigration045(t *testing.T, fixture string) *sql.DB {
	t.Helper()
	ctx := context.Background()

	fixturePath := filepath.Join(t.TempDir(), "044_zz_rest_fixture.sql")
	require.NoError(t, os.WriteFile(fixturePath, []byte(fixture), 0o600))

	scripts := migrationsThrough(t, "045")
	require.NotEmpty(t, scripts)
	scripts = append(scripts[:len(scripts)-1], fixturePath, scripts[len(scripts)-1])

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

	return db
}
