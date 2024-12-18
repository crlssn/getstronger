package pubsub

import (
	"context"
	"fmt"

	"go.uber.org/fx"

	"github.com/crlssn/getstronger/server/pubsub/handlers"
)

func Module() fx.Option {
	return fx.Module("bus", fx.Options(
		fx.Provide(
			New,
			handlers.NewRegistry,
			handlers.NewUserFollowed,
			handlers.NewRequestTraced,
			handlers.NewWorkoutCommentPosted,
		),
		fx.Invoke(
			func(lc fx.Lifecycle, bus *Bus, registry *handlers.Registry) {
				lc.Append(fx.Hook{
					OnStart: func(_ context.Context) error {
						for event, handler := range registry.Handlers() {
							if err := bus.Subscribe(event, handler); err != nil {
								return fmt.Errorf("failed to subscribe to event %s: %w", event, err)
							}
						}
						return nil
					},
					OnStop: func(_ context.Context) error {
						bus.Stop()
						return nil
					},
				})
			},
		),
	))
}
