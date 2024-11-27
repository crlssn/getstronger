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
		),
		fx.Invoke(
			func(
				lc fx.Lifecycle,
				bus *Bus,
				handlerRequestTraced *handlers.HandlerRequestTraced,
			) {
				lc.Append(fx.Hook{
					OnStart: func(_ context.Context) error {
						for event, handler := range map[events.Event]handlers.Handler{
							new(events.EventRequestTraced): handlerRequestTraced,
						} {
							bus.Subscribe(event, handler)
						}
						return nil
					},
				})
			},
		),
	))
}
