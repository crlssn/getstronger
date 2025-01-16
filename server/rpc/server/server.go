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
	log      *zap.Logger
	conn     *stream.Conn
	server   *http.Server
	keyPath  string
	certPath string
}

type Params struct {
	fx.In

	Log    *zap.Logger
	Mux    *http.ServeMux
	Conn   *stream.Conn
	Config *config.Config
}

func NewServer(p Params) *Server {
	return &Server{
		log:      p.Log,
		conn:     p.Conn,
		keyPath:  p.Config.Server.KeyPath,
		certPath: p.Config.Server.CertPath,
		server: &http.Server{
			Addr:         fmt.Sprintf(":%s", p.Config.Server.Port),
			Handler:      h2c.NewHandler(p.Mux, &http2.Server{}),
			ReadTimeout:  10 * time.Second, //nolint:mnd
			WriteTimeout: 0,
			IdleTimeout:  120 * time.Second, //nolint:mnd
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
	s.server.RegisterOnShutdown(s.conn.Cancel)

	if s.certPath == "" && s.keyPath == "" {
		s.log.Info("server: listening on http")
		return s.server.ListenAndServe() //nolint:wrapcheck
	}

	s.log.Info("server: listening on https")
	return s.server.ListenAndServeTLS(s.certPath, s.keyPath) //nolint:wrapcheck
}

func NewMultiplexer(f []handlers.HandlerFunc, o []connect.HandlerOption, m *middlewares.Middleware) *http.ServeMux {
	mux := http.NewServeMux()
	for _, h := range f {
		path, handler := h(o...)
		mux.Handle(path, m.Register(handler))
	}

	return mux
}
