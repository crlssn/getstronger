package pubsub_test

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
	"go.uber.org/mock/gomock"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/pubsub"
	"github.com/crlssn/getstronger/server/pubsub/events"
	"github.com/crlssn/getstronger/server/pubsub/handlers"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/testing/container"
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
				FollowerID: uuid.NewString(),
				FolloweeID: uuid.NewString(),
				EventID:    uuid.NewString(),
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
				CommentID: uuid.NewString(),
				EventID:   uuid.NewString(),
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

	t.Run("store_failure_is_swallowed", func(t *testing.T) {
		t.Parallel()
		ps := pubsub.New(pubsub.Params{
			Log:   zap.NewExample(),
			Store: &stubStore{err: errStorePublish},
		})

		require.NotPanics(t, func() {
			ps.Publish(context.Background(), events.TopicFollowedUser, events.UserFollowed{
				EventID: uuid.NewString(),
			})
		})
	})

	// With nothing draining the channel, the buffer fills and further events are
	// dropped from dispatch — but every one of them is still persisted.
	t.Run("a_full_buffer_drops_dispatch_not_the_event", func(t *testing.T) {
		t.Parallel()
		store := new(stubStore)
		ps := pubsub.New(pubsub.Params{Log: zap.NewExample(), Store: store})

		const overflow = 1100
		for range overflow {
			ps.Publish(context.Background(), events.TopicFollowedUser, events.UserFollowed{
				EventID: uuid.NewString(),
			})
		}

		require.Equal(t, int64(overflow), store.published.Load())
	})
}
