package main

import (
	"net/http"

	"github.com/bufbuild/protovalidate-go"
	"go.uber.org/fx"
	"go.uber.org/zap"
	"google.golang.org/grpc"

	"github.com/crlssn/getstronger/go/pkg/db"
	"github.com/crlssn/getstronger/go/pkg/jwt"
	"github.com/crlssn/getstronger/go/pkg/repos"
	"github.com/crlssn/getstronger/go/rpc"
)

func main() {
	fx.New(options()...).Run()
}

func options() []fx.Option {
	return []fx.Option{
		jwt.Module(),
		//interceptors.NewModule(),
		rpc.NewModule(),
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
			//auth.NewHandler,
			http.NewServeMux,
			repos.NewAuth,
			grpc.NewServer,
			protovalidate.New,
		), //fx.Invoke(
		//	//func(server *grpc.Server, listener net.Listener, handler apiv1connect.AuthServiceHandler) error {
		//	//	return server.Serve(listener)
		//	//},
		//	func(mux *http.ServeMux, handlers []rpc.Handler, opts []connect.HandlerOption) error {
		//		for _, h := range handlers {
		//			mux.Handle(h())
		//		}
		//		mux.Handle(apiv1connect.NewAuthServiceHandler(auth, opts...))
		//		return http.ListenAndServe(":8080", h2c.NewHandler(mux, &http2.Server{}))
		//	},
		//),

	}
}
