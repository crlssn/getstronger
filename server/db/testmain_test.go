package db_test

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"testing"

	"github.com/crlssn/getstronger/server/config"
	"github.com/crlssn/getstronger/server/testing/container"
)

// A run already asks one Docker daemon for a Postgres container per package, so
// the tests here share one rather than starting a second.
var testConfig *config.Config //nolint:gochecknoglobals // TestMain has no other way to hand the shared container to its tests.

func TestMain(m *testing.M) {
	os.Exit(runTests(m))
}

func runTests(m *testing.M) int {
	ctx := context.Background()
	c := container.NewContainer(ctx)

	parsed, err := url.Parse(c.Connection)
	if err != nil {
		_, _ = fmt.Fprintf(os.Stderr, "parse db test connection: %v\n", err)
		return 1
	}

	testConfig = new(config.Config)
	testConfig.Environment = config.EnvironmentLocal
	testConfig.DB.Host = parsed.Hostname()
	testConfig.DB.Port = parsed.Port()
	testConfig.DB.Name = "test-db"
	testConfig.DB.User = "postgres"
	testConfig.DB.Password = "postgres"

	code := m.Run()
	if err = c.Terminate(ctx); err != nil {
		_, _ = fmt.Fprintf(os.Stderr, "terminate db test database: %v\n", err)
		return 1
	}

	return code
}
