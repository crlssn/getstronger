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

	"github.com/crlssn/getstronger/server/gen/orm"
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

			w, err := orm.FindWorkout(ctx, s.container.DB, res.Msg.GetWorkoutId())
			s.Require().NoError(err)
			s.Require().NotNil(w)
		})
	}
}
