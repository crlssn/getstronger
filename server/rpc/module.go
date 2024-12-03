package rpc

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"log"
	"net/http"
	"time"

	"connectrpc.com/connect"
	"go.uber.org/fx"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"

	"github.com/crlssn/getstronger/server/pkg/config"
	"github.com/crlssn/getstronger/server/pkg/pb/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/pkg/stream"
	"github.com/crlssn/getstronger/server/rpc/interceptors"
	"github.com/crlssn/getstronger/server/rpc/middlewares"
	v1 "github.com/crlssn/getstronger/server/rpc/v1"
)

func Module() fx.Option {
	return fx.Module("rpc", fx.Options(
		interceptors.Module(),
		fx.Provide(
			registerHandlers,
			v1.NewAuthHandler,
			v1.NewFeedHandler,
			v1.NewUserHandler,
			v1.NewRoutineHandler,
			v1.NewWorkoutHandler,
			v1.NewExerciseHandler,
			v1.NewNotificationHandler,
			middlewares.New,
		),
		fx.Invoke(
			startServer,
		),
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

const (
	readTimeout = 10 * time.Second
	idleTimeout = 120 * time.Second
)

func startServer(l fx.Lifecycle, c *config.Config, m *http.ServeMux, conn *stream.Conn) {
	s := &http.Server{
		Addr:         fmt.Sprintf(":%s", c.Server.Port),
		Handler:      h2c.NewHandler(m, &http2.Server{}),
		ReadTimeout:  readTimeout,
		WriteTimeout: 0,
		IdleTimeout:  idleTimeout,
		TLSConfig: &tls.Config{
			MinVersion: tls.VersionTLS12,
		},
	}

	s.RegisterOnShutdown(conn.Cancel)

	l.Append(fx.Hook{
		OnStart: func(_ context.Context) error {
			go func() {
				if err := s.ListenAndServeTLS(c.Server.CertPath, c.Server.KeyPath); err != nil {
					if errors.Is(err, http.ErrServerClosed) {
						return
					}
					log.Fatalf("listen and serve: %v", err)
				}
			}()
			return nil
		},
		OnStop: func(ctx context.Context) error {
			return s.Shutdown(ctx)
		},
	})
}
