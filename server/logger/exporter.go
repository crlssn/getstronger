package logger

import (
	"context"
	"fmt"

	"go.opentelemetry.io/contrib/bridges/otelzap"
	"go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploghttp"
	sdklog "go.opentelemetry.io/otel/sdk/log"
	"go.opentelemetry.io/otel/sdk/resource"
	semconv "go.opentelemetry.io/otel/semconv/v1.43.0"
	"go.uber.org/zap/zapcore"

	"github.com/crlssn/getstronger/server/config"
)

// serviceName is what PostHog files these records under. The web app reports
// itself separately, so the name has to say which half of the app spoke.
const serviceName = "getstronger-api"

// scopeName names the instrumentation rather than the service: it is this
// bridge, not the application, that every exported record comes through.
const scopeName = "github.com/crlssn/getstronger/server/logger"

// Exporter mirrors log records to PostHog over OTLP. Its zero value exports
// nothing, which is what an environment without a project token builds.
type Exporter struct {
	provider *sdklog.LoggerProvider
}

// NewExporter builds what the environment configures, or an inert exporter when
// it configures nothing. An export that fails reaches stderr through OTel's own
// error handler, deliberately not through zap: a rejected batch logged by the
// logger that feeds the exporter is a batch that fails and logs again.
func NewExporter(c *config.Config) (*Exporter, error) {
	if !c.Logs.Enabled() {
		return &Exporter{}, nil
	}

	client, err := otlploghttp.New(
		context.Background(),
		otlploghttp.WithEndpointURL(c.Logs.URL()),
		otlploghttp.WithHeaders(map[string]string{"Authorization": "Bearer " + c.Logs.Token}),
		otlploghttp.WithCompression(otlploghttp.GzipCompression),
	)
	if err != nil {
		return nil, fmt.Errorf("otlp log client: %w", err)
	}

	return &Exporter{
		provider: sdklog.NewLoggerProvider(
			sdklog.WithResource(resource.NewWithAttributes(
				semconv.SchemaURL,
				semconv.ServiceName(serviceName),
				semconv.DeploymentEnvironmentNameKey.String(string(c.Environment)),
			)),
			// The batch processor's one-second interval is all that stands
			// between a record and a serverless container that freezes without
			// warning. Shutdown flushes what it still holds, which covers a
			// graceful stop and nothing else.
			sdklog.WithProcessor(sdklog.NewBatchProcessor(client)),
		),
	}, nil
}

// Core is the zap core that mirrors entries to PostHog, and nil when nothing is
// configured to receive them.
func (e *Exporter) Core() zapcore.Core {
	if e.provider == nil {
		return nil
	}

	return otelzap.NewCore(scopeName, otelzap.WithLoggerProvider(e.provider))
}

// Shutdown exports whatever the batch processor is still holding.
func (e *Exporter) Shutdown(ctx context.Context) error {
	if e.provider == nil {
		return nil
	}

	if err := e.provider.Shutdown(ctx); err != nil {
		return fmt.Errorf("log exporter shutdown: %w", err)
	}

	return nil
}
