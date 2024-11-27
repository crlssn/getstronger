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

	RequestTraced *RequestTraced
}

func NewRegistry(p RegistryParams) *Registry {
	return &Registry{
		handlers: map[string]Handler{
			events.RequestTraced: p.RequestTraced,
		},
	}
}

func (r *Registry) Handlers() map[string]Handler {
	return r.handlers
}
