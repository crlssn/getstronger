package v1_test

import (
	"context"
	"log"
	"testing"
	"time"

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
	"github.com/crlssn/getstronger/server/training"
	"github.com/crlssn/getstronger/server/xcontext"
)

type dashboardSuite struct {
	suite.Suite

	handler apiv1connect.RoutineServiceHandler

	factory   *factory.Factory
	container *container.Container
}

func TestDashboardSuite(t *testing.T) {
	t.Parallel()
	suite.Run(t, new(dashboardSuite))
}

func (s *dashboardSuite) SetupSuite() {
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

func (s *dashboardSuite) athlete() (context.Context, *models.User) {
	user := s.factory.NewUser()
	ctx := xcontext.WithUserID(context.Background(), user.ID)

	return xcontext.WithLogger(ctx, zap.NewExample()), user
}

func (s *dashboardSuite) dashboard(ctx context.Context, preferredRoutineID string) *apiv1.GetDashboardResponse {
	res, err := s.handler.GetDashboard(ctx, connect.NewRequest(&apiv1.GetDashboardRequest{
		PreferredRoutineId: preferredRoutineID,
	}))
	s.Require().NoError(err)

	return res.Msg
}

func (s *dashboardSuite) TestNextRoutineIsEmptyForAnAthleteWithoutRoutines() {
	ctx, _ := s.athlete()

	msg := s.dashboard(ctx, "")
	s.Require().Nil(msg.GetNextRoutine())
	s.Require().Empty(msg.GetRoutines())
	s.Require().Zero(msg.GetWorkoutsThisWeek())
}

func (s *dashboardSuite) TestNextRoutineFallsBackToThePreferenceAndThenTheFirst() {
	ctx, user := s.athlete()
	first := s.factory.NewRoutine(factory.RoutineUserID(user.ID), factory.RoutineName("First"))
	preferred := s.factory.NewRoutine(factory.RoutineUserID(user.ID), factory.RoutineName("Preferred"))

	s.Require().Equal(preferred.ID.String(), s.dashboard(ctx, preferred.ID.String()).GetNextRoutine().GetId())

	// An unknown or absent preference leaves whichever routine comes first.
	s.Require().Contains(
		[]string{first.ID.String(), preferred.ID.String()},
		s.dashboard(ctx, "").GetNextRoutine().GetId(),
	)
}

func (s *dashboardSuite) TestActivePlanOverridesThePreferredRoutine() {
	ctx, user := s.athlete()
	planned := s.factory.NewRoutine(factory.RoutineUserID(user.ID), factory.RoutineName("Planned"))
	preferred := s.factory.NewRoutine(factory.RoutineUserID(user.ID), factory.RoutineName("Preferred"))

	created, err := s.handler.CreatePlan(ctx, connect.NewRequest(&apiv1.CreatePlanRequest{
		Name:       "Rotation",
		RoutineIds: []string{planned.ID.String(), preferred.ID.String()},
	}))
	s.Require().NoError(err)

	// A plan that is not active does not get a say.
	s.Require().Equal(preferred.ID.String(), s.dashboard(ctx, preferred.ID.String()).GetNextRoutine().GetId())

	_, err = s.handler.SetActivePlan(ctx, connect.NewRequest(&apiv1.SetActivePlanRequest{
		Id: created.Msg.GetPlan().GetId(),
	}))
	s.Require().NoError(err)

	msg := s.dashboard(ctx, preferred.ID.String())
	s.Require().Equal(planned.ID.String(), msg.GetNextRoutine().GetId())
	s.Require().Equal(created.Msg.GetPlan().GetId(), msg.GetActivePlan().GetId())
}

func (s *dashboardSuite) TestThisWeekCountsOnlyWorkoutsFinishedSinceMonday() {
	ctx, user := s.athlete()
	exercise := s.factory.NewExercise(factory.ExerciseUserID(user.ID))

	weekStart := training.WeekOf(time.Now().UTC()).Start()
	thisWeek := s.factory.NewWorkout(
		factory.WorkoutUserID(user.ID),
		factory.WorkoutFinishedAt(time.Now().UTC()),
	)
	s.factory.NewSet(
		factory.SetUserID(user.ID),
		factory.SetWorkoutID(thisWeek.ID),
		factory.SetExerciseID(exercise.ID),
		factory.SetWeight(100),
		factory.SetReps(5),
		factory.SetDistance(3),
	)

	lastWeek := s.factory.NewWorkout(
		factory.WorkoutUserID(user.ID),
		factory.WorkoutStartedAt(weekStart.AddDate(0, 0, -2)),
		factory.WorkoutFinishedAt(weekStart.Add(-time.Hour)),
	)
	s.factory.NewSet(
		factory.SetUserID(user.ID),
		factory.SetWorkoutID(lastWeek.ID),
		factory.SetExerciseID(exercise.ID),
		factory.SetWeight(200),
		factory.SetReps(5),
		factory.SetDistance(9),
	)

	msg := s.dashboard(ctx, "")
	s.Require().Equal(int32(1), msg.GetWorkoutsThisWeek())
	s.Require().InDelta(500.0, msg.GetVolumeThisWeek(), 0.001)
	s.Require().InDelta(3.0, msg.GetDistanceThisWeek(), 0.001)
	s.Require().Len(msg.GetRecentWorkouts(), 2, "recent workouts are not limited to the current week")
}

func (s *dashboardSuite) TestWorkoutCountAndRecordsAreLifetimeTotals() {
	ctx, user := s.athlete()
	exercises := []*models.Exercise{
		s.factory.NewExercise(factory.ExerciseUserID(user.ID)),
		s.factory.NewExercise(factory.ExerciseUserID(user.ID)),
	}

	// More workouts than the recent preview holds, so a count taken off that
	// preview cannot pass for the total.
	const logged = 5
	for i := range logged {
		workout := s.factory.NewWorkout(
			factory.WorkoutUserID(user.ID),
			factory.WorkoutFinishedAt(time.Now().UTC()),
		)
		s.factory.NewSet(
			factory.SetUserID(user.ID),
			factory.SetWorkoutID(workout.ID),
			factory.SetExerciseID(exercises[i%len(exercises)].ID),
			factory.SetWeight(100),
			factory.SetReps(5),
		)
	}

	msg := s.dashboard(ctx, "")
	s.Require().Len(msg.GetRecentWorkouts(), 3, "the preview stays capped")
	s.Require().Equal(int32(logged), msg.GetWorkoutCount())
	s.Require().Len(msg.GetPersonalBests(), len(exercises), "one record per exercise, uncapped")
}

func (s *dashboardSuite) TestWorkoutCountIgnoresOtherAthletes() {
	ctx, _ := s.athlete()
	stranger := s.factory.NewUser()
	s.factory.NewWorkout(factory.WorkoutUserID(stranger.ID))

	s.Require().Zero(s.dashboard(ctx, "").GetWorkoutCount())
}
