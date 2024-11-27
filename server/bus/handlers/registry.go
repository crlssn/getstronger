package handlers

import (
	"go.uber.org/fx"

	"github.com/crlssn/getstronger/server/bus/events"
)

type Registry struct {
	handlers map[events.Event]Handler
}

type RegistryParams struct {
	fx.In

	HandlerRequestTraced *RequestTraced
}

func NewRegistry(p RegistryParams) *Registry {
	return &Registry{
		handlers: map[events.Event]Handler{
			new(events.EventRequestTraced): p.HandlerRequestTraced,
		},
	}
}

func (r *Registry) Handlers() map[events.Event]Handler {
	return r.handlers
}
