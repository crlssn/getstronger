package container

import (
	"context"
	"database/sql"
	"fmt"
	"io/fs"
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
		postgres.WithInitScripts(migrationFiles()...),
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

func migrationFiles() []string {
	basePath := filepath.Join(mustFindProjectRoot(), "database/migrations")
	return mustFindMigrationFiles(basePath)
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
		currentDir = filepath.Dir(currentDir)
	}
	panic("project root not found")
}

func mustFindMigrationFiles(baseDir string) []string {
	var files []string
	if err := filepath.WalkDir(baseDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return fmt.Errorf("could not walk directory: %w", err)
		}
		if !d.IsDir() && filepath.Ext(path) == ".sql" {
			files = append(files, path)
		}
		return nil
	}); err != nil {
		panic(fmt.Errorf("could not walk directory: %w", err))
	}
	return files
}
