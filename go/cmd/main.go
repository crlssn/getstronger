package main

import (
	"net/http"

	"go.uber.org/fx"
	"go.uber.org/zap"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"
	"google.golang.org/grpc"

	"github.com/crlssn/getstronger/go/pkg/db"
	"github.com/crlssn/getstronger/go/pkg/jwt"
	"github.com/crlssn/getstronger/go/pkg/pb/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/go/pkg/repos"
	"github.com/crlssn/getstronger/go/rpc/auth"
	"github.com/crlssn/getstronger/go/rpc/interceptors"
)

func main() {
	fx.New(options()...).Run()
}

func options() []fx.Option {
	return []fx.Option{
		jwt.Module(),
		interceptors.NewModule(),
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
			//func(interceptors []interceptors.Interceptor) []grpc.ServerOption {
			//	var opts []grpc.ServerOption
			//	for _, i := range interceptors {
			//		opts = append(opts, grpc.UnaryInterceptor(i.Unary()))
			//		opts = append(opts, grpc.StreamInterceptor(i.Stream()))
			//	}
			//	return opts
			//},
			//func() *jwt.Manager {
			//	return jwt.NewManager([]byte("access-key"), []byte("refresh-key"))
			//},
			//func() (net.Listener, error) {
			//	return net.Listen("tcp", ":8080")
			//},
			//interceptors.NewAuthInterceptor,

			db.New,
			zap.NewNop,
			auth.NewHandler,
			http.NewServeMux,
			repos.NewAuth,
			grpc.NewServer,
		),
		fx.Invoke(
			//func(server *grpc.Server, listener net.Listener, handler apiv1connect.AuthServiceHandler) error {
			//	return server.Serve(listener)
			//},
			func(mux *http.ServeMux, auth apiv1connect.AuthServiceHandler) error {
				mux.Handle(apiv1connect.NewAuthServiceHandler(auth))
				return http.ListenAndServe(":8080", h2c.NewHandler(mux, &http2.Server{}))
			},
		),
	}
}
