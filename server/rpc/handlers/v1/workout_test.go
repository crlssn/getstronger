package v1_test

import (
	"context"
	"database/sql"
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
	"github.com/crlssn/getstronger/server/pubsub"
	"github.com/crlssn/getstronger/server/pubsub/events"
	"github.com/crlssn/getstronger/server/repo"
	handlers "github.com/crlssn/getstronger/server/rpc/handlers/v1"
	"github.com/crlssn/getstronger/server/testing/container"
	"github.com/crlssn/getstronger/server/testing/factory"
	"github.com/crlssn/getstronger/server/training"
	"github.com/crlssn/getstronger/server/xcontext"
)

type workoutSuite struct {
	suite.Suite

	repo    *repo.Repo
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
	s.repo = repo.New(s.container.DB)
	// PostComment publishes, so the suite needs a real bus: nothing subscribes,
	// which leaves the event persisted and buffered, exactly as a dropped one is.
	s.handler = handlers.NewWorkoutHandler(s.repo, pubsub.New(pubsub.Params{
		Log:   zap.NewExample(),
		Store: s.repo,
	}))

	s.T().Cleanup(func() {
		if err := s.container.Terminate(ctx); err != nil {
			log.Fatalf("Clean container: %s", err)
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
				err: connect.NewError(connect.CodeInvalidArgument, training.ErrWorkoutStartsAfterFinish),
			},
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			user := s.factory.NewUser()
			ctx := xcontext.WithUserID(context.Background(), user.ID.String())
			ctx = xcontext.WithLogger(ctx, zap.NewExample())

			t.init(t, user.ID.String())
			res, err := s.handler.CreateWorkout(ctx, t.req)
			if t.expected.err != nil {
				s.Require().Nil(res)
				s.Require().Error(err)
				s.Require().Equal(t.expected.err.Error(), err.Error())
				return
			}

			s.Require().NotNil(res)
			s.Require().NoError(err)

			w, err := models.FindWorkout(ctx, bob.NewDB(s.container.DB), nativeUUID(res.Msg.GetWorkoutId()))
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
		UserID:     user.ID.String(),
		Name:       "Rotation",
		RoutineIDs: []string{routine.ID.String(), nextRoutine.ID.String()},
	})
	s.Require().NoError(err)
	plan, err = planRepo.SetActivePlan(context.Background(), plan.ID, user.ID.String())
	s.Require().NoError(err)

	ctx := xcontext.WithUserID(context.Background(), user.ID.String())
	ctx = xcontext.WithLogger(ctx, zap.NewExample())
	response, err := s.handler.CreateWorkout(ctx, connect.NewRequest(&apiv1.CreateWorkoutRequest{
		RoutineId: routine.ID.String(),
		PlanId:    plan.ID,
		ExerciseSets: []*apiv1.ExerciseSets{{
			Exercise: &apiv1.Exercise{Id: exercise.ID.String()},
			Sets:     []*apiv1.Set{{Reps: 5, Weight: 50}},
		}},
		StartedAt:  timestamppb.Now(),
		FinishedAt: timestamppb.New(time.Now().Add(time.Hour)),
	}))
	s.Require().NoError(err)
	s.Require().NotEmpty(response.Msg.GetWorkoutId())

	advanced, err := planRepo.GetActivePlan(context.Background(), user.ID.String())
	s.Require().NoError(err)
	s.Require().Equal(1, advanced.CurrentPosition)
}

