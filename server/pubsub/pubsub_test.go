package pubsub_test

import (
	"context"
	"time"

	"github.com/lib/pq"
	"github.com/stretchr/testify/suite"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/gen/orm"
	"github.com/crlssn/getstronger/server/pubsub"
	"github.com/crlssn/getstronger/server/pubsub/handlers"
	"github.com/crlssn/getstronger/server/testing/container"
)

type pubSubSuite struct {
	suite.Suite

	pubSub *pubsub.PubSub
}

func (s *pubSubSuite) SetupSuite() {
	ctx := context.Background()
	c := container.NewContainer(ctx)

	s.pubSub = pubsub.New(pubsub.Params{
		DB:       c.DB,
		Log:      zap.NewExample(),
		Listener: pq.NewListener(c.Connection, time.Second, time.Minute, nil),
	})

	s.pubSub.Subscribe(map[orm.EventTopic]handlers.Handler{
		orm.EventTopicFollowedUser:  handlers.NewFollowedUser(),
		orm.EventTopicRequestTraced: handlers.NewRequestTraced(),
	})

	s.T().Cleanup(func() {
		if err := c.Terminate(ctx); err != nil {
			s.T().Fatalf("failed to clean container: %s", err)
		}
	})
}
