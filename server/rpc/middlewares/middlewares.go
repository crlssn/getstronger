package middlewares

import (
	"net/http"

	connectcors "connectrpc.com/cors"
	"github.com/rs/cors"

	"github.com/crlssn/getstronger/server/config"
	"github.com/crlssn/getstronger/server/gen/proto/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/trace"
	"github.com/crlssn/getstronger/server/xcontext"
)

type Middleware struct {
	config *config.Config
	tracer *trace.Tracer
}

func New(c *config.Config, t *trace.Tracer) *Middleware {
	return &Middleware{c, t}
}

func (m *Middleware) Register(h http.Handler) http.Handler {
	middlewares := []func(http.Handler) http.Handler{
		m.trace,
		m.coors,
		m.cookies,
	}

	for _, middleware := range middlewares {
		h = middleware(h)
	}

	return h
}

func (m *Middleware) coors(h http.Handler) http.Handler {
	middleware := cors.New(cors.Options{
		AllowCredentials: true,
		AllowedOrigins:   m.config.Server.AllowedOrigins,
		AllowedMethods: []string{
			http.MethodGet,
			http.MethodPost,
			http.MethodOptions,
		},
		AllowedHeaders: []string{
			"Content-Type",
			"Connect-Protocol-Version",
			"Connect-Timeout-Ms",
			"Grpc-Timeout",
			"X-Grpc-Web",
			"X-User-Agent",
			"Authorization",
		},
		ExposedHeaders: connectcors.ExposedHeaders(),
	})

	return middleware.Handler(h)
}

func (m *Middleware) cookies(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("refreshToken") // TODO: Move cookie logic to own package.
		if err == nil {
			r = r.WithContext(xcontext.WithRefreshToken(r.Context(), cookie.Value))
		}

		h.ServeHTTP(w, r)
	})
}

func (m *Middleware) trace(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// DEBT: Hacky workaround to bypass tracing for streaming endpoints.
		if r.RequestURI == apiv1connect.NotificationServiceUnreadNotificationsProcedure {
			h.ServeHTTP(w, r)
			return
		}

		// Use a custom response writer to capture the status code.
		rw := &trace.ResponseWriter{ResponseWriter: w}
		t := m.tracer.Trace(r.Context(), r.RequestURI)
		defer t.End(rw)

		h.ServeHTTP(rw, r)
	})
}
