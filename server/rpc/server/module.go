package server

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

	"github.com/crlssn/getstronger/server/config"
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

const (
	readTimeout = 10 * time.Second
	idleTimeout = 120 * time.Second
)

type Server struct {
	keyPath  string
	certPath string
	server   *http.Server
}

func newServer(config *config.Config, mux *http.ServeMux) *Server {
	return &Server{
		keyPath:  config.Server.KeyPath,
		certPath: config.Server.CertPath,
		server: &http.Server{
			Addr:         fmt.Sprintf(":%s", config.Server.Port),
			Handler:      h2c.NewHandler(mux, &http2.Server{}),
			ReadTimeout:  readTimeout,
			WriteTimeout: 0,
			IdleTimeout:  idleTimeout,
			TLSConfig: &tls.Config{
				MinVersion: tls.VersionTLS12,
			},
		},
	}
}

func (s *Server) ListenAndServe(_ context.Context) error {
	go func() {
		if err := s.listenAndServe(); err != nil {
			if errors.Is(err, http.ErrServerClosed) {
				return
			}
			log.Fatalf("listen and serve: %v", err)
		}
	}()
	return nil
}

func (s *Server) listenAndServe() error {
	if s.certPath == "" && s.keyPath == "" {
		return s.server.ListenAndServe() //nolint:wrapcheck
	}

	return s.server.ListenAndServeTLS(s.certPath, s.keyPath) //nolint:wrapcheck
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
