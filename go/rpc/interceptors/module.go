package interceptors

import (
	"go.uber.org/fx"
	"google.golang.org/grpc"
)

func NewModule() fx.Option {
	return fx.Provide(
		fx.Annotate(newAuthInterceptor, fx.As(new(Interceptor))),
		func(interceptors []Interceptor) []grpc.ServerOption {
			var opts []grpc.ServerOption
			for _, i := range interceptors {
				opts = append(opts, grpc.UnaryInterceptor(i.Unary()))
				opts = append(opts, grpc.StreamInterceptor(i.Stream()))
			}
			return opts
		},
	)
}
