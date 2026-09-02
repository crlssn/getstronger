package v1_test

import (
	"context"
	"log"
	"testing"

	"connectrpc.com/connect"
	"github.com/gofrs/uuid/v5"
	"github.com/stephenafamo/bob"
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
	ctx := xcontext.WithUserID(context.Background(), user.ID)

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

// A routine the athlete does not have is a stale client rather than a bad
// request: the id is well formed, it just names nothing they own.
func (s *routineSuite) TestUpdateRoutineRejectsARoutineTheAthleteDoesNotHave() {
	ctx, _ := s.athlete()

	_, err := s.handler.UpdateRoutine(ctx, connect.NewRequest(&apiv1.UpdateRoutineRequest{
		Routine: &apiv1.Routine{Id: uuid.Must(uuid.NewV4()).String(), Name: "Push"},
	}))
	s.Require().Error(err)
	s.Require().Equal(connect.CodeFailedPrecondition, connect.CodeOf(err))
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

// An exercise added to a routine joins its last group, which is where the flat
// order puts it too. Taking one away is a save of the groups without it.
func (s *routineSuite) TestAddExerciseChangesWhatTheRoutineHolds() {
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
	s.Require().Equal(
		[]string{original.ID.String(), added.ID.String()},
		routineExerciseIDs(fetched.Msg.GetRoutine()),
	)
	s.Require().Len(fetched.Msg.GetRoutine().GetGroups(), 1)
}

func routineExerciseIDs(routine *apiv1.Routine) []string {
	ids := make([]string, 0, len(routine.GetExercises()))
	for _, exercise := range routine.GetExercises() {
		ids = append(ids, exercise.GetId())
	}

	return ids
}

func (s *routineSuite) context(user *models.User) context.Context {
	ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
	return xcontext.WithUserID(ctx, user.ID)
}

func (s *routineSuite) exerciseIDs(exercises models.ExerciseSlice) []string {
	ids := make([]string, 0, len(exercises))
	for _, exercise := range exercises {
		ids = append(ids, exercise.ID.String())
	}
	return ids
}

func (s *routineSuite) getRoutine(ctx context.Context, routineID string) *apiv1.Routine {
	res, err := s.handler.GetRoutine(ctx, connect.NewRequest(&apiv1.GetRoutineRequest{Id: routineID}))
	s.Require().NoError(err)
	return res.Msg.GetRoutine()
}

// A routine that says nothing about how it is worked through is one block of
// straight sets, which is what every routine was before groups existed.
func (s *routineSuite) TestCreateRoutineWithoutGroups() {
	user := s.factory.NewUser()
	ctx := s.context(user)
	exercises := s.factory.NewExerciseSlice(2, factory.ExerciseUserID(user.ID))
	exerciseIDs := s.exerciseIDs(exercises)

	created, err := s.handler.CreateRoutine(ctx, connect.NewRequest(&apiv1.CreateRoutineRequest{
		Name:        "Full body",
		ExerciseIds: exerciseIDs,
	}))
	s.Require().NoError(err)

	routine := s.getRoutine(ctx, created.Msg.GetId())
	s.Require().Equal("Full body", routine.GetName())
	s.Require().Len(routine.GetExercises(), 2)
	s.Require().Len(routine.GetGroups(), 1)
	s.Require().Equal(apiv1.RoutineGroupMode_ROUTINE_GROUP_MODE_STRAIGHT, routine.GetGroups()[0].GetMode())
	s.Require().Len(routine.GetGroups()[0].GetExercises(), 2)
}

func (s *routineSuite) TestCreateRoutineWithGroups() {
	user := s.factory.NewUser()
	ctx := s.context(user)
	exercises := s.factory.NewExerciseSlice(3, factory.ExerciseUserID(user.ID))
	exerciseIDs := s.exerciseIDs(exercises)

	created, err := s.handler.CreateRoutine(ctx, connect.NewRequest(&apiv1.CreateRoutineRequest{
		Name:        "Full body",
		ExerciseIds: exerciseIDs,
		Groups: []*apiv1.RoutineGroup{
			{
				Mode:      apiv1.RoutineGroupMode_ROUTINE_GROUP_MODE_STRAIGHT,
				Exercises: groupExercises(exerciseIDs[0]),
			},
			{
				Mode:                        apiv1.RoutineGroupMode_ROUTINE_GROUP_MODE_CIRCUIT,
				RestBetweenExercisesSeconds: 15,
				RestBetweenRoundsSeconds:    90,
				Rounds:                      3,
				Exercises:                   groupExercises(exerciseIDs[2], exerciseIDs[1]),
			},
		},
	}))
	s.Require().NoError(err)

	routine := s.getRoutine(ctx, created.Msg.GetId())
	s.Require().Len(routine.GetGroups(), 2)

	circuit := routine.GetGroups()[1]
	s.Require().Equal(apiv1.RoutineGroupMode_ROUTINE_GROUP_MODE_CIRCUIT, circuit.GetMode())
	s.Require().Equal(int32(15), circuit.GetRestBetweenExercisesSeconds())
	s.Require().Equal(int32(90), circuit.GetRestBetweenRoundsSeconds())
	// The prescription travels with the block: a circuit written as three
	// rounds is read back as three rounds.
	s.Require().Equal(int32(3), circuit.GetRounds())
	s.Require().Equal(
		[]string{exerciseIDs[2], exerciseIDs[1]},
		[]string{
			circuit.GetExercises()[0].GetExercise().GetId(),
			circuit.GetExercises()[1].GetExercise().GetId(),
		},
	)

	// The flat list is the groups read end to end, so the order the groups put
	// the exercises in is the order the routine is trained in.
	flat := make([]string, 0, len(routine.GetExercises()))
	for _, exercise := range routine.GetExercises() {
		flat = append(flat, exercise.GetId())
	}
	s.Require().Equal([]string{exerciseIDs[0], exerciseIDs[2], exerciseIDs[1]}, flat)
}

// A bench press in the warm-up and a bench press in the circuit are two
// different pieces of work, and a routine is allowed to say so.
func (s *routineSuite) TestCreateRoutineWithAnExerciseInTwoGroups() {
	user := s.factory.NewUser()
	ctx := s.context(user)
	exercises := s.factory.NewExerciseSlice(2, factory.ExerciseUserID(user.ID))
	exerciseIDs := s.exerciseIDs(exercises)

	created, err := s.handler.CreateRoutine(ctx, connect.NewRequest(&apiv1.CreateRoutineRequest{
		Name:        "Full body",
		ExerciseIds: exerciseIDs,
		Groups: []*apiv1.RoutineGroup{
			{
				Mode:      apiv1.RoutineGroupMode_ROUTINE_GROUP_MODE_STRAIGHT,
				Exercises: groupExercises(exerciseIDs[0]),
			},
			{
				Mode:      apiv1.RoutineGroupMode_ROUTINE_GROUP_MODE_CIRCUIT,
				Exercises: groupExercises(exerciseIDs[0], exerciseIDs[1]),
			},
		},
	}))
	s.Require().NoError(err)

	routine := s.getRoutine(ctx, created.Msg.GetId())
	s.Require().Len(routine.GetGroups(), 2)
	s.Require().Len(routine.GetGroups()[0].GetExercises(), 1)
	s.Require().Len(routine.GetGroups()[1].GetExercises(), 2)
	s.Require().Equal(exerciseIDs[0], routine.GetGroups()[0].GetExercises()[0].GetExercise().GetId())
	s.Require().Equal(exerciseIDs[0], routine.GetGroups()[1].GetExercises()[0].GetExercise().GetId())

	// The flat list is still the groups read end to end, so the repeat is in it
	// twice: that is how many times the routine trains it.
	flat := make([]string, 0, len(routine.GetExercises()))
	for _, exercise := range routine.GetExercises() {
		flat = append(flat, exercise.GetId())
	}
	s.Require().Equal([]string{exerciseIDs[0], exerciseIDs[0], exerciseIDs[1]}, flat)
}

// The rest a straight group gives an exercise is the routine's, not the
// library's: the same lift can rest one length here and another next door.
func (s *routineSuite) TestCreateRoutineWithAPerExerciseRest() {
	user := s.factory.NewUser()
	ctx := s.context(user)
	exercises := s.factory.NewExerciseSlice(3, factory.ExerciseUserID(user.ID))
	exerciseIDs := s.exerciseIDs(exercises)

	created, err := s.handler.CreateRoutine(ctx, connect.NewRequest(&apiv1.CreateRoutineRequest{
		Name:        "Heavy day",
		ExerciseIds: exerciseIDs,
		Groups: []*apiv1.RoutineGroup{
			{
				Mode: apiv1.RoutineGroupMode_ROUTINE_GROUP_MODE_STRAIGHT,
				Exercises: []*apiv1.RoutineExercise{
					{Exercise: &apiv1.Exercise{Id: exerciseIDs[0]}, RestSeconds: 180},
					{Exercise: &apiv1.Exercise{Id: exerciseIDs[1]}, RestSeconds: 45},
					{Exercise: &apiv1.Exercise{Id: exerciseIDs[2]}, RestSeconds: 0},
				},
			},
		},
	}))
	s.Require().NoError(err)

	group := s.getRoutine(ctx, created.Msg.GetId()).GetGroups()[0]
	s.Require().Len(group.GetExercises(), 3)

	s.Require().Equal(int32(180), group.GetExercises()[0].GetRestSeconds())
	s.Require().Equal(int32(45), group.GetExercises()[1].GetRestSeconds())
	// Zero is an answer of its own: no timer for this occurrence.
	s.Require().Equal(int32(0), group.GetExercises()[2].GetRestSeconds())
}

// Nothing says how long an occurrence rests, so the rest a new one of that
// exercise starts at does — and an exercise held against the clock starts with
// no timer at all.
func (s *routineSuite) TestCreateRoutineWithoutGroupsRestsByDefault() {
	user := s.factory.NewUser()
	ctx := s.context(user)
	lift := s.factory.NewExercise(factory.ExerciseUserID(user.ID))
	plank := s.factory.NewExercise(
		factory.ExerciseUserID(user.ID),
		factory.ExerciseMetrics(training.MetricTime.String()),
	)

	created, err := s.handler.CreateRoutine(ctx, connect.NewRequest(&apiv1.CreateRoutineRequest{
		Name:        "Plain day",
		ExerciseIds: []string{lift.ID.String(), plank.ID.String()},
	}))
	s.Require().NoError(err)

	group := s.getRoutine(ctx, created.Msg.GetId()).GetGroups()[0]
	s.Require().Len(group.GetExercises(), 2)

	rests := make(map[string]int32, len(group.GetExercises()))
	for _, entry := range group.GetExercises() {
		rests[entry.GetExercise().GetId()] = entry.GetRestSeconds()
	}
	s.Require().Equal(int32(training.DefaultRestSeconds), rests[lift.ID.String()])
	s.Require().Equal(int32(0), rests[plank.ID.String()])
}

// A circuit rests between exercises and between rounds, so a set rest sent for
// one has nowhere to go while it is one. It is kept rather than dropped, so a
// group switched back to straight sets rests as it did before.
func (s *routineSuite) TestCreateRoutineKeepsAPerExerciseRestInACircuit() {
	user := s.factory.NewUser()
	ctx := s.context(user)
	exercises := s.factory.NewExerciseSlice(2, factory.ExerciseUserID(user.ID))
	exerciseIDs := s.exerciseIDs(exercises)

	created, err := s.handler.CreateRoutine(ctx, connect.NewRequest(&apiv1.CreateRoutineRequest{
		Name:        "Circuit day",
		ExerciseIds: exerciseIDs,
		Groups: []*apiv1.RoutineGroup{
			{
				Mode:                     apiv1.RoutineGroupMode_ROUTINE_GROUP_MODE_CIRCUIT,
				RestBetweenRoundsSeconds: 120,
				Exercises: []*apiv1.RoutineExercise{
					{Exercise: &apiv1.Exercise{Id: exerciseIDs[0]}, RestSeconds: 180},
					{Exercise: &apiv1.Exercise{Id: exerciseIDs[1]}, RestSeconds: 0},
				},
			},
		},
	}))
	s.Require().NoError(err)

	group := s.getRoutine(ctx, created.Msg.GetId()).GetGroups()[0]
	s.Require().Equal(int32(120), group.GetRestBetweenRoundsSeconds())
	s.Require().Equal(int32(180), group.GetExercises()[0].GetRestSeconds())
	s.Require().Equal(int32(0), group.GetExercises()[1].GetRestSeconds())
}

func (s *routineSuite) TestCreateRoutineHoldsAnExerciseOncePerGroup() {
	user := s.factory.NewUser()
	ctx := s.context(user)
	exercises := s.factory.NewExerciseSlice(2, factory.ExerciseUserID(user.ID))
	exerciseIDs := s.exerciseIDs(exercises)

	created, err := s.handler.CreateRoutine(ctx, connect.NewRequest(&apiv1.CreateRoutineRequest{
		Name:        "Full body",
		ExerciseIds: exerciseIDs,
		Groups: []*apiv1.RoutineGroup{
			{
				Mode:      apiv1.RoutineGroupMode_ROUTINE_GROUP_MODE_CIRCUIT,
				Exercises: groupExercises(exerciseIDs[0], exerciseIDs[1], exerciseIDs[0]),
			},
		},
	}))
	s.Require().NoError(err)

	routine := s.getRoutine(ctx, created.Msg.GetId())
	s.Require().Len(routine.GetGroups(), 1)
	s.Require().Len(routine.GetGroups()[0].GetExercises(), 2)
}

func (s *routineSuite) TestUpdateRoutineRegroupsIt() {
	user := s.factory.NewUser()
	ctx := s.context(user)
	exercises := s.factory.NewExerciseSlice(2, factory.ExerciseUserID(user.ID))
	exerciseIDs := s.exerciseIDs(exercises)

	created, err := s.handler.CreateRoutine(ctx, connect.NewRequest(&apiv1.CreateRoutineRequest{
		Name:        "Full body",
		ExerciseIds: exerciseIDs,
	}))
	s.Require().NoError(err)

	// The exercises are named by the groups alone: a client that groups them
	// need not repeat the flat list.
	updated, err := s.handler.UpdateRoutine(ctx, connect.NewRequest(&apiv1.UpdateRoutineRequest{
		Routine: &apiv1.Routine{
			Id:   created.Msg.GetId(),
			Name: "Circuit day",
			Groups: []*apiv1.RoutineGroup{
				{
					Mode:                     apiv1.RoutineGroupMode_ROUTINE_GROUP_MODE_CIRCUIT,
					RestBetweenRoundsSeconds: 60,
					Exercises:                groupExercises(exerciseIDs[1], exerciseIDs[0]),
				},
			},
		},
	}))
	s.Require().NoError(err)
	s.Require().Equal("Circuit day", updated.Msg.GetRoutine().GetName())
	s.Require().Len(updated.Msg.GetRoutine().GetGroups(), 1)
	s.Require().Equal(int32(60), updated.Msg.GetRoutine().GetGroups()[0].GetRestBetweenRoundsSeconds())

	routine := s.getRoutine(ctx, created.Msg.GetId())
	s.Require().Len(routine.GetGroups(), 1)
	s.Require().Equal(apiv1.RoutineGroupMode_ROUTINE_GROUP_MODE_CIRCUIT, routine.GetGroups()[0].GetMode())
	s.Require().Equal(int32(60), routine.GetGroups()[0].GetRestBetweenRoundsSeconds())
	s.Require().Equal(
		[]string{exerciseIDs[1], exerciseIDs[0]},
		[]string{routine.GetExercises()[0].GetId(), routine.GetExercises()[1].GetId()},
	)
}

// An exercise trained in two groups is two pieces of work but one exercise to
// look up, and a client is free to name it in the flat list as well. Both the
// repeat and the echo have to resolve to one lookup, or the update is rejected
// for naming an exercise the athlete does not have twice over.
func (s *routineSuite) TestUpdateRoutineTrainsAnExerciseInTwoGroups() {
	user := s.factory.NewUser()
	ctx := s.context(user)
	exercises := s.factory.NewExerciseSlice(2, factory.ExerciseUserID(user.ID))
	exerciseIDs := s.exerciseIDs(exercises)

	created, err := s.handler.CreateRoutine(ctx, connect.NewRequest(&apiv1.CreateRoutineRequest{
		Name:        "Full body",
		ExerciseIds: exerciseIDs,
	}))
	s.Require().NoError(err)

	_, err = s.handler.UpdateRoutine(ctx, connect.NewRequest(&apiv1.UpdateRoutineRequest{
		Routine: &apiv1.Routine{
			Id:   created.Msg.GetId(),
			Name: "Full body",
			// The flat list repeats what the groups already named, which is
			// what a client that keeps both in step sends.
			Exercises: []*apiv1.Exercise{{Id: exerciseIDs[0]}, {Id: exerciseIDs[1]}},
			Groups: []*apiv1.RoutineGroup{
				{
					Mode:      apiv1.RoutineGroupMode_ROUTINE_GROUP_MODE_STRAIGHT,
					Exercises: groupExercises(exerciseIDs[0]),
				},
				{
					Mode:      apiv1.RoutineGroupMode_ROUTINE_GROUP_MODE_CIRCUIT,
					Exercises: groupExercises(exerciseIDs[0], exerciseIDs[1]),
				},
			},
		},
	}))
	s.Require().NoError(err)

	routine := s.getRoutine(ctx, created.Msg.GetId())
	s.Require().Len(routine.GetGroups(), 2)
	s.Require().Len(routine.GetGroups()[0].GetExercises(), 1)
	s.Require().Len(routine.GetGroups()[1].GetExercises(), 2)

	// The flat list is the groups read end to end, so the repeat is in it
	// twice: that is how many times the routine trains it.
	flat := make([]string, 0, len(routine.GetExercises()))
	for _, exercise := range routine.GetExercises() {
		flat = append(flat, exercise.GetId())
	}
	s.Require().Equal([]string{exerciseIDs[0], exerciseIDs[0], exerciseIDs[1]}, flat)
}

// Grouping is optional on the way in as well: a client that has never heard of
// it keeps saving a flat list, and the routine stays one straight block.
func (s *routineSuite) TestUpdateRoutineWithoutGroups() {
	user := s.factory.NewUser()
	ctx := s.context(user)
	exercises := s.factory.NewExerciseSlice(2, factory.ExerciseUserID(user.ID))
	exerciseIDs := s.exerciseIDs(exercises)

	created, err := s.handler.CreateRoutine(ctx, connect.NewRequest(&apiv1.CreateRoutineRequest{
		Name:        "Full body",
		ExerciseIds: exerciseIDs,
	}))
	s.Require().NoError(err)

	_, err = s.handler.UpdateRoutine(ctx, connect.NewRequest(&apiv1.UpdateRoutineRequest{
		Routine: &apiv1.Routine{
			Id:        created.Msg.GetId(),
			Name:      "Full body",
			Exercises: []*apiv1.Exercise{{Id: exerciseIDs[1]}},
		},
	}))
	s.Require().NoError(err)

	routine := s.getRoutine(ctx, created.Msg.GetId())
	s.Require().Len(routine.GetGroups(), 1)
	s.Require().Equal(apiv1.RoutineGroupMode_ROUTINE_GROUP_MODE_STRAIGHT, routine.GetGroups()[0].GetMode())
	s.Require().Len(routine.GetExercises(), 1)
	s.Require().Equal(exerciseIDs[1], routine.GetExercises()[0].GetId())
}

func (s *routineSuite) TestGetRoutineOfAnotherUser() {
	owner := s.factory.NewUser()
	exercises := s.factory.NewExerciseSlice(1, factory.ExerciseUserID(owner.ID))

	created, err := s.handler.CreateRoutine(s.context(owner), connect.NewRequest(&apiv1.CreateRoutineRequest{
		Name:        "Full body",
		ExerciseIds: s.exerciseIDs(exercises),
	}))
	s.Require().NoError(err)

	_, err = s.handler.GetRoutine(
		s.context(s.factory.NewUser()),
		connect.NewRequest(&apiv1.GetRoutineRequest{Id: created.Msg.GetId()}),
	)
	s.Require().Equal(connect.CodeNotFound, connect.CodeOf(err))
}

// groupExercises names a group's exercises without saying anything about rest,
// which is what a routine nobody has given one keeps sending.
func groupExercises(ids ...string) []*apiv1.RoutineExercise {
	exercises := make([]*apiv1.RoutineExercise, 0, len(ids))
	for _, id := range ids {
		exercises = append(exercises, &apiv1.RoutineExercise{Exercise: &apiv1.Exercise{Id: id}})
	}

	return exercises
}

// A routine that is not there and one belonging to somebody else are the same
// situation to a client. Only the read says so with NotFound; the writes are
// failed preconditions.
func (s *routineSuite) TestRoutineEndpointsRejectAMissingRoutine() {
	ctx, user := s.athlete()
	exercise := s.factory.NewExercise(factory.ExerciseUserID(user.ID))
	missing := uuid.Must(uuid.NewV4()).String()

	s.Run("get", func() {
		_, err := s.handler.GetRoutine(ctx, connect.NewRequest(&apiv1.GetRoutineRequest{Id: missing}))
		s.Require().Equal(connect.CodeNotFound, connect.CodeOf(err))
	})

	s.Run("update", func() {
		_, err := s.handler.UpdateRoutine(ctx, connect.NewRequest(&apiv1.UpdateRoutineRequest{
			Routine: &apiv1.Routine{
				Id:        missing,
				Name:      "Ghost",
				Exercises: []*apiv1.Exercise{{Id: exercise.ID.String()}},
			},
		}))
		s.Require().Equal(connect.CodeFailedPrecondition, connect.CodeOf(err))
	})

	s.Run("delete", func() {
		_, err := s.handler.DeleteRoutine(ctx, connect.NewRequest(&apiv1.DeleteRoutineRequest{Id: missing}))
		s.Require().Equal(connect.CodeFailedPrecondition, connect.CodeOf(err))
	})

	s.Run("add_exercise", func() {
		_, err := s.handler.AddExercise(ctx, connect.NewRequest(&apiv1.AddExerciseRequest{
			RoutineId:  missing,
			ExerciseId: exercise.ID.String(),
		}))
		s.Require().Equal(connect.CodeFailedPrecondition, connect.CodeOf(err))
	})

	s.Run("update_exercise_order", func() {
		_, err := s.handler.UpdateExerciseOrder(ctx, connect.NewRequest(&apiv1.UpdateExerciseOrderRequest{
			RoutineId:   missing,
			ExerciseIds: []string{exercise.ID.String()},
		}))
		s.Require().Equal(connect.CodeFailedPrecondition, connect.CodeOf(err))
	})
}

// A deleted routine is retired rather than erased, the way a deleted exercise
// is: the athlete never sees it again, but the row stays so the workouts that
// trained it still resolve.
func (s *routineSuite) TestDeleteRoutineRetiresItWithoutErasingIt() {
	ctx, user := s.athlete()
	exercise := s.factory.NewExercise(factory.ExerciseUserID(user.ID))
	created, err := s.handler.CreateRoutine(ctx, connect.NewRequest(&apiv1.CreateRoutineRequest{
		Name:        "Retired",
		ExerciseIds: []string{exercise.ID.String()},
	}))
	s.Require().NoError(err)

	_, err = s.handler.DeleteRoutine(ctx, connect.NewRequest(&apiv1.DeleteRoutineRequest{
		Id: created.Msg.GetId(),
	}))
	s.Require().NoError(err)

	_, err = s.handler.GetRoutine(ctx, connect.NewRequest(&apiv1.GetRoutineRequest{Id: created.Msg.GetId()}))
	s.Require().Equal(connect.CodeNotFound, connect.CodeOf(err))

	listed, err := s.handler.ListRoutines(ctx, connect.NewRequest(&apiv1.ListRoutinesRequest{}))
	s.Require().NoError(err)
	s.Require().Empty(listed.Msg.GetRoutines())

	retired, err := models.Routines.Query(
		models.SelectWhere.Routines.ID.EQ(nativeUUID(created.Msg.GetId())),
	).One(context.Background(), bob.NewDB(s.container.DB))
	s.Require().NoError(err)
	s.Require().False(retired.DeletedAt.IsNull())

	// Deleting it a second time reads as a routine that is no longer there.
	_, err = s.handler.DeleteRoutine(ctx, connect.NewRequest(&apiv1.DeleteRoutineRequest{
		Id: created.Msg.GetId(),
	}))
	s.Require().Equal(connect.CodeFailedPrecondition, connect.CodeOf(err))
}

// The exercise is looked up under the athlete who asked, so one they do not own
// is indistinguishable from one that does not exist.
func (s *routineSuite) TestAddExerciseRejectsAnExerciseTheAthleteDoesNotOwn() {
	ctx, user := s.athlete()
	owned := s.factory.NewExercise(factory.ExerciseUserID(user.ID))
	created, err := s.handler.CreateRoutine(ctx, connect.NewRequest(&apiv1.CreateRoutineRequest{
		Name:        "Push",
		ExerciseIds: []string{owned.ID.String()},
	}))
	s.Require().NoError(err)

	_, stranger := s.athlete()
	theirs := s.factory.NewExercise(factory.ExerciseUserID(stranger.ID))

	_, err = s.handler.AddExercise(ctx, connect.NewRequest(&apiv1.AddExerciseRequest{
		RoutineId:  created.Msg.GetId(),
		ExerciseId: theirs.ID.String(),
	}))
	s.Require().Equal(connect.CodeFailedPrecondition, connect.CodeOf(err))
}

func (s *routineSuite) TestUpdateExerciseOrderRefusesAnotherAthletesRoutine() {
	ownerCtx, owner := s.athlete()
	exercise := s.factory.NewExercise(factory.ExerciseUserID(owner.ID))
	created, err := s.handler.CreateRoutine(ownerCtx, connect.NewRequest(&apiv1.CreateRoutineRequest{
		Name:        "Private",
		ExerciseIds: []string{exercise.ID.String()},
	}))
	s.Require().NoError(err)

	strangerCtx, _ := s.athlete()
	_, err = s.handler.UpdateExerciseOrder(strangerCtx, connect.NewRequest(&apiv1.UpdateExerciseOrderRequest{
		RoutineId:   created.Msg.GetId(),
		ExerciseIds: []string{exercise.ID.String()},
	}))
	s.Require().Equal(connect.CodePermissionDenied, connect.CodeOf(err))
}

func (s *routineSuite) TestListRoutinesRejectsAMalformedPageToken() {
	ctx, _ := s.athlete()

	_, err := s.handler.ListRoutines(ctx, connect.NewRequest(&apiv1.ListRoutinesRequest{
		Pagination: &apiv1.PaginationRequest{PageLimit: 2, PageToken: []byte("not a token")},
	}))
	s.Require().Equal(connect.CodeInternal, connect.CodeOf(err))
}
