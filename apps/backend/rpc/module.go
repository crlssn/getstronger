package rpc

import (
	"context"
	"fmt"
	"net/http"
	"os"

	"connectrpc.com/connect"
	connectcors "connectrpc.com/cors"
	"github.com/rs/cors"
	"go.uber.org/fx"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"

	"github.com/crlssn/getstronger/apps/backend/pkg/jwt"
	"github.com/crlssn/getstronger/apps/backend/pkg/pb/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/apps/backend/rpc/interceptors"
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
		mux.Handle(path, withMiddleware(handler))
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

// TODO: Refactor middlewares to their own package.
func withMiddleware(handler http.Handler) http.Handler {
	middlewares := []func(http.Handler) http.Handler{
		middlewareCORS,
		middlewareCookie,
	}

	for _, middleware := range middlewares {
		handler = middleware(handler)
	}

	return handler
}

func middlewareCORS(h http.Handler) http.Handler {
	middleware := cors.New(cors.Options{
		AllowedOrigins: []string{os.Getenv("CORS_ALLOWED_ORIGIN")},
		AllowedMethods: []string{
			http.MethodGet,
			http.MethodPost,
			http.MethodOptions,
		},
		AllowedHeaders: []string{
			"Content-Type",
			"Connect-Protocol-Version",
			"Connect-Timeout-Ms",
			"Grpc-Timeout",
			"X-Grpc-Web",
			"X-User-Agent",
			"Authorization",
		},
		ExposedHeaders: connectcors.ExposedHeaders(),
	})
	return middleware.Handler(h)
}

func middlewareCookie(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("refreshToken")
		if err == nil {
			ctx := context.WithValue(r.Context(), jwt.ContextKeyRefreshToken, cookie.Value)
			r = r.WithContext(ctx)
		}

		h.ServeHTTP(w, r)
	})
}
