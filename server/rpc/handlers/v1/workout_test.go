package v1_test

import (
	"context"
	"log"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"github.com/stretchr/testify/suite"
	"go.uber.org/zap"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/stephenafamo/bob"

	"github.com/crlssn/getstronger/server/gen/models"
	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/gen/proto/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/repo"
	handlers "github.com/crlssn/getstronger/server/rpc/handlers/v1"
	"github.com/crlssn/getstronger/server/testing/container"
	"github.com/crlssn/getstronger/server/testing/factory"
	"github.com/crlssn/getstronger/server/xcontext"
)

type workoutSuite struct {
	suite.Suite

	handler apiv1connect.WorkoutServiceHandler

	factory   *factory.Factory
	container *container.Container
}

func TestWorkoutSuite(t *testing.T) {
	t.Parallel()
	suite.Run(t, new(workoutSuite))
}

func (s *workoutSuite) SetupSuite() {
	ctx := context.Background()
	s.container = container.NewContainer(ctx)
	s.factory = factory.NewFactory(s.container.DB)
	s.handler = handlers.NewWorkoutHandler(repo.New(s.container.DB), nil)

	s.T().Cleanup(func() {
		if err := s.container.Terminate(ctx); err != nil {
			log.Fatalf("failed to clean container: %s", err)
		}
	})
}

func (s *workoutSuite) TestCreateWorkout() {
	type expected struct {
		err error
	}

	type test struct {
		name     string
		req      *connect.Request[apiv1.CreateWorkoutRequest]
		init     func(test test, userID string)
		expected expected
	}

	tests := []test{
		{
			name: "ok_create_workout",
			req: &connect.Request[apiv1.CreateWorkoutRequest]{
				Msg: &apiv1.CreateWorkoutRequest{
					RoutineId: uuid.NewString(),
					ExerciseSets: []*apiv1.ExerciseSets{
						{
							Exercise: &apiv1.Exercise{
								Id: uuid.NewString(),
							},
							Sets: []*apiv1.Set{
								{
									Id:     uuid.NewString(),
									Reps:   s.factory.Faker.Int32(),
									Weight: s.factory.Faker.Float64(),
								},
							},
						},
					},
					StartedAt:  timestamppb.Now(),
					FinishedAt: timestamppb.New(time.Now().Add(1 * time.Hour)),
					Note:       "Note",
				},
			},
			init: func(t test, userID string) {
				for _, es := range t.req.Msg.GetExerciseSets() {
					s.factory.NewExercise(factory.ExerciseID(es.GetExercise().GetId()))
				}

				s.factory.NewRoutine(
					factory.RoutineID(t.req.Msg.GetRoutineId()),
					factory.RoutineUserID(userID),
				)
			},
			expected: expected{
				err: nil,
			},
		},
		{
			name: "err_routine_not_found_unexpected_routine_id",
			req: &connect.Request[apiv1.CreateWorkoutRequest]{
				Msg: &apiv1.CreateWorkoutRequest{
					RoutineId: uuid.NewString(),
				},
			},
			init: func(_ test, userID string) {
				s.factory.NewRoutine(
					factory.RoutineID(uuid.NewString()),
					factory.RoutineUserID(userID),
				)
			},
			expected: expected{
				err: connect.NewError(connect.CodeFailedPrecondition, nil),
			},
		},
		{
			name: "err_routine_not_found_unexpected_user_id",
			req: &connect.Request[apiv1.CreateWorkoutRequest]{
				Msg: &apiv1.CreateWorkoutRequest{
					RoutineId: uuid.NewString(),
				},
			},
			init: func(t test, _ string) {
				user := s.factory.NewUser()
				s.factory.NewRoutine(
					factory.RoutineID(t.req.Msg.GetRoutineId()),
					factory.RoutineUserID(user.ID),
				)
			},
			expected: expected{
				err: connect.NewError(connect.CodeFailedPrecondition, nil),
			},
		},
		{
			name: "err_invalid_timestamps",
			req: &connect.Request[apiv1.CreateWorkoutRequest]{
				Msg: &apiv1.CreateWorkoutRequest{
					StartedAt:  timestamppb.New(time.Now().Add(time.Minute)),
					FinishedAt: timestamppb.New(time.Now()),
				},
			},
			init: func(_ test, _ string) {},
			expected: expected{
				err: connect.NewError(connect.CodeInvalidArgument, handlers.ErrWorkoutMustStartBeforeFinish),
			},
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			user := s.factory.NewUser()
			ctx := xcontext.WithUserID(context.Background(), user.ID)
			ctx = xcontext.WithLogger(ctx, zap.NewExample())

			t.init(t, user.ID)
			res, err := s.handler.CreateWorkout(ctx, t.req)
			if t.expected.err != nil {
				s.Require().Nil(res)
				s.Require().Error(err)
				s.Require().Equal(t.expected.err.Error(), err.Error())
				return
			}

			s.Require().NotNil(res)
			s.Require().NoError(err)

			w, err := models.FindWorkout(ctx, bob.NewDB(s.container.DB), res.Msg.GetWorkoutId())
			s.Require().NoError(err)
			s.Require().NotNil(w)
		})
	}
}

