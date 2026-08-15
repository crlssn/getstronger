package stream_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/stream"
)

func TestManagerNotify(t *testing.T) {
	t.Parallel()

	m := stream.NewManager()
	updates1, unsubscribe1 := m.Subscribe("1", func() {})
	updates2, unsubscribe2 := m.Subscribe("1", func() {})
	otherUpdates, unsubscribeOther := m.Subscribe("2", func() {})
	t.Cleanup(unsubscribe1)
	t.Cleanup(unsubscribe2)
	t.Cleanup(unsubscribeOther)

	m.Notify("1")
	m.Notify("1")

	requireSignal(t, updates1)
	requireSignal(t, updates2)
	requireNoSignal(t, otherUpdates)
	requireNoSignal(t, updates1)
}

func TestManagerUnsubscribe(t *testing.T) {
	t.Parallel()

	m := stream.NewManager()
	updates, unsubscribe := m.Subscribe("1", func() {})
	unsubscribe()
	unsubscribe()

	m.Notify("1")
	requireNoSignal(t, updates)
}

func TestManagerCancel(t *testing.T) {
	t.Parallel()

	m := stream.NewManager()
	ctx1, cancel1 := context.WithCancel(context.Background())
	ctx2, cancel2 := context.WithCancel(context.Background())
	_, unsubscribe1 := m.Subscribe("1", cancel1)
	_, unsubscribe2 := m.Subscribe("1", cancel2)
	t.Cleanup(unsubscribe1)
	t.Cleanup(unsubscribe2)

	m.Cancel()

	require.ErrorIs(t, ctx1.Err(), context.Canceled)
	require.ErrorIs(t, ctx2.Err(), context.Canceled)
}

func requireSignal(t *testing.T, updates <-chan struct{}) {
	t.Helper()

	select {
	case <-updates:
	default:
		t.Fatal("expected update signal")
	}
}

func requireNoSignal(t *testing.T, updates <-chan struct{}) {
	t.Helper()

	select {
	case <-updates:
		t.Fatal("unexpected update signal")
	default:
	}
}