// A save the server committed but never answered is sent again: the offline
// queue replays it on reconnect, and a finish that timed out is pressed again.
// The key it carries makes the repeat answer with the first save rather than
// store a second one, and the plan the first advanced stays where it is.
func (s *workoutSuite) TestCreateWorkoutRepeatedWithItsKeyIsSavedOnce() {
	user := s.factory.NewUser()
	routine := s.factory.NewRoutine(factory.RoutineUserID(user.ID))
	nextRoutine := s.factory.NewRoutine(factory.RoutineUserID(user.ID))
	exercise := s.factory.NewExercise(factory.ExerciseUserID(user.ID))
	planRepo := repo.New(s.container.DB)
	plan, err := planRepo.CreatePlan(context.Background(), repo.CreatePlanParams{
		UserID:     user.ID.String(),
		Name:       "Rotation",
		RoutineIDs: []string{routine.ID.String(), nextRoutine.ID.String()},
	})
	s.Require().NoError(err)
	plan, err = planRepo.SetActivePlan(context.Background(), plan.ID, user.ID.String())
	s.Require().NoError(err)

	ctx := xcontext.WithUserID(context.Background(), user.ID.String())
	ctx = xcontext.WithLogger(ctx, zap.NewExample())
	key := uuid.NewString()
	request := func() *connect.Request[apiv1.CreateWorkoutRequest] {
		return connect.NewRequest(&apiv1.CreateWorkoutRequest{
			RoutineId: routine.ID.String(),
			PlanId:    plan.ID,
			ExerciseSets: []*apiv1.ExerciseSets{{
				Exercise: &apiv1.Exercise{Id: exercise.ID.String()},
				Sets:     []*apiv1.Set{{Reps: 5, Weight: 50}},
			}},
			StartedAt:      timestamppb.Now(),
			FinishedAt:     timestamppb.New(time.Now().Add(time.Hour)),
			IdempotencyKey: &key,
		})
	}

	first, err := s.handler.CreateWorkout(ctx, request())
	s.Require().NoError(err)
	repeat, err := s.handler.CreateWorkout(ctx, request())
	s.Require().NoError(err)
	s.Require().Equal(first.Msg.GetWorkoutId(), repeat.Msg.GetWorkoutId())

	saved, err := models.Workouts.Query(models.SelectWhere.Workouts.UserID.EQ(user.ID)).
		Count(ctx, bob.NewDB(s.container.DB))
	s.Require().NoError(err)
	s.Require().EqualValues(1, saved)

	advanced, err := planRepo.GetActivePlan(context.Background(), user.ID.String())
	s.Require().NoError(err)
	s.Require().Equal(1, advanced.CurrentPosition)
}

// The key is the client's own, so two users may well mint the same one: each
// keeps their workout, and a new key from the same user is a new workout.
func (s *workoutSuite) TestCreateWorkoutKeyIsUniquePerUser() {
	key := uuid.NewString()
	save := func(userID, key string) string {
		s.T().Helper()
		exercise := s.factory.NewExercise(factory.ExerciseUserID(userID))
		ctx := xcontext.WithUserID(context.Background(), userID)
		ctx = xcontext.WithLogger(ctx, zap.NewExample())
		response, err := s.handler.CreateWorkout(ctx, connect.NewRequest(&apiv1.CreateWorkoutRequest{
			WorkoutName: "Quick Workout",
			ExerciseSets: []*apiv1.ExerciseSets{{
				Exercise: &apiv1.Exercise{Id: exercise.ID.String()},
				Sets:     []*apiv1.Set{{Reps: 5, Weight: 50}},
			}},
			StartedAt:      timestamppb.Now(),
			FinishedAt:     timestamppb.New(time.Now().Add(time.Hour)),
			IdempotencyKey: &key,
		}))
		s.Require().NoError(err)
		return response.Msg.GetWorkoutId()
	}

	one := s.factory.NewUser()
	other := s.factory.NewUser()
	s.Require().NotEqual(save(one.ID.String(), key), save(other.ID.String(), key))
	s.Require().NotEqual(save(one.ID.String(), key), save(one.ID.String(), uuid.NewString()))
}

