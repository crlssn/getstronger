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
		Secure:   true,
		HttpOnly: true,
		SameSite: http.SameSiteNoneMode,
	}
}

func (c *Cookies) ExpiredRefreshToken() *http.Cookie {
	return &http.Cookie{
		Name:     CookieNameRefreshToken,
		Value:    "",
		Path:     fmt.Sprintf("/%s", apiv1connect.AuthServiceName),
		Domain:   c.config.Server.CookieDomain,
		MaxAge:   -1,
		Secure:   true,
		HttpOnly: true,
		SameSite: http.SameSiteNoneMode,
	}
}
