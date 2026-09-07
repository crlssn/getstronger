package interceptors

import (
	"connectrpc.com/connect"
	"go.uber.org/fx"

	"github.com/crlssn/getstronger/server/config"
	"github.com/crlssn/getstronger/server/repo"
)

const (
	fxAuth          = `name:"auth"`
	fxAuthRateLimit = `name:"authRateLimit"`
	fxValidator     = `name:"validator"`
)

func Module() fx.Option {
	return fx.Module("interceptors", fx.Options(
		fx.Provide(
			config.NewAuthRateLimit,
			func(store *repo.Repo) authAttempts { return store },
			fx.Annotate(newAuthRateLimit, fx.ResultTags(fxAuthRateLimit)),
			// Named values preserve order: fx groups deliberately do not.
			fx.Annotate(
				NewAuth,
				fx.ResultTags(fxAuth),
			),
			fx.Annotate(
				newValidator,
				fx.ResultTags(fxValidator),
			),
			fx.Annotate(
				provideHandlerOptions,
				fx.ParamTags(fxAuth, fxAuthRateLimit, fxValidator),
			),
		),
	))
}

// Authentication establishes the request context; limiting precedes validation
// so malformed guest requests consume the same source budget as valid ones.
func provideHandlerOptions(auth, limit, validator connect.Interceptor) []connect.HandlerOption {
	return []connect.HandlerOption{connect.WithInterceptors(auth, limit, validator)}
}
