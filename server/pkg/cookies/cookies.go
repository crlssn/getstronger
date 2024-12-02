package cookies

import (
	"fmt"
	"net/http"

	"github.com/crlssn/getstronger/server/pkg/config"
	"github.com/crlssn/getstronger/server/pkg/jwt"
	"github.com/crlssn/getstronger/server/pkg/pb/api/v1/apiv1connect"
)

type Cookies struct {
	config *config.Config
}

func New(c *config.Config) *Cookies {
	return &Cookies{c}
}

const cookieNameRefreshToken = "refreshToken"

func (c *Cookies) RefreshToken(value string) *http.Cookie {
	return &http.Cookie{
		Name:     cookieNameRefreshToken,
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
		Name:     cookieNameRefreshToken,
		Value:    "",
		Path:     fmt.Sprintf("/%s", apiv1connect.AuthServiceName),
		Domain:   c.config.Server.CookieDomain,
		MaxAge:   -1,
		Secure:   true,
		HttpOnly: true,
		SameSite: http.SameSiteNoneMode,
	}
}
