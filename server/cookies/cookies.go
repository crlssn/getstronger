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
		Secure:   c.secure(),
		HttpOnly: true,
		SameSite: c.sameSite(),
	}
}

func (c *Cookies) secure() bool {
	return c.config.Environment != config.EnvironmentLocal
}

func (c *Cookies) sameSite() http.SameSite {
	if c.config.Environment == config.EnvironmentLocal {
		return http.SameSiteDefaultMode
	}

	return http.SameSiteNoneMode
}

func (c *Cookies) ExpiredRefreshToken() *http.Cookie {
	return &http.Cookie{
		Name:     CookieNameRefreshToken,
		Value:    "",
		Path:     fmt.Sprintf("/%s", apiv1connect.AuthServiceName),
		Domain:   c.config.Server.CookieDomain,
		MaxAge:   -1,
		Secure:   c.secure(),
		HttpOnly: true,
		SameSite: c.sameSite(),
	}
}
