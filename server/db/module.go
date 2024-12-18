package db

import (
	"context"
	"database/sql"

	"go.uber.org/fx"
)

func Module() fx.Option {
	return fx.Module("db", fx.Options(
		fx.Provide(New),
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
