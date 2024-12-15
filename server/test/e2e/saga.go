package e2e

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"

	"connectrpc.com/connect"
	"github.com/brianvoe/gofakeit/v7"

	"github.com/crlssn/getstronger/server/pkg/config"
	"github.com/crlssn/getstronger/server/pkg/orm"
	v1 "github.com/crlssn/getstronger/server/pkg/proto/api/v1"
	"github.com/crlssn/getstronger/server/pkg/proto/api/v1/apiv1connect"
)

type Saga struct {
	db      *sql.DB
	err     error
	auth    *auth
	baseURL string
}

type auth struct {
	email              string
	password           string
	accessToken        string
	refreshTokenCookie string
}

func newSaga(db *sql.DB, config *config.Config) *Saga {
	return &Saga{
		db:      db,
		baseURL: fmt.Sprintf("https://localhost:%s", config.Server.Port),
		auth: &auth{
			email:    gofakeit.Email(),
			password: "password",
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

	if a.auth.accessToken != "" {
		r.Header.Set("Authorization", fmt.Sprintf("Bearer %s", a.auth.accessToken))
	}

	if a.auth.refreshTokenCookie != "" {
		cookie, err := http.ParseSetCookie(a.auth.refreshTokenCookie)
		if err != nil {
			return nil, fmt.Errorf("failed to parse cookie: %w", err)
		}
		r.AddCookie(cookie)
	}

	return a.roundTripper.RoundTrip(r) //nolint:wrapcheck
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
		s.err = fmt.Errorf("signup failed: %w", err)
		return s
	}

	f(res.Msg)

	return s
}

func (s *Saga) VerifyEmail(ctx context.Context, f func(_ *v1.VerifyEmailResponse)) *Saga {
	a, err := orm.Auths(orm.AuthWhere.Email.EQ(s.auth.email)).One(ctx, s.db)
	if err != nil {
		s.err = fmt.Errorf("failed to find auth: %w", err)
		return s
	}

	client := apiv1connect.NewAuthServiceClient(s.client(), s.baseURL)
	res, err := client.VerifyEmail(ctx, &connect.Request[v1.VerifyEmailRequest]{
		Msg: &v1.VerifyEmailRequest{
			Token: a.EmailToken,
		},
	})
	if err != nil {
		s.err = fmt.Errorf("verify email failed: %w", err)
		return s
	}

	f(res.Msg)

	return s
}

func (s *Saga) Login(ctx context.Context, f func(res *v1.LoginResponse)) *Saga {
	client := apiv1connect.NewAuthServiceClient(s.client(), s.baseURL)
	res, err := client.Login(ctx, &connect.Request[v1.LoginRequest]{
		Msg: &v1.LoginRequest{
			Email:    s.auth.email,
			Password: s.auth.password,
		},
	})
	if err != nil {
		s.err = fmt.Errorf("login failed: %w", err)
		return s
	}

	f(res.Msg)
	s.auth.accessToken = res.Msg.GetAccessToken()
	s.auth.refreshTokenCookie = res.Header().Get("Set-Cookie")

	return s
}

func (s *Saga) CreateExercise(ctx context.Context, f func(res *v1.CreateExerciseResponse)) *Saga {
	client := apiv1connect.NewExerciseServiceClient(s.client(), s.baseURL)
	res, err := client.CreateExercise(ctx, &connect.Request[v1.CreateExerciseRequest]{
		Msg: &v1.CreateExerciseRequest{
			Name:  gofakeit.RandomString([]string{"Bench Press", "Deadlifts", "Squats"}),
			Label: "",
		},
	})
	if err != nil {
		s.err = fmt.Errorf("create exercise failed: %w", err)
		return s
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
				PageLimit: 100, //nolint:mnd
				PageToken: nil,
			},
		},
	})
	if err != nil {
		s.err = fmt.Errorf("list exercises failed: %w", err)
		return s
	}

	f(res.Msg)

	return s
}

func (s *Saga) Error(f func(err error)) {
	f(s.err)
}

func (s *Saga) Logout(ctx context.Context, f func(res *v1.LogoutResponse)) *Saga {
	client := apiv1connect.NewAuthServiceClient(s.client(), s.baseURL)
	res, err := client.Logout(ctx, &connect.Request[v1.LogoutRequest]{
		Msg: &v1.LogoutRequest{},
	})
	if err != nil {
		s.err = fmt.Errorf("logout failed: %w", err)
		return s
	}

	f(res.Msg)

	return s
}

func (s *Saga) RefreshToken(ctx context.Context, f func(res *v1.RefreshTokenResponse)) *Saga {
	client := apiv1connect.NewAuthServiceClient(s.client(), s.baseURL)
	res, err := client.RefreshToken(ctx, &connect.Request[v1.RefreshTokenRequest]{
		Msg: &v1.RefreshTokenRequest{},
	})
	if err != nil {
		s.err = fmt.Errorf("refresh token failed: %w", err)
		return s
	}

	f(res.Msg)
	s.auth.accessToken = res.Msg.GetAccessToken()

	return s
}
