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

// The fixture covers the two shapes of pre-migration data: an everyday
// first/last pair and one padded with whitespace that the merge must trim.
const fixture037 = `
INSERT INTO public.auth (id, email, password)
VALUES ('aaaaaaaa-0000-4000-8000-000000000101', 'merge-one@getstronger.test', ''::bytea),
       ('aaaaaaaa-0000-4000-8000-000000000102', 'merge-two@getstronger.test', ''::bytea);

INSERT INTO public.users (id, auth_id, first_name, last_name)
VALUES ('bbbbbbbb-0000-4000-8000-000000000101', 'aaaaaaaa-0000-4000-8000-000000000101', 'Alex', 'Morgan'),
       ('bbbbbbbb-0000-4000-8000-000000000102', 'aaaaaaaa-0000-4000-8000-000000000102', ' Jane ', ' Doe ');
`

func TestMigration037MergesNames(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	// The fixture is named so the container's init runs it after migration 036
	// and before 037, which then merges it like it would production data.
	fixturePath := filepath.Join(t.TempDir(), "036_zz_name_merge_fixture.sql")
	require.NoError(t, os.WriteFile(fixturePath, []byte(fixture037), 0o600))

	scripts := migrationsThrough(t, "037")
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

	nameOf := func(userID string) (string, string) {
		var name, search string
		require.NoError(t, db.QueryRowContext(ctx, `
			SELECT name, full_name_search
			FROM public.users
			WHERE id = $1`, userID).Scan(&name, &search))
		return name, search
	}

	name, search := nameOf("bbbbbbbb-0000-4000-8000-000000000101")
	require.Equal(t, "Alex Morgan", name)
	require.Equal(t, "alex morgan", search)

	// Whitespace-padded halves collapse into a single-spaced, trimmed name.
	name, search = nameOf("bbbbbbbb-0000-4000-8000-000000000102")
	require.Equal(t, "Jane Doe", name)
	require.Equal(t, "jane doe", search)

	var splitColumns int
	require.NoError(t, db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'users'
		  AND column_name IN ('first_name', 'last_name')`).Scan(&splitColumns))
	require.Zero(t, splitColumns, "first_name and last_name should have been dropped")

	var indexExists bool
	require.NoError(t, db.QueryRowContext(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM pg_indexes
			WHERE schemaname = 'public' AND indexname = 'idx_users_full_name_search'
		)`).Scan(&indexExists))
	require.True(t, indexExists, "the trigram search index should have been rebuilt")
}
