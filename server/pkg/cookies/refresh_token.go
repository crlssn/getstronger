package cookies

import (
	"fmt"
	"net/http"

	"github.com/crlssn/getstronger/server/pkg/jwt"
	"github.com/crlssn/getstronger/server/pkg/pb/api/v1/apiv1connect"
)

const cookieNameRefreshToken = "refreshToken"

func RefreshToken(domain, value string) *http.Cookie {
	return &http.Cookie{
		Name:     cookieNameRefreshToken,
		Value:    value,
		Path:     fmt.Sprintf("/%s", apiv1connect.AuthServiceName),
		Domain:   domain,
		MaxAge:   int(jwt.ExpiryTimeRefresh),
		Secure:   true,
		HttpOnly: true,
		SameSite: http.SameSiteNoneMode,
	}
}

func InvalidateRefreshToken(domain string) *http.Cookie {
	return &http.Cookie{
		Name:     cookieNameRefreshToken,
		Value:    "",
		Path:     fmt.Sprintf("/%s", apiv1connect.AuthServiceName),
		Domain:   domain,
		MaxAge:   -1,
		Secure:   true,
		HttpOnly: true,
		SameSite: http.SameSiteNoneMode,
	}
}
