package v1_test

import (
	"context"
	"log"
	"maps"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/gofrs/uuid/v5"
	"github.com/stretchr/testify/suite"
	"go.uber.org/zap"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/crlssn/getstronger/server/config"
	"github.com/crlssn/getstronger/server/cookies"
	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/gen/proto/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/jwt"
	"github.com/crlssn/getstronger/server/pubsub"
	"github.com/crlssn/getstronger/server/repo"
	handlers "github.com/crlssn/getstronger/server/rpc/handlers/v1"
	"github.com/crlssn/getstronger/server/testing/container"
	"github.com/crlssn/getstronger/server/testing/factory"
	"github.com/crlssn/getstronger/server/xcontext"
)

func nativeUUID(value string) uuid.UUID {
	return uuid.FromStringOrNil(value)
}

// malformedIDSuite calls the handlers the way the mux never does: without the
// validation interceptor in front of them.
//
// The schema constrains every field that names a row, so a value that is not
// one cannot reach a handler through the server. What it may not do is read as
// the nil UUID if it ever does — that names no row, and the store would answer
// for it with an empty page or a silently dropped write. Each handler is asked
// directly, and has to say the argument was invalid.
type malformedIDSuite struct {
	suite.Suite

	auth         apiv1connect.AuthServiceHandler
	exercise     apiv1connect.ExerciseServiceHandler
	notification apiv1connect.NotificationServiceHandler
	routine      apiv1connect.RoutineServiceHandler
	user         apiv1connect.UserServiceHandler
	workout      apiv1connect.WorkoutServiceHandler

	factory   *factory.Factory
	container *container.Container
}

func TestMalformedIDSuite(t *testing.T) {
	t.Parallel()
	suite.Run(t, new(malformedIDSuite))
}

func (s *malformedIDSuite) SetupSuite() {
	ctx := context.Background()
	s.container = container.NewContainer(ctx)
	s.factory = factory.NewFactory(s.container.DB)

	r := repo.New(s.container.DB)
	ps := pubsub.New(pubsub.Params{Log: zap.NewExample(), Store: r})

	s.auth = handlers.NewAuthHandler(handlers.AuthHandlerParams{
		JWT:     jwt.NewIssuer([]byte("access-key"), []byte("refresh-key")),
		Repo:    r,
		Cookies: cookies.New(new(config.Config)),
	})
	s.exercise = handlers.NewExerciseHandler(r)
	s.notification = handlers.NewNotificationHandler(r)
	s.routine = handlers.NewRoutineHandler(r)
	s.user = handlers.NewUserHandler(r, ps)
	s.workout = handlers.NewWorkoutHandler(r, ps)

	s.T().Cleanup(func() {
		if err := s.container.Terminate(ctx); err != nil {
			log.Fatalf("Clean container: %s", err)
		}
	})
}

// notAnID is what none of these fields may be read as anything but a refusal.
const notAnID = "not-a-uuid"

func (s *malformedIDSuite) TestEveryFieldNamingARowIsRefused() {
	ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
	user := s.factory.NewUser()
	ctx = xcontext.WithUserID(ctx, user.ID)

	f := malformedFixtures{
		anID:      uuid.Must(uuid.NewV4()).String(),
		workoutID: s.factory.NewWorkout(factory.WorkoutUserID(user.ID)).ID.String(),
		exerciseSets: []*apiv1.ExerciseSets{{
			Exercise: &apiv1.Exercise{Id: notAnID},
			Sets:     []*apiv1.Set{{Reps: 5}},
		}},
	}

	for name, call := range s.cases(ctx, f) {
		s.Run(name, func() {
			s.Require().Equal(connect.CodeInvalidArgument, call())
		})
	}
}

// malformedFixtures are what a case needs besides the id that is not one: a
// well-formed id for the fields the case is not about, and a stored workout for
// the edits that read the row before reaching that field.
type malformedFixtures struct {
	anID         string
	workoutID    string
	exerciseSets []*apiv1.ExerciseSets
}

