package e2e

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"

	"connectrpc.com/connect"
	"github.com/brianvoe/gofakeit/v7"
	"github.com/volatiletech/sqlboiler/v4/boil"

	"github.com/crlssn/getstronger/server/pkg/config"
	"github.com/crlssn/getstronger/server/pkg/orm"
	v1 "github.com/crlssn/getstronger/server/pkg/proto/api/v1"
	"github.com/crlssn/getstronger/server/pkg/proto/api/v1/apiv1connect"
)

type Saga struct {
	db      *sql.DB
	auth    *auth
	config  *config.Config
	clients clients
}

type clients struct {
	auth     apiv1connect.AuthServiceClient
	exercise apiv1connect.ExerciseServiceClient
}

type auth struct {
	email       string
	password    string
	accessToken string
}

func newSaga(db *sql.DB, config *config.Config) *Saga {
	baseURL := fmt.Sprintf("https://localhost:%s", config.Server.Port)
	return &Saga{
		db: db,
		auth: &auth{
			email:    gofakeit.Email(),
			password: gofakeit.Password(true, true, true, true, true, 6),
		},
		config: config,
		clients: clients{
			auth: apiv1connect.NewAuthServiceClient(http.DefaultClient, baseURL),
			//exercise: apiv1connect.NewExerciseServiceClient(http.DefaultClient, baseURL),
		},
	}
}

func (s *Saga) Signup(ctx context.Context, f func(res *v1.SignupResponse)) *Saga {
	res, err := s.clients.auth.Signup(ctx, &connect.Request[v1.SignupRequest]{
		Msg: &v1.SignupRequest{
			Email:                s.auth.email,
			Password:             s.auth.password,
			PasswordConfirmation: s.auth.password,
			FirstName:            gofakeit.FirstName(),
			LastName:             gofakeit.LastName(),
		},
	})
	if err != nil {
		panic(err)
	}

	a, err := orm.Auths(orm.AuthWhere.Email.EQ(s.auth.email)).One(ctx, s.db)
	if err != nil {
		panic(err)
	}

	a.EmailVerified = true
	if _, err = a.Update(ctx, s.db, boil.Whitelist(orm.AuthColumns.EmailVerified)); err != nil {
		panic(err)
	}

	f(res.Msg)

	return s
}

func (s *Saga) Login(ctx context.Context, f func(res *v1.LoginResponse)) *Saga {
	res, err := s.clients.auth.Login(ctx, &connect.Request[v1.LoginRequest]{
		Msg: &v1.LoginRequest{
			Email:    s.auth.email,
			Password: s.auth.password,
		},
	})
	if err != nil {
		panic(err)
	}

	s.auth.accessToken = res.Msg.AccessToken

	f(res.Msg)

	return s

}
