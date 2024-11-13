package rpc

import (
	"context"
	"net/http"

	"connectrpc.com/connect"
	connectcors "connectrpc.com/cors"
	"github.com/rs/cors"
	"go.uber.org/fx"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"

	"github.com/crlssn/getstronger/go/pkg/jwt"
	"github.com/crlssn/getstronger/go/pkg/pb/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/go/rpc/interceptors"
	"github.com/crlssn/getstronger/go/rpc/v1"
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
			v1.NewExerciseHandler,
		),
		fx.Invoke(
			registerHandlers,
		),
	)
}

func newInterceptors(interceptors []interceptors.Interceptor) []connect.HandlerOption {
	var opts []connect.HandlerOption
	for _, i := range interceptors {
		opts = append(opts, connect.WithInterceptors(i.Unary()))
	}
	return opts
}

type Handlers struct {
	fx.In

	Auth     apiv1connect.AuthServiceHandler
	Exercise apiv1connect.ExerciseServiceHandler
}

func newHandlers(p Handlers) []Handler {
	return []Handler{
		func(options ...connect.HandlerOption) (string, http.Handler) {
			return apiv1connect.NewAuthServiceHandler(p.Auth, options...)
		},
		func(options ...connect.HandlerOption) (string, http.Handler) {
			return apiv1connect.NewExerciseServiceHandler(p.Exercise, options...)
		},
	}
}

const (
	certFile = "/Users/christian/Code/crlssn/getstronger/.secrets/localhost.crt"
	keyFile  = "/Users/christian/Code/crlssn/getstronger/.secrets/localhost.key"
)

func registerHandlers(lc fx.Lifecycle, handlers []Handler, options []connect.HandlerOption) {
	mux := http.NewServeMux()
	for _, h := range handlers {
		path, handler := h(options...)
		mux.Handle(path, CookieMiddleware(withCORS(handler)))
	}

	lc.Append(fx.Hook{
		OnStart: func(_ context.Context) error {
			go func() {
				if err := http.ListenAndServe(":1234", h2c.NewHandler(mux, &http2.Server{})); err != nil {
					panic(err)
				}
				//if err := http.ListenAndServeTLS(":1234", certFile, keyFile, h2c.NewHandler(mux, &http2.Server{})); err != nil {
				//	panic(err)
				//}
			}()
			return nil
		},
		OnStop: func(_ context.Context) error {
			return nil
		},
	})
}

func withCORS(h http.Handler) http.Handler {
	middleware := cors.New(cors.Options{
		AllowedOrigins: []string{"https://localhost:5173"},
		AllowedMethods: []string{
			http.MethodGet,
			http.MethodPost,
			http.MethodOptions,
		},
		AllowedHeaders: []string{
			"Content-Type",             // for all protocols
			"Connect-Protocol-Version", // for Connect
			"Connect-Timeout-Ms",       // for Connect
			"Grpc-Timeout",             // for gRPC-web
			"X-Grpc-Web",               // for gRPC-web
			"X-User-Agent",             // for all protocols
			"Authorization",            // for all protocols
		},
		ExposedHeaders:   connectcors.ExposedHeaders(),
		AllowCredentials: true,
	})
	return middleware.Handler(h)
}

func CookieMiddleware(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("refreshToken")
		if err == nil {
			ctx := context.WithValue(r.Context(), jwt.ContextKeyRefreshToken, cookie.Value)
			r = r.WithContext(ctx)
		}

		h.ServeHTTP(w, r)
	})
}