// trained gives a workout the period every save must carry, so a case fails on
// the id it is about rather than on the clock.
func trained(workout *apiv1.Workout) *apiv1.Workout {
	workout.StartedAt = timestamppb.New(time.Now().Add(-time.Hour))
	workout.FinishedAt = timestamppb.Now()

	return workout
}

func (s *malformedIDSuite) cases(ctx context.Context, f malformedFixtures) map[string]func() connect.Code {
	cases := map[string]func() connect.Code{}
	maps.Copy(cases, s.authCases(ctx, f))
	maps.Copy(cases, s.exerciseCases(ctx, f))
	maps.Copy(cases, s.notificationCases(ctx, f))
	maps.Copy(cases, s.routineCases(ctx, f))
	maps.Copy(cases, s.dashboardCases(ctx, f))
	maps.Copy(cases, s.planCases(ctx, f))
	maps.Copy(cases, s.userCases(ctx, f))
	maps.Copy(cases, s.workoutCases(ctx, f))

	return cases
}

func (s *malformedIDSuite) authCases(ctx context.Context, _ malformedFixtures) map[string]func() connect.Code {
	return map[string]func() connect.Code{
		"auth: update password token": func() connect.Code {
			_, err := s.auth.UpdatePassword(ctx, connect.NewRequest(&apiv1.UpdatePasswordRequest{
				Token: notAnID, Password: "password123", PasswordConfirmation: "password123",
			}))
			return connect.CodeOf(err)
		},
	}
}

func (s *malformedIDSuite) exerciseCases(ctx context.Context, _ malformedFixtures) map[string]func() connect.Code {
	return map[string]func() connect.Code{
		"exercise: get": func() connect.Code {
			_, err := s.exercise.GetExercise(ctx, connect.NewRequest(&apiv1.GetExerciseRequest{Id: notAnID}))
			return connect.CodeOf(err)
		},
		"exercise: update": func() connect.Code {
			_, err := s.exercise.UpdateExercise(ctx, connect.NewRequest(&apiv1.UpdateExerciseRequest{
				Exercise: &apiv1.Exercise{Id: notAnID},
			}))
			return connect.CodeOf(err)
		},
		"exercise: delete": func() connect.Code {
			_, err := s.exercise.DeleteExercise(ctx, connect.NewRequest(&apiv1.DeleteExerciseRequest{Id: notAnID}))
			return connect.CodeOf(err)
		},
		"exercise: list by ids": func() connect.Code {
			_, err := s.exercise.ListExercises(ctx, connect.NewRequest(&apiv1.ListExercisesRequest{
				ExerciseIds: []string{notAnID},
			}))
			return connect.CodeOf(err)
		},
		"exercise: previous sets": func() connect.Code {
			_, err := s.exercise.GetPreviousWorkoutSets(ctx, connect.NewRequest(&apiv1.GetPreviousWorkoutSetsRequest{
				ExerciseIds: []string{notAnID},
			}))
			return connect.CodeOf(err)
		},
		"exercise: personal bests": func() connect.Code {
			_, err := s.exercise.GetPersonalBests(ctx, connect.NewRequest(&apiv1.GetPersonalBestsRequest{UserId: notAnID}))
			return connect.CodeOf(err)
		},
		"exercise: list sets by exercise": func() connect.Code {
			_, err := s.exercise.ListSets(ctx, connect.NewRequest(&apiv1.ListSetsRequest{ExerciseIds: []string{notAnID}}))
			return connect.CodeOf(err)
		},
		"exercise: list sets by user": func() connect.Code {
			_, err := s.exercise.ListSets(ctx, connect.NewRequest(&apiv1.ListSetsRequest{UserIds: []string{notAnID}}))
			return connect.CodeOf(err)
		},
	}
}

func (s *malformedIDSuite) notificationCases(ctx context.Context, _ malformedFixtures) map[string]func() connect.Code {
	return map[string]func() connect.Code{
		"notification: mark one read": func() connect.Code {
			_, err := s.notification.MarkNotificationsAsRead(ctx, connect.NewRequest(&apiv1.MarkNotificationsAsReadRequest{
				NotificationId: &[]string{notAnID}[0],
			}))
			return connect.CodeOf(err)
		},
	}
}

