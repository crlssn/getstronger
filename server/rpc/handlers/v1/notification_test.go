package v1_test

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

	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/gen/proto/api/v1/apiv1connect"
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
			log.Fatalf("clean container: %s", err)
		}
	})
}

func (s *notificationSuite) TestMarkSingleNotificationAsRead() {
	user := s.testFactory.NewUser()
	notification := s.testFactory.NewNotification(factory.NotificationUserID(user.ID.String()))
	s.testFactory.NewNotification(factory.NotificationUserID(user.ID.String()))
	otherNotification := s.testFactory.NewNotification()

	ctx := xcontext.WithUserID(context.Background(), user.ID.String())
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
		repo.CountNotificationsWithUserID(user.ID.String()),
		repo.CountNotificationsWithUnreadOnly(true),
	)
	s.Require().NoError(err)
	s.Equal(int64(1), count)

	otherCount, err := repo.New(s.testContainer.DB).CountNotifications(
		ctx,
		repo.CountNotificationsWithUserID(otherNotification.UserID.String()),
		repo.CountNotificationsWithUnreadOnly(true),
	)
	s.Require().NoError(err)
	s.Equal(int64(1), otherCount)
}

func (s *notificationSuite) TestMarkAllNotificationsAsRead() {
	user := s.testFactory.NewUser()
	s.testFactory.NewNotificationSlice(2, factory.NotificationUserID(user.ID.String()))
	otherNotification := s.testFactory.NewNotification()

	ctx := xcontext.WithUserID(context.Background(), user.ID.String())
	ctx = xcontext.WithLogger(ctx, zap.NewExample())
	res, err := s.handler.MarkNotificationsAsRead(
		ctx,
		connect.NewRequest(&apiv1.MarkNotificationsAsReadRequest{}),
	)
	s.Require().NoError(err)
	s.Require().NotNil(res)

	count, err := repo.New(s.testContainer.DB).CountNotifications(
		ctx,
		repo.CountNotificationsWithUserID(user.ID.String()),
		repo.CountNotificationsWithUnreadOnly(true),
	)
	s.Require().NoError(err)
	s.Require().Zero(count)

	otherCount, err := repo.New(s.testContainer.DB).CountNotifications(
		ctx,
		repo.CountNotificationsWithUserID(otherNotification.UserID.String()),
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

	ctx := xcontext.WithUserID(context.Background(), user.ID.String())
	ctx = xcontext.WithLogger(ctx, zap.NewExample())
	res, err := s.handler.GetUnreadNotificationCount(
		ctx,
		connect.NewRequest(&apiv1.GetUnreadNotificationCountRequest{}),
	)
	s.Require().NoError(err)
	s.Equal(int64(1), res.Msg.GetCount())
}

func (s *notificationSuite) TestListNotifications() { //nolint:maintidx // Table-driven notification states are clearer together.
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
							factory.UserLastName(n.GetWorkoutComment().GetWorkout().GetUser().GetLastName()),
							factory.UserFirstName(n.GetWorkoutComment().GetWorkout().GetUser().GetFirstName()),
						).ID),
					)
					comment := s.testFactory.NewWorkoutComment(
						factory.WorkoutCommentUserID(s.testFactory.NewUser(
							factory.UserID(n.GetWorkoutComment().GetActor().GetId()),
							factory.UserLastName(n.GetWorkoutComment().GetActor().GetLastName()),
							factory.UserFirstName(n.GetWorkoutComment().GetActor().GetFirstName()),
						).ID),
						factory.WorkoutCommentWorkoutID(workout.ID),
					)
					s.testFactory.NewNotification(
						factory.NotificationID(n.GetId()),
						factory.NotificationType(repo.NotificationTypeWorkoutComment),
						factory.NotificationUserID(userID),
						factory.NotificationCreatedAt(time.Unix(n.GetNotifiedAtUnix(), 0)),
						factory.NotificationPayload(repo.NotificationPayload{
							ActorID:   comment.UserID.String(),
							WorkoutID: workout.ID.String(),
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
											Id:        uuid.NewString(),
											FirstName: gofakeit.FirstName(),
											LastName:  gofakeit.LastName(),
										},
										Workout: &apiv1.Workout{
											Id:   uuid.NewString(),
											Name: gofakeit.Name(),
											User: &apiv1.User{
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
						factory.NotificationType(repo.NotificationTypeFollow),
						factory.NotificationCreatedAt(time.Unix(n.GetNotifiedAtUnix(), 0)),
						factory.NotificationUserID(userID),
						factory.NotificationPayload(repo.NotificationPayload{
							ActorID: s.testFactory.NewUser(
								factory.UserID(n.GetUserFollowed().GetActor().GetId()),
								factory.UserLastName(n.GetUserFollowed().GetActor().GetLastName()),
								factory.UserFirstName(n.GetUserFollowed().GetActor().GetFirstName()),
							).ID.String(),
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
					factory.NotificationType(repo.NotificationTypeWorkoutComment),
					factory.NotificationUserID(userID),
					factory.NotificationPayload(repo.NotificationPayload{
						ActorID:   s.testFactory.NewUser().ID.String(),
						WorkoutID: uuid.NewString(),
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
			ctx := xcontext.WithUserID(context.Background(), user.ID.String())
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
		})
	}
}
