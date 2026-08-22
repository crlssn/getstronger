package v1

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"connectrpc.com/connect"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/gen/models"
	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/rpc/parser"
	"github.com/crlssn/getstronger/server/training"
	"github.com/crlssn/getstronger/server/xcontext"
)

// dashboardSources are the things the dashboard is assembled from. It only
// reads: everything it shows was decided elsewhere.
type dashboardSources interface {
	ListRoutines(ctx context.Context, opts ...repo.ListRoutineOpt) (models.RoutineSlice, error)
	ListWorkouts(ctx context.Context, opts ...repo.ListWorkoutsOpt) (models.WorkoutSlice, error)
	GetActivePlan(ctx context.Context, userID string) (*training.Plan, error)
	GetPersonalBests(ctx context.Context, userIDs ...string) (models.SetSlice, error)
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

	nextRoutine := training.NextRoutine(activePlan, routines, req.Msg.GetPreferredRoutineId())

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

	thisWeek := training.WeekOf(time.Now().UTC()).Summarise(workouts)

	recentWorkouts := workouts
	if len(recentWorkouts) > recentWorkoutLimit {
		recentWorkouts = recentWorkouts[:recentWorkoutLimit]
	}
	parsedWorkouts, err := parser.WorkoutSlice(recentWorkouts, personalBests)
	if err != nil {
		log.Error("Parse dashboard workouts", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}
	var parsedNextRoutine *apiv1.Routine
	if nextRoutine != nil {
		parsedNextRoutine = parser.Routine(nextRoutine)
	}

	log.Info("Dashboard returned")
	return connect.NewResponse(&apiv1.GetDashboardResponse{
		NextRoutine:      parsedNextRoutine,
		Routines:         parser.RoutineSlice(routines),
		WorkoutsThisWeek: thisWeek.Workouts,
		VolumeThisWeek:   thisWeek.Volume.Float64(),
		PersonalBests:    parser.ExerciseSetSlice(personalBests),
		RecentWorkouts:   parsedWorkouts,
		ActivePlan:       parser.Plan(activePlan),
	}), nil
}
