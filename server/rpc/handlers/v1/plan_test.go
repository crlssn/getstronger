package v1_test

import (
	"context"
	"log"
	"testing"

	"connectrpc.com/connect"
	"github.com/google/uuid"
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

type planSuite struct {
	suite.Suite

	handler apiv1connect.RoutineServiceHandler

	factory   *factory.Factory
	container *container.Container
}

func TestPlanSuite(t *testing.T) {
	t.Parallel()
	suite.Run(t, new(planSuite))
}

func (s *planSuite) SetupSuite() {
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

// athlete returns a context authenticated as a new user, and that user.
func (s *planSuite) athlete() (context.Context, *models.User) {
	user := s.factory.NewUser()
	ctx := xcontext.WithUserID(context.Background(), user.ID.String())

	return xcontext.WithLogger(ctx, zap.NewExample()), user
}

func (s *planSuite) createPlan(ctx context.Context, name string, routineIDs ...string) *apiv1.Plan {
	res, err := s.handler.CreatePlan(ctx, connect.NewRequest(&apiv1.CreatePlanRequest{
		Name:       name,
		RoutineIds: routineIDs,
	}))
	s.Require().NoError(err)

	return res.Msg.GetPlan()
}

func (s *planSuite) TestCreatePlanKeepsTheRotationInTheOrderAsked() {
	ctx, user := s.athlete()
	lower := s.factory.NewRoutine(factory.RoutineUserID(user.ID), factory.RoutineName("Lower"))
	upper := s.factory.NewRoutine(factory.RoutineUserID(user.ID), factory.RoutineName("Upper"))

	plan := s.createPlan(ctx, "Strength", upper.ID.String(), lower.ID.String())

	s.Require().Equal("Strength", plan.GetName())
	s.Require().False(plan.GetActive())
	s.Require().Equal(
		[]string{upper.ID.String(), lower.ID.String()},
		planRoutineIDs(plan),
	)
}

func (s *planSuite) TestCreatePlanRejectsARoutineTheAthleteDoesNotOwn() {
	ctx, user := s.athlete()
	own := s.factory.NewRoutine(factory.RoutineUserID(user.ID))
	somebodyElses := s.factory.NewRoutine(factory.RoutineUserID(s.factory.NewUser().ID))

	_, err := s.handler.CreatePlan(ctx, connect.NewRequest(&apiv1.CreatePlanRequest{
		Name:       "Borrowed",
		RoutineIds: []string{own.ID.String(), somebodyElses.ID.String()},
	}))

	s.Require().Equal(connect.CodeInvalidArgument, connect.CodeOf(err))
}

func (s *planSuite) TestCreatePlanRejectsARepeatedRoutine() {
	ctx, user := s.athlete()
	routine := s.factory.NewRoutine(factory.RoutineUserID(user.ID))

	_, err := s.handler.CreatePlan(ctx, connect.NewRequest(&apiv1.CreatePlanRequest{
		Name:       "Twice",
		RoutineIds: []string{routine.ID.String(), routine.ID.String()},
	}))

	s.Require().Equal(connect.CodeInvalidArgument, connect.CodeOf(err))
}

func (s *planSuite) TestGetPlanIsNotFoundForAnotherAthletesPlan() {
	ownerCtx, owner := s.athlete()
	routine := s.factory.NewRoutine(factory.RoutineUserID(owner.ID))
	plan := s.createPlan(ownerCtx, "Private", routine.ID.String())

	strangerCtx, _ := s.athlete()
	_, err := s.handler.GetPlan(strangerCtx, connect.NewRequest(&apiv1.GetPlanRequest{Id: plan.GetId()}))

	s.Require().Equal(connect.CodeNotFound, connect.CodeOf(err))
}

func (s *planSuite) TestListPlansShowsTheActivePlanFirst() {
	ctx, user := s.athlete()
	routine := s.factory.NewRoutine(factory.RoutineUserID(user.ID))
	s.createPlan(ctx, "Older", routine.ID.String())
	activated := s.createPlan(ctx, "Newer", routine.ID.String())

	_, err := s.handler.SetActivePlan(ctx, connect.NewRequest(&apiv1.SetActivePlanRequest{Id: activated.GetId()}))
	s.Require().NoError(err)

	res, err := s.handler.ListPlans(ctx, connect.NewRequest(&apiv1.ListPlansRequest{}))
	s.Require().NoError(err)
	s.Require().Len(res.Msg.GetPlans(), 2)
	s.Require().Equal(activated.GetId(), res.Msg.GetPlans()[0].GetId())
	s.Require().True(res.Msg.GetPlans()[0].GetActive())
}

func (s *planSuite) TestUpdatePlanFollowsTheCurrentRoutineToItsNewPosition() {
	ctx, user := s.athlete()
	first := s.factory.NewRoutine(factory.RoutineUserID(user.ID), factory.RoutineName("First"))
	second := s.factory.NewRoutine(factory.RoutineUserID(user.ID), factory.RoutineName("Second"))
	plan := s.createPlan(ctx, "Rotation", first.ID.String(), second.ID.String())

	_, err := s.handler.SetActivePlan(ctx, connect.NewRequest(&apiv1.SetActivePlanRequest{Id: plan.GetId()}))
	s.Require().NoError(err)

	skipped, err := s.handler.SkipPlanRoutine(ctx, connect.NewRequest(&apiv1.SkipPlanRoutineRequest{Id: plan.GetId()}))
	s.Require().NoError(err)
	s.Require().Equal(int32(1), skipped.Msg.GetPlan().GetCurrentPosition())

	// The plan is on "Second"; reversing the rotation should keep it there.
	updated, err := s.handler.UpdatePlan(ctx, connect.NewRequest(&apiv1.UpdatePlanRequest{
		Id:         plan.GetId(),
		Name:       "Reversed",
		RoutineIds: []string{second.ID.String(), first.ID.String()},
	}))
	s.Require().NoError(err)
	s.Require().Equal("Reversed", updated.Msg.GetPlan().GetName())
	s.Require().Zero(updated.Msg.GetPlan().GetCurrentPosition())
	s.Require().Equal(second.ID.String(), planRoutineIDs(updated.Msg.GetPlan())[0])
}

func (s *planSuite) TestSkipPlanRoutineWrapsAroundAndStopsWhenPaused() {
	ctx, user := s.athlete()
	first := s.factory.NewRoutine(factory.RoutineUserID(user.ID))
	second := s.factory.NewRoutine(factory.RoutineUserID(user.ID))
	plan := s.createPlan(ctx, "Rotation", first.ID.String(), second.ID.String())

	_, err := s.handler.SetActivePlan(ctx, connect.NewRequest(&apiv1.SetActivePlanRequest{Id: plan.GetId()}))
	s.Require().NoError(err)

	for _, expected := range []int32{1, 0} {
		res, errSkip := s.handler.SkipPlanRoutine(ctx, connect.NewRequest(&apiv1.SkipPlanRoutineRequest{Id: plan.GetId()}))
		s.Require().NoError(errSkip)
		s.Require().Equal(expected, res.Msg.GetPlan().GetCurrentPosition())
	}

	_, err = s.handler.PauseActivePlan(ctx, connect.NewRequest(&apiv1.PauseActivePlanRequest{}))
	s.Require().NoError(err)

	_, err = s.handler.SkipPlanRoutine(ctx, connect.NewRequest(&apiv1.SkipPlanRoutineRequest{Id: plan.GetId()}))
	s.Require().Equal(connect.CodeFailedPrecondition, connect.CodeOf(err))
}

func (s *planSuite) TestDeletePlanRemovesItAndIsNotFoundTwice() {
	ctx, user := s.athlete()
	routine := s.factory.NewRoutine(factory.RoutineUserID(user.ID))
	plan := s.createPlan(ctx, "Temporary", routine.ID.String())

	_, err := s.handler.DeletePlan(ctx, connect.NewRequest(&apiv1.DeletePlanRequest{Id: plan.GetId()}))
	s.Require().NoError(err)

	_, err = s.handler.DeletePlan(ctx, connect.NewRequest(&apiv1.DeletePlanRequest{Id: plan.GetId()}))
	s.Require().Equal(connect.CodeNotFound, connect.CodeOf(err))
}

// Deleting a routine is the one way a rotation changes without the athlete
// editing it, so the plan must land where editing it would have left it.
func (s *planSuite) TestDeleteRoutineKeepsThePlanOnTheRoutineItWasTraining() {
	ctx, user := s.athlete()
	first := s.factory.NewRoutine(factory.RoutineUserID(user.ID), factory.RoutineName("First"))
	second := s.factory.NewRoutine(factory.RoutineUserID(user.ID), factory.RoutineName("Second"))
	third := s.factory.NewRoutine(factory.RoutineUserID(user.ID), factory.RoutineName("Third"))
	plan := s.createPlan(ctx, "Rotation", first.ID.String(), second.ID.String(), third.ID.String())

	_, err := s.handler.SetActivePlan(ctx, connect.NewRequest(&apiv1.SetActivePlanRequest{Id: plan.GetId()}))
	s.Require().NoError(err)
	_, err = s.handler.SkipPlanRoutine(ctx, connect.NewRequest(&apiv1.SkipPlanRoutineRequest{Id: plan.GetId()}))
	s.Require().NoError(err)

	_, err = s.handler.DeleteRoutine(ctx, connect.NewRequest(&apiv1.DeleteRoutineRequest{Id: first.ID.String()}))
	s.Require().NoError(err)

	res, err := s.handler.GetPlan(ctx, connect.NewRequest(&apiv1.GetPlanRequest{Id: plan.GetId()}))
	s.Require().NoError(err)
	s.Require().Equal([]string{second.ID.String(), third.ID.String()}, planRoutineIDs(res.Msg.GetPlan()))
	s.Require().Zero(res.Msg.GetPlan().GetCurrentPosition(), "Second was next and still is")
	s.Require().True(res.Msg.GetPlan().GetActive())

	// The rotation still turns, rather than being stuck past its own end.
	skipped, err := s.handler.SkipPlanRoutine(ctx, connect.NewRequest(&apiv1.SkipPlanRoutineRequest{Id: plan.GetId()}))
	s.Require().NoError(err)
	s.Require().Equal(int32(1), skipped.Msg.GetPlan().GetCurrentPosition())
}

func (s *planSuite) TestDeletingThePlansLastRoutinePausesIt() {
	ctx, user := s.athlete()
	only := s.factory.NewRoutine(factory.RoutineUserID(user.ID), factory.RoutineName("Only"))
	plan := s.createPlan(ctx, "Rotation", only.ID.String())

	_, err := s.handler.SetActivePlan(ctx, connect.NewRequest(&apiv1.SetActivePlanRequest{Id: plan.GetId()}))
	s.Require().NoError(err)

	_, err = s.handler.DeleteRoutine(ctx, connect.NewRequest(&apiv1.DeleteRoutineRequest{Id: only.ID.String()}))
	s.Require().NoError(err)

	res, err := s.handler.GetPlan(ctx, connect.NewRequest(&apiv1.GetPlanRequest{Id: plan.GetId()}))
	s.Require().NoError(err)
	s.Require().Empty(planRoutineIDs(res.Msg.GetPlan()))
	s.Require().Zero(res.Msg.GetPlan().GetCurrentPosition())
	s.Require().False(res.Msg.GetPlan().GetActive(), "a plan with nothing to train cannot say what is next")
}

// Losing its last routine pauses a plan; activating it again would put it
// straight back into a state where it cannot say what to train next.
func (s *planSuite) TestSetActivePlanRejectsAPlanWithNoRoutinesLeft() {
	ctx, user := s.athlete()
	only := s.factory.NewRoutine(factory.RoutineUserID(user.ID), factory.RoutineName("Only"))
	plan := s.createPlan(ctx, "Rotation", only.ID.String())

	_, err := s.handler.DeleteRoutine(ctx, connect.NewRequest(&apiv1.DeleteRoutineRequest{Id: only.ID.String()}))
	s.Require().NoError(err)

	_, err = s.handler.SetActivePlan(ctx, connect.NewRequest(&apiv1.SetActivePlanRequest{Id: plan.GetId()}))
	s.Require().Equal(connect.CodeFailedPrecondition, connect.CodeOf(err))

	res, err := s.handler.GetPlan(ctx, connect.NewRequest(&apiv1.GetPlanRequest{Id: plan.GetId()}))
	s.Require().NoError(err)
	s.Require().False(res.Msg.GetPlan().GetActive())
}

// A routine the athlete has retired may not be put back into a rotation by a
// client still holding it.
func (s *planSuite) TestCreatePlanRejectsADeletedRoutine() {
	ctx, user := s.athlete()
	routine := s.factory.NewRoutine(factory.RoutineUserID(user.ID))

	_, err := s.handler.DeleteRoutine(ctx, connect.NewRequest(&apiv1.DeleteRoutineRequest{Id: routine.ID.String()}))
	s.Require().NoError(err)

	_, err = s.handler.CreatePlan(ctx, connect.NewRequest(&apiv1.CreatePlanRequest{
		Name:       "Ghost",
		RoutineIds: []string{routine.ID.String()},
	}))
	s.Require().Equal(connect.CodeInvalidArgument, connect.CodeOf(err))
}

func planRoutineIDs(plan *apiv1.Plan) []string {
	ids := make([]string, 0, len(plan.GetRoutines()))
	for _, routine := range plan.GetRoutines() {
		ids = append(ids, routine.GetId())
	}

	return ids
}

func (s *planSuite) TestUpdatePlanIsNotFoundForAnotherAthletesPlan() {
	ctx, user := s.athlete()
	routine := s.factory.NewRoutine(factory.RoutineUserID(user.ID))
	plan := s.createPlan(ctx, "Private", routine.ID.String())

	strangerCtx, _ := s.athlete()
	_, err := s.handler.UpdatePlan(strangerCtx, connect.NewRequest(&apiv1.UpdatePlanRequest{
		Id:         plan.GetId(),
		Name:       "Taken over",
		RoutineIds: []string{routine.ID.String()},
	}))
	s.Require().Equal(connect.CodeNotFound, connect.CodeOf(err))
}

func (s *planSuite) TestUpdatePlanRejectsARepeatedRoutine() {
	ctx, user := s.athlete()
	routine := s.factory.NewRoutine(factory.RoutineUserID(user.ID))
	plan := s.createPlan(ctx, "Rotation", routine.ID.String())

	_, err := s.handler.UpdatePlan(ctx, connect.NewRequest(&apiv1.UpdatePlanRequest{
		Id:         plan.GetId(),
		Name:       "Rotation",
		RoutineIds: []string{routine.ID.String(), routine.ID.String()},
	}))
	s.Require().Equal(connect.CodeInvalidArgument, connect.CodeOf(err))
}

func (s *planSuite) TestSetActivePlanIsNotFoundForAPlanTheAthleteCannotSee() {
	ctx, user := s.athlete()
	routine := s.factory.NewRoutine(factory.RoutineUserID(user.ID))
	plan := s.createPlan(ctx, "Private", routine.ID.String())

	s.Run("another_athletes_plan", func() {
		strangerCtx, _ := s.athlete()
		_, err := s.handler.SetActivePlan(strangerCtx, connect.NewRequest(&apiv1.SetActivePlanRequest{
			Id: plan.GetId(),
		}))
		s.Require().Equal(connect.CodeNotFound, connect.CodeOf(err))
	})

	s.Run("a_plan_that_does_not_exist", func() {
		_, err := s.handler.SetActivePlan(ctx, connect.NewRequest(&apiv1.SetActivePlanRequest{
			Id: uuid.NewString(),
		}))
		s.Require().Equal(connect.CodeNotFound, connect.CodeOf(err))
	})
}

func (s *planSuite) TestSkipPlanRoutineIsNotFoundForAPlanThatDoesNotExist() {
	ctx, _ := s.athlete()

	_, err := s.handler.SkipPlanRoutine(ctx, connect.NewRequest(&apiv1.SkipPlanRoutineRequest{
		Id: uuid.NewString(),
	}))
	s.Require().Equal(connect.CodeNotFound, connect.CodeOf(err))
}

// Skipping a plan that is not the active one is a precondition failure, not a
// missing plan: the athlete owns it, they just are not running it.
func (s *planSuite) TestSkipPlanRoutineRejectsAnInactivePlan() {
	ctx, user := s.athlete()
	routine := s.factory.NewRoutine(factory.RoutineUserID(user.ID))
	plan := s.createPlan(ctx, "Idle", routine.ID.String())

	_, err := s.handler.SkipPlanRoutine(ctx, connect.NewRequest(&apiv1.SkipPlanRoutineRequest{
		Id: plan.GetId(),
	}))
	s.Require().Equal(connect.CodeFailedPrecondition, connect.CodeOf(err))
}

func (s *planSuite) TestGetPlanReturnsItsRotation() {
	ctx, user := s.athlete()
	first := s.factory.NewRoutine(factory.RoutineUserID(user.ID), factory.RoutineName("First"))
	second := s.factory.NewRoutine(factory.RoutineUserID(user.ID), factory.RoutineName("Second"))
	created := s.createPlan(ctx, "Rotation", first.ID.String(), second.ID.String())

	res, err := s.handler.GetPlan(ctx, connect.NewRequest(&apiv1.GetPlanRequest{Id: created.GetId()}))
	s.Require().NoError(err)
	s.Require().Equal(created.GetId(), res.Msg.GetPlan().GetId())
	s.Require().Equal("Rotation", res.Msg.GetPlan().GetName())
	s.Require().Equal(
		[]string{first.ID.String(), second.ID.String()},
		planRoutineIDs(res.Msg.GetPlan()),
	)
}