// The whole point of the snapshot: a session trained in blocks is read back in
// them, and an exercise trained in two blocks keeps its sets apart.
func (s *workoutSuite) TestCreateWorkoutRecordsTheBlocksItWasTrainedIn() {
	user := s.factory.NewUser()
	routine := s.factory.NewRoutine(factory.RoutineUserID(user.ID))
	press := s.factory.NewExercise(factory.ExerciseUserID(user.ID))
	squat := s.factory.NewExercise(factory.ExerciseUserID(user.ID))

	ctx := xcontext.WithUserID(context.Background(), user.ID.String())
	ctx = xcontext.WithLogger(ctx, zap.NewExample())
	created, err := s.handler.CreateWorkout(ctx, connect.NewRequest(&apiv1.CreateWorkoutRequest{
		RoutineId: routine.ID.String(),
		ExerciseSets: []*apiv1.ExerciseSets{
			{
				Exercise: &apiv1.Exercise{Id: press.ID.String()},
				// Two in the warm-up, then two rounds of the circuit.
				Sets: []*apiv1.Set{
					{Reps: 10, Weight: 20},
					{Reps: 10, Weight: 25},
					{Reps: 8, Weight: 60},
					{Reps: 8, Weight: 60},
				},
			},
			{
				Exercise: &apiv1.Exercise{Id: squat.ID.String()},
				Sets:     []*apiv1.Set{{Reps: 5, Weight: 90}, {Reps: 5, Weight: 90}},
			},
		},
		Groups: []*apiv1.WorkoutGroup{
			{
				Mode: apiv1.RoutineGroupMode_ROUTINE_GROUP_MODE_STRAIGHT,
				Exercises: []*apiv1.WorkoutGroupExercise{
					{Exercise: &apiv1.Exercise{Id: press.ID.String()}, SetCount: 2},
				},
			},
			{
				Mode:                        apiv1.RoutineGroupMode_ROUTINE_GROUP_MODE_CIRCUIT,
				RestBetweenExercisesSeconds: 15,
				RestBetweenRoundsSeconds:    90,
				Rounds:                      2,
				Exercises: []*apiv1.WorkoutGroupExercise{
					{Exercise: &apiv1.Exercise{Id: press.ID.String()}, SetCount: 2},
					{Exercise: &apiv1.Exercise{Id: squat.ID.String()}, SetCount: 2},
				},
			},
		},
		StartedAt:  timestamppb.Now(),
		FinishedAt: timestamppb.New(time.Now().Add(time.Hour)),
	}))
	s.Require().NoError(err)

	fetched, err := s.handler.GetWorkout(ctx, connect.NewRequest(&apiv1.GetWorkoutRequest{
		Id: created.Msg.GetWorkoutId(),
	}))
	s.Require().NoError(err)

	groups := fetched.Msg.GetWorkout().GetGroups()
	s.Require().Len(groups, 2)

	warmUp := groups[0]
	s.Require().Equal(apiv1.RoutineGroupMode_ROUTINE_GROUP_MODE_STRAIGHT, warmUp.GetMode())
	s.Require().Len(warmUp.GetExercises(), 1)
	s.Require().Equal(press.ID.String(), warmUp.GetExercises()[0].GetExercise().GetId())
	s.Require().Len(warmUp.GetExercises()[0].GetSets(), 2)
	// The first two sets of the press, in the order they were logged.
	s.Require().InDelta(20, warmUp.GetExercises()[0].GetSets()[0].GetWeight(), 0.01)
	s.Require().InDelta(25, warmUp.GetExercises()[0].GetSets()[1].GetWeight(), 0.01)

	circuit := groups[1]
	s.Require().Equal(apiv1.RoutineGroupMode_ROUTINE_GROUP_MODE_CIRCUIT, circuit.GetMode())
	s.Require().Equal(int32(15), circuit.GetRestBetweenExercisesSeconds())
	s.Require().Equal(int32(90), circuit.GetRestBetweenRoundsSeconds())
	s.Require().Equal(int32(2), circuit.GetRounds())
	s.Require().Len(circuit.GetExercises(), 2)
	// The block holds its exercises in the order it worked them.
	s.Require().Equal(press.ID.String(), circuit.GetExercises()[0].GetExercise().GetId())
	s.Require().Equal(squat.ID.String(), circuit.GetExercises()[1].GetExercise().GetId())
	// The press's remaining two sets, not the warm-up's.
	s.Require().Len(circuit.GetExercises()[0].GetSets(), 2)
	s.Require().InDelta(60, circuit.GetExercises()[0].GetSets()[0].GetWeight(), 0.01)

	// The flat list stays whole: a client that does not care how the session
	// was blocked keeps reading only that.
	s.Require().Len(fetched.Msg.GetWorkout().GetExerciseSets(), 2)

	// A record is a record wherever it is read: the heaviest press is marked in
	// the block that logged it, not only in the flat list.
	s.Require().True(circuit.GetExercises()[0].GetSets()[0].GetMetadata().GetPersonalBest())
}

