package middlewares

import (
	"net/http"

	connectcors "connectrpc.com/cors"
	"github.com/rs/cors"

	"github.com/crlssn/getstronger/server/pkg/config"
	"github.com/crlssn/getstronger/server/pkg/xcontext"
)

type Middleware struct {
	config *config.Config
}

func New(c *config.Config) *Middleware {
	return &Middleware{c}
}

func (m *Middleware) Register(h http.Handler) http.Handler {
	middlewares := []func(http.Handler) http.Handler{
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
		cookie, err := r.Cookie("refreshToken")
		if err == nil {
			r = r.WithContext(xcontext.WithRefreshToken(r.Context(), cookie.Value))
		}

		h.ServeHTTP(w, r)
	})
}