package jwt

import (
	"go.uber.org/fx"

	"github.com/crlssn/getstronger/server/config"
)

// Module builds the issuer from the environment, and refuses to build one from
// keys it cannot trust. An unusable key is a deployment mistake rather than a
// request-time condition, so it stops the process at startup instead of serving
// sessions that mean nothing.
func Module() fx.Option {
	return fx.Module("jwt", fx.Provide(
		func(c *config.Config) (*Issuer, error) {
			secrets := Secrets{
				AccessKey:  []byte(c.JWT.AccessTokenKey),
				RefreshKey: []byte(c.JWT.RefreshTokenKey),
			}
			if err := secrets.Validate(); err != nil {
				return nil, err
			}

			return NewIssuer(secrets.AccessKey, secrets.RefreshKey), nil
		},
	))
}
