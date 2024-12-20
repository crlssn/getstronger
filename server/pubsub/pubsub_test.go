package pubsub_test

import (
	"context"
	"time"

	"github.com/lib/pq"
	"github.com/stretchr/testify/suite"
	"go.uber.org/mock/gomock"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/gen/orm"
	"github.com/crlssn/getstronger/server/pubsub"
	"github.com/crlssn/getstronger/server/pubsub/handlers"
	"github.com/crlssn/getstronger/server/pubsub/handlers/mocks"
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
		if err := c.Terminate(ctx); err != nil {
			s.T().Fatalf("failed to clean container: %s", err)
		}
	})
}
