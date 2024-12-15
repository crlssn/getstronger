package e2e

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"time"

	"connectrpc.com/connect"
	"github.com/brianvoe/gofakeit/v7"
	"github.com/volatiletech/sqlboiler/v4/queries/qm"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/crlssn/getstronger/server/pkg/config"
	"github.com/crlssn/getstronger/server/pkg/orm"
	v1 "github.com/crlssn/getstronger/server/pkg/proto/api/v1"
	"github.com/crlssn/getstronger/server/pkg/proto/api/v1/apiv1connect"
)

type saga struct {
	db      *sql.DB
	auth    *auth
	baseURL string
}

type auth struct {
	email              string
	password           string
	accessToken        string
	refreshTokenCookie string
}

func newSaga(db *sql.DB, config *config.Config) *saga {
	return &saga{
		db:      db,
		baseURL: fmt.Sprintf("http://localhost:%s", config.Server.Port),
		auth: &auth{
			email:    gofakeit.Email(),
			password: "password",
		},
	}
}

func (s *saga) client() *http.Client {
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

func (s *saga) Signup(ctx context.Context, f func(*connect.Response[v1.SignupResponse], error)) *saga {
	client := apiv1connect.NewAuthServiceClient(s.client(), s.baseURL)
	f(client.Signup(ctx, &connect.Request[v1.SignupRequest]{
		Msg: &v1.SignupRequest{
			Email:                s.auth.email,
			Password:             s.auth.password,
			PasswordConfirmation: s.auth.password,
			FirstName:            gofakeit.FirstName(),
			LastName:             gofakeit.LastName(),
		},
	}))

	return s
}

func (s *saga) VerifyEmail(ctx context.Context, f func(*connect.Response[v1.VerifyEmailResponse], error)) *saga {
	a, err := orm.Auths(orm.AuthWhere.Email.EQ(s.auth.email)).One(ctx, s.db)
	if err != nil {
		f(nil, fmt.Errorf("failed to load auth: %w", err))
		return s
	}

	client := apiv1connect.NewAuthServiceClient(s.client(), s.baseURL)
	f(client.VerifyEmail(ctx, &connect.Request[v1.VerifyEmailRequest]{
		Msg: &v1.VerifyEmailRequest{
			Token: a.EmailToken,
		},
	}))

	return s
}

func (s *saga) Login(ctx context.Context, f func(*connect.Response[v1.LoginResponse], error)) *saga {
	client := apiv1connect.NewAuthServiceClient(s.client(), s.baseURL)
	f(client.Login(ctx, &connect.Request[v1.LoginRequest]{
		Msg: &v1.LoginRequest{
			Email:    s.auth.email,
			Password: s.auth.password,
		},
	}))

	//f(res.Msg)
	//s.auth.accessToken = res.Msg.GetAccessToken()
	//s.auth.refreshTokenCookie = res.Header().Get("Set-Cookie")

	return s
}

func (s *saga) CreateExercise(ctx context.Context, f func(res *v1.CreateExerciseResponse)) *saga {
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

func (s *saga) ListExercises(ctx context.Context, f func(res *v1.ListExercisesResponse)) *saga {
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

func (s *saga) Logout(ctx context.Context, f func(*connect.Response[v1.LogoutResponse], error)) *saga {
	client := apiv1connect.NewAuthServiceClient(s.client(), s.baseURL)
	f(client.Logout(ctx, &connect.Request[v1.LogoutRequest]{
		Msg: &v1.LogoutRequest{},
	}))

	return s
}

func (s *saga) RefreshToken(ctx context.Context, f func(*connect.Response[v1.RefreshTokenResponse], error)) *saga {
	client := apiv1connect.NewAuthServiceClient(s.client(), s.baseURL)
	f(client.RefreshToken(ctx, &connect.Request[v1.RefreshTokenRequest]{
		Msg: &v1.RefreshTokenRequest{},
	}))

	return s
}

func (s *saga) CreateRoutine(ctx context.Context, f func(res *v1.CreateRoutineResponse)) *saga {
	exercises, err := orm.Exercises().All(ctx, s.db)
	if err != nil {
		s.err = fmt.Errorf("failed to load exercises: %w", err)
		return s
	}

	exerciseIDs := make([]string, 0, len(exercises))
	for _, e := range exercises {
		exerciseIDs = append(exerciseIDs, e.ID)
	}

	client := apiv1connect.NewRoutineServiceClient(s.client(), s.baseURL)
	res, err := client.CreateRoutine(ctx, &connect.Request[v1.CreateRoutineRequest]{
		Msg: &v1.CreateRoutineRequest{
			Name:        gofakeit.RandomString([]string{"Upper Body", "Lower Body", "Full Body"}),
			ExerciseIds: exerciseIDs,
		},
	})
	if err != nil {
		s.err = fmt.Errorf("create routine failed: %w", err)
		return s
	}

	f(res.Msg)

	return s
}

func (s *saga) CreateWorkout(ctx context.Context, f func(res *v1.CreateWorkoutResponse)) *saga {
	routine, err := orm.Routines(qm.Load(orm.RoutineRels.Exercises)).One(ctx, s.db)
	if err != nil {
		s.err = fmt.Errorf("failed to load routines: %w", err)
		return s
	}

	exerciseSets := make([]*v1.ExerciseSets, 0, len(routine.R.Exercises))
	for _, e := range routine.R.Exercises {
		exerciseSets = append(exerciseSets, &v1.ExerciseSets{
			Exercise: &v1.Exercise{Id: e.ID},
			Sets: []*v1.Set{
				{
					Reps:   10,  //nolint:mnd
					Weight: 100, //nolint:mnd
				},
			},
		})
	}

	client := apiv1connect.NewWorkoutServiceClient(s.client(), s.baseURL)
	res, err := client.CreateWorkout(ctx, &connect.Request[v1.CreateWorkoutRequest]{
		Msg: &v1.CreateWorkoutRequest{
			RoutineId:    routine.ID,
			ExerciseSets: exerciseSets,
			StartedAt:    timestamppb.New(time.Now().Add(-time.Hour).UTC()),
			FinishedAt:   timestamppb.New(time.Now().UTC()),
		},
	})
	if err != nil {
		s.err = fmt.Errorf("create workout failed: %w", err)
		return s
	}

	f(res.Msg)

	return s
}

func (s *saga) ListRoutines(ctx context.Context, f func(res *v1.ListRoutinesResponse)) *saga {
	client := apiv1connect.NewRoutineServiceClient(s.client(), s.baseURL)
	res, err := client.ListRoutines(ctx, &connect.Request[v1.ListRoutinesRequest]{
		Msg: &v1.ListRoutinesRequest{
			Name: "",
			Pagination: &v1.PaginationRequest{
				PageLimit: 100, //nolint:mnd
				PageToken: nil,
			},
		},
	})
	if err != nil {
		s.err = fmt.Errorf("list routines failed: %w", err)
		return s
	}

	f(res.Msg)

	return s
}

func (s *saga) ListWorkouts(ctx context.Context, f func(res *v1.ListWorkoutsResponse)) *saga {
	user, err := orm.Users().One(ctx, s.db)
	if err != nil {
		s.err = fmt.Errorf("failed to load user: %w", err)
		return s
	}

	client := apiv1connect.NewWorkoutServiceClient(s.client(), s.baseURL)
	res, err := client.ListWorkouts(ctx, &connect.Request[v1.ListWorkoutsRequest]{
		Msg: &v1.ListWorkoutsRequest{
			UserIds: []string{user.ID},
			Pagination: &v1.PaginationRequest{
				PageLimit: 100, //nolint:mnd
				PageToken: nil,
			},
		},
	})
	if err != nil {
		s.err = fmt.Errorf("list workouts failed: %w", err)
		return s
	}

	f(res.Msg)

	return s
}

func (s *saga) SearchUsers(ctx context.Context, f func(res *v1.SearchUsersResponse)) *saga {
	user, err := orm.Users().One(ctx, s.db)
	if err != nil {
		s.err = fmt.Errorf("failed to load user: %w", err)
		return s
	}

	client := apiv1connect.NewUserServiceClient(s.client(), s.baseURL)
	res, err := client.SearchUsers(ctx, &connect.Request[v1.SearchUsersRequest]{
		Msg: &v1.SearchUsersRequest{
			Query: user.FirstName,
			Pagination: &v1.PaginationRequest{
				PageLimit: 100, //nolint:mnd
				PageToken: nil,
			},
		},
	})
	if err != nil {
		s.err = fmt.Errorf("search users failed: %w", err)
		return s
	}

	f(res.Msg)

	return s
}

func (s *saga) ListFeedItems(ctx context.Context, f func(res *v1.ListFeedItemsResponse)) *saga {
	client := apiv1connect.NewFeedServiceClient(s.client(), s.baseURL)
	res, err := client.ListFeedItems(ctx, &connect.Request[v1.ListFeedItemsRequest]{
		Msg: &v1.ListFeedItemsRequest{
			Pagination: &v1.PaginationRequest{
				PageLimit: 100, //nolint:mnd
				PageToken: nil,
			},
		},
	})
	if err != nil {
		s.err = fmt.Errorf("list feed items failed: %w", err)
		return s
	}

	f(res.Msg)

	return s
}

func (s *saga) SetAccessToken(token string) {
	s.auth.accessToken = token
}

func (s *saga) SetRefreshTokenCookie(cookie string) {
	s.auth.refreshTokenCookie = cookie
}
