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

// A workout's recording_json may be 5 MB (workout_service.proto) and JSON
// transport escapes it, so the largest legitimate body is about twice that.
const handlerReadMaxBytes = 12 << 20

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
// The cap precedes all three: connect buffers and unmarshals a body before the
// chain runs, so without it a gzipped megabyte expands to gigabytes unrefused.
func provideHandlerOptions(auth, limit, validator connect.Interceptor) []connect.HandlerOption {
	return []connect.HandlerOption{
		connect.WithReadMaxBytes(handlerReadMaxBytes),
		connect.WithInterceptors(auth, limit, validator),
	}
}
