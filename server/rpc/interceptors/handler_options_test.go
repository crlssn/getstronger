package interceptors

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/require"

	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
)

const createWorkoutProcedure = "/api.v1.WorkoutService/CreateWorkout"

// passThrough stands in for the three interceptors the module wires and records
// whether the chain ran, which is what the cap has to pre-empt: a body is read
// and unmarshalled before the first interceptor sees the request.
type passThrough struct{ reached atomic.Bool }

func (p *passThrough) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, request connect.AnyRequest) (connect.AnyResponse, error) {
		p.reached.Store(true)
		return next(ctx, request)
	}
}

func (p *passThrough) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return next
}

func (p *passThrough) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return next
}

func TestHandlerOptionsCapWhatAHandlerReads(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name      string
		recording int
		sendGzip  bool
		code      connect.Code
	}{
		{"a recording within the cap is served", 1 << 20, false, 0},
		{"a body past the cap is refused", handlerReadMaxBytes, false, connect.CodeResourceExhausted},
		{"a small body that expands past the cap is refused", handlerReadMaxBytes, true, connect.CodeResourceExhausted},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			var (
				chain     passThrough
				served    atomic.Bool
				wireBytes atomic.Int64
			)
			handler := connect.NewUnaryHandler(createWorkoutProcedure,
				func(context.Context, *connect.Request[apiv1.CreateWorkoutRequest]) (*connect.Response[apiv1.CreateWorkoutResponse], error) {
					served.Store(true)
					return connect.NewResponse(&apiv1.CreateWorkoutResponse{}), nil
				},
				provideHandlerOptions(&chain, &chain, &chain)...,
			)
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				wireBytes.Store(r.ContentLength)
				handler.ServeHTTP(w, r)
			}))
			t.Cleanup(server.Close)

			var options []connect.ClientOption
			if tc.sendGzip {
				options = append(options, connect.WithSendGzip())
			}
			client := connect.NewClient[apiv1.CreateWorkoutRequest, apiv1.CreateWorkoutResponse](
				server.Client(), server.URL+createWorkoutProcedure, options...,
			)
			_, err := client.CallUnary(t.Context(), connect.NewRequest(&apiv1.CreateWorkoutRequest{
				RecordingJson: strings.Repeat("a", tc.recording),
			}))

			if tc.code == 0 {
				require.NoError(t, err)
				require.True(t, chain.reached.Load())
				require.True(t, served.Load())
				return
			}
			require.Equal(t, tc.code, connect.CodeOf(err))
			require.False(t, chain.reached.Load(), "the cap refuses a body before an interceptor can")
			require.False(t, served.Load())
			if tc.sendGzip {
				require.Less(t, wireBytes.Load(), int64(handlerReadMaxBytes/100),
					"a body this small is what the amplification costs an attacker")
			}
		})
	}
}
