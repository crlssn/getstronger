package jwt

import (
	"os"

	"go.uber.org/fx"
)

func Module() fx.Option {
	return fx.Provide(
		func() *Manager {
			return NewManager([]byte(os.Getenv("JWT_ACCESS_TOKEN_KEY")), []byte(os.Getenv("JWT_REFRESH_TOKEN_KEY")))
		},
	)
}
