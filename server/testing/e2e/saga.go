package e2e

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"strings"
	"time"

	"connectrpc.com/connect"
	"github.com/brianvoe/gofakeit/v7"
	"github.com/stephenafamo/bob"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/crlssn/getstronger/server/config"
	"github.com/crlssn/getstronger/server/gen/models"
	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/gen/proto/api/v1/apiv1connect"
)

type Saga struct {
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

func NewSaga(db *sql.DB, config *config.Config) *Saga {
	return &Saga{
		db:      db,
		baseURL: fmt.Sprintf("http://localhost:%s", config.Server.Port),
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
			return nil, fmt.Errorf("parse cookie: %w", err)
		}
		r.AddCookie(cookie)
	}

	return a.roundTripper.RoundTrip(r) //nolint:wrapcheck
}

func (s *Saga) Signup(ctx context.Context, f func(*connect.Response[apiv1.SignupResponse], error)) *Saga {
	client := apiv1connect.NewAuthServiceClient(s.client(), s.baseURL)
	f(client.Signup(ctx, &connect.Request[apiv1.SignupRequest]{
		Msg: &apiv1.SignupRequest{
			Email:                s.auth.email,
			Password:             s.auth.password,
			PasswordConfirmation: s.auth.password,
			Name:                 gofakeit.Name(),
			Username:             fakeUsername(),
		},
	}))

	return s
}

// fakeUsername is a username the API will accept: gofakeit hands out names
// with apostrophes and hyphens in them, which the username pattern does not
// allow, so anything outside it is dropped and the result kept inside the
// length the pattern takes.
func fakeUsername() string {
	const maxNameLength = 20

	kept := strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9', r == '_', r == '.':
			return r
		default:
			return -1
		}
	}, strings.ToLower(gofakeit.Username()))
	if len(kept) > maxNameLength {
		kept = kept[:maxNameLength]
	}

	return fmt.Sprintf("user%s%d", kept, gofakeit.Number(0, 999999)) //nolint:mnd
}

func (s *Saga) ResendVerificationEmail(ctx context.Context, f func(*connect.Response[apiv1.ResendVerificationEmailResponse], error)) *Saga {
	client := apiv1connect.NewAuthServiceClient(s.client(), s.baseURL)
	f(client.ResendVerificationEmail(ctx, &connect.Request[apiv1.ResendVerificationEmailRequest]{
		Msg: &apiv1.ResendVerificationEmailRequest{
			Email: s.auth.email,
		},
	}))

	return s
}

func (s *Saga) VerifyEmail(ctx context.Context, f func(*connect.Response[apiv1.VerifyEmailResponse], error)) *Saga {
	a, err := models.Auths.Query(models.SelectWhere.Auths.Email.EQ(s.auth.email)).One(ctx, bob.NewDB(s.db))
	if err != nil {
		f(nil, fmt.Errorf("load auth: %w", err))
		return s
	}

	client := apiv1connect.NewAuthServiceClient(s.client(), s.baseURL)
	f(client.VerifyEmail(ctx, &connect.Request[apiv1.VerifyEmailRequest]{
		Msg: &apiv1.VerifyEmailRequest{
			Token: a.EmailToken.String(),
		},
	}))

	return s
}

func (s *Saga) Login(ctx context.Context, f func(*connect.Response[apiv1.LoginResponse], error)) *Saga {
	client := apiv1connect.NewAuthServiceClient(s.client(), s.baseURL)
	f(client.Login(ctx, &connect.Request[apiv1.LoginRequest]{
		Msg: &apiv1.LoginRequest{
			Email:    s.auth.email,
			Password: s.auth.password,
		},
	}))

	return s
}

func (s *Saga) CreateExercise(ctx context.Context, f func(*connect.Response[apiv1.CreateExerciseResponse], error)) *Saga {
	client := apiv1connect.NewExerciseServiceClient(s.client(), s.baseURL)
	f(client.CreateExercise(ctx, &connect.Request[apiv1.CreateExerciseRequest]{
		Msg: &apiv1.CreateExerciseRequest{
			Name: gofakeit.RandomString([]string{"Bench Press", "Deadlifts", "Squats"}),
			Tags: nil,
		},
	}))

	return s
}

func (s *Saga) ListExercises(ctx context.Context, f func(*connect.Response[apiv1.ListExercisesResponse], error)) *Saga {
	client := apiv1connect.NewExerciseServiceClient(s.client(), s.baseURL)
	f(client.ListExercises(ctx, &connect.Request[apiv1.ListExercisesRequest]{
		Msg: &apiv1.ListExercisesRequest{
			Name:        "",
			ExerciseIds: nil,
			Pagination: &apiv1.PaginationRequest{
				PageLimit: 100, //nolint:mnd
				PageToken: nil,
			},
		},
	}))

	return s
}

func (s *Saga) Logout(ctx context.Context, f func(*connect.Response[apiv1.LogoutResponse], error)) *Saga {
	client := apiv1connect.NewAuthServiceClient(s.client(), s.baseURL)
	f(client.Logout(ctx, &connect.Request[apiv1.LogoutRequest]{
		Msg: &apiv1.LogoutRequest{},
	}))

	return s
}

func (s *Saga) RefreshToken(ctx context.Context, f func(*connect.Response[apiv1.RefreshTokenResponse], error)) *Saga {
	client := apiv1connect.NewAuthServiceClient(s.client(), s.baseURL)
	f(client.RefreshToken(ctx, &connect.Request[apiv1.RefreshTokenRequest]{
		Msg: &apiv1.RefreshTokenRequest{},
	}))

	return s
}

