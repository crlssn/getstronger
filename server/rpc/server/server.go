package server

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"net/http"
	"time"

	"connectrpc.com/connect"
	"go.uber.org/fx"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/config"
	"github.com/crlssn/getstronger/server/rpc/handlers"
	"github.com/crlssn/getstronger/server/rpc/middlewares"
)

type Server struct {
	log    *zap.Logger
	config *config.Config
	server *http.Server
}

type Params struct {
	fx.In

	Log    *zap.Logger
	Mux    *http.ServeMux
	Config *config.Config
}

const (
	readTimeout  = 10 * time.Second
	idleTimeout  = 120 * time.Second
	writeTimeout = 0
)

func NewServer(p Params) *Server {
	// gRPC clients speak HTTP/2 without TLS, which the stdlib server only
	// accepts once unencrypted HTTP/2 is opted into. This replaces the
	// deprecated h2c handler wrapper.
	protocols := new(http.Protocols)
	protocols.SetHTTP1(true)
	protocols.SetHTTP2(true)
	protocols.SetUnencryptedHTTP2(true)

	return &Server{
		log:    p.Log,
		config: p.Config,
		server: &http.Server{
			Addr:         fmt.Sprintf(":%s", p.Config.Server.Port),
			Handler:      p.Mux,
			Protocols:    protocols,
			ReadTimeout:  readTimeout,
			WriteTimeout: writeTimeout,
			IdleTimeout:  idleTimeout,
			TLSConfig: &tls.Config{
				MinVersion: tls.VersionTLS12,
			},
		},
	}
}

func (s *Server) ListenAndServe(_ context.Context) error {
	go func() {
		if err := s.listenAndServe(); err != nil {
			if errors.Is(err, http.ErrServerClosed) {
				return
			}

			s.log.Fatal("Server: listen and serve", zap.Error(err))
		}
	}()

	return nil
}

func (s *Server) listenAndServe() error {
	if s.config.Server.HasCertificate() {
		s.log.Info("Server: listening on https")
		return s.server.ListenAndServeTLS(s.config.Server.CertPath, s.config.Server.KeyPath) //nolint:wrapcheck
	}

	s.log.Info("Server: listening on http")
	return s.server.ListenAndServe() //nolint:wrapcheck
}

func NewMultiplexer(f []handlers.HandlerFunc, o []connect.HandlerOption, m *middlewares.Middleware) *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(http.StatusNoContent)
	})
	for _, h := range f {
		path, handler := h(o...)
		mux.Handle(path, m.Register(handler))
	}

	return mux
}