func (s *malformedIDSuite) routineCases(ctx context.Context, f malformedFixtures) map[string]func() connect.Code {
	return map[string]func() connect.Code{
		"routine: create with exercise ids": func() connect.Code {
			_, err := s.routine.CreateRoutine(ctx, connect.NewRequest(&apiv1.CreateRoutineRequest{
				Name: "Push", ExerciseIds: []string{notAnID},
			}))
			return connect.CodeOf(err)
		},
		"routine: create with grouped exercise": func() connect.Code {
			_, err := s.routine.CreateRoutine(ctx, connect.NewRequest(&apiv1.CreateRoutineRequest{
				Name: "Push",
				Groups: []*apiv1.RoutineGroup{{
					Exercises: []*apiv1.RoutineExercise{{Exercise: &apiv1.Exercise{Id: notAnID}}},
				}},
			}))
			return connect.CodeOf(err)
		},
		"routine: get": func() connect.Code {
			_, err := s.routine.GetRoutine(ctx, connect.NewRequest(&apiv1.GetRoutineRequest{Id: notAnID}))
			return connect.CodeOf(err)
		},
		"routine: update by id": func() connect.Code {
			_, err := s.routine.UpdateRoutine(ctx, connect.NewRequest(&apiv1.UpdateRoutineRequest{
				Routine: &apiv1.Routine{Id: notAnID},
			}))
			return connect.CodeOf(err)
		},
		"routine: update with exercise": func() connect.Code {
			_, err := s.routine.UpdateRoutine(ctx, connect.NewRequest(&apiv1.UpdateRoutineRequest{
				Routine: &apiv1.Routine{Id: f.anID, Exercises: []*apiv1.Exercise{{Id: notAnID}}},
			}))
			return connect.CodeOf(err)
		},
		"routine: update with grouped exercise": func() connect.Code {
			_, err := s.routine.UpdateRoutine(ctx, connect.NewRequest(&apiv1.UpdateRoutineRequest{
				Routine: &apiv1.Routine{Id: f.anID, Groups: []*apiv1.RoutineGroup{{
					Exercises: []*apiv1.RoutineExercise{{Exercise: &apiv1.Exercise{Id: notAnID}}},
				}}},
			}))
			return connect.CodeOf(err)
		},
		"routine: delete": func() connect.Code {
			_, err := s.routine.DeleteRoutine(ctx, connect.NewRequest(&apiv1.DeleteRoutineRequest{Id: notAnID}))
			return connect.CodeOf(err)
		},
		"routine: add exercise to routine": func() connect.Code {
			_, err := s.routine.AddExercise(ctx, connect.NewRequest(&apiv1.AddExerciseRequest{
				RoutineId: notAnID, ExerciseId: f.anID,
			}))
			return connect.CodeOf(err)
		},
		"routine: add exercise by exercise": func() connect.Code {
			_, err := s.routine.AddExercise(ctx, connect.NewRequest(&apiv1.AddExerciseRequest{
				RoutineId: f.anID, ExerciseId: notAnID,
			}))
			return connect.CodeOf(err)
		},
		"routine: reorder by routine": func() connect.Code {
			_, err := s.routine.UpdateExerciseOrder(ctx, connect.NewRequest(&apiv1.UpdateExerciseOrderRequest{
				RoutineId: notAnID, ExerciseIds: []string{f.anID},
			}))
			return connect.CodeOf(err)
		},
		"routine: reorder by exercise": func() connect.Code {
			_, err := s.routine.UpdateExerciseOrder(ctx, connect.NewRequest(&apiv1.UpdateExerciseOrderRequest{
				RoutineId: f.anID, ExerciseIds: []string{notAnID},
			}))
			return connect.CodeOf(err)
		},
	}
}

func (s *malformedIDSuite) dashboardCases(ctx context.Context, _ malformedFixtures) map[string]func() connect.Code {
	return map[string]func() connect.Code{
		"dashboard: preferred routine": func() connect.Code {
			_, err := s.routine.GetDashboard(ctx, connect.NewRequest(&apiv1.GetDashboardRequest{
				PreferredRoutineId: notAnID,
			}))
			return connect.CodeOf(err)
		},
	}
}

