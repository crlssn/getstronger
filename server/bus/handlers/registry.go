package handlers

import (
	"go.uber.org/fx"

	"github.com/crlssn/getstronger/server/bus/events"
)

type Registry struct {
	handlers map[string]Handler
}

type RegistryParams struct {
	fx.In

	UserFollowed         *UserFollowed
	RequestTraced        *RequestTraced
	WorkoutCommentPosted *WorkoutCommentPosted
}

func NewRegistry(p RegistryParams) *Registry {
	return &Registry{
		handlers: map[string]Handler{
			events.UserFollowed:         p.UserFollowed,
			events.RequestTraced:        p.RequestTraced,
			events.WorkoutCommentPosted: p.WorkoutCommentPosted,
		},
	}
}

func (r *Registry) Handlers() map[string]Handler {
	return r.handlers
}
