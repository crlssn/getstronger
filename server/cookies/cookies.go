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
	return &http.Cookie{
		Name:     CookieNameRefreshToken,
		Value:    value,
		Path:     fmt.Sprintf("/%s", apiv1connect.AuthServiceName),
		Domain:   c.config.Server.CookieDomain,
		MaxAge:   int(jwt.ExpiryTimeRefresh),
		Secure:   c.config.Server.UsingHTTPS(),
		HttpOnly: true,
		SameSite: c.sameSiteMode(),
	}
}

func (c *Cookies) ExpiredRefreshToken() *http.Cookie {
	return &http.Cookie{
		Name:     CookieNameRefreshToken,
		Value:    "",
		Path:     fmt.Sprintf("/%s", apiv1connect.AuthServiceName),
		Domain:   c.config.Server.CookieDomain,
		MaxAge:   -1,
		Secure:   c.config.Server.UsingHTTPS(),
		HttpOnly: true,
		SameSite: c.sameSiteMode(),
	}
}

func (c *Cookies) sameSiteMode() http.SameSite {
	if c.config.Server.UsingHTTPS() {
		return http.SameSiteNoneMode
	}

	// The cross-site request handling varies depending on the browser which may
	// affect auth because the browser may not properly store the refresh token.
	return http.SameSiteDefaultMode
}
