package main

import (
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
			db.New,
			zap.NewDevelopment,
			repos.NewAuth,
			grpc.NewServer,
			protovalidate.New,
		),
	}
}
