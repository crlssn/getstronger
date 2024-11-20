package middlewares

import (
	"context"
	"net/http"
	"os"

	connectcors "connectrpc.com/cors"
	"github.com/rs/cors"

	"github.com/crlssn/getstronger/apps/backend/pkg/jwt"
)

func Register(h http.Handler) http.Handler {
	middlewares := []func(http.Handler) http.Handler{
		coors,
		cookies,
	}

	for _, middleware := range middlewares {
		h = middleware(h)
	}

	return h
}

func cookies(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("refreshToken")
		if err == nil {
			ctx := context.WithValue(r.Context(), jwt.ContextKeyRefreshToken, cookie.Value)
			r = r.WithContext(ctx)
		}

		h.ServeHTTP(w, r)
	})
}

func coors(h http.Handler) http.Handler {
	middleware := cors.New(cors.Options{
		AllowCredentials: true,
		AllowedOrigins:   []string{os.Getenv("CORS_ALLOWED_ORIGIN")},
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