func (s *workoutSuite) TestCreateWorkoutAdvancesActivePlan() {
	user := s.factory.NewUser()
	routine := s.factory.NewRoutine(factory.RoutineUserID(user.ID))
	nextRoutine := s.factory.NewRoutine(factory.RoutineUserID(user.ID))
	exercise := s.factory.NewExercise(factory.ExerciseUserID(user.ID))
	planRepo := repo.New(s.container.DB)
	plan, err := planRepo.CreatePlan(context.Background(), repo.CreatePlanParams{
		UserID:     user.ID,
		Name:       "Rotation",
		RoutineIDs: []string{routine.ID, nextRoutine.ID},
	})
	s.Require().NoError(err)
	plan, err = planRepo.SetActivePlan(context.Background(), plan.ID, user.ID)
	s.Require().NoError(err)

	ctx := xcontext.WithUserID(context.Background(), user.ID)
	ctx = xcontext.WithLogger(ctx, zap.NewExample())
	response, err := s.handler.CreateWorkout(ctx, connect.NewRequest(&apiv1.CreateWorkoutRequest{
		RoutineId: routine.ID,
		PlanId:    plan.ID,
		ExerciseSets: []*apiv1.ExerciseSets{{
			Exercise: &apiv1.Exercise{Id: exercise.ID},
			Sets:     []*apiv1.Set{{Reps: 5, Weight: 50}},
		}},
		StartedAt:  timestamppb.Now(),
		FinishedAt: timestamppb.New(time.Now().Add(time.Hour)),
	}))
	s.Require().NoError(err)
	s.Require().NotEmpty(response.Msg.GetWorkoutId())

	advanced, err := planRepo.GetActivePlan(context.Background(), user.ID)
	s.Require().NoError(err)
	s.Require().Equal(1, advanced.CurrentPosition)
}

func (s *workoutSuite) TestCreateWorkoutLinksTheRoutine() {
	user := s.factory.NewUser()
	routine := s.factory.NewRoutine(factory.RoutineUserID(user.ID))
	exercise := s.factory.NewExercise(factory.ExerciseUserID(user.ID))

	ctx := xcontext.WithUserID(context.Background(), user.ID)
	ctx = xcontext.WithLogger(ctx, zap.NewExample())
	created, err := s.handler.CreateWorkout(ctx, connect.NewRequest(&apiv1.CreateWorkoutRequest{
		RoutineId: routine.ID,
		ExerciseSets: []*apiv1.ExerciseSets{{
			Exercise: &apiv1.Exercise{Id: exercise.ID},
			Sets:     []*apiv1.Set{{Reps: 5, Weight: 50}},
		}},
		StartedAt:  timestamppb.Now(),
		FinishedAt: timestamppb.New(time.Now().Add(time.Hour)),
	}))
	s.Require().NoError(err)

	listed, err := s.handler.ListWorkouts(ctx, connect.NewRequest(&apiv1.ListWorkoutsRequest{
		UserIds:    []string{user.ID},
		Pagination: &apiv1.PaginationRequest{PageLimit: 10},
	}))
	s.Require().NoError(err)
	s.Require().Len(listed.Msg.GetWorkouts(), 1)
	s.Require().Equal(created.Msg.GetWorkoutId(), listed.Msg.GetWorkouts()[0].GetId())
	s.Require().Equal(routine.ID, listed.Msg.GetWorkouts()[0].GetRoutineId())
}

