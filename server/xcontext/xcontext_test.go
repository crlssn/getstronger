package xcontext_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/xcontext"
)

// The interceptor puts both on every request it serves, so a handler reading
// one that is not there is a wiring fault: it panics rather than carrying on
// with a nil logger or an empty user.
func TestMustExtractPanicsOnAnUnpreparedContext(t *testing.T) {
	t.Parallel()

	require.Panics(t, func() { xcontext.MustExtractLogger(context.Background()) })
	require.Panics(t, func() { xcontext.MustExtractUserID(context.Background()) })
}

func TestContextCarriesWhatWasPutOnIt(t *testing.T) {
	t.Parallel()

	logger := zap.NewExample()
	ctx := xcontext.WithLogger(context.Background(), logger)
	ctx = xcontext.WithUserID(ctx, "user-id")
	ctx = xcontext.WithRefreshToken(ctx, "refresh-token")

	require.Same(t, logger, xcontext.MustExtractLogger(ctx))
	require.Equal(t, "user-id", xcontext.MustExtractUserID(ctx))

	userID, ok := xcontext.ExtractUserID(ctx)
	require.True(t, ok)
	require.Equal(t, "user-id", userID)

	token, ok := xcontext.ExtractRefreshToken(ctx)
	require.True(t, ok)
	require.Equal(t, "refresh-token", token)

	_, ok = xcontext.ExtractRefreshToken(context.Background())
	require.False(t, ok)
}
