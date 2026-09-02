package v1

import (
	"context"
	"database/sql"
	"errors"
	"math"
	"testing"

	"connectrpc.com/connect"
	"github.com/gofrs/uuid/v5"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/gen/models"
	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/training"
	"github.com/crlssn/getstronger/server/xcontext"
)

// errCountUnavailable stands in for whatever the database was unable to do.
var errCountUnavailable = errors.New("connection reset")

// stubSources answers every dashboard question with nothing, so a test only has
// to say how the one source it is about behaves.
type stubSources struct {
	workoutCount     int64
	workoutCountErr  error
	listRoutinesErr  error
	listWorkoutsErr  error
	activePlanErr    error
	personalBestsErr error
}

func (s stubSources) ListRoutines(_ context.Context, _ ...repo.ListRoutineOpt) (models.RoutineSlice, error) {
	return nil, s.listRoutinesErr
}

func (s stubSources) ListWorkouts(_ context.Context, _ ...repo.ListWorkoutsOpt) (models.WorkoutSlice, error) {
	return nil, s.listWorkoutsErr
}

func (s stubSources) GetActivePlan(_ context.Context, _ uuid.UUID) (*training.Plan, error) {
	if s.activePlanErr != nil {
		return nil, s.activePlanErr
	}

	return nil, sql.ErrNoRows
}

func (s stubSources) GetPersonalBests(_ context.Context, _ ...uuid.UUID) (models.SetSlice, error) {
	return nil, s.personalBestsErr
}

func (s stubSources) CountWorkouts(_ context.Context, _ uuid.UUID) (int64, error) {
	return s.workoutCount, s.workoutCountErr
}

func dashboardOf(t *testing.T, sources stubSources) (context.Context, *dashboard) {
	t.Helper()
	ctx := xcontext.WithUserID(context.Background(), uuid.Must(uuid.NewV4()))

	return xcontext.WithLogger(ctx, zap.NewExample()), &dashboard{sources: sources}
}

// A count is the one source with nothing to fall back on: a dashboard that
// answered with zero would be indistinguishable from an athlete who has never
// trained.
func TestDashboardFailsWhenTheWorkoutCountCannotBeRead(t *testing.T) {
	t.Parallel()
	ctx, handler := dashboardOf(t, stubSources{workoutCountErr: errCountUnavailable})

	_, err := handler.GetDashboard(ctx, connect.NewRequest(&apiv1.GetDashboardRequest{}))
	require.Equal(t, connect.CodeInternal, connect.CodeOf(err))
}

func TestDashboardCapsAWorkoutCountTheFieldCannotHold(t *testing.T) {
	t.Parallel()
	ctx, handler := dashboardOf(t, stubSources{workoutCount: math.MaxInt32 + 1})

	res, err := handler.GetDashboard(ctx, connect.NewRequest(&apiv1.GetDashboardRequest{}))
	require.NoError(t, err)
	require.Equal(t, int32(math.MaxInt32), res.Msg.GetWorkoutCount())
}

// An athlete with no active plan is an ordinary dashboard; only a plan that
// cannot be read at all is a failure.
func TestDashboardFailsOnlyWhenASourceCannotAnswer(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		sources stubSources
	}{
		{name: "routines", sources: stubSources{listRoutinesErr: errCountUnavailable}},
		{name: "active_plan", sources: stubSources{activePlanErr: errCountUnavailable}},
		{name: "workouts", sources: stubSources{listWorkoutsErr: errCountUnavailable}},
		{name: "personal_bests", sources: stubSources{personalBestsErr: errCountUnavailable}},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			ctx, handler := dashboardOf(t, test.sources)

			_, err := handler.GetDashboard(ctx, connect.NewRequest(&apiv1.GetDashboardRequest{}))
			require.Equal(t, connect.CodeInternal, connect.CodeOf(err))
		})
	}

	t.Run("no_active_plan_is_not_a_failure", func(t *testing.T) {
		t.Parallel()
		ctx, handler := dashboardOf(t, stubSources{})

		res, err := handler.GetDashboard(ctx, connect.NewRequest(&apiv1.GetDashboardRequest{}))
		require.NoError(t, err)
		require.Nil(t, res.Msg.GetActivePlan())
	})
}
