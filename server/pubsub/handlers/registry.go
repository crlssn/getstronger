package handlers

import (
	"go.uber.org/fx"

	"github.com/crlssn/getstronger/server/gen/orm"
)

type Registry struct {
	handlers map[orm.EventTopic]Handler
}

type RegistryParams struct {
	fx.In

	FollowedUser         *FollowedUser
	RequestTraced        *RequestTraced
	WorkoutCommentPosted *WorkoutCommentPosted
}

func NewRegistry(p RegistryParams) *Registry {
	return &Registry{
		handlers: map[orm.EventTopic]Handler{
			orm.EventTopicFollowedUser:         p.FollowedUser,
			orm.EventTopicRequestTraced:        p.RequestTraced,
			orm.EventTopicWorkoutCommentPosted: p.WorkoutCommentPosted,
		},
	}
}

func (r *Registry) Handlers() map[orm.EventTopic]Handler {
	return r.handlers
}
