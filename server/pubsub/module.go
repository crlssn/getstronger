package pubsub

import (
	"context"

	"go.uber.org/fx"

	"github.com/crlssn/getstronger/server/pubsub/handlers"
	"github.com/crlssn/getstronger/server/repo"
)

// bindStore names the slice of the persistence adapter each part of the
// messaging machinery depends on. Binding happens here rather than in every
// application that assembles the server, so a subscriber that grows a new
// dependency cannot leave one of them behind.
func bindStore() fx.Option {
	return fx.Provide(
		func(r *repo.Repo) EventStore { return r },
		func(r *repo.Repo) handlers.TraceStore { return r },
		func(r *repo.Repo) handlers.CommentThread { return r },
		func(r *repo.Repo) handlers.NotificationStore { return r },
	)
}

func Module() fx.Option {
	return fx.Module("bus", fx.Options(
		bindStore(),
		fx.Provide(
			New,
			handlers.NewRegistry,
			handlers.NewFollowedUser,
			handlers.NewRequestTraced,
			handlers.NewWorkoutCommentPosted,
		),
		fx.Invoke(
			func(lc fx.Lifecycle, pubSub *PubSub, registry *handlers.Registry) {
				lc.Append(fx.Hook{
					OnStart: func(_ context.Context) error {
						pubSub.Subscribe(registry.Handlers())
						return nil
					},
					OnStop: func(_ context.Context) error {
						pubSub.Stop()
						return nil
					},
				})
			},
		),
	))
}
