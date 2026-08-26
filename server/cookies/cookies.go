package cookies

import (
	"fmt"
	"net/http"

	"github.com/crlssn/getstronger/server/config"
	"github.com/crlssn/getstronger/server/gen/proto/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/jwt"
)

type Cookies struct {
	config *config.Config
}

func New(c *config.Config) *Cookies {
	return &Cookies{c}
}

const CookieNameRefreshToken = "refreshToken"

func (c *Cookies) RefreshToken(value string) *http.Cookie {
	secure := c.usesSecureCookies()

	return &http.Cookie{ //nolint:gosec // Secure and SameSite follow production or local TLS configuration.
		Name:     CookieNameRefreshToken,
		Value:    value,
		Path:     fmt.Sprintf("/%s", apiv1connect.AuthServiceName),
		Domain:   c.config.Server.CookieDomain,
		MaxAge:   int(jwt.ExpiryTimeRefresh.Seconds()),
		Secure:   secure,
		HttpOnly: true,
		SameSite: sameSiteMode(secure),
	}
}

func (c *Cookies) ExpiredRefreshToken() *http.Cookie {
	secure := c.usesSecureCookies()

	return &http.Cookie{ //nolint:gosec // Secure and SameSite follow production or local TLS configuration.
		Name:     CookieNameRefreshToken,
		Value:    "",
		Path:     fmt.Sprintf("/%s", apiv1connect.AuthServiceName),
		Domain:   c.config.Server.CookieDomain,
		MaxAge:   -1,
		Secure:   secure,
		HttpOnly: true,
		SameSite: sameSiteMode(secure),
	}
}

func (c *Cookies) usesSecureCookies() bool {
	return c.config.Environment == config.EnvironmentProduction ||
		c.config.Environment == config.EnvironmentBeta ||
		c.config.Server.HasCertificate()
}

func sameSiteMode(secure bool) http.SameSite {
	if secure {
		return http.SameSiteNoneMode
	}

	// The cross-site request handling varies depending on the browser which may
	// affect auth because the browser may not properly store the refresh token.
	return http.SameSiteDefaultMode
}
