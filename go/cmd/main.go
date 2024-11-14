package main

import (
	"os"

	"github.com/bufbuild/protovalidate-go"
	"github.com/joho/godotenv"
	"go.uber.org/fx"
	"go.uber.org/zap"
	"google.golang.org/grpc"

	"github.com/crlssn/getstronger/go/pkg/db"
	"github.com/crlssn/getstronger/go/pkg/jwt"
	"github.com/crlssn/getstronger/go/pkg/repo"
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
					Host:     os.Getenv("DB_HOST"),
					Port:     os.Getenv("DB_PORT"),
					User:     os.Getenv("DB_USER"),
					Password: os.Getenv("DB_PASSWORD"),
					Database: os.Getenv("DB_NAME"),
				}
			},
			db.New,
			zap.NewDevelopment,
			repo.New,
			grpc.NewServer,
			godotenv.Load,
			protovalidate.New,
		),
	}
}
