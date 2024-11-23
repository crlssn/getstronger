package rpc

import (
	"context"
	"fmt"
	"net/http"

	"connectrpc.com/connect"
	"go.uber.org/fx"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"

	"github.com/crlssn/getstronger/server/pkg/config"
	apiv1connect2 "github.com/crlssn/getstronger/server/pkg/pb/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/rpc/interceptors"
	"github.com/crlssn/getstronger/server/rpc/middlewares"
	v2 "github.com/crlssn/getstronger/server/rpc/v1"
)

func Module() fx.Option {
	return fx.Options(
		interceptors.Module(),
		fx.Provide(
			registerHandlers,
			v2.NewAuthHandler,
			v2.NewRoutineHandler,
			v2.NewWorkoutHandler,
			v2.NewExerciseHandler,
			middlewares.New,
		),
		fx.Invoke(
			startServer,
		),
	)
}

type Handlers struct {
	fx.In

	Auth     apiv1connect2.AuthServiceHandler
	Routine  apiv1connect2.RoutineServiceHandler
	Workout  apiv1connect2.WorkoutServiceHandler
	Exercise apiv1connect2.ExerciseServiceHandler
}

func registerHandlers(p Handlers, o []connect.HandlerOption, m *middlewares.Middleware) *http.ServeMux {
	handlers := []func(opts ...connect.HandlerOption) (string, http.Handler){
		func(opts ...connect.HandlerOption) (string, http.Handler) {
			return apiv1connect2.NewAuthServiceHandler(p.Auth, opts...)
		},
		func(opts ...connect.HandlerOption) (string, http.Handler) {
			return apiv1connect2.NewRoutineServiceHandler(p.Routine, opts...)
		},
		func(opts ...connect.HandlerOption) (string, http.Handler) {
			return apiv1connect2.NewWorkoutServiceHandler(p.Workout, opts...)
		},
		func(opts ...connect.HandlerOption) (string, http.Handler) {
			return apiv1connect2.NewExerciseServiceHandler(p.Exercise, opts...)
		},
	}

	mux := http.NewServeMux()
	for _, h := range handlers {
		path, handler := h(o...)
		mux.Handle(path, m.Register(handler))
	}

	return mux
}

func startServer(lc fx.Lifecycle, c *config.Config, mux *http.ServeMux) {
	lc.Append(fx.Hook{
		OnStart: func(_ context.Context) error {
			go func() {
				address := fmt.Sprintf(":%s", c.Server.Port)
				err := http.ListenAndServeTLS(address, c.Server.CertPath, c.Server.KeyPath, h2c.NewHandler(mux, &http2.Server{}))
				if err != nil {
					panic(fmt.Errorf("listen and serve: %w", err))
				}
			}()
			return nil
		},
		OnStop: func(_ context.Context) error {
			return nil
		},
	})
}
