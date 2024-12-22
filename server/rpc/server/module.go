package server

import (
	"go.uber.org/fx"

	"github.com/crlssn/getstronger/server/rpc/handlers"
	"github.com/crlssn/getstronger/server/rpc/interceptors"
	"github.com/crlssn/getstronger/server/rpc/middlewares"
)

func Module() fx.Option {
	return fx.Module("rpc", fx.Options(
		fx.Provide(
			NewServer,
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
