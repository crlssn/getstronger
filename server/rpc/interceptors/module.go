package interceptors

import (
	"connectrpc.com/connect"
	"go.uber.org/fx"
)

const fxGroupInterceptors = `group:"interceptors"`

func Module() fx.Option {
	return fx.Options(
		fx.Provide(
			// Annotate the interceptors to provide a slice of their interface.
			fx.Annotate(
				newAuth,
				fx.ResultTags(fxGroupInterceptors),
			),
			fx.Annotate(
				newValidator,
				fx.ResultTags(fxGroupInterceptors),
			),
			fx.Annotate(
				provideHandlerOptions,
				fx.ParamTags(fxGroupInterceptors),
			),
		),
	)
}

func provideHandlerOptions(interceptors []connect.Interceptor) []connect.HandlerOption {
	opts := make([]connect.HandlerOption, 0, len(interceptors))
	for _, interceptor := range interceptors {
		opts = append(opts, connect.WithInterceptors(interceptor))
	}
	return opts
}
