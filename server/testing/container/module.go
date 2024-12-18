package container

import (
	"context"
	"database/sql"

	"go.uber.org/fx"
)

func Module() fx.Option {
	return fx.Module("testing-container", fx.Options(
		fx.Provide(
			NewContainer,
			context.Background,
			func(c *Container) *sql.DB {
				return c.DB
			},
		),
		fx.Invoke(func(l fx.Lifecycle, c *Container) {
			l.Append(fx.Hook{
				OnStop: c.Terminate,
			})
		}),
	))
}
