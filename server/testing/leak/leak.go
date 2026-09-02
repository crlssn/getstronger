// Package leak asserts that a piece of code parked no goroutine forever.
//
// Go's goroutine leak profile reports the goroutines blocked on a channel,
// mutex or condition variable that no runnable goroutine can still reach.
// The profile covers the whole process, so the assertions here name the
// frames they care about rather than demanding an empty profile: a test
// binary is full of pools and servers that other tests still own.
package leak

import (
	"bytes"
	"fmt"
	"runtime/pprof"
	"strings"
	"testing"
)

// None fails tb when a leaked goroutine is parked in any of frames, each the
// name of a function as a stack trace spells it — "pubsub.(*PubSub).run".
func None(tb testing.TB, frames ...string) {
	tb.Helper()

	p, err := profile()
	if err != nil {
		tb.Fatalf("Write goroutine leak profile: %s", err)
	}

	for _, frame := range frames {
		if strings.Contains(p, frame) {
			tb.Errorf("Goroutine leaked in %s:\n%s", frame, p)
		}
	}
}

// profile returns the goroutine leak profile in its readable form. Writing it
// is what runs the leak-detection garbage collection cycle, so this is the only
// way to a verdict that covers goroutines which parked a moment ago; the
// profile's Count reports whatever the previous cycle found.
func profile() (string, error) {
	var buf bytes.Buffer
	if err := pprof.Lookup("goroutineleak").WriteTo(&buf, 1); err != nil {
		return "", fmt.Errorf("write goroutine leak profile: %w", err)
	}

	return buf.String(), nil
}
