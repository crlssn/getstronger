package jwt

import "go.uber.org/fx"

func Module() fx.Option {
	return fx.Provide(
		func() *Manager {
			return NewManager([]byte("access-key"), []byte("refresh-key"))
		},
	)
}
