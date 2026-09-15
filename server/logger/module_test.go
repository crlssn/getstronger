package logger_test

import (
	"compress/gzip"
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	collogspb "go.opentelemetry.io/proto/otlp/collector/logs/v1"
	commonpb "go.opentelemetry.io/proto/otlp/common/v1"
	logspb "go.opentelemetry.io/proto/otlp/logs/v1"
	"go.uber.org/fx"
	"go.uber.org/zap"
	"google.golang.org/protobuf/proto"

	"github.com/crlssn/getstronger/server/config"
	"github.com/crlssn/getstronger/server/logger"
)

// The module provides the config and the logger built from it, so the only way
// to see either is to let fx build the graph.
func TestModuleProvidesAProductionLogger(t *testing.T) {
	t.Parallel()

	var (
		built  *zap.Logger
		config zap.Config
	)

	app := fx.New(
		logger.Module(),
		providesTheEnvironment(),
		fx.Populate(&built, &config),
		fx.NopLogger,
	)
	require.NoError(t, app.Err())
	require.NoError(t, app.Start(context.Background()))
	t.Cleanup(func() {
		require.NoError(t, app.Stop(context.Background()))
	})

	require.NotNil(t, built)
	require.Equal(t, "json", config.Encoding)
	require.False(t, config.Development)
	require.Equal(t, zap.InfoLevel, config.Level.Level())
	require.Equal(t, []string{"stdout"}, config.OutputPaths)
}

// A project token is the only switch there is, so an environment without one
// must build a logger that talks to nobody.
func TestModuleWithoutATokenExportsNothing(t *testing.T) {
	collected, endpoint := collectorFor(t)
	t.Setenv("POSTHOG_KEY", "")
	t.Setenv("POSTHOG_LOGS_ENDPOINT", endpoint)

	local := filepath.Join(t.TempDir(), "logs.json")
	built, stop := start(t, local)
	built.Info("Keep me local")
	stop()

	require.Contains(t, readFile(t, local), "Keep me local")
	require.Empty(t, collected.records())
}

func TestModuleExportsLogsToPostHog(t *testing.T) {
	collected, endpoint := collectorFor(t)
	t.Setenv("POSTHOG_KEY", "phc_test")
	t.Setenv("POSTHOG_LOGS_ENDPOINT", endpoint)
	t.Setenv("ENV", string(config.EnvironmentProduction))

	local := filepath.Join(t.TempDir(), "logs.json")
	built, stop := start(t, local)
	built.Info("Export me", zap.String("rpc", "ExportTest"))
	// Below the configured level, so neither branch may carry it.
	built.Debug("Leave me behind")
	stop()

	require.Contains(t, readFile(t, local), "Export me")

	require.Equal(t, "/i/v1/logs", collected.path())
	require.Equal(t, "Bearer phc_test", collected.authorization())

	records := collected.records()
	require.Len(t, records, 1)
	require.Equal(t, "Export me", records[0].GetBody().GetStringValue())
	require.Equal(t, "info", records[0].GetSeverityText())
	require.Equal(t, "ExportTest", attributes(records[0].GetAttributes())["rpc"])

	resource := attributes(collected.resource())
	require.Equal(t, "getstronger-api", resource["service.name"])
	require.Equal(t, "production", resource["deployment.environment.name"])
}

// Sampling is a volume cap, and a cap that only applies to stdout is no cap at
// all: the branch we pay for would carry every line of a hot loop.
func TestModuleSamplesBothBranchesAlike(t *testing.T) {
	collected, endpoint := collectorFor(t)
	t.Setenv("POSTHOG_KEY", "phc_test")
	t.Setenv("POSTHOG_LOGS_ENDPOINT", endpoint)

	local := filepath.Join(t.TempDir(), "logs.json")
	built, stop := start(t, local)
	for range 150 {
		built.Info("Repeat me")
	}
	stop()

	require.Equal(t, 100, strings.Count(readFile(t, local), "Repeat me"))
	require.Len(t, collected.records(), 100)
}

// start builds the graph and hands back the logger and the stop that flushes
// it. The module builds its own config, so pointing the local branch at a file
// is the only way to read what it wrote.
func start(t *testing.T, path string) (*zap.Logger, func()) {
	t.Helper()

	var built *zap.Logger
	app := fx.New(
		logger.Module(),
		providesTheEnvironment(),
		fx.Decorate(func(c zap.Config) zap.Config {
			c.OutputPaths = []string{path}
			return c
		}),
		fx.Populate(&built),
		fx.NopLogger,
	)
	require.NoError(t, app.Err())
	require.NoError(t, app.Start(context.Background()))

	return built, func() {
		require.NoError(t, app.Stop(context.Background()))
	}
}

// The module reads the environment through the config every application
// assembles for itself, rather than providing one of its own.
func providesTheEnvironment() fx.Option {
	return fx.Provide(config.New)
}

func readFile(t *testing.T, path string) string {
	t.Helper()

	contents, err := os.ReadFile(path)
	require.NoError(t, err)

	return string(contents)
}

func attributes(pairs []*commonpb.KeyValue) map[string]string {
	values := make(map[string]string, len(pairs))
	for _, pair := range pairs {
		values[pair.GetKey()] = pair.GetValue().GetStringValue()
	}

	return values
}

// collector stands in for PostHog's ingestion endpoint and records what the
// exporter sent it.
type collector struct {
	mu   sync.Mutex
	head *http.Request
	logs []*logspb.LogRecord
	res  []*commonpb.KeyValue
}

func collectorFor(t *testing.T) (*collector, string) {
	t.Helper()

	c := &collector{}
	server := httptest.NewServer(c.serve(t))
	t.Cleanup(server.Close)

	return c, server.URL + "/i/v1/logs"
}

// serve decodes one OTLP export. Assertions here run on the server's goroutine,
// where a require would abandon the handler rather than fail the test.
func (c *collector) serve(t *testing.T) http.HandlerFunc {
	t.Helper()

	return func(w http.ResponseWriter, r *http.Request) {
		gz, err := gzip.NewReader(r.Body)
		if !assert.NoError(t, err) {
			w.WriteHeader(http.StatusBadRequest)

			return
		}

		body, err := io.ReadAll(gz)
		if !assert.NoError(t, err) {
			w.WriteHeader(http.StatusBadRequest)

			return
		}

		var request collogspb.ExportLogsServiceRequest
		if !assert.NoError(t, proto.Unmarshal(body, &request)) {
			w.WriteHeader(http.StatusBadRequest)

			return
		}

		c.record(r, &request)
	}
}

func (c *collector) record(r *http.Request, request *collogspb.ExportLogsServiceRequest) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.head = r
	for _, resourceLogs := range request.GetResourceLogs() {
		c.res = append(c.res, resourceLogs.GetResource().GetAttributes()...)
		for _, scope := range resourceLogs.GetScopeLogs() {
			c.logs = append(c.logs, scope.GetLogRecords()...)
		}
	}
}

func (c *collector) records() []*logspb.LogRecord {
	c.mu.Lock()
	defer c.mu.Unlock()

	return slices.Clone(c.logs)
}

func (c *collector) resource() []*commonpb.KeyValue {
	c.mu.Lock()
	defer c.mu.Unlock()

	return c.res
}

func (c *collector) path() string {
	c.mu.Lock()
	defer c.mu.Unlock()

	return c.head.URL.Path
}

func (c *collector) authorization() string {
	c.mu.Lock()
	defer c.mu.Unlock()

	return c.head.Header.Get("Authorization")
}