// Every workout logged before blocks were recorded, and every one saved by a
// client that does not send them.
func (s *workoutSuite) TestCreateWorkoutWithoutBlocksIsUngrouped() {
	user := s.factory.NewUser()
	routine := s.factory.NewRoutine(factory.RoutineUserID(user.ID))
	exercise := s.factory.NewExercise(factory.ExerciseUserID(user.ID))

	ctx := xcontext.WithUserID(context.Background(), user.ID.String())
	ctx = xcontext.WithLogger(ctx, zap.NewExample())
	created, err := s.handler.CreateWorkout(ctx, connect.NewRequest(&apiv1.CreateWorkoutRequest{
		RoutineId: routine.ID.String(),
		ExerciseSets: []*apiv1.ExerciseSets{{
			Exercise: &apiv1.Exercise{Id: exercise.ID.String()},
			Sets:     []*apiv1.Set{{Reps: 5, Weight: 50}},
		}},
		StartedAt:  timestamppb.Now(),
		FinishedAt: timestamppb.New(time.Now().Add(time.Hour)),
	}))
	s.Require().NoError(err)

	fetched, err := s.handler.GetWorkout(ctx, connect.NewRequest(&apiv1.GetWorkoutRequest{
		Id: created.Msg.GetWorkoutId(),
	}))
	s.Require().NoError(err)
	s.Require().Empty(fetched.Msg.GetWorkout().GetGroups())
	s.Require().Len(fetched.Msg.GetWorkout().GetExerciseSets(), 1)
}

func (s *workoutSuite) TestCreateWorkoutLinksTheRoutine() {
	user := s.factory.NewUser()
	routine := s.factory.NewRoutine(factory.RoutineUserID(user.ID))
	exercise := s.factory.NewExercise(factory.ExerciseUserID(user.ID))

	ctx := xcontext.WithUserID(context.Background(), user.ID.String())
	ctx = xcontext.WithLogger(ctx, zap.NewExample())
	created, err := s.handler.CreateWorkout(ctx, connect.NewRequest(&apiv1.CreateWorkoutRequest{
		RoutineId: routine.ID.String(),
		ExerciseSets: []*apiv1.ExerciseSets{{
			Exercise: &apiv1.Exercise{Id: exercise.ID.String()},
			Sets:     []*apiv1.Set{{Reps: 5, Weight: 50}},
		}},
		StartedAt:  timestamppb.Now(),
		FinishedAt: timestamppb.New(time.Now().Add(time.Hour)),
	}))
	s.Require().NoError(err)

	listed, err := s.handler.ListWorkouts(ctx, connect.NewRequest(&apiv1.ListWorkoutsRequest{
		UserIds:    []string{user.ID.String()},
		Pagination: &apiv1.PaginationRequest{PageLimit: 10},
	}))
	s.Require().NoError(err)
	s.Require().Len(listed.Msg.GetWorkouts(), 1)
	s.Require().Equal(created.Msg.GetWorkoutId(), listed.Msg.GetWorkouts()[0].GetId())
	s.Require().Equal(routine.ID.String(), listed.Msg.GetWorkouts()[0].GetRoutineId())
}

