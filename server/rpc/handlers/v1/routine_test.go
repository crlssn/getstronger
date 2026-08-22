package v1_test

import (
	"context"
	"log"
	"testing"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/suite"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/gen/models"
	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/gen/proto/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/repo"
	handlers "github.com/crlssn/getstronger/server/rpc/handlers/v1"
	"github.com/crlssn/getstronger/server/testing/container"
	"github.com/crlssn/getstronger/server/testing/factory"
	"github.com/crlssn/getstronger/server/xcontext"
)

type routineSuite struct {
	suite.Suite

	handler apiv1connect.RoutineServiceHandler

	factory   *factory.Factory
	container *container.Container
}

func TestRoutineSuite(t *testing.T) {
	t.Parallel()
	suite.Run(t, new(routineSuite))
}

func (s *routineSuite) SetupSuite() {
	ctx := context.Background()
	s.container = container.NewContainer(ctx)
	s.factory = factory.NewFactory(s.container.DB)
	s.handler = handlers.NewRoutineHandler(repo.New(s.container.DB))

	s.T().Cleanup(func() {
		if err := s.container.Terminate(ctx); err != nil {
			log.Fatalf("Clean container: %s", err)
		}
	})
}

func (s *routineSuite) athlete() (context.Context, *models.User) {
	user := s.factory.NewUser()
	ctx := xcontext.WithUserID(context.Background(), user.ID.String())

	return xcontext.WithLogger(ctx, zap.NewExample()), user
}

func (s *routineSuite) TestUpdateRoutineRearrangesItsExercises() {
	ctx, user := s.athlete()
	first := s.factory.NewExercise(factory.ExerciseUserID(user.ID))
	second := s.factory.NewExercise(factory.ExerciseUserID(user.ID))

	created, err := s.handler.CreateRoutine(ctx, connect.NewRequest(&apiv1.CreateRoutineRequest{
		Name:        "Push",
		ExerciseIds: []string{first.ID.String(), second.ID.String()},
	}))
	s.Require().NoError(err)

	updated, err := s.handler.UpdateRoutine(ctx, connect.NewRequest(&apiv1.UpdateRoutineRequest{
		Routine: &apiv1.Routine{
			Id:   created.Msg.GetId(),
			Name: "Push Day",
			Exercises: []*apiv1.Exercise{
				{Id: second.ID.String()},
				{Id: first.ID.String()},
			},
		},
	}))
	s.Require().NoError(err)
	s.Require().Equal("Push Day", updated.Msg.GetRoutine().GetName())
	s.Require().Equal(
		[]string{second.ID.String(), first.ID.String()},
		routineExerciseIDs(updated.Msg.GetRoutine()),
	)
}

func (s *routineSuite) TestUpdateRoutineRejectsAnExerciseTheAthleteDoesNotOwn() {
	ctx, user := s.athlete()
	own := s.factory.NewExercise(factory.ExerciseUserID(user.ID))
	somebodyElses := s.factory.NewExercise(factory.ExerciseUserID(s.factory.NewUser().ID))

	created, err := s.handler.CreateRoutine(ctx, connect.NewRequest(&apiv1.CreateRoutineRequest{
		Name:        "Push",
		ExerciseIds: []string{own.ID.String()},
	}))
	s.Require().NoError(err)

	_, err = s.handler.UpdateRoutine(ctx, connect.NewRequest(&apiv1.UpdateRoutineRequest{
		Routine: &apiv1.Routine{
			Id:   created.Msg.GetId(),
			Name: "Push",
			Exercises: []*apiv1.Exercise{
				{Id: own.ID.String()},
				{Id: somebodyElses.ID.String()},
			},
		},
	}))
	s.Require().Equal(connect.CodeInvalidArgument, connect.CodeOf(err))
}

func (s *routineSuite) TestUpdateExerciseOrderAcceptsOnlyARearrangement() {
	ctx, user := s.athlete()
	first := s.factory.NewExercise(factory.ExerciseUserID(user.ID))
	second := s.factory.NewExercise(factory.ExerciseUserID(user.ID))
	stranger := s.factory.NewExercise(factory.ExerciseUserID(user.ID))

	created, err := s.handler.CreateRoutine(ctx, connect.NewRequest(&apiv1.CreateRoutineRequest{
		Name:        "Pull",
		ExerciseIds: []string{first.ID.String(), second.ID.String()},
	}))
	s.Require().NoError(err)

	_, err = s.handler.UpdateExerciseOrder(ctx, connect.NewRequest(&apiv1.UpdateExerciseOrderRequest{
		RoutineId:   created.Msg.GetId(),
		ExerciseIds: []string{second.ID.String(), first.ID.String()},
	}))
	s.Require().NoError(err)

	fetched, err := s.handler.GetRoutine(ctx, connect.NewRequest(&apiv1.GetRoutineRequest{Id: created.Msg.GetId()}))
	s.Require().NoError(err)
	s.Require().Equal(
		[]string{second.ID.String(), first.ID.String()},
		routineExerciseIDs(fetched.Msg.GetRoutine()),
	)

	// Naming an exercise the routine does not hold is not a rearrangement.
	_, err = s.handler.UpdateExerciseOrder(ctx, connect.NewRequest(&apiv1.UpdateExerciseOrderRequest{
		RoutineId:   created.Msg.GetId(),
		ExerciseIds: []string{first.ID.String(), stranger.ID.String()},
	}))
	s.Require().Equal(connect.CodeInvalidArgument, connect.CodeOf(err))

	// Neither is dropping one.
	_, err = s.handler.UpdateExerciseOrder(ctx, connect.NewRequest(&apiv1.UpdateExerciseOrderRequest{
		RoutineId:   created.Msg.GetId(),
		ExerciseIds: []string{first.ID.String()},
	}))
	s.Require().Equal(connect.CodeInvalidArgument, connect.CodeOf(err))
}

