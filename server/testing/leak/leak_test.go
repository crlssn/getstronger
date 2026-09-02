package leak

import (
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// A guard nobody has seen fail is a guard that might be spelling a frame name
// wrong. Park a goroutine on a channel this package then drops and check the
// profile names it, so the callers of None can trust an empty result.
func TestProfileNamesALeakedGoroutine(t *testing.T) {
	t.Parallel()

	started := make(chan struct{})
	parkForever(started)
	<-started

	require.Contains(t, waitForLeak(t, leakedFrame), leakedFrame)
}

func TestNonePassesWhenNothingIsParked(t *testing.T) {
	t.Parallel()

	None(t, "leak.aFrameNothingRunsIn")
}

const leakedFrame = "leak.parkForever.func1"

// parkForever blocks a goroutine on a channel it drops on the way out, which
// is the shape the profile is built to notice. It closes started first so the
// caller can wait for the goroutine to exist rather than sleeping.
func parkForever(started chan<- struct{}) {
	forever := make(chan struct{})
	go func() {
		close(started)
		<-forever
	}()
}

// waitForLeak polls until the profile names frame. Having started is not
// enough: a goroutine counts as leaked only once it has reached its blocking
// receive, and until then it is merely runnable.
func waitForLeak(tb testing.TB, frame string) string {
	tb.Helper()

	const timeout = 10 * time.Second

	deadline := time.Now().Add(timeout)
	for {
		p, err := profile()
		require.NoError(tb, err)

		if strings.Contains(p, frame) {
			return p
		}

		if time.Now().After(deadline) {
			tb.Fatalf("Profile never named %s within %s:\n%s", frame, timeout, p)
		}

		runtime.Gosched()
	}
}
