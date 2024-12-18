package logger

import (
	"go.uber.org/fx"
	"go.uber.org/zap"
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
			func(config zap.Config) (*zap.Logger, error) {
				return config.Build()
			},
		),
	))
}
