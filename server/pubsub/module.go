package pubsub

import (
	"context"
	"time"

	"github.com/lib/pq"
	"go.uber.org/fx"

	"github.com/crlssn/getstronger/server/config"
	"github.com/crlssn/getstronger/server/db"
	"github.com/crlssn/getstronger/server/pubsub/handlers"
)

func Module() fx.Option {
	return fx.Module("bus", fx.Options(
		fx.Provide(
			New,
			handlers.NewRegistry,
			handlers.NewFollowedUser,
			handlers.NewRequestTraced,
			handlers.NewWorkoutCommentPosted,
			func(c *config.Config) *pq.Listener {
				return pq.NewListener(db.ConnectionString(c), time.Second, time.Minute, nil)
			},
		),
		fx.Invoke(
			func(lc fx.Lifecycle, pubSub *PubSub, registry *handlers.Registry) {
				lc.Append(fx.Hook{
					OnStart: func(_ context.Context) error {
						return pubSub.Subscribe(registry.Handlers())
					},
					OnStop: func(_ context.Context) error {
						return pubSub.Stop()
					},
				})
			},
		),
	))
}
