package v1

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"connectrpc.com/connect"
	"github.com/gofrs/uuid/v5"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	"go.uber.org/zap/zaptest/observer"

	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/training"
	"github.com/crlssn/getstronger/server/xcontext"
)

// errStoreUnavailable stands in for whatever the database was unable to do.
var errStoreUnavailable = errors.New("connection reset")

// stubRotation turns every plan request down with the same error, so a test
// only has to say which outcome it is about.
type stubRotation struct {
	err error
}

func (s stubRotation) CreatePlan(_ context.Context, _ repo.CreatePlanParams) (*training.Plan, error) {
	return nil, s.err
}

func (s stubRotation) GetPlan(_ context.Context, _, _ uuid.UUID) (*training.Plan, error) {
	return nil, s.err
}

func (s stubRotation) ListPlans(_ context.Context, _ uuid.UUID) ([]*training.Plan, error) {
	return nil, s.err
}

func (s stubRotation) UpdatePlan(_ context.Context, _ repo.UpdatePlanParams) (*training.Plan, error) {
	return nil, s.err
}

func (s stubRotation) DeletePlan(_ context.Context, _, _ uuid.UUID) error {
	return s.err
}

func (s stubRotation) SetActivePlan(_ context.Context, _, _ uuid.UUID) (*training.Plan, error) {
	return nil, s.err
}

func (s stubRotation) PauseActivePlan(_ context.Context, _ uuid.UUID) error {
	return s.err
}

func (s stubRotation) AdvancePlan(_ context.Context, _, _, _ uuid.UUID) (*training.Plan, error) {
	return nil, s.err
}

// planLibraryOf returns an authenticated context whose logger is observed, and
// a plan library whose store answers every request with err.
func planLibraryOf(t *testing.T, err error) (context.Context, *planLibrary, *observer.ObservedLogs) {
	t.Helper()
	core, logs := observer.New(zap.DebugLevel)
	ctx := xcontext.WithUserID(context.Background(), uuid.Must(uuid.NewV4()))

	return xcontext.WithLogger(ctx, zap.New(core)), &planLibrary{plans: stubRotation{err: err}}, logs
}

type planRequest struct {
	name string
	call func(ctx context.Context, p *planLibrary) error
}

// planRequests are the three requests whose outcome the store classifies after
// the fact, one call each.
func planRequests() []planRequest {
	id := uuid.Must(uuid.NewV4()).String()

	return []planRequest{
		{
			name: "create",
			call: func(ctx context.Context, p *planLibrary) error {
				_, err := p.CreatePlan(ctx, connect.NewRequest(&apiv1.CreatePlanRequest{
					Name:       "Strength",
					RoutineIds: []string{id},
				}))
				return err
			},
		},
		{
			name: "update",
			call: func(ctx context.Context, p *planLibrary) error {
				_, err := p.UpdatePlan(ctx, connect.NewRequest(&apiv1.UpdatePlanRequest{
					Id:         id,
					Name:       "Strength",
					RoutineIds: []string{id},
				}))
				return err
			},
		},
		{
			name: "skip",
			call: func(ctx context.Context, p *planLibrary) error {
				_, err := p.SkipPlanRoutine(ctx, connect.NewRequest(&apiv1.SkipPlanRoutineRequest{Id: id}))
				return err
			},
		},
	}
}

// A plan turning a request down is the client's mistake and is logged as one,
// at Warn: an error log is a signal somebody may need to act on.
func TestPlanRequestsLogAClientErrorAtWarn(t *testing.T) {
	t.Parallel()

	requests := planRequests()
	tests := []struct {
		name    string
		request planRequest
		err     error
		code    connect.Code
	}{
		{name: "create_with_a_repeated_routine", request: requests[0], err: training.ErrPlanRoutineDuplicate, code: connect.CodeInvalidArgument},
		{name: "create_with_a_missing_routine", request: requests[0], err: sql.ErrNoRows, code: connect.CodeInvalidArgument},
		{name: "update_a_missing_plan", request: requests[1], err: sql.ErrNoRows, code: connect.CodeNotFound},
		{name: "update_with_a_repeated_routine", request: requests[1], err: training.ErrPlanRoutineDuplicate, code: connect.CodeInvalidArgument},
		{name: "skip_a_missing_plan", request: requests[2], err: sql.ErrNoRows, code: connect.CodeNotFound},
		{name: "skip_an_inactive_plan", request: requests[2], err: training.ErrPlanNotActive, code: connect.CodeFailedPrecondition},
		{name: "skip_a_plan_on_another_routine", request: requests[2], err: training.ErrPlanUnexpectedRoutine, code: connect.CodeFailedPrecondition},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			ctx, handler, logs := planLibraryOf(t, test.err)

			err := test.request.call(ctx, handler)
			require.Equal(t, test.code, connect.CodeOf(err))
			require.Empty(t, logs.FilterLevelExact(zap.ErrorLevel).All())
			require.Len(t, logs.FilterLevelExact(zap.WarnLevel).All(), 1)
		})
	}
}

// Only a store that cannot answer at all is logged at Error, once.
func TestPlanRequestsLogAStoreFailureAtError(t *testing.T) {
	t.Parallel()

	for _, request := range planRequests() {
		t.Run(request.name, func(t *testing.T) {
			t.Parallel()
			ctx, handler, logs := planLibraryOf(t, errStoreUnavailable)

			err := request.call(ctx, handler)
			require.Equal(t, connect.CodeInternal, connect.CodeOf(err))
			require.Empty(t, logs.FilterLevelExact(zap.WarnLevel).All())
			require.Len(t, logs.FilterLevelExact(zap.ErrorLevel).All(), 1)
		})
	}
}
