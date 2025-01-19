package main

import (
	"fmt"

	"github.com/bufbuild/protovalidate-go"
	"github.com/joho/godotenv"
	"go.uber.org/fx"

	"github.com/crlssn/getstronger/server/config"
	"github.com/crlssn/getstronger/server/cookies"
	"github.com/crlssn/getstronger/server/db"
	"github.com/crlssn/getstronger/server/email"
	"github.com/crlssn/getstronger/server/jwt"
	"github.com/crlssn/getstronger/server/logger"
	"github.com/crlssn/getstronger/server/pubsub"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/rpc/server"
	"github.com/crlssn/getstronger/server/stream"
	"github.com/crlssn/getstronger/server/trace"
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
		jwt.Module(),
		logger.Module(),
		pubsub.Module(),
		server.Module(),
		fx.Provide(
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