func (s *Saga) CreateRoutine(ctx context.Context, f func(*connect.Response[apiv1.CreateRoutineResponse], error)) *Saga {
	exercises, err := models.Exercises.Query().All(ctx, bob.NewDB(s.db))
	if err != nil {
		f(nil, fmt.Errorf("load exercises: %w", err))
		return s
	}

	exerciseIDs := make([]string, 0, len(exercises))
	for _, e := range exercises {
		exerciseIDs = append(exerciseIDs, e.ID.String())
	}

	client := apiv1connect.NewRoutineServiceClient(s.client(), s.baseURL)
	f(client.CreateRoutine(ctx, &connect.Request[apiv1.CreateRoutineRequest]{
		Msg: &apiv1.CreateRoutineRequest{
			Name:        gofakeit.RandomString([]string{"Upper Body", "Lower Body", "Full Body"}),
			ExerciseIds: exerciseIDs,
		},
	}))

	return s
}

func (s *Saga) CreateWorkout(ctx context.Context, f func(*connect.Response[apiv1.CreateWorkoutResponse], error)) *Saga {
	routine, err := models.Routines.Query(models.SelectThenLoad.Routine.Exercises()).One(ctx, bob.NewDB(s.db))
	if err != nil {
		f(nil, fmt.Errorf("load routines: %w", err))
		return s
	}

	exerciseSets := make([]*apiv1.ExerciseSets, 0, len(routine.R.Exercises))
	for _, e := range routine.R.Exercises {
		exerciseSets = append(exerciseSets, &apiv1.ExerciseSets{
			Exercise: &apiv1.Exercise{Id: e.ID.String()},
			Sets: []*apiv1.Set{
				{
					Reps:   10,  //nolint:mnd
					Weight: 100, //nolint:mnd
				},
			},
		})
	}

	client := apiv1connect.NewWorkoutServiceClient(s.client(), s.baseURL)
	f(client.CreateWorkout(ctx, &connect.Request[apiv1.CreateWorkoutRequest]{
		Msg: &apiv1.CreateWorkoutRequest{
			RoutineId:    routine.ID.String(),
			ExerciseSets: exerciseSets,
			StartedAt:    timestamppb.New(time.Now().Add(-time.Hour).UTC()),
			FinishedAt:   timestamppb.New(time.Now().UTC()),
		},
	}))

	return s
}

func (s *Saga) ListRoutines(ctx context.Context, f func(*connect.Response[apiv1.ListRoutinesResponse], error)) *Saga {
	client := apiv1connect.NewRoutineServiceClient(s.client(), s.baseURL)
	f(client.ListRoutines(ctx, &connect.Request[apiv1.ListRoutinesRequest]{
		Msg: &apiv1.ListRoutinesRequest{
			Name: "",
			Pagination: &apiv1.PaginationRequest{
				PageLimit: 100, //nolint:mnd
				PageToken: nil,
			},
		},
	}))

	return s
}

func (s *Saga) ListWorkouts(ctx context.Context, f func(*connect.Response[apiv1.ListWorkoutsResponse], error)) *Saga {
	user, err := models.Users.Query().One(ctx, bob.NewDB(s.db))
	if err != nil {
		f(nil, fmt.Errorf("load user: %w", err))
		return s
	}

	client := apiv1connect.NewWorkoutServiceClient(s.client(), s.baseURL)
	f(client.ListWorkouts(ctx, &connect.Request[apiv1.ListWorkoutsRequest]{
		Msg: &apiv1.ListWorkoutsRequest{
			UserIds: []string{user.ID.String()},
			Pagination: &apiv1.PaginationRequest{
				PageLimit: 100, //nolint:mnd
				PageToken: nil,
			},
		},
	}))

	return s
}

func (s *Saga) SearchUsers(ctx context.Context, f func(*connect.Response[apiv1.SearchUsersResponse], error)) *Saga {
	user, err := models.Users.Query().One(ctx, bob.NewDB(s.db))
	if err != nil {
		f(nil, fmt.Errorf("load user: %w", err))
		return s
	}

	client := apiv1connect.NewUserServiceClient(s.client(), s.baseURL)
	f(client.SearchUsers(ctx, &connect.Request[apiv1.SearchUsersRequest]{
		Msg: &apiv1.SearchUsersRequest{
			Query: user.Name,
			Pagination: &apiv1.PaginationRequest{
				PageLimit: 100, //nolint:mnd
				PageToken: nil,
			},
		},
	}))

	return s
}

func (s *Saga) ListFeedItems(ctx context.Context, f func(*connect.Response[apiv1.ListFeedItemsResponse], error)) *Saga {
	client := apiv1connect.NewFeedServiceClient(s.client(), s.baseURL)
	f(client.ListFeedItems(ctx, &connect.Request[apiv1.ListFeedItemsRequest]{
		Msg: &apiv1.ListFeedItemsRequest{
			Pagination: &apiv1.PaginationRequest{
				PageLimit: 100, //nolint:mnd
				PageToken: nil,
			},
		},
	}))

	return s
}

func (s *Saga) SetAccessToken(token string) {
	s.auth.accessToken = token
}

func (s *Saga) SetRefreshTokenCookie(cookie string) {
	s.auth.refreshTokenCookie = cookie
}

func (s *Saga) GetWorkout(ctx context.Context, f func(*connect.Response[apiv1.GetWorkoutResponse], error)) *Saga {
	workout, err := models.Workouts.Query().One(ctx, bob.NewDB(s.db))
	if err != nil {
		f(nil, fmt.Errorf("load workout: %w", err))
		return s
	}

	client := apiv1connect.NewWorkoutServiceClient(s.client(), s.baseURL)
	f(client.GetWorkout(ctx, &connect.Request[apiv1.GetWorkoutRequest]{
		Msg: &apiv1.GetWorkoutRequest{
			Id: workout.ID.String(),
		},
	}))

	return s
}
