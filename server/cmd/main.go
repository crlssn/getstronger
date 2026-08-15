package main

import (
	"errors"
	"fmt"
	"os"

	"buf.build/go/protovalidate"
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
	if err := loadEnvironment(); err != nil {
		panic(err)
	}

	fx.New(options()...).Run()
}

func loadEnvironment() error {
	err := godotenv.Load()
	if err == nil || (errors.Is(err, os.ErrNotExist) && os.Getenv("ENV") != "") {
		return nil
	}

	return fmt.Errorf("failed to load .env file: %w", err)
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
			stream.NewManager,
			cookies.New,
			protovalidate.New,
		),
	}
}
