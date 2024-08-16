package main

import (
	"github.com/crlssn/getstronger/go/pkg/db"
	"github.com/crlssn/getstronger/go/pkg/pb/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/go/pkg/repositories"
	"github.com/crlssn/getstronger/go/rpc/auth"
	"go.uber.org/fx"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"
	"net/http"
)

const address = "localhost:8080"

func main() {
	fx.New(options()...).Run()
}

func options() []fx.Option {
	return []fx.Option{
		fx.Provide(
			func() db.Options {
				return db.Options{
					Host:     "",
					Port:     0,
					User:     "",
					Password: "",
					Database: "",
				}
			},
			db.New,
			http.NewServeMux,
			repositories.NewAuth,
			auth.NewHandler,
		),
		fx.Invoke(
			func(mux *http.ServeMux, auth apiv1connect.AuthServiceHandler) error {
				mux.Handle(apiv1connect.NewAuthServiceHandler(auth))
				return http.ListenAndServe(address, h2c.NewHandler(mux, &http2.Server{}))
			},
		),
	}
}
