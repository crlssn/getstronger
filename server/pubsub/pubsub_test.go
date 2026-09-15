package pubsub_test

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/gofrs/uuid/v5"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
	"go.uber.org/mock/gomock"
	"go.uber.org/zap"
	"go.uber.org/zap/zaptest/observer"

	"github.com/crlssn/getstronger/server/pubsub"
	"github.com/crlssn/getstronger/server/pubsub/events"
	"github.com/crlssn/getstronger/server/pubsub/handlers"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/testing/container"
	"github.com/crlssn/getstronger/server/testing/leak"
)

type pubSubSuite struct {
	suite.Suite

	pubSub *pubsub.PubSub

	mocks struct {
		handler    *handlers.MockHandler
		controller *gomock.Controller
	}
}

func TestPubSubSuite(t *testing.T) {
	t.Parallel()
	suite.Run(t, new(pubSubSuite))
}

func (s *pubSubSuite) SetupSuite() {
	ctx := context.Background()
	c := container.NewContainer(ctx)

	s.pubSub = pubsub.New(pubsub.Params{
		Log:   zap.NewExample(),
		Store: repo.New(c.DB),
	})

	s.mocks.controller = gomock.NewController(s.T())
	s.mocks.handler = handlers.NewMockHandler(s.mocks.controller)

	s.pubSub.Subscribe(map[events.Topic]handlers.Handler{
		events.TopicFollowedUser: s.mocks.handler,
	})

	s.T().Cleanup(func() {
		s.pubSub.Stop()
		s.mocks.controller.Finish()
		if err := c.Terminate(ctx); err != nil {
			s.T().Fatalf("Clean container: %s", err)
		}
	})
}

func (s *pubSubSuite) TestPublish() {
	type test struct {
		name    string
		topic   events.Topic
		payload any
		init    func(test)
	}

	var wg sync.WaitGroup

	tests := []test{
		{
			name:  "ok_handler_found",
			topic: events.TopicFollowedUser,
			payload: events.UserFollowed{
				FollowerID: uuid.Must(uuid.NewV4()),
				FolloweeID: uuid.Must(uuid.NewV4()),
				EventID:    uuid.Must(uuid.NewV4()),
			},
			init: func(t test) {
				wg.Add(1)
				s.mocks.handler.EXPECT().HandlePayload(t.payload).Do(func(_ any) {
					wg.Done()
				})
			},
		},
		{
			name:  "ok_handler_not_found",
			topic: events.TopicRequestTraced,
			payload: events.WorkoutCommentPosted{
				CommentID: uuid.Must(uuid.NewV4()),
				EventID:   uuid.Must(uuid.NewV4()),
			},
			init: func(t test) {
				s.mocks.handler.EXPECT().HandlePayload(t.payload).Times(0)
			},
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			t.init(t)
			s.pubSub.Publish(context.Background(), t.topic, t.payload)
			wg.Wait()
		})
	}
}

// stubStore records what was published without a database behind it.
type stubStore struct {
	err       error
	published atomic.Int64
}

func (s *stubStore) PublishEvent(context.Context, events.Topic, []byte) error {
	if s.err != nil {
		return s.err
	}
	s.published.Add(1)

	return nil
}

var errStorePublish = errors.New("store unavailable")

