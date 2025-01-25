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
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"

	"github.com/crlssn/getstronger/server/config"
	"github.com/crlssn/getstronger/server/rpc/handlers"
	"github.com/crlssn/getstronger/server/rpc/middlewares"
	"github.com/crlssn/getstronger/server/stream"
)

type Server struct {
	log    *zap.Logger
	config *config.Config
	stream *stream.Manager
	server *http.Server
}

type Params struct {
	fx.In

	Log    *zap.Logger
	Mux    *http.ServeMux
	Config *config.Config
	Stream *stream.Manager
}

const (
	readTimeout  = 10 * time.Second
	idleTimeout  = 120 * time.Second
	writeTimeout = 0
)

func NewServer(p Params) *Server {
	return &Server{
		log:    p.Log,
		config: p.Config,
		stream: p.Stream,
		server: &http.Server{
			Addr:         fmt.Sprintf(":%s", p.Config.Server.Port),
			Handler:      h2c.NewHandler(p.Mux, &http2.Server{}),
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

			s.log.Fatal("server: listen and serve", zap.Error(err))
		}
	}()

	return nil
}

func (s *Server) listenAndServe() error {
	s.server.RegisterOnShutdown(s.stream.Cancel)

	if s.config.Server.HasCertificate() {
		s.log.Info("server: listening on https")
		return s.server.ListenAndServeTLS(s.config.Server.CertPath, s.config.Server.KeyPath) //nolint:wrapcheck
	}

	s.log.Info("server: listening on http")
	return s.server.ListenAndServe() //nolint:wrapcheck
}

func NewMultiplexer(f []handlers.HandlerFunc, o []connect.HandlerOption, m *middlewares.Middleware) *http.ServeMux {
	mux := http.NewServeMux()
	for _, h := range f {
		path, handler := h(o...)
		mux.Handle(path, m.Register(handler))
	}

	return mux
}
