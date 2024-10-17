package rpc

import (
	"net/http"

	"connectrpc.com/connect"
	"go.uber.org/fx"

	"github.com/crlssn/getstronger/go/pkg/pb/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/go/rpc/auth"
	"github.com/crlssn/getstronger/go/rpc/interceptors"
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
			auth.NewHandler,
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

	Auth apiv1connect.AuthServiceHandler
}

func newHandlers(p Handlers) []Handler {
	return []Handler{
		func(options ...connect.HandlerOption) (string, http.Handler) {
			return apiv1connect.NewAuthServiceHandler(p.Auth, options...)
		},
	}
}

func registerHandlers(lc fx.Lifecycle, handlers []Handler, options []connect.HandlerOption) {
	// Create your HTTP server or router.
	mux := http.NewServeMux()

	// Register each handler.
	for _, h := range handlers {
		path, handler := h(options...)
		mux.Handle(path, handler)
	}

	if err := http.ListenAndServe(":8080", mux); err != nil {
		panic(err)
	}

	// Start the HTTP server.
	//lc.Append(fx.Hook{
	//	OnStart: func(_ context.Context) error {
	//		println("Starting server")
	//		if err := http.ListenAndServe("localhost:9876", mux); err != nil {
	//			panic(err)
	//		}
	//		return nil
	//		//return http.ListenAndServe(":8080", h2c.NewHandler(mux, &http2.Server{}))
	//	},
	//	OnStop: func(_ context.Context) error {
	//		return nil
	//	},
	//})
}
