package migrations_test

import (
	"context"
	"database/sql"
	"fmt"
	"io"
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

// Addresses predating the migration were stored however they were typed.
const fixture043 = `
INSERT INTO public.auth (id, email, password)
VALUES ('aaaaaaaa-0000-4000-8000-000000000301', 'Alice@Example.com', ''::bytea),
       ('aaaaaaaa-0000-4000-8000-000000000302', 'bob@example.com', ''::bytea);
`

// Two rows that are one mailbox. The migration must not decide which of them
// survives, because merging or disabling one takes its workout history along.
const fixture043Colliding = `
INSERT INTO public.auth (id, email, password)
VALUES ('aaaaaaaa-0000-4000-8000-000000000311', 'Carol@Example.com', ''::bytea),
       ('aaaaaaaa-0000-4000-8000-000000000312', 'carol@example.com', ''::bytea);
`

func TestMigration043LowercasesEmails(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	db := runMigration043(t, fixture043)

	emailOf := func(authID string) string {
		var email string
		require.NoError(t, db.QueryRowContext(ctx, `
			SELECT email FROM public.auth WHERE id = $1`, authID).Scan(&email))
		return email
	}

	require.Equal(t, "alice@example.com", emailOf("aaaaaaaa-0000-4000-8000-000000000301"))
	require.Equal(t, "bob@example.com", emailOf("aaaaaaaa-0000-4000-8000-000000000302"))

	// From here the column rejects a duplicate regardless of case, so one
	// mailbox can never hold two accounts again.
	_, err := db.ExecContext(ctx, `
		INSERT INTO public.auth (id, email, password)
		VALUES ('aaaaaaaa-0000-4000-8000-000000000303', 'ALICE@EXAMPLE.COM', ''::bytea)`)
	require.ErrorContains(t, err, "idx_auth_email_lower")
}

func TestMigration043StopsOnCaseVariantDuplicates(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	container, err := startMigration043(t, fixture043Colliding)
	require.Error(t, err)

	// The start error only says the container exited; what refused it is in
	// the logs, and asserting on that is what tells the two apart.
	require.NotNil(t, container)
	logs, err := container.Logs(ctx)
	require.NoError(t, err)
	defer func() { require.NoError(t, logs.Close()) }()

	output, err := io.ReadAll(logs)
	require.NoError(t, err)
	require.Contains(t, string(output), "auth rows hold case-variant duplicates of: carol@example.com")
}

func runMigration043(t *testing.T, fixture string) *sql.DB {
	t.Helper()

	container, err := startMigration043(t, fixture)
	require.NoError(t, err)

	connection, err := container.ConnectionString(context.Background(), "sslmode=disable")
	require.NoError(t, err)

	db, err := sql.Open("pgx", connection)
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, db.Close()) })

	return db
}

// startMigration043 boots a database whose init runs the fixture after
// migration 042 and before 043, so that 043 meets it as it would production
// data. It returns the start error rather than asserting on it, because a
// migration that refuses to run is one of the things under test.
func startMigration043(t *testing.T, fixture string) (*postgres.PostgresContainer, error) {
	t.Helper()
	ctx := context.Background()

	fixturePath := filepath.Join(t.TempDir(), "042_zz_email_fixture.sql")
	require.NoError(t, os.WriteFile(fixturePath, []byte(fixture), 0o600))

	scripts := migrationsThrough(t, "043")
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
	if container != nil {
		t.Cleanup(func() { require.NoError(t, container.Terminate(ctx)) })
	}

	if err != nil {
		return container, fmt.Errorf("run postgres: %w", err)
	}

	return container, nil
}
