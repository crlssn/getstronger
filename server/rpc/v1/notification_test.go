package v1

import (
	"context"
	"log"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/brianvoe/gofakeit/v7"
	"github.com/google/uuid"
	"github.com/stretchr/testify/suite"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/pkg/orm"
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
		init     func(test test, userID string)
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
			init: func(_ test, _ string) {},
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
		{
			name: "ok_workout_comment",
			req: &connect.Request[v1.ListNotificationsRequest]{
				Msg: &v1.ListNotificationsRequest{
					Pagination: &v1.PaginationRequest{
						PageLimit: 100,
						PageToken: nil,
					},
				},
			},
			init: func(test test, userID string) {
				for _, n := range test.expected.res.Msg.GetNotifications() {
					workout := s.testFactory.NewWorkout(
						testdb.WorkoutID(n.GetWorkoutComment().GetWorkout().GetId()),
						testdb.WorkoutName(n.GetWorkoutComment().GetWorkout().GetName()),
						testdb.WorkoutUserID(s.testFactory.NewUser(
							testdb.UserID(n.GetWorkoutComment().GetWorkout().GetUser().GetId()),
							testdb.UserLastName(n.GetWorkoutComment().GetWorkout().GetUser().GetLastName()),
							testdb.UserFirstName(n.GetWorkoutComment().GetWorkout().GetUser().GetFirstName()),
						).ID),
					)
					comment := s.testFactory.NewWorkoutComment(
						testdb.WorkoutCommentUserID(s.testFactory.NewUser(
							testdb.UserID(n.GetWorkoutComment().GetActor().GetId()),
							testdb.UserLastName(n.GetWorkoutComment().GetActor().GetLastName()),
							testdb.UserFirstName(n.GetWorkoutComment().GetActor().GetFirstName()),
						).ID),
						testdb.WorkoutCommentWorkoutID(workout.ID),
					)
					s.testFactory.NewNotification(
						testdb.NotificationID(n.GetId()),
						testdb.NotificationType(orm.NotificationTypeWorkoutComment),
						testdb.NotificationUserID(userID),
						testdb.NotificationCreatedAt(time.Unix(n.GetNotifiedAtUnix(), 0)),
						testdb.NotificationPayload(repo.NotificationPayload{
							ActorID:   comment.UserID,
							WorkoutID: workout.ID,
						}),
					)
				}
			},
			expected: expected{
				err: nil,
				res: &connect.Response[v1.ListNotificationsResponse]{
					Msg: &v1.ListNotificationsResponse{
						Notifications: []*v1.Notification{
							{
								Id:             uuid.NewString(),
								NotifiedAtUnix: time.Now().UTC().Unix(),
								Type: &v1.Notification_WorkoutComment_{
									WorkoutComment: &v1.Notification_WorkoutComment{
										Actor: &v1.User{
											Id:        uuid.NewString(),
											FirstName: gofakeit.FirstName(),
											LastName:  gofakeit.LastName(),
										},
										Workout: &v1.Workout{
											Id:   uuid.NewString(),
											Name: gofakeit.Name(),
											User: &v1.User{
												Id:        uuid.NewString(),
												FirstName: gofakeit.FirstName(),
												LastName:  gofakeit.LastName(),
											},
										},
									},
								},
							},
						},
					},
				},
			},
		},
		//{
		//	name: "ok_user_followed",
		//	req: &connect.Request[v1.ListNotificationsRequest]{
		//		Msg: &v1.ListNotificationsRequest{
		//			Pagination: &v1.PaginationRequest{
		//				PageLimit: 100,
		//				PageToken: nil,
		//			},
		//		},
		//	},
		//	init: func(test test) {
		//		for _, n := range test.expected.res.Msg.GetNotifications() {
		//			s.testFactory.NewNotification(
		//				testdb.NotificationID(n.GetId()),
		//				testdb.NotificationType(orm.NotificationTypeFollow),
		//				testdb.NotificationCreatedAt(time.Unix(n.GetNotifiedAtUnix(), 0)),
		//				testdb.NotificationUserID(user.ID),
		//				testdb.NotificationPayload(repo.NotificationPayload{
		//					ActorID: s.testFactory.NewUser(
		//						testdb.UserID(n.GetUserFollowed().GetActor().GetId()),
		//						testdb.UserLastName(n.GetUserFollowed().GetActor().GetLastName()),
		//						testdb.UserFirstName(n.GetUserFollowed().GetActor().GetFirstName()),
		//					).ID,
		//				}),
		//			)
		//		}
		//	},
		//	expected: expected{
		//		err: nil,
		//		res: &connect.Response[v1.ListNotificationsResponse]{
		//			Msg: &v1.ListNotificationsResponse{
		//				Notifications: []*v1.Notification{
		//					{
		//						Id:             uuid.NewString(),
		//						NotifiedAtUnix: time.Now().UTC().Unix(),
		//						Type: &v1.Notification_UserFollowed_{
		//							UserFollowed: &v1.Notification_UserFollowed{
		//								Actor: &v1.User{
		//									Id:        uuid.NewString(),
		//									FirstName: gofakeit.FirstName(),
		//									LastName:  gofakeit.LastName(),
		//								},
		//							},
		//						},
		//					},
		//				},
		//			},
		//		},
		//	},
		//},
	}

	for _, t := range tests {
		user := s.testFactory.NewUser()
		ctx := xcontext.WithUserID(context.Background(), user.ID)
		ctx = xcontext.WithLogger(ctx, zap.NewExample())

		t.init(t, user.ID)
		res, err := s.handler.ListNotifications(ctx, t.req)
		if t.expected.err != nil {
			s.Require().Nil(res)
			s.Require().Error(err)
			s.Require().ErrorIs(err, t.expected.err)
			return
		}

		s.Require().NotNil(res)
		s.Require().NoError(err)
		s.Require().Len(t.expected.res.Msg.GetNotifications(), len(res.Msg.GetNotifications()))
		s.Require().Equal(t.expected.res.Msg.GetPagination().GetNextPageToken(), res.Msg.GetPagination().GetNextPageToken())

		for i, actualNotification := range res.Msg.GetNotifications() {
			expectedNotification := t.expected.res.Msg.GetNotifications()[i]

			s.Require().Equal(expectedNotification.GetId(), actualNotification.GetId())
			s.Require().Equal(expectedNotification.GetNotifiedAtUnix(), actualNotification.GetNotifiedAtUnix())

			expectedActor := expectedNotification.GetUserFollowed().GetActor()
			actualActor := actualNotification.GetUserFollowed().GetActor()

			s.Require().Equal(expectedActor.GetId(), actualActor.GetId())
			s.Require().Equal(expectedActor.GetLastName(), actualActor.GetLastName())
			s.Require().Equal(expectedActor.GetFirstName(), actualActor.GetFirstName())

			expectedComment := expectedNotification.GetWorkoutComment()
			actualComment := actualNotification.GetWorkoutComment()

			s.Require().Equal(expectedComment.GetActor().GetId(), actualComment.GetActor().GetId())
			s.Require().Equal(expectedComment.GetActor().GetLastName(), actualComment.GetActor().GetLastName())
			s.Require().Equal(expectedComment.GetActor().GetFirstName(), actualComment.GetActor().GetFirstName())

			s.Require().Equal(expectedComment.GetWorkout().GetId(), actualComment.GetWorkout().GetId())
			s.Require().Equal(expectedComment.GetWorkout().GetName(), actualComment.GetWorkout().GetName())
			s.Require().Equal(expectedComment.GetWorkout().GetUser().GetId(), actualComment.GetWorkout().GetUser().GetId())
			s.Require().Equal(expectedComment.GetWorkout().GetUser().GetLastName(), actualComment.GetWorkout().GetUser().GetLastName())
			s.Require().Equal(expectedComment.GetWorkout().GetUser().GetFirstName(), actualComment.GetWorkout().GetUser().GetFirstName())
		}
	}
}
