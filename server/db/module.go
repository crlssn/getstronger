package db

import (
	"context"
	"database/sql"
	"time"

	"github.com/lib/pq"
	"go.uber.org/fx"

	"github.com/crlssn/getstronger/server/config"
)

func Module() fx.Option {
	return fx.Module("db", fx.Options(
		fx.Provide(
			New,
			func(c *config.Config) *pq.Listener {
				return pq.NewListener(connection(c), time.Second, time.Minute, nil)
			},
		),
		fx.Invoke(func(l fx.Lifecycle, db *sql.DB) {
			l.Append(fx.Hook{
				OnStart: func(ctx context.Context) error {
					return db.PingContext(ctx)
				},
				OnStop: func(_ context.Context) error {
					return db.Close()
				},
			})
		}),
	))
}
