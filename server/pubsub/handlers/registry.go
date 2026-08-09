package handlers

import (
	"go.uber.org/fx"

	"github.com/crlssn/getstronger/server/repo"
)

type Registry struct {
	handlers map[repo.EventTopic]Handler
}

type RegistryParams struct {
	fx.In

	FollowedUser         *FollowedUser
	RequestTraced        *RequestTraced
	WorkoutCommentPosted *WorkoutCommentPosted
}

func NewRegistry(p RegistryParams) *Registry {
	return &Registry{
		handlers: map[repo.EventTopic]Handler{
			repo.EventTopicFollowedUser:         p.FollowedUser,
			repo.EventTopicRequestTraced:        p.RequestTraced,
			repo.EventTopicWorkoutCommentPosted: p.WorkoutCommentPosted,
		},
	}
}

func (r *Registry) Handlers() map[repo.EventTopic]Handler {
	return r.handlers
}