func (s *malformedIDSuite) planCases(ctx context.Context, f malformedFixtures) map[string]func() connect.Code {
	return map[string]func() connect.Code{
		"plan: create": func() connect.Code {
			_, err := s.routine.CreatePlan(ctx, connect.NewRequest(&apiv1.CreatePlanRequest{
				Name: "Rotation", RoutineIds: []string{notAnID},
			}))
			return connect.CodeOf(err)
		},
		"plan: get": func() connect.Code {
			_, err := s.routine.GetPlan(ctx, connect.NewRequest(&apiv1.GetPlanRequest{Id: notAnID}))
			return connect.CodeOf(err)
		},
		"plan: update by id": func() connect.Code {
			_, err := s.routine.UpdatePlan(ctx, connect.NewRequest(&apiv1.UpdatePlanRequest{Id: notAnID}))
			return connect.CodeOf(err)
		},
		"plan: update by routine": func() connect.Code {
			_, err := s.routine.UpdatePlan(ctx, connect.NewRequest(&apiv1.UpdatePlanRequest{
				Id: f.anID, RoutineIds: []string{notAnID},
			}))
			return connect.CodeOf(err)
		},
		"plan: delete": func() connect.Code {
			_, err := s.routine.DeletePlan(ctx, connect.NewRequest(&apiv1.DeletePlanRequest{Id: notAnID}))
			return connect.CodeOf(err)
		},
		"plan: activate": func() connect.Code {
			_, err := s.routine.SetActivePlan(ctx, connect.NewRequest(&apiv1.SetActivePlanRequest{Id: notAnID}))
			return connect.CodeOf(err)
		},
		"plan: skip routine": func() connect.Code {
			_, err := s.routine.SkipPlanRoutine(ctx, connect.NewRequest(&apiv1.SkipPlanRoutineRequest{Id: notAnID}))
			return connect.CodeOf(err)
		},
	}
}

func (s *malformedIDSuite) userCases(ctx context.Context, _ malformedFixtures) map[string]func() connect.Code {
	return map[string]func() connect.Code{
		"user: get": func() connect.Code {
			_, err := s.user.GetUser(ctx, connect.NewRequest(&apiv1.GetUserRequest{Id: notAnID}))
			return connect.CodeOf(err)
		},
		"user: follow": func() connect.Code {
			_, err := s.user.FollowUser(ctx, connect.NewRequest(&apiv1.FollowUserRequest{FollowId: notAnID}))
			return connect.CodeOf(err)
		},
		"user: unfollow": func() connect.Code {
			_, err := s.user.UnfollowUser(ctx, connect.NewRequest(&apiv1.UnfollowUserRequest{UnfollowId: notAnID}))
			return connect.CodeOf(err)
		},
		"user: list followers": func() connect.Code {
			_, err := s.user.ListFollowers(ctx, connect.NewRequest(&apiv1.ListFollowersRequest{UserId: notAnID}))
			return connect.CodeOf(err)
		},
		"user: list followees": func() connect.Code {
			_, err := s.user.ListFollowees(ctx, connect.NewRequest(&apiv1.ListFolloweesRequest{UserId: notAnID}))
			return connect.CodeOf(err)
		},
	}
}

