package server

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"log"
	"net/http"
	"time"

	"connectrpc.com/connect"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"

	"github.com/crlssn/getstronger/server/config"
	"github.com/crlssn/getstronger/server/rpc/handlers"
	"github.com/crlssn/getstronger/server/rpc/middlewares"
	"github.com/crlssn/getstronger/server/stream"
)

type Server struct {
	conn     *stream.Conn
	server   *http.Server
	keyPath  string
	certPath string
}

func NewServer(config *config.Config, mux *http.ServeMux, conn *stream.Conn) *Server {
	return &Server{
		conn:     conn,
		keyPath:  config.Server.KeyPath,
		certPath: config.Server.CertPath,
		server: &http.Server{
			Addr:         fmt.Sprintf(":%s", config.Server.Port),
			Handler:      h2c.NewHandler(mux, &http2.Server{}),
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
			log.Fatalf("listen and serve: %v", err)
		}
	}()
	return nil
}

func (s *Server) listenAndServe() error {
	s.server.RegisterOnShutdown(s.conn.Cancel)

	if s.certPath == "" && s.keyPath == "" {
		return s.server.ListenAndServe() //nolint:wrapcheck
	}

	return s.server.ListenAndServeTLS(s.certPath, s.keyPath) //nolint:wrapcheck
}

func NewMultiplexer(handlers []handlers.HandlerFunc, o []connect.HandlerOption, m *middlewares.Middleware) *http.ServeMux {
	mux := http.NewServeMux()
	for _, h := range handlers {
		path, handler := h(o...)
		mux.Handle(path, m.Register(handler))
	}

	return mux
}
