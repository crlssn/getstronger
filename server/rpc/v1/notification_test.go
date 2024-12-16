package v1

import (
	"context"
	"log"
	"testing"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/suite"
	"go.uber.org/zap"

	v1 "github.com/crlssn/getstronger/server/pkg/proto/api/v1"
	"github.com/crlssn/getstronger/server/pkg/proto/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/pkg/repo"
	"github.com/crlssn/getstronger/server/pkg/test/testdb"
	"github.com/crlssn/getstronger/server/pkg/xcontext"
)

type notificationSuite struct {
	suite.Suite

	handler apiv1connect.NotificationServiceHandler

	testFactory   *testdb.Factory
	testContainer *testdb.Container
}

func TestNotificationSuite(t *testing.T) {
	t.Parallel()
	suite.Run(t, new(notificationSuite))
}

func (s *notificationSuite) SetupSuite() {
	ctx := context.Background()
	s.testContainer = testdb.NewContainer(ctx)
	s.testFactory = testdb.NewFactory(s.testContainer.DB)
	s.handler = NewNotificationHandler(repo.New(s.testContainer.DB), nil)

	s.T().Cleanup(func() {
		if err := s.testContainer.Terminate(ctx); err != nil {
			log.Fatalf("failed to clean container: %s", err)
		}
	})
}

func (s *notificationSuite) TestListNotifications() {
	type expected struct {
		err error
		res *connect.Response[v1.ListNotificationsResponse]
	}

	type test struct {
		name     string
		req      *connect.Request[v1.ListNotificationsRequest]
		expected expected
	}

	tests := []test{
		{
			name: "ok_empty_response",
			req: &connect.Request[v1.ListNotificationsRequest]{
				Msg: &v1.ListNotificationsRequest{
					Pagination: &v1.PaginationRequest{
						PageLimit: 100,
						PageToken: nil,
					},
				},
			},
			expected: expected{
				err: nil,
				res: &connect.Response[v1.ListNotificationsResponse]{
					Msg: &v1.ListNotificationsResponse{
						Notifications: nil,
						Pagination:    nil,
					},
				},
			},
		},
	}

	user := s.testFactory.NewUser()
	ctx := xcontext.WithUserID(context.Background(), user.ID)
	ctx = xcontext.WithLogger(ctx, zap.NewExample())

	for _, t := range tests {
		res, err := s.handler.ListNotifications(ctx, t.req)
		if t.expected.err != nil {
			s.Require().Nil(res)
			s.Require().Error(err)
			s.Require().ErrorIs(err, t.expected.err)
			return
		}

		s.Require().NoError(err)
		s.Require().NotNil(res)
		s.Equal(t.expected.res.Msg.GetPagination().GetNextPageToken(), res.Msg.GetPagination().GetNextPageToken())
		s.Len(t.expected.res.Msg.GetNotifications(), len(res.Msg.GetNotifications()))
		for i, n := range res.Msg.GetNotifications() {
			s.Equal(t.expected.res.Msg.GetNotifications()[i].GetId(), n.GetId())
			s.Equal(t.expected.res.Msg.GetNotifications()[i].GetId(), n.GetType())
			s.Equal(t.expected.res.Msg.GetNotifications()[i].GetWorkoutComment(), n.GetWorkoutComment())
			s.Equal(t.expected.res.Msg.GetNotifications()[i].GetUserFollowed(), n.GetUserFollowed())
		}
	}
}