// Nothing a publisher does on the request path is allowed to fail the request,
// so each of the three ways a publish can go wrong is a log and a return.
func TestPublishNeverFailsTheCaller(t *testing.T) {
	t.Parallel()

	t.Run("unmarshalable_payload_is_not_stored", func(t *testing.T) {
		t.Parallel()
		store := new(stubStore)
		ps := pubsub.New(pubsub.Params{Log: zap.NewExample(), Store: store})

		// A channel has no JSON representation.
		ps.Publish(context.Background(), events.TopicFollowedUser, make(chan int))
		require.Zero(t, store.published.Load())
	})

	t.Run("store_failure_is_swallowed_and_logged_once", func(t *testing.T) {
		t.Parallel()
		core, logs := observer.New(zap.DebugLevel)
		ps := pubsub.New(pubsub.Params{
			Log:   zap.New(core),
			Store: &stubStore{err: errStorePublish},
		})

		require.NotPanics(t, func() {
			ps.Publish(context.Background(), events.TopicFollowedUser, events.UserFollowed{
				EventID: uuid.Must(uuid.NewV4()),
			})
		})
		require.Len(t, logs.FilterMessage("Persist event").FilterLevelExact(zap.ErrorLevel).All(), 1)
	})

	// With nothing draining the channel, the buffer fills and further events are
	// dropped from dispatch — but every one of them is still persisted, so the
	// drop is an expected anomaly, stated as a warning rather than an error.
	t.Run("a_full_buffer_drops_dispatch_not_the_event", func(t *testing.T) {
		t.Parallel()
		store := new(stubStore)
		core, logs := observer.New(zap.DebugLevel)
		ps := pubsub.New(pubsub.Params{Log: zap.New(core), Store: store})

		const overflow = 1100
		for range overflow {
			ps.Publish(context.Background(), events.TopicFollowedUser, events.UserFollowed{
				EventID: uuid.Must(uuid.NewV4()),
			})
		}

		require.Equal(t, int64(overflow), store.published.Load())
		require.Empty(t, logs.FilterLevelExact(zap.ErrorLevel).All())
		require.NotEmpty(t, logs.FilterMessage("Event buffer full: dropping event").FilterLevelExact(zap.WarnLevel).All())
	})
}

// The trace middleware publishes from a defer holding the request's own
// context, so a client that hangs up mid-request cancels the persist. That is
// not a failure anyone needs to act on, and it must not be logged as one.
func TestPublishDoesNotLogCancellationAsAnError(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		err  error
	}{
		{name: "cancelled", err: fmt.Errorf("publish event: %w", context.Canceled)},
		{name: "deadline_exceeded", err: fmt.Errorf("publish event: %w", context.DeadlineExceeded)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			core, logs := observer.New(zap.DebugLevel)
			store := &stubStore{err: tt.err}
			ps := pubsub.New(pubsub.Params{Log: zap.New(core), Store: store})

			ps.Publish(context.Background(), events.TopicFollowedUser, events.UserFollowed{
				EventID: uuid.Must(uuid.NewV4()),
			})

			require.Empty(t, logs.FilterLevelExact(zap.ErrorLevel).All())
			require.Empty(t, logs.FilterLevelExact(zap.WarnLevel).All())
			require.Len(t, logs.FilterMessage("Persist event cancelled").FilterLevelExact(zap.DebugLevel).All(), 1)
		})
	}
}

// handlerFunc adapts a plain function to handlers.Handler.
type handlerFunc func(payload any)

func (f handlerFunc) HandlePayload(payload any) { f(payload) }

// stopAfterOneEvent runs a PubSub through a whole life and drops every
// reference to it. The workers park on a channel nobody else holds, so a Stop
// that ever stopped draining leaves them unreachable and blocked — which is
// what the goroutine leak profile reports. Keeping the PubSub in the test's
// own frame would defeat that: a channel the test can still reach is a channel
// the detector assumes something might still send on.
func stopAfterOneEvent() {
	handled := make(chan struct{})

	ps := pubsub.New(pubsub.Params{Log: zap.NewExample(), Store: new(stubStore)})
	ps.Subscribe(map[events.Topic]handlers.Handler{
		events.TopicFollowedUser: handlerFunc(func(any) { close(handled) }),
	})

	ps.Publish(context.Background(), events.TopicFollowedUser, events.UserFollowed{
		EventID: uuid.Must(uuid.NewV4()),
	})

	<-handled
	ps.Stop()
}

func TestStopLeavesNoWorkerBehind(t *testing.T) {
	t.Parallel()

	stopAfterOneEvent()
	leak.None(t, "pubsub.(*PubSub).startWorker")
}
