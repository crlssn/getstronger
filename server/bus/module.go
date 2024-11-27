package bus

import (
	"context"

	"go.uber.org/fx"

	"github.com/crlssn/getstronger/server/bus/handlers"
)

func Module() fx.Option {
	return fx.Module("bus", fx.Options(
		fx.Provide(
			New,
			handlers.NewRegistry,
			handlers.NewHandlerRequestTraced,
		),
		fx.Invoke(
			func(
				lc fx.Lifecycle,
				bus *Bus,
				registry *handlers.Registry,
			) {
				lc.Append(fx.Hook{
					OnStart: func(_ context.Context) error {
						for event, handler := range registry.Handlers() {
							bus.Subscribe(event, handler)
						}
						return nil
					},
				})
			},
		),
	))
}
