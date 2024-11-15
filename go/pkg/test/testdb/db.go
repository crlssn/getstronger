package testdb

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib" // Register pgx driver
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

type Container struct {
	DB        *sql.DB
	Terminate func(ctx context.Context) error
}

const (
	startTimeout = 5 * time.Second
	occurrence   = 2
)

func NewContainer(ctx context.Context) *Container {
	container, err := postgres.Run(ctx, "postgres:16.4-alpine",
		postgres.WithInitScripts([]string{
			filepath.Join(mustFindProjectRoot(), "db/migrations/001_schema.up.sql"),
			filepath.Join(mustFindProjectRoot(), "db/migrations/002_base.up.sql"),
		}...),
		postgres.WithDatabase("test-db"),
		postgres.WithUsername("postgres"),
		postgres.WithPassword("postgres"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(occurrence).WithStartupTimeout(startTimeout)),
	)
	if err != nil {
		panic(fmt.Errorf("could not start postgres container: %w", err))
	}

	connection, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		panic(fmt.Errorf("could not get connection string: %w", err))
	}

	db, err := sql.Open("pgx", connection)
	if err != nil {
		panic(fmt.Errorf("could not open connection: %w", err))
	}

	return &Container{
		DB:        db,
		Terminate: container.Terminate,
	}
}

func mustFindProjectRoot() string {
	currentDir, err := os.Getwd()
	if err != nil {
		panic(fmt.Errorf("could not get current directory: %w", err))
	}

	for currentDir != "/" {
		if _, err = os.Stat(filepath.Join(currentDir, "go.mod")); err == nil {
			return currentDir
		}

		// Move up one directory
		currentDir = filepath.Dir(currentDir)
	}

	panic("project root not found")
}
