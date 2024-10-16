package interceptors

import (
	"go.uber.org/fx"
	"google.golang.org/grpc"
)

const fxGroupInterceptors = `group:"interceptors"`

func NewModule() fx.Option {
	return fx.Provide(
		fx.Annotate(
			newAuth,
			fx.ResultTags(fxGroupInterceptors),
		),
		fx.Annotate(
			newValidator,
			fx.ResultTags(fxGroupInterceptors),
		),
		fx.Annotate(
			newServerOptions,
			fx.ParamTags(fxGroupInterceptors),
		),
	)
}

func newServerOptions(interceptors []Interceptor) []grpc.ServerOption {
	var opts []grpc.ServerOption
	for _, i := range interceptors {
		opts = append(opts, grpc.UnaryInterceptor(i.Unary()))
		opts = append(opts, grpc.StreamInterceptor(i.Stream()))
	}
	return opts
}
