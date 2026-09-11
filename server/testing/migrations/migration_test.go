package migrations_test

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	_ "github.com/jackc/pgx/v5/stdlib" // Register pgx driver
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/crlssn/getstronger/server/testing/container"
)

// runMigration boots a database with the fixture in place and hands back a
// connection to it, failing the test if the migration refuses to run.
func runMigration(t *testing.T, through, fixtureName, fixture string) *sql.DB {
	t.Helper()

	postgresContainer, err := startMigration(t, through, fixtureName, fixture)
	require.NoError(t, err)

	connection, err := postgresContainer.ConnectionString(context.Background(), "sslmode=disable")
	require.NoError(t, err)

	db, err := sql.Open("pgx", connection)
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, db.Close()) })

	return db
}

// startMigration boots a database that runs the fixture just before migration
// through, so that through meets it as it would production data. It returns
// the start error rather than asserting on it, because a migration that
// refuses to run is one of the things under test.
func startMigration(t *testing.T, through, fixtureName, fixture string) (*postgres.PostgresContainer, error) {
	t.Helper()
	ctx := context.Background()

	fixturePath := filepath.Join(t.TempDir(), fixtureName)
	require.NoError(t, os.WriteFile(fixturePath, []byte(fixture), 0o600))

	// The fixture's NNN_zz_ name is what places it: the entrypoint runs the init
	// directory in filename order, not in the order the scripts are passed.
	scripts := append(migrationsThrough(t, through), fixturePath)

	postgresContainer, err := postgres.Run(
		ctx, "postgres:16.4-alpine",
		postgres.WithInitScripts(scripts...),
		postgres.WithDatabase("test-db"),
		postgres.WithUsername("postgres"),
		postgres.WithPassword("postgres"),
		testcontainers.WithWaitStrategy(
			// The entrypoint serves the init scripts from a temporary server and
			// then restarts, so the line it is ready arrives twice.
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).WithStartupTimeout(container.StartTimeout),
		),
	)
	if postgresContainer != nil {
		t.Cleanup(func() { require.NoError(t, postgresContainer.Terminate(ctx)) })
	}

	if err != nil {
		return postgresContainer, fmt.Errorf("run postgres: %w", err)
	}

	return postgresContainer, nil
}
