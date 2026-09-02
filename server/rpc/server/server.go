package server

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"net"
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

// ListenAndServe binds the socket before returning, so the fx OnStart hook it
// backs completes only once the server accepts connections. A hook that returned
// while a goroutine was still binding let callers reach a closed port, and a
// port already in use killed the process instead of failing startup.
func (s *Server) ListenAndServe(ctx context.Context) error {
	listener, err := new(net.ListenConfig).Listen(ctx, "tcp", s.server.Addr)
	if err != nil {
		return fmt.Errorf("server listen: %w", err)
	}

	go func() {
		if err := s.serve(listener); err != nil {
			if errors.Is(err, http.ErrServerClosed) {
				return
			}

			s.log.Fatal("Server: serve", zap.Error(err))
		}
	}()

	return nil
}

func (s *Server) serve(listener net.Listener) error {
	if s.config.Server.HasCertificate() {
		s.log.Info("Server: listening on https")
		return s.server.ServeTLS(listener, s.config.Server.CertPath, s.config.Server.KeyPath) //nolint:wrapcheck
	}

	s.log.Info("Server: listening on http")
	return s.server.Serve(listener) //nolint:wrapcheck
}

type MultiplexerParams struct {
	fx.In

	Log        *zap.Logger
	Config     *config.Config
	Handlers   []handlers.HandlerFunc
	Options    []connect.HandlerOption
	Middleware *middlewares.Middleware
}

func NewMultiplexer(p MultiplexerParams) *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(http.StatusNoContent)
	})

	// Neither /healthz nor the profiles are browser traffic, so both sit
	// outside the CORS, cookie and tracing chain the Connect handlers get.
	registerProfiles(mux, p.Config.Pprof, p.Log)

	for _, h := range p.Handlers {
		path, handler := h(p.Options...)
		mux.Handle(path, p.Middleware.Register(handler))
	}

	return mux
}
