package pubsub

import (
	"go.uber.org/fx"

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
		),
		fx.Invoke(
			func(pubSub *PubSub, registry *handlers.Registry) {
				pubSub.Register(registry.Handlers())
			},
		),
	))
}
