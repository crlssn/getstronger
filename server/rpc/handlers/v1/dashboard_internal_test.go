package v1

import (
	"context"
	"database/sql"
	"errors"
	"math"
	"testing"

	"connectrpc.com/connect"
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
	workoutCount    int64
	workoutCountErr error
}

func (s stubSources) ListRoutines(_ context.Context, _ ...repo.ListRoutineOpt) (models.RoutineSlice, error) {
	return nil, nil
}

func (s stubSources) ListWorkouts(_ context.Context, _ ...repo.ListWorkoutsOpt) (models.WorkoutSlice, error) {
	return nil, nil
}

func (s stubSources) GetActivePlan(_ context.Context, _ string) (*training.Plan, error) {
	return nil, sql.ErrNoRows
}

func (s stubSources) GetPersonalBests(_ context.Context, _ ...string) (models.SetSlice, error) {
	return nil, nil
}

func (s stubSources) CountWorkouts(_ context.Context, _ string) (int64, error) {
	return s.workoutCount, s.workoutCountErr
}

func dashboardOf(t *testing.T, sources stubSources) (context.Context, *dashboard) {
	t.Helper()
	ctx := xcontext.WithUserID(context.Background(), "b0f0a1e4-0c7b-4d3b-9f3a-8c5f1d2e3a4b")

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
