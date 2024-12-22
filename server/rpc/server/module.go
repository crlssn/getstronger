package server

import (
	"net/http"

	"connectrpc.com/connect"
	"go.uber.org/fx"

	"github.com/crlssn/getstronger/server/rpc/handlers"
	"github.com/crlssn/getstronger/server/rpc/interceptors"
	"github.com/crlssn/getstronger/server/rpc/middlewares"
)

func Module() fx.Option {
	return fx.Module("rpc", fx.Options(
		fx.Provide(
			New,
			NewMultiplexer,
			middlewares.New,
		),
		handlers.Module(),
		interceptors.Module(),
		fx.Invoke(func(lc fx.Lifecycle, s *Server) {
			lc.Append(fx.Hook{
				OnStart: s.ListenAndServe,
				OnStop:  s.server.Shutdown,
			})
		}),
	))
}

func NewMultiplexer(handlers []handlers.HandlerFunc, o []connect.HandlerOption, m *middlewares.Middleware) *http.ServeMux {
	mux := http.NewServeMux()
	for _, h := range handlers {
		path, handler := h(o...)
		mux.Handle(path, m.Register(handler))
	}

	return mux
}
