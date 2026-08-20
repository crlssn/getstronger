package pubsub_test

import (
	"context"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/suite"
	"go.uber.org/mock/gomock"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/pubsub"
	"github.com/crlssn/getstronger/server/pubsub/handlers"
	"github.com/crlssn/getstronger/server/pubsub/payloads"
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
		Log:  zap.NewExample(),
		Repo: repo.New(c.DB),
	})

	s.mocks.controller = gomock.NewController(s.T())
	s.mocks.handler = handlers.NewMockHandler(s.mocks.controller)

	s.pubSub.Subscribe(map[repo.EventTopic]handlers.Handler{
		repo.EventTopicFollowedUser: s.mocks.handler,
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
		topic   repo.EventTopic
		payload any
		init    func(test)
	}

	var wg sync.WaitGroup

	tests := []test{
		{
			name:  "ok_handler_found",
			topic: repo.EventTopicFollowedUser,
			payload: payloads.UserFollowed{
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
			topic: repo.EventTopicRequestTraced,
			payload: payloads.WorkoutCommentPosted{
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
