package container

import (
	"context"
	"database/sql"
	"time"

	"github.com/lib/pq"
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
			func(c *Container) *pq.Listener {
				return pq.NewListener(c.Connection, time.Second, time.Minute, nil)
			},
		),
		fx.Invoke(func(l fx.Lifecycle, c *Container) {
			l.Append(fx.Hook{
				OnStop: func(ctx context.Context) error {
					return c.Terminate(ctx)
				},
			})
		}),
	))
}
