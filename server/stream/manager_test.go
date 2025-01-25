package stream_test

import (
	"testing"

	"github.com/crlssn/getstronger/server/stream"
)

func TestManager(t *testing.T) {
	t.Parallel()

	var cancelled []bool
	f := func() {
		cancelled = append(cancelled, true)
	}

	m := stream.NewManager()
	m.Add("1", f)
	m.Add("2", f)
	m.Remove("1")
	m.Cancel()

	if len(cancelled) != 1 {
		t.Error("expected cancel func to be called once")
	}
}
