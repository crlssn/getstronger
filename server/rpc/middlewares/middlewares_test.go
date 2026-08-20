package middlewares_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/config"
	"github.com/crlssn/getstronger/server/rpc/middlewares"
)

func TestSecurityHeaders(t *testing.T) {
	t.Parallel()

	handler := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})

	cfg := new(config.Config)
	cfg.Environment = config.EnvironmentProduction

	rec := httptest.NewRecorder()
	middlewares.SecurityHeaders(cfg, handler).ServeHTTP(rec, httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/healthz", nil))
	require.Equal(t, "max-age=63072000; includeSubDomains", rec.Header().Get("Strict-Transport-Security"))

	cfg.Environment = config.EnvironmentLocal

	rec = httptest.NewRecorder()
	middlewares.SecurityHeaders(cfg, handler).ServeHTTP(rec, httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/healthz", nil))
	require.Empty(t, rec.Header().Get("Strict-Transport-Security"))
}
