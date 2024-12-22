package server

import (
	"net/http"

	"connectrpc.com/connect"
	"go.uber.org/fx"

	"github.com/crlssn/getstronger/server/gen/proto/api/v1/apiv1connect"
	handlers "github.com/crlssn/getstronger/server/rpc/handlers/v1"
	"github.com/crlssn/getstronger/server/rpc/interceptors"
	"github.com/crlssn/getstronger/server/rpc/middlewares"
)

func Module() fx.Option {
	return fx.Module("rpc", fx.Options(
		interceptors.Module(),
		fx.Provide(
			newServer,
			registerHandlers,
			handlers.NewAuthHandler,
			handlers.NewFeedHandler,
			handlers.NewUserHandler,
			handlers.NewRoutineHandler,
			handlers.NewWorkoutHandler,
			handlers.NewExerciseHandler,
			handlers.NewNotificationHandler,
			middlewares.New,
		),
		fx.Invoke(func(lc fx.Lifecycle, s *Server) {
			lc.Append(fx.Hook{
				OnStart: s.ListenAndServe,
				OnStop:  s.server.Shutdown,
			})
		}),
	))
}

type Handlers struct {
	fx.In

	Auth         apiv1connect.AuthServiceHandler
	Feed         apiv1connect.FeedServiceHandler
	User         apiv1connect.UserServiceHandler
	Routine      apiv1connect.RoutineServiceHandler
	Workout      apiv1connect.WorkoutServiceHandler
	Exercise     apiv1connect.ExerciseServiceHandler
	Notification apiv1connect.NotificationServiceHandler
}

func registerHandlers(p Handlers, o []connect.HandlerOption, m *middlewares.Middleware) *http.ServeMux {
	handlers := []func(opts ...connect.HandlerOption) (string, http.Handler){
		func(opts ...connect.HandlerOption) (string, http.Handler) {
			return apiv1connect.NewAuthServiceHandler(p.Auth, opts...)
		},
		func(opts ...connect.HandlerOption) (string, http.Handler) {
			return apiv1connect.NewFeedServiceHandler(p.Feed, opts...)
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
		func(opts ...connect.HandlerOption) (string, http.Handler) {
			return apiv1connect.NewNotificationServiceHandler(p.Notification, opts...)
		},
	}

	mux := http.NewServeMux()
	for _, h := range handlers {
		path, handler := h(o...)
		mux.Handle(path, m.Register(handler))
	}

	return mux
}
