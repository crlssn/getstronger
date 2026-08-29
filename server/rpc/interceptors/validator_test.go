package interceptors

import (
	"context"
	"strings"
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

// bcrypt refuses a password longer than 72 bytes, so the schema bounds one
// before a handler can hand it over and answer with an internal error.
func TestValidatorRejectsAPasswordBcryptCannotHash(t *testing.T) {
	t.Parallel()
	validator, err := protovalidate.New()
	require.NoError(t, err)

	// 72 accented characters are 144 bytes: the bound counts bytes, as bcrypt
	// does, so a character count would let this one through.
	tooLong := strings.Repeat("é", 72)
	require.Len(t, []byte(tooLong), 144)

	for name, req := range map[string]connect.AnyRequest{
		"signup": connect.NewRequest(&apiv1.SignupRequest{
			Email:    "athlete@example.com",
			Password: tooLong,
			Name:     "Athlete",
			Username: "athlete",
		}),
		"update password": connect.NewRequest(&apiv1.UpdatePasswordRequest{
			Token:    uuid.NewString(),
			Password: tooLong,
		}),
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			reached := false
			next := func(_ context.Context, _ connect.AnyRequest) (connect.AnyResponse, error) {
				reached = true
				return connect.NewResponse(&apiv1.SignupResponse{}), nil
			}
			interceptor := newValidator(zap.NewNop(), validator)

			_, err := interceptor.WrapUnary(next)(context.Background(), req)
			require.Equal(t, connect.CodeInvalidArgument, connect.CodeOf(err))
			require.False(t, reached)
		})
	}
}

// The longest password bcrypt does hash still reaches the handler.
func TestValidatorAllowsAPasswordOfSeventyTwoBytes(t *testing.T) {
	t.Parallel()
	validator, err := protovalidate.New()
	require.NoError(t, err)

	called := false
	next := func(_ context.Context, _ connect.AnyRequest) (connect.AnyResponse, error) {
		called = true
		return connect.NewResponse(&apiv1.SignupResponse{}), nil
	}
	interceptor := newValidator(zap.NewNop(), validator)

	_, err = interceptor.WrapUnary(next)(context.Background(), connect.NewRequest(&apiv1.SignupRequest{
		Email:    "athlete@example.com",
		Password: strings.Repeat("a", 72),
		Name:     "Athlete",
		Username: "athlete",
	}))

	require.NoError(t, err)
	require.True(t, called)
}
