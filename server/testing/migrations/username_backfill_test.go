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

// The fixture covers the shapes of pre-migration data the backfill must
// handle: a lone first word, two users sharing a first word, and a name whose
// first word carries characters a username may not.
const fixture038 = `
INSERT INTO public.auth (id, email, password)
VALUES ('aaaaaaaa-0000-4000-8000-000000000201', 'username-one@getstronger.test', ''::bytea),
       ('aaaaaaaa-0000-4000-8000-000000000202', 'username-two@getstronger.test', ''::bytea),
       ('aaaaaaaa-0000-4000-8000-000000000203', 'username-three@getstronger.test', ''::bytea),
       ('aaaaaaaa-0000-4000-8000-000000000204', 'username-four@getstronger.test', ''::bytea);

INSERT INTO public.users (id, auth_id, name)
VALUES ('bbbbbbbb-0000-4000-8000-000000000201', 'aaaaaaaa-0000-4000-8000-000000000201', 'Alex Morgan'),
       ('bbbbbbbb-0000-4000-8000-000000000202', 'aaaaaaaa-0000-4000-8000-000000000202', 'Alex Taylor'),
       ('bbbbbbbb-0000-4000-8000-000000000203', 'aaaaaaaa-0000-4000-8000-000000000203', 'Jane Doe'),
       ('bbbbbbbb-0000-4000-8000-000000000204', 'aaaaaaaa-0000-4000-8000-000000000204', $$O'Brien Smith$$);
`

func TestMigration038BackfillsUsernames(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	// The fixture is named so the container's init runs it after migration 037
	// and before 038, which then backfills it like it would production data.
	fixturePath := filepath.Join(t.TempDir(), "037_zz_username_fixture.sql")
	require.NoError(t, os.WriteFile(fixturePath, []byte(fixture038), 0o600))

	scripts := migrationsThrough(t, "038")
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

	usernameOf := func(userID string) string {
		var username string
		require.NoError(t, db.QueryRowContext(ctx, `
			SELECT username FROM public.users WHERE id = $1`, userID).Scan(&username))
		return username
	}

	// The first holder of a first word keeps it bare; the next gets a numeric
	// suffix. The fixture's insertion order decides who came first.
	require.Equal(t, "alex", usernameOf("bbbbbbbb-0000-4000-8000-000000000201"))
	require.Equal(t, "alex2", usernameOf("bbbbbbbb-0000-4000-8000-000000000202"))
	require.Equal(t, "jane", usernameOf("bbbbbbbb-0000-4000-8000-000000000203"))

	// Characters a username may not contain are stripped from the first word.
	require.Equal(t, "obrien", usernameOf("bbbbbbbb-0000-4000-8000-000000000204"))

	// The column rejects a duplicate regardless of case.
	_, err = db.ExecContext(ctx, `
		INSERT INTO public.auth (id, email, password)
		VALUES ('aaaaaaaa-0000-4000-8000-000000000205', 'username-five@getstronger.test', ''::bytea)`)
	require.NoError(t, err)
	_, err = db.ExecContext(ctx, `
		INSERT INTO public.users (id, auth_id, name, username)
		VALUES ('bbbbbbbb-0000-4000-8000-000000000205', 'aaaaaaaa-0000-4000-8000-000000000205', 'Alex Case', 'ALEX')`)
	require.ErrorContains(t, err, "idx_users_username_lower")
}
