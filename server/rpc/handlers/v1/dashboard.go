package v1

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"connectrpc.com/connect"
	"github.com/gofrs/uuid/v5"
	"go.uber.org/zap"

	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/rpc/parser"
	"github.com/crlssn/getstronger/server/safe"
	"github.com/crlssn/getstronger/server/training"
	"github.com/crlssn/getstronger/server/xcontext"
)

// dashboardSources are the things the dashboard is assembled from. It only
// reads: everything it shows was decided elsewhere.
type dashboardSources interface {
	ListRoutines(ctx context.Context, opts ...repo.ListRoutineOpt) ([]*training.Routine, error)
	ListWorkouts(ctx context.Context, opts ...repo.ListWorkoutsOpt) ([]*training.Workout, error)
	GetActivePlan(ctx context.Context, userID uuid.UUID) (*training.Plan, error)
	GetPersonalBests(ctx context.Context, userIDs ...uuid.UUID) ([]*training.Set, error)
	CountWorkouts(ctx context.Context, userID uuid.UUID) (int64, error)
}

const (
	dashboardListLimit = 50
	recentWorkoutLimit = 3
)

// dashboard is the one screen that spans the whole training context, so it is
// the one place that coordinates several collaborators: it asks the plan what
// is next, the week how much has been lifted, and the log what was done
// recently.
type dashboard struct {
	sources dashboardSources
}

func (d *dashboard) GetDashboard(ctx context.Context, req *connect.Request[apiv1.GetDashboardRequest]) (*connect.Response[apiv1.GetDashboardResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	userID := xcontext.MustExtractUserID(ctx)

	preferredRoutineID, err := parser.OptionalUUID(req.Msg.GetPreferredRoutineId())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, nil)
	}

	routines, err := d.sources.ListRoutines(
		ctx,
		repo.ListRoutinesLoadExercises(),
		repo.ListRoutinesWithLimit(dashboardListLimit),
		repo.ListRoutinesWithUserID(userID),
		repo.ListRoutinesWithPageToken(nil),
	)
	if err != nil {
		log.Error("List routines for dashboard", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	activePlan, err := d.sources.GetActivePlan(ctx, userID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		log.Error("Get active plan for dashboard", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	nextRoutine := training.NextRoutine(activePlan, routines, preferredRoutineID)

	workouts, err := d.sources.ListWorkouts(
		ctx,
		repo.ListWorkoutsLoadSets(),
		repo.ListWorkoutsLoadUser(),
		repo.ListWorkoutsLoadExercises(),
		repo.ListWorkoutsWithLimit(dashboardListLimit),
		repo.ListWorkoutsWithUserIDs(userID),
		repo.ListWorkoutsWithPageToken(nil),
	)
	if err != nil {
		log.Error("List workouts for dashboard", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	personalBests, err := d.sources.GetPersonalBests(ctx, userID)
	if err != nil {
		log.Error("Get personal bests for dashboard", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	// The listed workouts stop at dashboardListLimit, so the lifetime total is
	// counted rather than measured off them.
	workoutCount, err := d.sources.CountWorkouts(ctx, userID)
	if err != nil {
		log.Error("Count workouts for dashboard", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}
	thisWeek := training.WeekOf(time.Now().UTC()).Summarise(workouts)

	log.Info("Dashboard returned")
	return connect.NewResponse(&apiv1.GetDashboardResponse{
		NextRoutine:      nextRoutineOf(nextRoutine),
		Routines:         parser.RoutineSlice(routines),
		WorkoutsThisWeek: thisWeek.Workouts,
		VolumeThisWeek:   thisWeek.Volume.Float64(),
		PersonalBests:    parser.ExerciseSetSlice(personalBests),
		RecentWorkouts:   parser.WorkoutSlice(recentOf(workouts), personalBests),
		ActivePlan:       parser.Plan(activePlan),
		WorkoutCount:     safe.Int32FromInt64(workoutCount),
		DistanceThisWeek: thisWeek.Distance.Float64(),
	}), nil
}

// nextRoutineOf renders the routine to train next, which an athlete with none
// does not have.
func nextRoutineOf(routine *training.Routine) *apiv1.Routine {
	if routine == nil {
		return nil
	}

	return parser.Routine(routine)
}

// recentOf is the tail of the log the dashboard shows.
func recentOf(workouts []*training.Workout) []*training.Workout {
	if len(workouts) > recentWorkoutLimit {
		return workouts[:recentWorkoutLimit]
	}

	return workouts
}
