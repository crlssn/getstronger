package dberrors

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"testing"

	_ "github.com/lib/pq"
	"github.com/stephenafamo/bob"

	"github.com/crlssn/getstronger/server/testing/container"
)

func TestMain(m *testing.M) {
	os.Exit(runTests(m))
}

func runTests(m *testing.M) int {
	c := container.NewContainer(context.Background())
	db, err := sql.Open("postgres", c.Connection)
	if err != nil {
		_, _ = fmt.Fprintf(os.Stderr, "open database-error test database: %v\n", err)
		_ = c.Terminate(context.Background())
		return 1
	}
	if err := db.PingContext(context.Background()); err != nil {
		_, _ = fmt.Fprintf(os.Stderr, "ping database-error test database: %v\n", err)
		_ = db.Close()
		_ = c.Terminate(context.Background())
		return 1
	}
	testDB = bob.NewDB(db)

	code := m.Run()
	if err := db.Close(); err != nil {
		_, _ = fmt.Fprintf(os.Stderr, "close database-error test database: %v\n", err)
		code = 1
	}
	if err := c.Terminate(context.Background()); err != nil {
		_, _ = fmt.Fprintf(os.Stderr, "terminate database-error test database: %v\n", err)
		code = 1
	}

	return code
}
