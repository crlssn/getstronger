package e2e

import (
	"context"
	"database/sql"
	"testing"

	"github.com/bufbuild/protovalidate-go"
	"github.com/joho/godotenv"
	"github.com/stretchr/testify/require"
	"go.uber.org/fx"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/bus"
	"github.com/crlssn/getstronger/server/pkg/config"
	"github.com/crlssn/getstronger/server/pkg/cookies"
	"github.com/crlssn/getstronger/server/pkg/email"
	"github.com/crlssn/getstronger/server/pkg/jwt"
	v1 "github.com/crlssn/getstronger/server/pkg/proto/api/v1"
	"github.com/crlssn/getstronger/server/pkg/repo"
	"github.com/crlssn/getstronger/server/pkg/stream"
	"github.com/crlssn/getstronger/server/pkg/test/testdb"
	"github.com/crlssn/getstronger/server/pkg/trace"
	"github.com/crlssn/getstronger/server/rpc/server"
)

func TestE2E(t *testing.T) {
	t.Parallel()
	if err := godotenv.Load(); err != nil {
		require.NoError(t, err)
	}

	var db *sql.DB
	var cfg *config.Config
	app := fx.New(append(options(), fx.Invoke(
		func(d *sql.DB, c *config.Config) {
			db = d
			cfg = c
		},
	))...)

	ctx := context.Background()
	if err := app.Start(ctx); err != nil {
		require.NoError(t, err)
	}

	saga := newSaga(db, cfg)
	saga.
		Signup(ctx, func(_ *v1.SignupResponse) {}).
		VerifyEmail(ctx, func(_ *v1.VerifyEmailResponse) {}).
		Login(ctx, func(res *v1.LoginResponse) {
			require.NotEmpty(t, res.GetAccessToken())
		}).
		RefreshToken(ctx, func(res *v1.RefreshTokenResponse) {
			require.NotEmpty(t, res.GetAccessToken())
		}).
		CreateExercise(ctx, func(res *v1.CreateExerciseResponse) {
			require.NotEmpty(t, res.GetId())
		}).
		ListExercises(ctx, func(res *v1.ListExercisesResponse) {
			require.Len(t, res.GetExercises(), 1)
		}).
		Logout(ctx, func(_ *v1.LogoutResponse) {}).
		Error(func(err error) {
			require.NoError(t, err)
		})

	if err := app.Stop(ctx); err != nil {
		require.NoError(t, err)
	}
}

func options() []fx.Option {
	return []fx.Option{
		testdb.Module(),
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
