package rpc

import (
	"context"
	"fmt"
	"net/http"
	"os"

	"connectrpc.com/connect"
	"go.uber.org/fx"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"

	"github.com/crlssn/getstronger/apps/backend/pkg/pb/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/apps/backend/rpc/interceptors"
	"github.com/crlssn/getstronger/apps/backend/rpc/middlewares"
	v1 "github.com/crlssn/getstronger/apps/backend/rpc/v1"
)

type Handler func(opts ...connect.HandlerOption) (string, http.Handler)

const fxGroupInterceptors = `group:"interceptors"`

func NewModule() fx.Option {
	return fx.Options(
		fx.Provide(
			fx.Annotate(
				interceptors.NewAuth,
				fx.ResultTags(fxGroupInterceptors),
			),
			fx.Annotate(
				interceptors.NewValidator,
				fx.ResultTags(fxGroupInterceptors),
			),
			fx.Annotate(
				newInterceptors,
				fx.ParamTags(fxGroupInterceptors),
			),
			newHandlers,
			v1.NewAuthHandler,
			v1.NewRoutineHandler,
			v1.NewWorkoutHandler,
			v1.NewExerciseHandler,
		),
		fx.Invoke(
			registerHandlers,
		),
	)
}

func newInterceptors(i []interceptors.Interceptor) []connect.HandlerOption {
	opts := make([]connect.HandlerOption, 0, len(i))
	for _, i := range i {
		opts = append(opts, connect.WithInterceptors(i.Unary()))
	}
	return opts
}

type Handlers struct {
	fx.In

	Auth     apiv1connect.AuthServiceHandler
	Routine  apiv1connect.RoutineServiceHandler
	Workout  apiv1connect.WorkoutServiceHandler
	Exercise apiv1connect.ExerciseServiceHandler
}

func newHandlers(p Handlers) []Handler {
	return []Handler{
		func(options ...connect.HandlerOption) (string, http.Handler) {
			return apiv1connect.NewAuthServiceHandler(p.Auth, options...)
		},
		func(options ...connect.HandlerOption) (string, http.Handler) {
			return apiv1connect.NewRoutineServiceHandler(p.Routine, options...)
		},
		func(options ...connect.HandlerOption) (string, http.Handler) {
			return apiv1connect.NewWorkoutServiceHandler(p.Workout, options...)
		},
		func(options ...connect.HandlerOption) (string, http.Handler) {
			return apiv1connect.NewExerciseServiceHandler(p.Exercise, options...)
		},
	}
}

func registerHandlers(lc fx.Lifecycle, handlers []Handler, options []connect.HandlerOption) {
	mux := http.NewServeMux()
	for _, h := range handlers {
		path, handler := h(options...)
		mux.Handle(path, middlewares.Register(handler))
	}

	lc.Append(fx.Hook{
		OnStart: func(_ context.Context) error {
			go func() {
				if err := http.ListenAndServeTLS(fmt.Sprintf(":%s", os.Getenv("SERVER_PORT")), os.Getenv("SERVER_CERT_PATH"), os.Getenv("SERVER_KEY_PATH"), h2c.NewHandler(mux, &http2.Server{})); err != nil {
					panic(err)
				}
			}()
			return nil
		},
		OnStop: func(_ context.Context) error {
			return nil
		},
	})
}
