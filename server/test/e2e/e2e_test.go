package main_test

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"testing"

	"connectrpc.com/connect"
	"github.com/brianvoe/gofakeit/v7"
	"github.com/bufbuild/protovalidate-go"
	"github.com/davecgh/go-spew/spew"
	"github.com/joho/godotenv"
	"github.com/stretchr/testify/require"
	"github.com/volatiletech/sqlboiler/v4/boil"
	"go.uber.org/fx"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/bus"
	"github.com/crlssn/getstronger/server/pkg/config"
	"github.com/crlssn/getstronger/server/pkg/cookies"
	"github.com/crlssn/getstronger/server/pkg/email"
	"github.com/crlssn/getstronger/server/pkg/jwt"
	"github.com/crlssn/getstronger/server/pkg/orm"
	v1 "github.com/crlssn/getstronger/server/pkg/proto/api/v1"
	"github.com/crlssn/getstronger/server/pkg/proto/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/pkg/repo"
	"github.com/crlssn/getstronger/server/pkg/stream"
	"github.com/crlssn/getstronger/server/pkg/test/testdb"
	"github.com/crlssn/getstronger/server/pkg/trace"
	"github.com/crlssn/getstronger/server/rpc/server"
)

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

func TestE2E(t *testing.T) {
	if err := godotenv.Load(); err != nil {
		panic(fmt.Errorf("failed to load .env file: %w", err))
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
		panic(err)
	}

	baseURL := fmt.Sprintf("https://localhost:%s", cfg.Server.Port)

	email := gofakeit.Email()
	password := gofakeit.Password(true, true, true, true, true, 6)

	authClient := apiv1connect.NewAuthServiceClient(http.DefaultClient, baseURL)
	resSignup, err := authClient.Signup(ctx, &connect.Request[v1.SignupRequest]{
		Msg: &v1.SignupRequest{
			Email:                email,
			Password:             password,
			PasswordConfirmation: password,
			FirstName:            gofakeit.FirstName(),
			LastName:             gofakeit.LastName(),
		},
	})
	require.NoError(t, err)
	spew.Dump(resSignup)

	auth, err := orm.Auths(orm.AuthWhere.Email.EQ(email)).One(ctx, db)
	require.NoError(t, err)

	auth.EmailVerified = true
	_, err = auth.Update(ctx, db, boil.Whitelist(orm.AuthColumns.EmailVerified))
	require.NoError(t, err)

	resLogin, err := authClient.Login(ctx, &connect.Request[v1.LoginRequest]{
		Msg: &v1.LoginRequest{
			Email:    email,
			Password: password,
		},
	})
	require.NoError(t, err)
	spew.Dump(resLogin)

	client := &http.Client{
		Transport: &authTransport{
			underlyingTransport: http.DefaultTransport,
			accessToken:         resLogin.Msg.AccessToken,
		},
	}

	exerciseClient := apiv1connect.NewExerciseServiceClient(client, baseURL)
	resListExercises, err := exerciseClient.ListExercises(ctx, &connect.Request[v1.ListExercisesRequest]{
		Msg: &v1.ListExercisesRequest{
			Name:        "",
			ExerciseIds: nil,
			Pagination: &v1.PaginationRequest{
				PageLimit: 100,
				PageToken: nil,
			},
		},
	})
	require.NoError(t, err)
	spew.Dump(resListExercises)

	if err = app.Stop(ctx); err != nil {
		panic(err)
	}
}

type authTransport struct {
	underlyingTransport http.RoundTripper
	accessToken         string
}

func (a *authTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	clonedReq := req.Clone(req.Context())
	clonedReq.Header.Set("Authorization", fmt.Sprintf("Bearer %s", a.accessToken))

	return a.underlyingTransport.RoundTrip(clonedReq)
}
