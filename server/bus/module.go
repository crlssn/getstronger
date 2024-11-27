package bus

import (
	"go.uber.org/fx"
)

func Module() fx.Option {
	return fx.Module("bus", fx.Options(
		fx.Provide(
			New,
			func() map[event]handler {
				return map[event]handler{
					EventRequestTraced: newHandlerRequestTraced(),
				}
			},
		),
		fx.Invoke(
			func(lc fx.Lifecycle, bus *Bus) {
				lc.Append(fx.Hook{
					OnStart: bus.OnStart,
					OnStop:  bus.OnStop,
				})
			},
		),
	))
}
