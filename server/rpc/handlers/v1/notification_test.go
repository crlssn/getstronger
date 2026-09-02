package v1_test

import (
	"context"
	"log"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/brianvoe/gofakeit/v7"
	gofrsuuid "github.com/gofrs/uuid/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/suite"
	"go.uber.org/zap"

	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/gen/proto/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/notification"
	"github.com/crlssn/getstronger/server/repo"
	handlers "github.com/crlssn/getstronger/server/rpc/handlers/v1"
	"github.com/crlssn/getstronger/server/testing/container"
	"github.com/crlssn/getstronger/server/testing/factory"
	"github.com/crlssn/getstronger/server/xcontext"
)

type notificationSuite struct {
	suite.Suite

	handler apiv1connect.NotificationServiceHandler

	testFactory   *factory.Factory
	testContainer *container.Container
}

func TestNotificationSuite(t *testing.T) {
	t.Parallel()
	suite.Run(t, new(notificationSuite))
}

func (s *notificationSuite) SetupSuite() {
	ctx := context.Background()
	s.testContainer = container.NewContainer(ctx)
	s.testFactory = factory.NewFactory(s.testContainer.DB)
	s.handler = handlers.NewNotificationHandler(repo.New(s.testContainer.DB))

	s.T().Cleanup(func() {
		if err := s.testContainer.Terminate(ctx); err != nil {
			log.Fatalf("Clean container: %s", err)
		}
	})
}

func (s *notificationSuite) TestMarkSingleNotificationAsRead() {
	user := s.testFactory.NewUser()
	notification := s.testFactory.NewNotification(factory.NotificationUserID(user.ID.String()))
	s.testFactory.NewNotification(factory.NotificationUserID(user.ID.String()))
	otherNotification := s.testFactory.NewNotification()

	ctx := xcontext.WithUserID(context.Background(), user.ID)
	ctx = xcontext.WithLogger(ctx, zap.NewExample())
	notificationID := notification.ID.String()
	res, err := s.handler.MarkNotificationsAsRead(
		ctx,
		connect.NewRequest(&apiv1.MarkNotificationsAsReadRequest{
			NotificationId: &notificationID,
		}),
	)
	s.Require().NoError(err)
	s.Require().NotNil(res)

	count, err := repo.New(s.testContainer.DB).CountNotifications(
		ctx,
		repo.CountNotificationsWithUserID(user.ID),
		repo.CountNotificationsWithUnreadOnly(true),
	)
	s.Require().NoError(err)
	s.Equal(int64(1), count)

	otherCount, err := repo.New(s.testContainer.DB).CountNotifications(
		ctx,
		repo.CountNotificationsWithUserID(otherNotification.UserID),
		repo.CountNotificationsWithUnreadOnly(true),
	)
	s.Require().NoError(err)
	s.Equal(int64(1), otherCount)
}

func (s *notificationSuite) TestMarkAllNotificationsAsRead() {
	user := s.testFactory.NewUser()
	s.testFactory.NewNotificationSlice(2, factory.NotificationUserID(user.ID.String()))
	otherNotification := s.testFactory.NewNotification()

	ctx := xcontext.WithUserID(context.Background(), user.ID)
	ctx = xcontext.WithLogger(ctx, zap.NewExample())
	res, err := s.handler.MarkNotificationsAsRead(
		ctx,
		connect.NewRequest(&apiv1.MarkNotificationsAsReadRequest{}),
	)
	s.Require().NoError(err)
	s.Require().NotNil(res)

	count, err := repo.New(s.testContainer.DB).CountNotifications(
		ctx,
		repo.CountNotificationsWithUserID(user.ID),
		repo.CountNotificationsWithUnreadOnly(true),
	)
	s.Require().NoError(err)
	s.Require().Zero(count)

	otherCount, err := repo.New(s.testContainer.DB).CountNotifications(
		ctx,
		repo.CountNotificationsWithUserID(otherNotification.UserID),
		repo.CountNotificationsWithUnreadOnly(true),
	)
	s.Require().NoError(err)
	s.Equal(int64(1), otherCount)
}

