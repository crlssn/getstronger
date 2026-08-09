package interceptors

import (
	"context"
	"testing"

	"buf.build/go/protovalidate"
	"connectrpc.com/connect"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	"google.golang.org/protobuf/types/known/timestamppb"

	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
)

func TestValidatorAllowsQuickWorkoutWithoutRoutine(t *testing.T) {
	validator, err := protovalidate.New()
	require.NoError(t, err)

	called := false
	next := func(_ context.Context, _ connect.AnyRequest) (connect.AnyResponse, error) {
		called = true
		return connect.NewResponse(&apiv1.CreateWorkoutResponse{}), nil
	}
	interceptor := newValidator(zap.NewNop(), validator)

	_, err = interceptor.WrapUnary(next)(context.Background(), connect.NewRequest(&apiv1.CreateWorkoutRequest{
		WorkoutName: "Quick Workout",
		ExerciseSets: []*apiv1.ExerciseSets{{
			Exercise: &apiv1.Exercise{Id: uuid.NewString()},
			Sets:     []*apiv1.Set{{Reps: 10}},
		}},
		StartedAt:  timestamppb.Now(),
		FinishedAt: timestamppb.Now(),
	}))

	require.NoError(t, err)
	require.True(t, called)
}
