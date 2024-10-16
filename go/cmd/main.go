package main

import (
	"github.com/crlssn/getstronger/go/pkg/db"
	"github.com/crlssn/getstronger/go/pkg/pb/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/go/pkg/repos"
	"github.com/crlssn/getstronger/go/rpc/auth"
	"github.com/crlssn/getstronger/go/rpc/interceptors"
	"go.uber.org/fx"
	"go.uber.org/zap"
	"google.golang.org/grpc"
	"net"
	"net/http"
)

func main() {
	grpc.NewServer()

	fx.New(options()...).Run()
}

func options() []fx.Option {
	return []fx.Option{
		fx.Provide(
			func() db.Options {
				return db.Options{
					Host:     "localhost",
					Port:     5433,
					User:     "root",
					Password: "root",
					Database: "postgres",
				}
			},
			func() []grpc.ServerOption {
				authInterceptor := interceptors.NewAuthInterceptor()

				return []grpc.ServerOption{
					grpc.UnaryInterceptor(authInterceptor.Unary()),
					grpc.StreamInterceptor(authInterceptor.Stream()),
				}
			},
			func() (net.Listener, error) {
				return net.Listen("tcp", ":8080")
			},
			db.New,
			zap.NewNop,
			auth.NewHandler,
			http.NewServeMux,
			repos.NewAuth,
			grpc.NewServer,
		),
		fx.Invoke(
			func(server *grpc.Server, listener net.Listener, handler apiv1connect.AuthServiceHandler) error {
				return server.Serve(listener)
			},
			//func(mux *http.ServeMux, auth apiv1connect.AuthServiceHandler) error {
			//	mux.Handle(apiv1connect.NewAuthServiceHandler(auth))
			//	return http.ListenAndServe(":8080", h2c.NewHandler(mux, &http2.Server{}))
			//},
		),
	}
}
