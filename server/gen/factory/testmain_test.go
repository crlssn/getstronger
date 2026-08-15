package factory

import (
	"context"
	"fmt"
	"os"
	"testing"

	"github.com/stephenafamo/bob"

	"github.com/crlssn/getstronger/server/testing/container"
)

func TestMain(m *testing.M) {
	os.Exit(runTests(m))
}

func runTests(m *testing.M) int {
	c := container.NewContainer(context.Background())
	testDB = bob.NewDB(c.DB)

	code := m.Run()
	if err := c.Terminate(context.Background()); err != nil {
		_, _ = fmt.Fprintf(os.Stderr, "terminate factory test database: %v\n", err)
		return 1
	}

	return code
}
