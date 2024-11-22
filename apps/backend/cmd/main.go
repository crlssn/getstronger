package main

import (
	"github.com/bufbuild/protovalidate-go"
	"go.uber.org/fx"
	"go.uber.org/zap"
	"google.golang.org/grpc"

	"github.com/crlssn/getstronger/apps/backend/pkg/config"
	"github.com/crlssn/getstronger/apps/backend/pkg/db"
	"github.com/crlssn/getstronger/apps/backend/pkg/jwt"
	"github.com/crlssn/getstronger/apps/backend/pkg/repo"
	"github.com/crlssn/getstronger/apps/backend/rpc"
)

func main() {
	fx.New(options()...).Run()
}

func options() []fx.Option {
	return []fx.Option{
		jwt.Module(),
		rpc.Module(),
		fx.Provide(
			db.New,
			zap.NewDevelopment,
			repo.New,
			grpc.NewServer,
			config.New,
			protovalidate.New,
		),
	}
}
