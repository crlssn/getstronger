package logger

import (
	"fmt"
	"time"

	"go.uber.org/fx"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

func Module() fx.Option {
	return fx.Module("logger", fx.Options(
		fx.Provide(
			func() zap.Config {
				return zap.Config{
					Level:       zap.NewAtomicLevelAt(zap.InfoLevel),
					Development: false,
					Sampling: &zap.SamplingConfig{
						Initial:    100, //nolint:mnd
						Thereafter: 100, //nolint:mnd
					},
					Encoding:         "json",
					EncoderConfig:    zap.NewProductionEncoderConfig(),
					OutputPaths:      []string{"stdout"},
					ErrorOutputPaths: []string{"stderr"},
				}
			},
			NewExporter,
			build,
		),
		// Registered ahead of the server's own hook, and so run after it: what
		// the shutdown path logs still has somewhere to go.
		fx.Invoke(func(l fx.Lifecycle, exporter *Exporter) {
			l.Append(fx.Hook{OnStop: exporter.Shutdown})
		}),
	))
}

// build assembles the logger the config describes, teed to PostHog when an
// exporter is configured.
func build(config zap.Config, exporter *Exporter) (*zap.Logger, error) {
	core := exporter.Core()
	if core == nil {
		built, err := config.Build()
		if err != nil {
			return nil, fmt.Errorf("logger build: %w", err)
		}

		return built, nil
	}

	// otelzap asks the OTel SDK whether a severity is enabled and the SDK
	// enables every one, so the exported branch is held to the configured level
	// by hand. Without it a Debug entry reaches PostHog while stdout, which the
	// level does bind, shows nothing.
	exported, err := zapcore.NewIncreaseLevelCore(core, config.Level)
	if err != nil {
		return nil, fmt.Errorf("exported core level: %w", err)
	}

	// Sampling has to wrap the tee rather than sit inside it. zap samples the
	// core it builds, which is the stdout half alone, so a hot loop would reach
	// PostHog in full while stdout showed one line in a hundred.
	sampling := config.Sampling
	config.Sampling = nil

	built, err := config.Build(zap.WrapCore(func(local zapcore.Core) zapcore.Core {
		tee := zapcore.NewTee(local, exported)
		if sampling == nil {
			return tee
		}

		return zapcore.NewSamplerWithOptions(tee, time.Second, sampling.Initial, sampling.Thereafter)
	}))
	if err != nil {
		return nil, fmt.Errorf("logger build: %w", err)
	}

	return built, nil
}
