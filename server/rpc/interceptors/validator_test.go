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

func TestValidatorRejectsAnInvalidRequest(t *testing.T) {
	validator, err := protovalidate.New()
	require.NoError(t, err)

	reached := false
	next := func(_ context.Context, _ connect.AnyRequest) (connect.AnyResponse, error) {
		reached = true
		return connect.NewResponse(&apiv1.CreateWorkoutResponse{}), nil
	}
	interceptor := newValidator(zap.NewNop(), validator)

	// An empty request fails the field constraints the schema carries.
	_, err = interceptor.WrapUnary(next)(context.Background(),
		connect.NewRequest(&apiv1.CreateWorkoutRequest{}))
	require.Equal(t, connect.CodeInvalidArgument, connect.CodeOf(err))
	require.False(t, reached)
}

// Neither streaming wrapper validates: the API is unary, so both hand the call
// straight on. The test pins that they do rather than swallowing it.
func TestValidatorPassesStreamingThrough(t *testing.T) {
	validator, err := protovalidate.New()
	require.NoError(t, err)
	interceptor := newValidator(zap.NewNop(), validator)

	clientCalled := false
	client := interceptor.WrapStreamingClient(func(_ context.Context, _ connect.Spec) connect.StreamingClientConn {
		clientCalled = true
		return nil
	})
	require.Nil(t, client(context.Background(), connect.Spec{}))
	require.True(t, clientCalled)

	handlerCalled := false
	handler := interceptor.WrapStreamingHandler(func(_ context.Context, _ connect.StreamingHandlerConn) error {
		handlerCalled = true
		return nil
	})
	require.NoError(t, handler(context.Background(), nil))
	require.True(t, handlerCalled)
}

// Connect only ever hands the interceptor proto messages, so anything else is a
// wiring fault: it is refused rather than passed on unvalidated.
func TestValidatorRefusesANonProtoRequest(t *testing.T) {
	t.Parallel()
	validator, err := protovalidate.New()
	require.NoError(t, err)

	reached := false
	next := func(_ context.Context, _ connect.AnyRequest) (connect.AnyResponse, error) {
		reached = true
		return connect.NewResponse(&apiv1.CreateWorkoutResponse{}), nil
	}
	interceptor := newValidator(zap.NewNop(), validator)

	type notAMessage struct{}
	_, err = interceptor.WrapUnary(next)(context.Background(), connect.NewRequest(&notAMessage{}))
	require.Equal(t, connect.CodeInvalidArgument, connect.CodeOf(err))
	require.ErrorIs(t, err, errRequestMessageNotProtoMessage)
	require.False(t, reached)
}
