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
		MaxAge:   int(jwt.ExpiryTimeRefresh.Seconds()),
		Secure:   true,
		HttpOnly: true,
		SameSite: http.SameSiteNoneMode,
	}, cookie.RefreshToken("value"))

	cfg.Server.KeyPath = ""
	cfg.Server.CertPath = ""
	cfg.Environment = config.EnvironmentProduction

	require.Equal(t, &http.Cookie{
		Name:     cookies.CookieNameRefreshToken,
		Value:    "value",
		Path:     fmt.Sprintf("/%s", apiv1connect.AuthServiceName),
		Domain:   cfg.Server.CookieDomain,
		MaxAge:   int(jwt.ExpiryTimeRefresh.Seconds()),
		Secure:   true,
		HttpOnly: true,
		SameSite: http.SameSiteNoneMode,
	}, cookie.RefreshToken("value"))

	cfg.Environment = config.EnvironmentLocal

	require.Equal(t, &http.Cookie{
		Name:     cookies.CookieNameRefreshToken,
		Value:    "value",
		Path:     fmt.Sprintf("/%s", apiv1connect.AuthServiceName),
		Domain:   cfg.Server.CookieDomain,
		MaxAge:   int(jwt.ExpiryTimeRefresh.Seconds()),
		Secure:   false,
		HttpOnly: true,
		SameSite: http.SameSiteDefaultMode,
	}, cookie.RefreshToken("value"))

	// A literal rather than a derived expression: comparing the cookie against
	// the same expression that builds it is what hid the nanosecond Max-Age.
	require.Contains(t, cookie.RefreshToken("value").String(), "Max-Age=2592000;")
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

	cfg.Server.KeyPath = ""
	cfg.Server.CertPath = ""
	cfg.Environment = config.EnvironmentProduction

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

	cfg.Environment = config.EnvironmentLocal

	require.Equal(t, &http.Cookie{
		Name:     cookies.CookieNameRefreshToken,
		Value:    "",
		Path:     fmt.Sprintf("/%s", apiv1connect.AuthServiceName),
		Domain:   cfg.Server.CookieDomain,
		MaxAge:   -1,
		Secure:   false,
		HttpOnly: true,
		SameSite: http.SameSiteDefaultMode,
	}, cookie.ExpiredRefreshToken())
}

// Beta is served over TLS like production, so it must not fall back to the
// local cookie settings.
func TestCookies_BetaIsSecure(t *testing.T) {
	t.Parallel()

	cfg := new(config.Config)
	cfg.Environment = config.EnvironmentBeta
	cookie := cookies.New(cfg)

	require.True(t, cookie.RefreshToken("value").Secure)
	require.Equal(t, http.SameSiteNoneMode, cookie.RefreshToken("value").SameSite)
}
