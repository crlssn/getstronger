package repo_test

import (
	"context"
	"crypto/sha256"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/testing/container"
)

func TestAuthRateLimitAcrossInstances(t *testing.T) {
	t.Parallel()
	ctx := t.Context()
	c := container.NewContainer(ctx)
	t.Cleanup(func() { require.NoError(t, c.Terminate(context.Background())) })
	instances := []*repo.Repo{repo.New(c.DB), repo.New(c.DB)}
	key := fmt.Sprintf("%x", sha256.Sum256([]byte("account")))
	var admitted atomic.Int32
	var workers sync.WaitGroup
	for n := range 40 {
		workers.Go(func() {
			allowed, err := instances[n%2].ConsumeAuthAttempt(ctx, key, 7, time.Minute)
			if !assertNoError(t, err) {
				return
			}
			if allowed {
				admitted.Add(1)
			}
		})
	}
	workers.Wait()
	require.EqualValues(t, 7, admitted.Load())
	var before, after time.Time
	require.NoError(t, c.DB.QueryRowContext(ctx, "SELECT expires_at FROM auth_rate_limits WHERE key = $1", key).Scan(&before))
	allowed, err := instances[0].ConsumeAuthAttempt(ctx, key, 7, time.Minute)
	require.NoError(t, err)
	require.False(t, allowed)
	require.NoError(t, c.DB.QueryRowContext(ctx, "SELECT expires_at FROM auth_rate_limits WHERE key = $1", key).Scan(&after))
	require.Equal(t, before, after, "refusals must not prolong a lockout")
	_, err = c.DB.ExecContext(ctx, "UPDATE auth_rate_limits SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE key = $1", key)
	require.NoError(t, err)
	allowed, err = instances[1].ConsumeAuthAttempt(ctx, key, 7, time.Minute)
	require.NoError(t, err)
	require.True(t, allowed, "an expired counter must recover on any instance")

	_, err = c.DB.ExecContext(ctx, "INSERT INTO auth_rate_limits (key, attempts, expires_at) VALUES ('stale', 1, CURRENT_TIMESTAMP - INTERVAL '1 day')")
	require.NoError(t, err)
	_, err = instances[0].ConsumeAuthAttempt(ctx, key, 7, time.Minute)
	require.NoError(t, err)
	var count int
	require.NoError(t, c.DB.QueryRowContext(ctx, "SELECT count(*) FROM auth_rate_limits WHERE key = 'stale'").Scan(&count))
	require.Zero(t, count, "traffic reaps expired counters")
}

func assertNoError(t *testing.T, err error) bool {
	t.Helper()
	if err != nil {
		t.Errorf("consume auth attempt: %v", err)
		return false
	}
	return true
}
