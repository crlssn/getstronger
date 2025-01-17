package cookies_test

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/config"
	"github.com/crlssn/getstronger/server/cookies"
	"github.com/crlssn/getstronger/server/gen/proto/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/jwt"
)

func TestCookies_RefreshToken(t *testing.T) {
	t.Parallel()

	cfg := new(config.Config)
	cfg.Server.KeyPath = "key_path"
	cfg.Server.CertPath = "cert_path"
	cfg.Server.CookieDomain = "cookie_domain"
	cookie := cookies.New(cfg)

	require.Equal(t, &http.Cookie{
		Name:     cookies.CookieNameRefreshToken,
		Value:    "value",
		Path:     fmt.Sprintf("/%s", apiv1connect.AuthServiceName),
		Domain:   cfg.Server.CookieDomain,
		MaxAge:   int(jwt.ExpiryTimeRefresh),
		Secure:   true,
		HttpOnly: true,
		SameSite: http.SameSiteNoneMode,
	}, cookie.RefreshToken("value"))
}

func TestCookies_ExpiredRefreshToken(t *testing.T) {
	t.Parallel()

	cfg := new(config.Config)
	cfg.Server.KeyPath = "key_path"
	cfg.Server.CertPath = "cert_path"
	cfg.Server.CookieDomain = "cookie_domain"
	cookie := cookies.New(cfg)

	require.Equal(t, &http.Cookie{
		Name:     cookies.CookieNameRefreshToken,
		Value:    "",
		Path:     fmt.Sprintf("/%s", apiv1connect.AuthServiceName),
		Domain:   cfg.Server.CookieDomain,
		MaxAge:   -1,
		Secure:   true,
		HttpOnly: true,
		SameSite: http.SameSiteNoneMode,
	}, cookie.ExpiredRefreshToken())
}
