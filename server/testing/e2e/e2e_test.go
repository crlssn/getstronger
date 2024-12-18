package e2e_test

import (
	"context"
	"database/sql"
	"testing"

	"connectrpc.com/connect"
	"github.com/bufbuild/protovalidate-go"
	"github.com/stretchr/testify/require"
	"go.uber.org/fx"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/config"
	"github.com/crlssn/getstronger/server/cookies"
	"github.com/crlssn/getstronger/server/email"
	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/jwt"
	"github.com/crlssn/getstronger/server/pubsub"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/rpc/server"
	"github.com/crlssn/getstronger/server/stream"
	"github.com/crlssn/getstronger/server/testing/db"
	"github.com/crlssn/getstronger/server/testing/e2e"
	"github.com/crlssn/getstronger/server/trace"
)

func TestE2E(t *testing.T) {
	t.Parallel()

	var db *sql.DB
	var cfg *config.Config
	app := fx.New(append(options(), fx.Invoke(
		func(d *sql.DB, c *config.Config) {
			db = d
			cfg = c
		},
	))...)

	require.NoError(t, fx.ValidateApp(options()...))

	ctx := context.Background()
	if err := app.Start(ctx); err != nil {
		require.NoError(t, err)
	}

	saga := e2e.NewSaga(db, cfg)
	saga.
		Signup(ctx, func(_ *connect.Response[apiv1.SignupResponse], err error) {
			require.NoError(t, err)
		}).
		VerifyEmail(ctx, func(_ *connect.Response[apiv1.VerifyEmailResponse], err error) {
			require.NoError(t, err)
		}).
		Login(ctx, func(c *connect.Response[apiv1.LoginResponse], err error) {
			require.NoError(t, err)
			require.NotEmpty(t, c.Msg.GetAccessToken())
			require.NotEmpty(t, c.Header().Get("Set-Cookie"))
			saga.SetAccessToken(c.Msg.GetAccessToken())
			saga.SetRefreshTokenCookie(c.Header().Get("Set-Cookie"))
		}).
		RefreshToken(ctx, func(c *connect.Response[apiv1.RefreshTokenResponse], err error) {
			require.NoError(t, err)
			require.NotEmpty(t, c.Msg.GetAccessToken())
			saga.SetAccessToken(c.Msg.GetAccessToken())
		}).
		SearchUsers(ctx, func(c *connect.Response[apiv1.SearchUsersResponse], err error) {
			require.NoError(t, err)
			require.Len(t, c.Msg.GetUsers(), 1)
			require.Empty(t, c.Msg.GetPagination().GetNextPageToken())
		}).
		CreateExercise(ctx, func(c *connect.Response[apiv1.CreateExerciseResponse], err error) {
			require.NoError(t, err)
			require.NotEmpty(t, c.Msg.GetId())
		}).
		CreateExercise(ctx, func(c *connect.Response[apiv1.CreateExerciseResponse], err error) {
			require.NoError(t, err)
			require.NotEmpty(t, c.Msg.GetId())
		}).
		ListExercises(ctx, func(c *connect.Response[apiv1.ListExercisesResponse], err error) {
			require.NoError(t, err)
			require.Len(t, c.Msg.GetExercises(), 2)
			require.Empty(t, c.Msg.GetPagination().GetNextPageToken())
		}).
		CreateRoutine(ctx, func(c *connect.Response[apiv1.CreateRoutineResponse], err error) {
			require.NoError(t, err)
			require.NotEmpty(t, c.Msg.GetId())
		}).
		ListRoutines(ctx, func(c *connect.Response[apiv1.ListRoutinesResponse], err error) {
			require.NoError(t, err)
			require.Len(t, c.Msg.GetRoutines(), 1)
			require.Empty(t, c.Msg.GetPagination().GetNextPageToken())
		}).
		CreateWorkout(ctx, func(c *connect.Response[apiv1.CreateWorkoutResponse], err error) {
			require.NoError(t, err)
			require.NotEmpty(t, c.Msg.GetWorkoutId())
		}).
		GetWorkout(ctx, func(c *connect.Response[apiv1.GetWorkoutResponse], err error) {
			require.NoError(t, err)
			require.NotEmpty(t, c.Msg.GetWorkout().GetId())
		}).
		ListWorkouts(ctx, func(c *connect.Response[apiv1.ListWorkoutsResponse], err error) {
			require.NoError(t, err)
			require.Len(t, c.Msg.GetWorkouts(), 1)
			require.Empty(t, c.Msg.GetPagination().GetNextPageToken())
		}).
		ListFeedItems(ctx, func(c *connect.Response[apiv1.ListFeedItemsResponse], err error) {
			require.NoError(t, err)
			require.Len(t, c.Msg.GetItems(), 1)
			require.Empty(t, c.Msg.GetPagination().GetNextPageToken())
		}).
		Logout(ctx, func(_ *connect.Response[apiv1.LogoutResponse], err error) {
			require.NoError(t, err)
		})

	if err := app.Stop(ctx); err != nil {
		require.NoError(t, err)
	}
}

func options() []fx.Option {
	return []fx.Option{
		pubsub.Module(),
		jwt.Module(),
		server.Module(),
		db.Module(),
		fx.Provide(
			zap.NewDevelopment,
			repo.New,
			email.NewNoop,
			trace.New,
			stream.New,
			cookies.New,
			protovalidate.New,
			func() *config.Config {
				return &config.Config{
					DB:     config.DB{},
					JWT:    config.JWT{},
					Server: config.Server{Port: "8081"},
				}
			},
		),
	}
}
