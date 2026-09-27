package v1

import (
	"context"
	"testing"

	"connectrpc.com/connect"
	"github.com/gofrs/uuid/v5"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/testing/container"
	"github.com/crlssn/getstronger/server/xcontext"
)

// A repeated create whose stored exercise cannot be read is a fault, not an id
// somebody else owns: answering AlreadyExists would have the queue drop it.
func TestCreatedExerciseFailsWhenTheStoredExerciseCannotBeRead(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	c := container.NewContainer(ctx)
	t.Cleanup(func() {
		require.NoError(t, c.Terminate(ctx))
	})

	handler := &exerciseHandler{repo: repo.New(c.DB)}
	cancelled, cancel := context.WithCancel(xcontext.WithLogger(ctx, zap.NewExample()))
	cancel()

	res, err := handler.createdExercise(cancelled, uuid.Must(uuid.NewV4()), uuid.Must(uuid.NewV4()))
	require.Nil(t, res)
	require.Equal(t, connect.CodeInternal, connect.CodeOf(err))
}