func (s *workoutSuite) TestCreateQuickWorkoutHasNoRoutine() {
	user := s.factory.NewUser()
	exercise := s.factory.NewExercise(factory.ExerciseUserID(user.ID))

	ctx := xcontext.WithUserID(context.Background(), user.ID)
	ctx = xcontext.WithLogger(ctx, zap.NewExample())
	_, err := s.handler.CreateWorkout(ctx, connect.NewRequest(&apiv1.CreateWorkoutRequest{
		WorkoutName: "Quick Workout",
		ExerciseSets: []*apiv1.ExerciseSets{{
			Exercise: &apiv1.Exercise{Id: exercise.ID},
			Sets:     []*apiv1.Set{{Reps: 5, Weight: 50}},
		}},
		StartedAt:  timestamppb.Now(),
		FinishedAt: timestamppb.New(time.Now().Add(time.Hour)),
	}))
	s.Require().NoError(err)

	listed, err := s.handler.ListWorkouts(ctx, connect.NewRequest(&apiv1.ListWorkoutsRequest{
		UserIds:    []string{user.ID},
		Pagination: &apiv1.PaginationRequest{PageLimit: 10},
	}))
	s.Require().NoError(err)
	s.Require().Len(listed.Msg.GetWorkouts(), 1)
	s.Require().Empty(listed.Msg.GetWorkouts()[0].GetRoutineId())
}

func (s *workoutSuite) TestCreateWorkoutSavesWhenRoutineIsNoLongerNextInPlan() {
	user := s.factory.NewUser()
	completedRoutine := s.factory.NewRoutine(factory.RoutineUserID(user.ID))
	nextRoutine := s.factory.NewRoutine(factory.RoutineUserID(user.ID))
	exercise := s.factory.NewExercise(factory.ExerciseUserID(user.ID))
	planRepo := repo.New(s.container.DB)
	plan, err := planRepo.CreatePlan(context.Background(), repo.CreatePlanParams{
		UserID:     user.ID,
		Name:       "Rotation",
		RoutineIDs: []string{completedRoutine.ID, nextRoutine.ID},
	})
	s.Require().NoError(err)
	plan, err = planRepo.SetActivePlan(context.Background(), plan.ID, user.ID)
	s.Require().NoError(err)
	_, err = planRepo.AdvancePlan(context.Background(), plan.ID, user.ID, completedRoutine.ID)
	s.Require().NoError(err)

	ctx := xcontext.WithUserID(context.Background(), user.ID)
	ctx = xcontext.WithLogger(ctx, zap.NewExample())
	response, err := s.handler.CreateWorkout(ctx, connect.NewRequest(&apiv1.CreateWorkoutRequest{
		RoutineId: completedRoutine.ID,
		PlanId:    plan.ID,
		ExerciseSets: []*apiv1.ExerciseSets{{
			Exercise: &apiv1.Exercise{Id: exercise.ID},
			Sets:     []*apiv1.Set{{Reps: 5, Weight: 50}},
		}},
		StartedAt:  timestamppb.Now(),
		FinishedAt: timestamppb.New(time.Now().Add(time.Hour)),
	}))
	s.Require().NoError(err)
	s.Require().NotEmpty(response.Msg.GetWorkoutId())

	savedWorkout, err := models.FindWorkout(context.Background(), bob.NewDB(s.container.DB), response.Msg.GetWorkoutId())
	s.Require().NoError(err)
	s.Require().Equal(completedRoutine.Title, savedWorkout.Name)

	unchanged, err := planRepo.GetActivePlan(context.Background(), user.ID)
	s.Require().NoError(err)
	s.Require().Equal(1, unchanged.CurrentPosition)
	s.Require().Equal(nextRoutine.ID, unchanged.Routines[unchanged.CurrentPosition].ID)
}

func (s *workoutSuite) TestCreateQuickWorkoutWithoutRoutine() {
	user := s.factory.NewUser()
	exercise := s.factory.NewExercise(factory.ExerciseUserID(user.ID))
	ctx := xcontext.WithUserID(context.Background(), user.ID)
	ctx = xcontext.WithLogger(ctx, zap.NewExample())

	response, err := s.handler.CreateWorkout(ctx, connect.NewRequest(&apiv1.CreateWorkoutRequest{
		WorkoutName: "Quick Workout",
		ExerciseSets: []*apiv1.ExerciseSets{{
			Exercise: &apiv1.Exercise{Id: exercise.ID},
			Sets:     []*apiv1.Set{{Reps: 10, Weight: 20}},
		}},
		StartedAt:  timestamppb.Now(),
		FinishedAt: timestamppb.New(time.Now().Add(time.Hour)),
	}))
	s.Require().NoError(err)

	workout, err := models.FindWorkout(context.Background(), bob.NewDB(s.container.DB), response.Msg.GetWorkoutId())
	s.Require().NoError(err)
	s.Require().Equal("Quick Workout", workout.Name)
}
