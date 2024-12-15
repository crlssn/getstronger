package e2e

import (
	"context"
	"database/sql"
	"testing"

	"connectrpc.com/connect"
	"github.com/bufbuild/protovalidate-go"
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

	s := newSaga(db, cfg)
	s.
		Signup(ctx, func(_ *connect.Response[v1.SignupResponse], err error) {
			require.NoError(t, err)
		}).
		VerifyEmail(ctx, func(_ *connect.Response[v1.VerifyEmailResponse], err error) {
			require.NoError(t, err)
		}).
		Login(ctx, func(c *connect.Response[v1.LoginResponse], err error) {
			require.NoError(t, err)
			require.NotEmpty(t, c.Msg.GetAccessToken())
			require.NotEmpty(t, c.Header().Get("Set-Cookie"))
			s.SetAccessToken(c.Msg.GetAccessToken())
			s.SetRefreshTokenCookie(c.Header().Get("Set-Cookie"))
		}).
		RefreshToken(ctx, func(c *connect.Response[v1.RefreshTokenResponse], err error) {
			require.NoError(t, err)
			require.NotEmpty(t, c.Msg.GetAccessToken())
			s.SetAccessToken(c.Msg.GetAccessToken())
		}).
		SearchUsers(ctx, func(c *connect.Response[v1.SearchUsersResponse], err error) {
			require.NoError(t, err)
			require.Len(t, c.Msg.GetUsers(), 1)
			require.Empty(t, c.Msg.GetPagination().GetNextPageToken())
		}).
		CreateExercise(ctx, func(c *connect.Response[v1.CreateExerciseResponse], err error) {
			require.NoError(t, err)
			require.NotEmpty(t, c.Msg.GetId())
		}).
		CreateExercise(ctx, func(c *connect.Response[v1.CreateExerciseResponse], err error) {
			require.NoError(t, err)
			require.NotEmpty(t, c.Msg.GetId())
		}).
		ListExercises(ctx, func(c *connect.Response[v1.ListExercisesResponse], err error) {
			require.NoError(t, err)
			require.Len(t, c.Msg.GetExercises(), 2)
			require.Empty(t, c.Msg.GetPagination().GetNextPageToken())
		}).
		CreateRoutine(ctx, func(c *connect.Response[v1.CreateRoutineResponse], err error) {
			require.NoError(t, err)
			require.NotEmpty(t, c.Msg.GetId())
		}).
		ListRoutines(ctx, func(c *connect.Response[v1.ListRoutinesResponse], err error) {
			require.NoError(t, err)
			require.Len(t, c.Msg.GetRoutines(), 1)
			require.Empty(t, c.Msg.GetPagination().GetNextPageToken())
		}).
		CreateWorkout(ctx, func(c *connect.Response[v1.CreateWorkoutResponse], err error) {
			require.NoError(t, err)
			require.NotEmpty(t, c.Msg.GetWorkoutId())
		}).
		GetWorkout(ctx, func(c *connect.Response[v1.GetWorkoutResponse], err error) {
			require.NoError(t, err)
			require.NotEmpty(t, c.Msg.GetWorkout().GetId())
		}).
		ListWorkouts(ctx, func(c *connect.Response[v1.ListWorkoutsResponse], err error) {
			require.NoError(t, err)
			require.Len(t, c.Msg.GetWorkouts(), 1)
			require.Empty(t, c.Msg.GetPagination().GetNextPageToken())
		}).
		ListFeedItems(ctx, func(c *connect.Response[v1.ListFeedItemsResponse], err error) {
			require.NoError(t, err)
			require.Len(t, c.Msg.GetItems(), 1)
			require.Empty(t, c.Msg.GetPagination().GetNextPageToken())
		}).
		Logout(ctx, func(_ *connect.Response[v1.LogoutResponse], err error) {
			require.NoError(t, err)
		})

	if err := app.Stop(ctx); err != nil {
		require.NoError(t, err)
	}
}

func options() []fx.Option {
	return []fx.Option{
		bus.Module(),
		jwt.Module(),
		server.Module(),
		testdb.Module(),
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
