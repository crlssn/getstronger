package pubsub_test

import (
	"context"
	"encoding/json"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/stretchr/testify/suite"
	"go.uber.org/mock/gomock"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/gen/orm"
	"github.com/crlssn/getstronger/server/pubsub"
	"github.com/crlssn/getstronger/server/pubsub/handlers"
	"github.com/crlssn/getstronger/server/pubsub/handlers/mocks"
	"github.com/crlssn/getstronger/server/pubsub/payloads"
	"github.com/crlssn/getstronger/server/testing/container"
)

type pubSubSuite struct {
	suite.Suite

	pubSub *pubsub.PubSub

	mocks struct {
		handler    *mock_handlers.MockHandler
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
		DB:       c.DB,
		Log:      zap.NewExample(),
		Listener: pq.NewListener(c.Connection, time.Second, time.Minute, nil),
	})

	s.mocks.controller = gomock.NewController(s.T())
	s.mocks.handler = mock_handlers.NewMockHandler(s.mocks.controller)

	err := s.pubSub.Subscribe(map[orm.EventTopic]handlers.Handler{
		orm.EventTopicFollowedUser:         s.mocks.handler,
		orm.EventTopicRequestTraced:        s.mocks.handler,
		orm.EventTopicWorkoutCommentPosted: s.mocks.handler,
	})
	s.Require().NoError(err)

	s.T().Cleanup(func() {
		s.mocks.controller.Finish()
		if err = c.Terminate(ctx); err != nil {
			s.T().Fatalf("failed to clean container: %s", err)
		}
	})
}

func (s *pubSubSuite) TestPublish() {
	payload := payloads.UserFollowed{
		FollowerID: uuid.NewString(),
		FolloweeID: uuid.NewString(),
	}

	marshal, err := json.Marshal(payload)
	s.Require().NoError(err)

	var wg sync.WaitGroup
	wg.Add(1)

	s.mocks.handler.EXPECT().HandlePayload(string(marshal)).Do(func(_ string) {
		wg.Done()
	})
	s.pubSub.Publish(orm.EventTopicFollowedUser, payload)

	wg.Wait()
}
