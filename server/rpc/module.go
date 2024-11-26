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
	"github.com/crlssn/getstronger/server/pkg/pb/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/rpc/interceptors"
	"github.com/crlssn/getstronger/server/rpc/middlewares"
	v1 "github.com/crlssn/getstronger/server/rpc/v1"
)

func Module() fx.Option {
	return fx.Options(
		interceptors.Module(),
		fx.Provide(
			registerHandlers,
			v1.NewAuthHandler,
			v1.NewUserHandler,
			v1.NewRoutineHandler,
			v1.NewWorkoutHandler,
			v1.NewExerciseHandler,
			middlewares.New,
		),
		fx.Invoke(
			startServer,
		),
	)
}

type Handlers struct {
	fx.In

	Auth     apiv1connect.AuthServiceHandler
	User     apiv1connect.UserServiceHandler
	Routine  apiv1connect.RoutineServiceHandler
	Workout  apiv1connect.WorkoutServiceHandler
	Exercise apiv1connect.ExerciseServiceHandler
}

func registerHandlers(p Handlers, o []connect.HandlerOption, m *middlewares.Middleware) *http.ServeMux {
	handlers := []func(opts ...connect.HandlerOption) (string, http.Handler){
		func(opts ...connect.HandlerOption) (string, http.Handler) {
			return apiv1connect.NewAuthServiceHandler(p.Auth, opts...)
		},
		func(opts ...connect.HandlerOption) (string, http.Handler) {
			return apiv1connect.NewUserServiceHandler(p.User, opts...)
		},
		func(opts ...connect.HandlerOption) (string, http.Handler) {
			return apiv1connect.NewRoutineServiceHandler(p.Routine, opts...)
		},
		func(opts ...connect.HandlerOption) (string, http.Handler) {
			return apiv1connect.NewWorkoutServiceHandler(p.Workout, opts...)
		},
		func(opts ...connect.HandlerOption) (string, http.Handler) {
			return apiv1connect.NewExerciseServiceHandler(p.Exercise, opts...)
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
