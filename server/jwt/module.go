package jwt

import (
	"go.uber.org/fx"

	"github.com/crlssn/getstronger/server/config"
)

func Module() fx.Option {
	return fx.Module("jwt", fx.Provide(
		func(c *config.Config) *Issuer {
			return NewIssuer([]byte(c.JWT.AccessTokenKey), []byte(c.JWT.RefreshTokenKey))
		},
	))
}