func (s *notificationSuite) TestGetUnreadNotificationCount() {
	user := s.testFactory.NewUser()
	s.testFactory.NewNotification(factory.NotificationUserID(user.ID.String()))
	s.testFactory.NewNotification(
		factory.NotificationUserID(user.ID.String()),
		factory.NotificationRead(),
	)

	ctx := xcontext.WithUserID(context.Background(), user.ID)
	ctx = xcontext.WithLogger(ctx, zap.NewExample())
	res, err := s.handler.GetUnreadNotificationCount(
		ctx,
		connect.NewRequest(&apiv1.GetUnreadNotificationCountRequest{}),
	)
	s.Require().NoError(err)
	s.Equal(int64(1), res.Msg.GetCount())
}

func (s *notificationSuite) TestListNotifications() {
	type expected struct {
		err error
		res *connect.Response[apiv1.ListNotificationsResponse]
	}

	type test struct {
		name     string
		req      *connect.Request[apiv1.ListNotificationsRequest]
		init     func(test test, userID string)
		expected expected
	}

	tests := []test{
		{
			name: "ok_empty_response",
			req: &connect.Request[apiv1.ListNotificationsRequest]{
				Msg: &apiv1.ListNotificationsRequest{
					Pagination: &apiv1.PaginationRequest{
						PageLimit: 100,
						PageToken: nil,
					},
				},
			},
			init: func(_ test, _ string) {},
			expected: expected{
				err: nil,
				res: &connect.Response[apiv1.ListNotificationsResponse]{
					Msg: &apiv1.ListNotificationsResponse{
						Notifications: nil,
						Pagination:    nil,
					},
				},
			},
		},
		{
			name: "ok_workout_comment",
			req: &connect.Request[apiv1.ListNotificationsRequest]{
				Msg: &apiv1.ListNotificationsRequest{
					Pagination: &apiv1.PaginationRequest{
						PageLimit: 100,
						PageToken: nil,
					},
				},
			},
			init: func(test test, userID string) {
				for _, n := range test.expected.res.Msg.GetNotifications() {
					workout := s.testFactory.NewWorkout(
						factory.WorkoutID(n.GetWorkoutComment().GetWorkout().GetId()),
						factory.WorkoutName(n.GetWorkoutComment().GetWorkout().GetName()),
						factory.WorkoutUserID(s.testFactory.NewUser(
							factory.UserID(n.GetWorkoutComment().GetWorkout().GetUser().GetId()),
							factory.UserName(n.GetWorkoutComment().GetWorkout().GetUser().GetName()),
						).ID),
					)
					comment := s.testFactory.NewWorkoutComment(
						factory.WorkoutCommentUserID(s.testFactory.NewUser(
							factory.UserID(n.GetWorkoutComment().GetActor().GetId()),
							factory.UserName(n.GetWorkoutComment().GetActor().GetName()),
						).ID),
						factory.WorkoutCommentWorkoutID(workout.ID),
					)
					s.testFactory.NewNotification(
						factory.NotificationID(n.GetId()),
						factory.NotificationType(notification.TypeWorkoutComment),
						factory.NotificationUserID(userID),
						factory.NotificationCreatedAt(time.Unix(n.GetNotifiedAtUnix(), 0)),
						factory.NotificationPayload(notification.Payload{
							ActorID:   comment.UserID,
							WorkoutID: workout.ID,
						}),
					)
				}
			},
			expected: expected{
				err: nil,
				res: &connect.Response[apiv1.ListNotificationsResponse]{
					Msg: &apiv1.ListNotificationsResponse{
						Notifications: []*apiv1.Notification{
							{
								Id:             uuid.NewString(),
								NotifiedAtUnix: time.Now().UTC().Unix(),
								Type: &apiv1.Notification_WorkoutComment_{
									WorkoutComment: &apiv1.Notification_WorkoutComment{
										Actor: &apiv1.User{
											Id:   uuid.NewString(),
											Name: gofakeit.Name(),
										},
										Workout: &apiv1.Workout{
											Id:   uuid.NewString(),
											Name: gofakeit.Name(),
											User: &apiv1.User{
												Id:   uuid.NewString(),
												Name: gofakeit.Name(),
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
		{
			name: "ok_user_followed",
			req: &connect.Request[apiv1.ListNotificationsRequest]{
				Msg: &apiv1.ListNotificationsRequest{
					Pagination: &apiv1.PaginationRequest{
						PageLimit: 100,
						PageToken: nil,
					},
				},
			},
			init: func(test test, userID string) {
				for _, n := range test.expected.res.Msg.GetNotifications() {
					s.testFactory.NewNotification(
						factory.NotificationID(n.GetId()),
						factory.NotificationType(notification.TypeFollow),
						factory.NotificationCreatedAt(time.Unix(n.GetNotifiedAtUnix(), 0)),
						factory.NotificationUserID(userID),
						factory.NotificationPayload(notification.Payload{
							ActorID: s.testFactory.NewUser(
								factory.UserID(n.GetUserFollowed().GetActor().GetId()),
								factory.UserName(n.GetUserFollowed().GetActor().GetName()),
							).ID,
						}),
					)
				}
			},
			expected: expected{
				err: nil,
				res: &connect.Response[apiv1.ListNotificationsResponse]{
					Msg: &apiv1.ListNotificationsResponse{
						Notifications: []*apiv1.Notification{
							{
								Id:             uuid.NewString(),
								NotifiedAtUnix: time.Now().UTC().Unix(),
								Type: &apiv1.Notification_UserFollowed_{
									UserFollowed: &apiv1.Notification_UserFollowed{
										Actor: &apiv1.User{
											Id:   uuid.NewString(),
											Name: gofakeit.Name(),
										},
									},
								},
							},
						},
					},
				},
			},
		},
		{
			name: "ok_workout_comment_deleted_workout",
			req: &connect.Request[apiv1.ListNotificationsRequest]{
				Msg: &apiv1.ListNotificationsRequest{
					Pagination: &apiv1.PaginationRequest{
						PageLimit: 100,
						PageToken: nil,
					},
				},
			},
			init: func(_ test, userID string) {
				s.testFactory.NewNotification(
					factory.NotificationType(notification.TypeWorkoutComment),
					factory.NotificationUserID(userID),
					factory.NotificationPayload(notification.Payload{
						ActorID:   s.testFactory.NewUser().ID,
						WorkoutID: gofrsuuid.Must(gofrsuuid.NewV4()),
					}),
				)
			},
			expected: expected{
				err: nil,
				res: &connect.Response[apiv1.ListNotificationsResponse]{
					Msg: &apiv1.ListNotificationsResponse{
						Notifications: nil,
					},
				},
			},
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			user := s.testFactory.NewUser()
			ctx := xcontext.WithUserID(context.Background(), user.ID)
			ctx = xcontext.WithLogger(ctx, zap.NewExample())

			t.init(t, user.ID.String())
			res, err := s.handler.ListNotifications(ctx, t.req)
			if t.expected.err != nil {
				s.Require().Nil(res)
				s.Require().Error(err)
				s.Require().ErrorIs(err, t.expected.err)
				return
			}

			s.Require().NotNil(res)
			s.Require().NoError(err)
			s.Require().Len(res.Msg.GetNotifications(), len(t.expected.res.Msg.GetNotifications()))
			s.Require().Equal(t.expected.res.Msg.GetPagination().GetNextPageToken(), res.Msg.GetPagination().GetNextPageToken())

			for i, actualNotification := range res.Msg.GetNotifications() {
				expectedNotification := t.expected.res.Msg.GetNotifications()[i]

				s.Require().Equal(expectedNotification.GetId(), actualNotification.GetId())
				s.Require().Equal(expectedNotification.GetNotifiedAtUnix(), actualNotification.GetNotifiedAtUnix())

				expectedActor := expectedNotification.GetUserFollowed().GetActor()
				actualActor := actualNotification.GetUserFollowed().GetActor()

				s.Require().Equal(expectedActor.GetId(), actualActor.GetId())
				s.Require().Equal(expectedActor.GetName(), actualActor.GetName())

				expectedComment := expectedNotification.GetWorkoutComment()
				actualComment := actualNotification.GetWorkoutComment()

				s.Require().Equal(expectedComment.GetActor().GetId(), actualComment.GetActor().GetId())
				s.Require().Equal(expectedComment.GetActor().GetName(), actualComment.GetActor().GetName())

				s.Require().Equal(expectedComment.GetWorkout().GetId(), actualComment.GetWorkout().GetId())
				s.Require().Equal(expectedComment.GetWorkout().GetName(), actualComment.GetWorkout().GetName())

				s.Require().Equal(expectedComment.GetWorkout().GetUser().GetId(), actualComment.GetWorkout().GetUser().GetId())
				s.Require().Equal(expectedComment.GetWorkout().GetUser().GetName(), actualComment.GetWorkout().GetUser().GetName())
			}
		})
	}
}

func (s *notificationSuite) TestListNotificationsPaginates() {
	user := s.testFactory.NewUser()
	actor := s.testFactory.NewUser()
	now := time.Now().UTC()
	for i := range 3 {
		s.testFactory.NewNotification(
			factory.NotificationUserID(user.ID),
			factory.NotificationType(notification.TypeFollow),
			factory.NotificationPayload(notification.Payload{ActorID: actor.ID}),
			factory.NotificationCreatedAt(now.Add(-time.Duration(i)*time.Second)),
		)
	}

	ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
	ctx = xcontext.WithUserID(ctx, user.ID)

	first, err := s.handler.ListNotifications(ctx, &connect.Request[apiv1.ListNotificationsRequest]{
		Msg: &apiv1.ListNotificationsRequest{
			Pagination: &apiv1.PaginationRequest{PageLimit: 2},
		},
	})
	s.Require().NoError(err)
	s.Require().Len(first.Msg.GetNotifications(), 2)
	s.Require().NotEmpty(first.Msg.GetPagination().GetNextPageToken())

	second, err := s.handler.ListNotifications(ctx, &connect.Request[apiv1.ListNotificationsRequest]{
		Msg: &apiv1.ListNotificationsRequest{
			Pagination: &apiv1.PaginationRequest{
				PageLimit: 2,
				PageToken: first.Msg.GetPagination().GetNextPageToken(),
			},
		},
	})
	s.Require().NoError(err)
	s.Require().Len(second.Msg.GetNotifications(), 1)
	s.Require().Empty(second.Msg.GetPagination().GetNextPageToken())
}

func (s *notificationSuite) TestListNotificationsRejectsAMalformedPageToken() {
	ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
	ctx = xcontext.WithUserID(ctx, gofrsuuid.Must(gofrsuuid.NewV4()))

	res, err := s.handler.ListNotifications(ctx, &connect.Request[apiv1.ListNotificationsRequest]{
		Msg: &apiv1.ListNotificationsRequest{
			Pagination: &apiv1.PaginationRequest{PageLimit: 2, PageToken: []byte("not a token")},
		},
	})
	s.Require().Nil(res)
	s.Require().Equal(connect.CodeInternal, connect.CodeOf(err))
}

// The payload is written by the publisher, not the client, so one that no
// longer parses is a fault on this side: the list fails rather than showing a
// notification with the wrong actor.
func (s *notificationSuite) TestListNotificationsFailsOnAnUnreadablePayload() {
	user := s.testFactory.NewUser()
	n := s.testFactory.NewNotification(
		factory.NotificationUserID(user.ID),
		factory.NotificationType(notification.TypeFollow),
		factory.NotificationPayload(notification.Payload{ActorID: gofrsuuid.Must(gofrsuuid.NewV4())}),
	)

	_, err := s.testContainer.DB.ExecContext(context.Background(),
		`UPDATE public.notifications SET payload = '[]'::jsonb WHERE id = $1`, n.ID)
	s.Require().NoError(err)

	ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
	ctx = xcontext.WithUserID(ctx, user.ID)

	res, err := s.handler.ListNotifications(ctx, &connect.Request[apiv1.ListNotificationsRequest]{
		Msg: &apiv1.ListNotificationsRequest{
			Pagination: &apiv1.PaginationRequest{PageLimit: 10},
		},
	})
	s.Require().Nil(res)
	s.Require().Equal(connect.CodeInternal, connect.CodeOf(err))
}