func (s *malformedIDSuite) workoutCases(ctx context.Context, f malformedFixtures) map[string]func() connect.Code {
	return map[string]func() connect.Code{
		"workout: create against a routine": func() connect.Code {
			_, err := s.workout.CreateWorkout(ctx, connect.NewRequest(&apiv1.CreateWorkoutRequest{
				RoutineId:    notAnID,
				ExerciseSets: []*apiv1.ExerciseSets{{Exercise: &apiv1.Exercise{Id: f.anID}, Sets: []*apiv1.Set{{Reps: 5}}}},
				StartedAt:    timestamppb.New(time.Now().Add(-time.Hour)),
				FinishedAt:   timestamppb.Now(),
			}))
			return connect.CodeOf(err)
		},
		"workout: create against a plan": func() connect.Code {
			_, err := s.workout.CreateWorkout(ctx, connect.NewRequest(&apiv1.CreateWorkoutRequest{
				PlanId:       notAnID,
				ExerciseSets: []*apiv1.ExerciseSets{{Exercise: &apiv1.Exercise{Id: f.anID}, Sets: []*apiv1.Set{{Reps: 5}}}},
				StartedAt:    timestamppb.New(time.Now().Add(-time.Hour)),
				FinishedAt:   timestamppb.Now(),
			}))
			return connect.CodeOf(err)
		},
		"workout: create with an idempotency key": func() connect.Code {
			key := notAnID
			_, err := s.workout.CreateWorkout(ctx, connect.NewRequest(&apiv1.CreateWorkoutRequest{
				IdempotencyKey: &key,
				ExerciseSets:   []*apiv1.ExerciseSets{{Exercise: &apiv1.Exercise{Id: f.anID}, Sets: []*apiv1.Set{{Reps: 5}}}},
				StartedAt:      timestamppb.New(time.Now().Add(-time.Hour)),
				FinishedAt:     timestamppb.Now(),
			}))
			return connect.CodeOf(err)
		},
		"workout: create with an exercise set": func() connect.Code {
			_, err := s.workout.CreateWorkout(ctx, connect.NewRequest(&apiv1.CreateWorkoutRequest{
				ExerciseSets: f.exerciseSets,
				StartedAt:    timestamppb.New(time.Now().Add(-time.Hour)),
				FinishedAt:   timestamppb.Now(),
			}))
			return connect.CodeOf(err)
		},
		"workout: create with a grouped exercise": func() connect.Code {
			_, err := s.workout.CreateWorkout(ctx, connect.NewRequest(&apiv1.CreateWorkoutRequest{
				ExerciseSets: []*apiv1.ExerciseSets{{Exercise: &apiv1.Exercise{Id: f.anID}, Sets: []*apiv1.Set{{Reps: 5}}}},
				Groups: []*apiv1.WorkoutGroup{{
					Exercises: []*apiv1.WorkoutGroupExercise{{Exercise: &apiv1.Exercise{Id: notAnID}, SetCount: 1}},
				}},
				StartedAt:  timestamppb.New(time.Now().Add(-time.Hour)),
				FinishedAt: timestamppb.Now(),
			}))
			return connect.CodeOf(err)
		},
		"workout: get": func() connect.Code {
			_, err := s.workout.GetWorkout(ctx, connect.NewRequest(&apiv1.GetWorkoutRequest{Id: notAnID}))
			return connect.CodeOf(err)
		},
		"workout: list by user": func() connect.Code {
			_, err := s.workout.ListWorkouts(ctx, connect.NewRequest(&apiv1.ListWorkoutsRequest{
				UserIds: []string{notAnID},
			}))
			return connect.CodeOf(err)
		},
		"workout: delete": func() connect.Code {
			_, err := s.workout.DeleteWorkout(ctx, connect.NewRequest(&apiv1.DeleteWorkoutRequest{Id: notAnID}))
			return connect.CodeOf(err)
		},
		"workout: comment": func() connect.Code {
			_, err := s.workout.PostComment(ctx, connect.NewRequest(&apiv1.PostCommentRequest{
				WorkoutId: notAnID, Comment: "Strong",
			}))
			return connect.CodeOf(err)
		},
		"workout: update by id": func() connect.Code {
			_, err := s.workout.UpdateWorkout(ctx, connect.NewRequest(&apiv1.UpdateWorkoutRequest{
				Workout: trained(&apiv1.Workout{Id: notAnID}),
			}))
			return connect.CodeOf(err)
		},
		"workout: update with an exercise set": func() connect.Code {
			_, err := s.workout.UpdateWorkout(ctx, connect.NewRequest(&apiv1.UpdateWorkoutRequest{
				Workout: trained(&apiv1.Workout{Id: f.workoutID, ExerciseSets: f.exerciseSets}),
			}))
			return connect.CodeOf(err)
		},
	}
}