func (s *routineSuite) TestListRoutinesPagesThroughTheAthletesOwnRoutines() {
	ctx, user := s.athlete()
	exercise := s.factory.NewExercise(factory.ExerciseUserID(user.ID))
	for _, name := range []string{"Push", "Pull", "Legs"} {
		_, err := s.handler.CreateRoutine(ctx, connect.NewRequest(&apiv1.CreateRoutineRequest{
			Name:        name,
			ExerciseIds: []string{exercise.ID.String()},
		}))
		s.Require().NoError(err)
	}

	first, err := s.handler.ListRoutines(ctx, connect.NewRequest(&apiv1.ListRoutinesRequest{
		Pagination: &apiv1.PaginationRequest{PageLimit: 2},
	}))
	s.Require().NoError(err)
	s.Require().Len(first.Msg.GetRoutines(), 2)
	s.Require().NotEmpty(first.Msg.GetPagination().GetNextPageToken())

	second, err := s.handler.ListRoutines(ctx, connect.NewRequest(&apiv1.ListRoutinesRequest{
		Pagination: &apiv1.PaginationRequest{
			PageLimit: 2,
			PageToken: first.Msg.GetPagination().GetNextPageToken(),
		},
	}))
	s.Require().NoError(err)
	s.Require().Len(second.Msg.GetRoutines(), 1)
	s.Require().Empty(second.Msg.GetPagination().GetNextPageToken())

	// Another athlete sees none of them.
	strangerCtx, _ := s.athlete()
	stranger, err := s.handler.ListRoutines(strangerCtx, connect.NewRequest(&apiv1.ListRoutinesRequest{
		Pagination: &apiv1.PaginationRequest{PageLimit: 10},
	}))
	s.Require().NoError(err)
	s.Require().Empty(stranger.Msg.GetRoutines())
}

func (s *routineSuite) TestDeleteRoutineRefusesAnotherAthletesRoutine() {
	ownerCtx, owner := s.athlete()
	exercise := s.factory.NewExercise(factory.ExerciseUserID(owner.ID))
	created, err := s.handler.CreateRoutine(ownerCtx, connect.NewRequest(&apiv1.CreateRoutineRequest{
		Name:        "Private",
		ExerciseIds: []string{exercise.ID.String()},
	}))
	s.Require().NoError(err)

	strangerCtx, _ := s.athlete()
	_, err = s.handler.DeleteRoutine(strangerCtx, connect.NewRequest(&apiv1.DeleteRoutineRequest{
		Id: created.Msg.GetId(),
	}))
	s.Require().Equal(connect.CodePermissionDenied, connect.CodeOf(err))
}

func (s *routineSuite) TestAddAndRemoveExerciseChangeWhatTheRoutineHolds() {
	ctx, user := s.athlete()
	original := s.factory.NewExercise(factory.ExerciseUserID(user.ID))
	added := s.factory.NewExercise(factory.ExerciseUserID(user.ID))

	created, err := s.handler.CreateRoutine(ctx, connect.NewRequest(&apiv1.CreateRoutineRequest{
		Name:        "Legs",
		ExerciseIds: []string{original.ID.String()},
	}))
	s.Require().NoError(err)

	_, err = s.handler.AddExercise(ctx, connect.NewRequest(&apiv1.AddExerciseRequest{
		RoutineId:  created.Msg.GetId(),
		ExerciseId: added.ID.String(),
	}))
	s.Require().NoError(err)

	fetched, err := s.handler.GetRoutine(ctx, connect.NewRequest(&apiv1.GetRoutineRequest{Id: created.Msg.GetId()}))
	s.Require().NoError(err)
	s.Require().Len(fetched.Msg.GetRoutine().GetExercises(), 2)

	_, err = s.handler.RemoveExercise(ctx, connect.NewRequest(&apiv1.RemoveExerciseRequest{
		RoutineId:  created.Msg.GetId(),
		ExerciseId: original.ID.String(),
	}))
	s.Require().NoError(err)

	fetched, err = s.handler.GetRoutine(ctx, connect.NewRequest(&apiv1.GetRoutineRequest{Id: created.Msg.GetId()}))
	s.Require().NoError(err)
	s.Require().Equal([]string{added.ID.String()}, routineExerciseIDs(fetched.Msg.GetRoutine()))
}

func routineExerciseIDs(routine *apiv1.Routine) []string {
	ids := make([]string, 0, len(routine.GetExercises()))
	for _, exercise := range routine.GetExercises() {
		ids = append(ids, exercise.GetId())
	}

	return ids
}
