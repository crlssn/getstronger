// Command recordings moves workout recordings out of the database and into the
// object store. Run it after deploying the change that writes new recordings
// there: it claims a workout only while the document is still on its row, so
// running it again picks up whatever the last run did not finish and does
// nothing to what it did.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/joho/godotenv"

	"github.com/crlssn/getstronger/server/config"
	"github.com/crlssn/getstronger/server/db"
	"github.com/crlssn/getstronger/server/objectstore"
	"github.com/crlssn/getstronger/server/repo"
)

func main() {
	if err := run(); err != nil {
		log.Fatalf("Backfill workout recordings: %v", err)
	}
}

func run() error {
	// Only local runs have a .env to read; a deployment passes its
	// configuration through the environment.
	if err := godotenv.Load(); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("load .env file: %w", err)
	}

	batch := flag.Int("batch", repo.BackfillRecordingsBatch, "how many workouts to claim per pass")
	flag.Parse()

	c := config.New()
	pool, err := config.NewDBPool()
	if err != nil {
		return fmt.Errorf("resolve database pool configuration: %w", err)
	}

	database, err := db.New(c, pool)
	if err != nil {
		return fmt.Errorf("connect to database: %w", err)
	}
	defer func() { _ = database.Close() }()

	store, err := objectstore.New(c)
	if err != nil {
		return fmt.Errorf("resolve object store: %w", err)
	}

	// The count is reported whether the run finished or stopped: it says how
	// far a repeat has to catch up.
	moved, err := repo.New(database, store).BackfillRecordings(context.Background(), *batch)
	log.Printf("Moved %d workout recordings to object storage", moved)
	if err != nil {
		return fmt.Errorf("move workout recordings: %w", err)
	}

	return nil
}
