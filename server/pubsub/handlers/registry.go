package handlers

import (
	"go.uber.org/fx"

	"github.com/crlssn/getstronger/server/pubsub/events"
)

type Registry struct {
	handlers map[events.Topic]Handler
}

type RegistryParams struct {
	fx.In

	FollowedUser         *FollowedUser
	RequestTraced        *RequestTraced
	WorkoutCommentPosted *WorkoutCommentPosted
}

func NewRegistry(p RegistryParams) *Registry {
	return &Registry{
		handlers: map[events.Topic]Handler{
			events.TopicFollowedUser:         p.FollowedUser,
			events.TopicRequestTraced:        p.RequestTraced,
			events.TopicWorkoutCommentPosted: p.WorkoutCommentPosted,
		},
	}
}

func (r *Registry) Handlers() map[events.Topic]Handler {
	return r.handlers
}
