package e2e

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"

	"connectrpc.com/connect"
	"github.com/brianvoe/gofakeit/v7"
	"github.com/davecgh/go-spew/spew"
	"github.com/volatiletech/sqlboiler/v4/boil"

	"github.com/crlssn/getstronger/server/pkg/config"
	"github.com/crlssn/getstronger/server/pkg/orm"
	v1 "github.com/crlssn/getstronger/server/pkg/proto/api/v1"
	"github.com/crlssn/getstronger/server/pkg/proto/api/v1/apiv1connect"
)

type Saga struct {
	db      *sql.DB
	auth    *auth
	baseURL string
}

type auth struct {
	email       string
	password    string
	accessToken string
}

func newSaga(db *sql.DB, config *config.Config) *Saga {
	return &Saga{
		db:      db,
		baseURL: fmt.Sprintf("https://localhost:%s", config.Server.Port),
		auth: &auth{
			email:    gofakeit.Email(),
			password: gofakeit.Password(true, true, true, true, true, 6),
		},
	}
}

func (s *Saga) client() *http.Client {
	if s.auth.accessToken == "" {
		return http.DefaultClient
	}

	return &http.Client{
		Transport: &clientTransport{
			auth:         s.auth,
			roundTripper: http.DefaultTransport,
		},
	}
}

type clientTransport struct {
	auth         *auth
	roundTripper http.RoundTripper
}

func (a *clientTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	r := req.Clone(req.Context())
	r.Header.Set("Authorization", fmt.Sprintf("Bearer %s", a.auth.accessToken))

	return a.roundTripper.RoundTrip(r)
}

func (s *Saga) Signup(ctx context.Context, f func(res *v1.SignupResponse)) *Saga {
	client := apiv1connect.NewAuthServiceClient(s.client(), s.baseURL)
	res, err := client.Signup(ctx, &connect.Request[v1.SignupRequest]{
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

	exists, err := a.User().Exists(ctx, s.db)
	if err != nil {
		panic(err)
	}
	if !exists {
		panic("user does not exist")
	}

	f(res.Msg)

	return s
}

func (s *Saga) Login(ctx context.Context, f func(res *v1.LoginResponse)) *Saga {
	spew.Dump("login")
	spew.Dump(orm.Users().All(ctx, s.db))
	client := apiv1connect.NewAuthServiceClient(s.client(), s.baseURL)
	res, err := client.Login(ctx, &connect.Request[v1.LoginRequest]{
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

func (s *Saga) CreateExercise(ctx context.Context, f func(res *v1.CreateExerciseResponse)) *Saga {
	spew.Dump("CreateExercise")
	spew.Dump(s.auth.accessToken)
	spew.Dump(orm.Users().All(ctx, s.db))
	client := apiv1connect.NewExerciseServiceClient(s.client(), s.baseURL)
	res, err := client.CreateExercise(ctx, &connect.Request[v1.CreateExerciseRequest]{
		Msg: &v1.CreateExerciseRequest{
			Name:  gofakeit.RandomString([]string{"Bench Press", "Deadlifts", "Squats"}),
			Label: "",
		},
	})
	if err != nil {
		panic(err)
	}

	f(res.Msg)

	return s
}

func (s *Saga) ListExercises(ctx context.Context, f func(res *v1.ListExercisesResponse)) *Saga {
	client := apiv1connect.NewExerciseServiceClient(s.client(), s.baseURL)
	res, err := client.ListExercises(ctx, &connect.Request[v1.ListExercisesRequest]{
		Msg: &v1.ListExercisesRequest{
			Name:        "",
			ExerciseIds: nil,
			Pagination: &v1.PaginationRequest{
				PageLimit: 100,
				PageToken: nil,
			},
		},
	})
	if err != nil {
		panic(err)
	}

	f(res.Msg)

	return s
}
