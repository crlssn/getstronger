package v1

import (
	"context"
	"testing"

	"github.com/gofrs/uuid/v5"
	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/testing/container"
	"github.com/crlssn/getstronger/server/training"
)

// The handler answers every personal-bests failure the same way, so the wrap
// is checked where it happens rather than through a feed that cannot fail
// only there.
func TestPersonalBestsOfWrapsARefusedQuery(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	c := container.NewContainer(ctx)
	t.Cleanup(func() {
		require.NoError(t, c.Terminate(ctx))
	})

	handler := &feedHandler{repo: repo.New(c.DB)}
	cancelled, cancel := context.WithCancel(ctx)
	cancel()

	bests, err := handler.personalBestsOf(cancelled, []*training.Workout{
		{UserID: uuid.Must(uuid.NewV4())},
	})
	require.Nil(t, bests)
	require.ErrorIs(t, err, context.Canceled)
}
