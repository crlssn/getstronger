package bus

import (
	"context"

	"go.uber.org/fx"

	"github.com/crlssn/getstronger/server/bus/events"
	"github.com/crlssn/getstronger/server/bus/handlers"
)

func Module() fx.Option {
	return fx.Module("bus", fx.Options(
		fx.Provide(
			New,
			handlers.NewHandlerRequestTraced,
			func(handler *handlers.HandlerRequestTraced) map[string]handlers.Handler {
				return map[string]handlers.Handler{
					new(events.EventRequestTraced).Type(): handler,
				}
			},
		),
		fx.Invoke(
			func(lc fx.Lifecycle, bus *Bus) {
				lc.Append(fx.Hook{
					OnStart: func(ctx context.Context) error {
						return nil
					},
				})
			},
		),
	))
}
