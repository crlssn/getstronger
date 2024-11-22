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

func provideHandlerOptions(i []Interceptor) []connect.HandlerOption {
	opts := make([]connect.HandlerOption, 0, len(i))
	for _, j := range i {
		opts = append(opts, connect.WithInterceptors(j.Unary()))
	}
	return opts
}
