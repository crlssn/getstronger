package handlers

import (
	"net/http"

	"connectrpc.com/connect"
	"go.uber.org/fx"

	"github.com/crlssn/getstronger/server/gen/proto/api/v1/apiv1connect"
	handlers "github.com/crlssn/getstronger/server/rpc/handlers/v1"
)

func Module() fx.Option {
	return fx.Options(
		fx.Provide(
			BuildHandlers,
			handlers.NewAuthHandler,
			handlers.NewFeedHandler,
			handlers.NewUserHandler,
			handlers.NewRoutineHandler,
			handlers.NewWorkoutHandler,
			handlers.NewExerciseHandler,
			handlers.NewNotificationHandler,
		),
	)
}

type BuildHandlersOpts struct {
	fx.In

	Auth         apiv1connect.AuthServiceHandler
	Feed         apiv1connect.FeedServiceHandler
	User         apiv1connect.UserServiceHandler
	Routine      apiv1connect.RoutineServiceHandler
	Workout      apiv1connect.WorkoutServiceHandler
	Exercise     apiv1connect.ExerciseServiceHandler
	Notification apiv1connect.NotificationServiceHandler
}

type HandlerFunc func(opts ...connect.HandlerOption) (string, http.Handler)

func BuildHandlers(p BuildHandlersOpts) []HandlerFunc {
	return []HandlerFunc{
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
}
