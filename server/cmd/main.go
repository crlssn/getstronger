package main

import (
	"fmt"

	"github.com/bufbuild/protovalidate-go"
	"github.com/joho/godotenv"
	"go.uber.org/fx"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/bus"
	"github.com/crlssn/getstronger/server/pkg/config"
	"github.com/crlssn/getstronger/server/pkg/cookies"
	"github.com/crlssn/getstronger/server/pkg/db"
	"github.com/crlssn/getstronger/server/pkg/email"
	"github.com/crlssn/getstronger/server/pkg/jwt"
	"github.com/crlssn/getstronger/server/pkg/repo"
	"github.com/crlssn/getstronger/server/pkg/stream"
	"github.com/crlssn/getstronger/server/pkg/trace"
	"github.com/crlssn/getstronger/server/rpc/server"
)

func main() {
	if err := godotenv.Load(); err != nil {
		panic(fmt.Errorf("failed to load .env file: %w", err))
	}

	fx.New(options()...).Run()
}

func options() []fx.Option {
	return []fx.Option{
		db.Module(),
		bus.Module(),
		jwt.Module(),
		server.Module(),
		fx.Provide(
			zap.NewDevelopment,
			repo.New,
			email.New,
			trace.New,
			config.New,
			stream.New,
			cookies.New,
			protovalidate.New,
		),
	}
}