func (s *workoutSuite) TestCreateQuickWorkoutHasNoRoutine() {
	user := s.factory.NewUser()
	exercise := s.factory.NewExercise(factory.ExerciseUserID(user.ID))

	ctx := xcontext.WithUserID(context.Background(), user.ID.String())
	ctx = xcontext.WithLogger(ctx, zap.NewExample())
	_, err := s.handler.CreateWorkout(ctx, connect.NewRequest(&apiv1.CreateWorkoutRequest{
		WorkoutName: "Quick Workout",
		ExerciseSets: []*apiv1.ExerciseSets{{
			Exercise: &apiv1.Exercise{Id: exercise.ID.String()},
			Sets:     []*apiv1.Set{{Reps: 5, Weight: 50}},
		}},
		StartedAt:  timestamppb.Now(),
		FinishedAt: timestamppb.New(time.Now().Add(time.Hour)),
	}))
	s.Require().NoError(err)

	listed, err := s.handler.ListWorkouts(ctx, connect.NewRequest(&apiv1.ListWorkoutsRequest{
		UserIds:    []string{user.ID.String()},
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
		UserID:     user.ID.String(),
		Name:       "Rotation",
		RoutineIDs: []string{completedRoutine.ID.String(), nextRoutine.ID.String()},
	})
	s.Require().NoError(err)
	plan, err = planRepo.SetActivePlan(context.Background(), plan.ID, user.ID.String())
	s.Require().NoError(err)
	_, err = planRepo.AdvancePlan(context.Background(), plan.ID, user.ID.String(), completedRoutine.ID.String())
	s.Require().NoError(err)

	ctx := xcontext.WithUserID(context.Background(), user.ID.String())
	ctx = xcontext.WithLogger(ctx, zap.NewExample())
	response, err := s.handler.CreateWorkout(ctx, connect.NewRequest(&apiv1.CreateWorkoutRequest{
		RoutineId: completedRoutine.ID.String(),
		PlanId:    plan.ID,
		ExerciseSets: []*apiv1.ExerciseSets{{
			Exercise: &apiv1.Exercise{Id: exercise.ID.String()},
			Sets:     []*apiv1.Set{{Reps: 5, Weight: 50}},
		}},
		StartedAt:  timestamppb.Now(),
		FinishedAt: timestamppb.New(time.Now().Add(time.Hour)),
	}))
	s.Require().NoError(err)
	s.Require().NotEmpty(response.Msg.GetWorkoutId())

	savedWorkout, err := models.FindWorkout(context.Background(), bob.NewDB(s.container.DB), nativeUUID(response.Msg.GetWorkoutId()))
	s.Require().NoError(err)
	s.Require().Equal(completedRoutine.Title, savedWorkout.Name)

	unchanged, err := planRepo.GetActivePlan(context.Background(), user.ID.String())
	s.Require().NoError(err)
	s.Require().Equal(1, unchanged.CurrentPosition)
	s.Require().Equal(nextRoutine.ID, unchanged.Routines[unchanged.CurrentPosition].ID)
}

func (s *workoutSuite) TestCreateQuickWorkoutWithoutRoutine() {
	user := s.factory.NewUser()
	exercise := s.factory.NewExercise(factory.ExerciseUserID(user.ID))
	ctx := xcontext.WithUserID(context.Background(), user.ID.String())
	ctx = xcontext.WithLogger(ctx, zap.NewExample())

	response, err := s.handler.CreateWorkout(ctx, connect.NewRequest(&apiv1.CreateWorkoutRequest{
		WorkoutName: "Quick Workout",
		ExerciseSets: []*apiv1.ExerciseSets{{
			Exercise: &apiv1.Exercise{Id: exercise.ID.String()},
			Sets:     []*apiv1.Set{{Reps: 10, Weight: 20}},
		}},
		StartedAt:  timestamppb.Now(),
		FinishedAt: timestamppb.New(time.Now().Add(time.Hour)),
	}))
	s.Require().NoError(err)

	workout, err := models.FindWorkout(context.Background(), bob.NewDB(s.container.DB), nativeUUID(response.Msg.GetWorkoutId()))
	s.Require().NoError(err)
	s.Require().Equal("Quick Workout", workout.Name)
}

func (s *workoutSuite) TestGetWorkoutNotFound() {
	ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
	ctx = xcontext.WithUserID(ctx, uuid.NewString())

	res, err := s.handler.GetWorkout(ctx, connect.NewRequest(&apiv1.GetWorkoutRequest{
		Id: uuid.NewString(),
	}))
	s.Require().Nil(res)
	s.Require().Equal(connect.NewError(connect.CodeNotFound, nil).Error(), err.Error())
}

func (s *workoutSuite) TestListWorkoutsPaginates() {
	user := s.factory.NewUser()
	// Created a second apart so the page token, which is a timestamp, orders them.
	for i := range 3 {
		s.factory.NewWorkout(
			factory.WorkoutUserID(user.ID),
			factory.WorkoutCreatedAt(time.Now().UTC().Add(-time.Duration(i)*time.Second)),
		)
	}

	ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
	ctx = xcontext.WithUserID(ctx, user.ID.String())

	first, err := s.handler.ListWorkouts(ctx, connect.NewRequest(&apiv1.ListWorkoutsRequest{
		UserIds:    []string{user.ID.String()},
		Pagination: &apiv1.PaginationRequest{PageLimit: 2},
	}))
	s.Require().NoError(err)
	s.Require().Len(first.Msg.GetWorkouts(), 2)
	s.Require().NotEmpty(first.Msg.GetPagination().GetNextPageToken())

	second, err := s.handler.ListWorkouts(ctx, connect.NewRequest(&apiv1.ListWorkoutsRequest{
		UserIds: []string{user.ID.String()},
		Pagination: &apiv1.PaginationRequest{
			PageLimit: 2,
			PageToken: first.Msg.GetPagination().GetNextPageToken(),
		},
	}))
	s.Require().NoError(err)
	s.Require().Len(second.Msg.GetWorkouts(), 1)
	s.Require().Empty(second.Msg.GetPagination().GetNextPageToken())
}

func (s *workoutSuite) TestListWorkoutsRejectsAMalformedPageToken() {
	ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
	ctx = xcontext.WithUserID(ctx, uuid.NewString())

	res, err := s.handler.ListWorkouts(ctx, connect.NewRequest(&apiv1.ListWorkoutsRequest{
		UserIds:    []string{uuid.NewString()},
		Pagination: &apiv1.PaginationRequest{PageLimit: 2, PageToken: []byte("not a token")},
	}))
	s.Require().Nil(res)
	s.Require().Equal(connect.NewError(connect.CodeInternal, nil).Error(), err.Error())
}

func (s *workoutSuite) TestDeleteWorkout() {
	s.Run("ok_workout_and_its_sets_deleted", func() {
		user := s.factory.NewUser()
		workout := s.factory.NewWorkout(factory.WorkoutUserID(user.ID))
		s.factory.NewSet(factory.SetWorkoutID(workout.ID), factory.SetUserID(user.ID))

		ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
		ctx = xcontext.WithUserID(ctx, user.ID.String())

		_, err := s.handler.DeleteWorkout(ctx, connect.NewRequest(&apiv1.DeleteWorkoutRequest{
			Id: workout.ID.String(),
		}))
		s.Require().NoError(err)

		_, err = s.repo.GetWorkout(context.Background(), repo.GetWorkoutWithID(workout.ID.String()))
		s.Require().ErrorIs(err, sql.ErrNoRows)
	})

	s.Run("err_another_athletes_workout_is_not_deletable", func() {
		owner := s.factory.NewUser()
		intruder := s.factory.NewUser()
		workout := s.factory.NewWorkout(factory.WorkoutUserID(owner.ID))

		ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
		ctx = xcontext.WithUserID(ctx, intruder.ID.String())

		res, err := s.handler.DeleteWorkout(ctx, connect.NewRequest(&apiv1.DeleteWorkoutRequest{
			Id: workout.ID.String(),
		}))
		s.Require().Nil(res)
		s.Require().Equal(connect.NewError(connect.CodeFailedPrecondition, nil).Error(), err.Error())

		// The owner still has it.
		_, err = s.repo.GetWorkout(context.Background(), repo.GetWorkoutWithID(workout.ID.String()))
		s.Require().NoError(err)
	})

	s.Run("err_workout_not_found", func() {
		ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
		ctx = xcontext.WithUserID(ctx, uuid.NewString())

		res, err := s.handler.DeleteWorkout(ctx, connect.NewRequest(&apiv1.DeleteWorkoutRequest{
			Id: uuid.NewString(),
		}))
		s.Require().Nil(res)
		s.Require().Equal(connect.NewError(connect.CodeFailedPrecondition, nil).Error(), err.Error())
	})
}

func (s *workoutSuite) TestPostComment() {
	s.Run("ok_comment_carries_its_author_and_raises_an_event", func() {
		owner := s.factory.NewUser()
		commenter := s.factory.NewUser()
		workout := s.factory.NewWorkout(factory.WorkoutUserID(owner.ID))

		ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
		ctx = xcontext.WithUserID(ctx, commenter.ID.String())

		res, err := s.handler.PostComment(ctx, connect.NewRequest(&apiv1.PostCommentRequest{
			WorkoutId: workout.ID.String(),
			Comment:   "Strong session.",
		}))
		s.Require().NoError(err)
		s.Require().Equal("Strong session.", res.Msg.GetComment().GetComment())
		// Loaded by the post-create option, so the client can render the
		// comment without a second round trip.
		s.Require().Equal(commenter.ID.String(), res.Msg.GetComment().GetUser().GetId())

		comment, err := s.repo.GetWorkoutComment(
			context.Background(),
			repo.GetWorkoutCommentWithID(res.Msg.GetComment().GetId()),
			repo.GetWorkoutCommentWithWorkout(),
		)
		s.Require().NoError(err)
		s.Require().Equal(workout.ID, comment.R.Workout.ID)

		s.Require().Eventually(func() bool {
			count, countErr := models.Events.Query(
				models.SelectWhere.Events.Topic.EQ(events.TopicWorkoutCommentPosted),
			).Count(context.Background(), bob.NewDB(s.container.DB))
			return countErr == nil && count > 0
		}, 5*time.Second, 50*time.Millisecond)
	})

	s.Run("err_comment_on_a_workout_that_does_not_exist", func() {
		ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
		ctx = xcontext.WithUserID(ctx, s.factory.NewUser().ID.String())

		res, err := s.handler.PostComment(ctx, connect.NewRequest(&apiv1.PostCommentRequest{
			WorkoutId: uuid.NewString(),
			Comment:   "Nobody's session.",
		}))
		s.Require().Nil(res)
		s.Require().Equal(connect.NewError(connect.CodeInternal, nil).Error(), err.Error())
	})
}

func (s *workoutSuite) TestUpdateWorkout() {
	startedAt := time.Now().UTC().Truncate(time.Second)
	finishedAt := startedAt.Add(time.Hour)

	s.Run("ok_name_note_period_and_sets_updated", func() {
		user := s.factory.NewUser()
		workout := s.factory.NewWorkout(factory.WorkoutUserID(user.ID))
		exercise := s.factory.NewExercise(factory.ExerciseUserID(user.ID))
		s.factory.NewSet(factory.SetWorkoutID(workout.ID), factory.SetUserID(user.ID), factory.SetExerciseID(exercise.ID))

		ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
		ctx = xcontext.WithUserID(ctx, user.ID.String())

		_, err := s.handler.UpdateWorkout(ctx, connect.NewRequest(&apiv1.UpdateWorkoutRequest{
			Workout: &apiv1.Workout{
				Id:         workout.ID.String(),
				Name:       "Renamed",
				Note:       "Felt heavy",
				StartedAt:  timestamppb.New(startedAt),
				FinishedAt: timestamppb.New(finishedAt),
				ExerciseSets: []*apiv1.ExerciseSets{{
					Exercise: &apiv1.Exercise{Id: exercise.ID.String()},
					Sets:     []*apiv1.Set{{Reps: 12, Weight: 42.5}},
				}},
			},
		}))
		s.Require().NoError(err)

		updated, err := s.handler.GetWorkout(ctx, connect.NewRequest(&apiv1.GetWorkoutRequest{
			Id: workout.ID.String(),
		}))
		s.Require().NoError(err)
		s.Require().Equal("Renamed", updated.Msg.GetWorkout().GetName())
		s.Require().Equal("Felt heavy", updated.Msg.GetWorkout().GetNote())
		s.Require().Equal(startedAt, updated.Msg.GetWorkout().GetStartedAt().AsTime())
		s.Require().Equal(finishedAt, updated.Msg.GetWorkout().GetFinishedAt().AsTime())
		s.Require().Len(updated.Msg.GetWorkout().GetExerciseSets(), 1)
		s.Require().Len(updated.Msg.GetWorkout().GetExerciseSets()[0].GetSets(), 1)
		s.Require().Equal(int32(12), updated.Msg.GetWorkout().GetExerciseSets()[0].GetSets()[0].GetReps())
	})

	s.Run("err_workout_cannot_start_after_it_finishes", func() {
		user := s.factory.NewUser()
		workout := s.factory.NewWorkout(factory.WorkoutUserID(user.ID))

		ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
		ctx = xcontext.WithUserID(ctx, user.ID.String())

		res, err := s.handler.UpdateWorkout(ctx, connect.NewRequest(&apiv1.UpdateWorkoutRequest{
			Workout: &apiv1.Workout{
				Id:         workout.ID.String(),
				StartedAt:  timestamppb.New(finishedAt),
				FinishedAt: timestamppb.New(startedAt),
			},
		}))
		s.Require().Nil(res)
		s.Require().Equal(connect.CodeInvalidArgument, connect.CodeOf(err))
	})

	s.Run("err_workout_not_found", func() {
		ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
		ctx = xcontext.WithUserID(ctx, uuid.NewString())

		res, err := s.handler.UpdateWorkout(ctx, connect.NewRequest(&apiv1.UpdateWorkoutRequest{
			Workout: &apiv1.Workout{
				Id:         uuid.NewString(),
				StartedAt:  timestamppb.New(startedAt),
				FinishedAt: timestamppb.New(finishedAt),
			},
		}))
		s.Require().Nil(res)
		s.Require().Equal(connect.NewError(connect.CodeFailedPrecondition, nil).Error(), err.Error())
	})

	s.Run("err_another_athletes_workout_is_not_editable", func() {
		owner := s.factory.NewUser()
		intruder := s.factory.NewUser()
		workout := s.factory.NewWorkout(factory.WorkoutUserID(owner.ID), factory.WorkoutName("Untouched"))

		ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
		ctx = xcontext.WithUserID(ctx, intruder.ID.String())

		res, err := s.handler.UpdateWorkout(ctx, connect.NewRequest(&apiv1.UpdateWorkoutRequest{
			Workout: &apiv1.Workout{
				Id:         workout.ID.String(),
				Name:       "Renamed by a stranger",
				StartedAt:  timestamppb.New(startedAt),
				FinishedAt: timestamppb.New(finishedAt),
			},
		}))
		s.Require().Nil(res)
		s.Require().Equal(connect.NewError(connect.CodePermissionDenied, nil).Error(), err.Error())

		unchanged, err := s.repo.GetWorkout(context.Background(), repo.GetWorkoutWithID(workout.ID.String()))
		s.Require().NoError(err)
		s.Require().Equal("Untouched", unchanged.Name)
	})
}

// A plan workout is a routine's turn in a rotation, so one that names a plan
// and no routine is not a quick workout — it is a request that lost its routine.
func (s *workoutSuite) TestCreateWorkoutRejectsAPlanWithoutARoutine() {
	user := s.factory.NewUser()
	ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
	ctx = xcontext.WithUserID(ctx, user.ID.String())

	res, err := s.handler.CreateWorkout(ctx, connect.NewRequest(&apiv1.CreateWorkoutRequest{
		PlanId:     uuid.NewString(),
		StartedAt:  timestamppb.Now(),
		FinishedAt: timestamppb.New(time.Now().Add(time.Hour)),
	}))
	s.Require().Nil(res)
	s.Require().Equal(connect.CodeInvalidArgument, connect.CodeOf(err))
}
