//nolint:contextcheck
package handlers_test

import (
	"context"
	"fmt"
	"testing"

	gofrsuuid "github.com/gofrs/uuid/v5"
	"github.com/google/uuid"
	"github.com/stephenafamo/bob"
	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/notification"
	"github.com/crlssn/getstronger/server/pubsub/events"
	"github.com/crlssn/getstronger/server/pubsub/handlers"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/testing/container"
	"github.com/crlssn/getstronger/server/testing/factory"
)

func TestRequestTraced_HandlePayload(t *testing.T) {
	t.Parallel()
	controller := gomock.NewController(t)
	repoMock := repo.NewMockRepo(controller)
	handler := handlers.NewRequestTraced(zap.NewExample(), repoMock)

	t.Run("ok_request_traced", func(t *testing.T) {
		t.Parallel()
		payload := events.RequestTraced{
			Request:    "GET /api/test",
			DurationMS: 200,
			StatusCode: 200,
		}

		repoMock.EXPECT().StoreTrace(gomock.Any(), repo.StoreTraceParams{
			Request:    payload.Request,
			DurationMS: payload.DurationMS,
			StatusCode: payload.StatusCode,
		})

		handler.HandlePayload(payload)
	})

	t.Run("ok_invalid_payload", func(t *testing.T) {
		t.Parallel()
		handler.HandlePayload("invalid_payload")
		repoMock.EXPECT().StoreTrace(gomock.Any(), gomock.Any()).Times(0)
	})

	t.Cleanup(func() {
		controller.Finish()
	})
}

func TestWorkoutCommentPosted_HandlePayload(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	c := container.NewContainer(ctx)
	f := factory.NewFactory(c.DB)
	handler := handlers.NewWorkoutCommentPosted(zap.NewExample(), repo.New(c.DB))

	t.Run("ok_workout_comment_posted", func(t *testing.T) {
		t.Parallel()
		payload := events.WorkoutCommentPosted{
			CommentID: uuid.NewString(),
			EventID:   uuid.NewString(),
		}

		f.NewUser(factory.UserID(factory.UUID(0)))
		f.NewUser(factory.UserID(factory.UUID(1)))
		f.NewUser(factory.UserID(factory.UUID(2)))
		f.NewUser(factory.UserID(factory.UUID(3)))

		workout := f.NewWorkout(
			factory.WorkoutUserID(factory.UUID(0)),
		)
		f.NewWorkoutComment(
			factory.WorkoutCommentUserID(factory.UUID(1)),
			factory.WorkoutCommentWorkoutID(workout.ID),
		)
		f.NewWorkoutComment(
			factory.WorkoutCommentUserID(factory.UUID(2)),
			factory.WorkoutCommentWorkoutID(workout.ID),
		)
		f.NewWorkoutComment(
			factory.WorkoutCommentUserID(factory.UUID(3)),
			factory.WorkoutCommentWorkoutID(workout.ID),
		)
		f.NewWorkoutComment(
			factory.WorkoutCommentID(payload.CommentID),
			factory.WorkoutCommentUserID(factory.UUID(3)),
			factory.WorkoutCommentWorkoutID(workout.ID),
		)

		handler.HandlePayload(payload)
		handler.HandlePayload(payload)

		count, err := models.Notifications.Query(models.SelectWhere.Notifications.UserID.In(
			gofrsuuid.FromStringOrNil(factory.UUID(0)),
			gofrsuuid.FromStringOrNil(factory.UUID(1)),
			gofrsuuid.FromStringOrNil(factory.UUID(2)),
		)).Count(ctx, bob.NewDB(c.DB))
		require.NoError(t, err)
		require.Equal(t, 3, int(count))

		exists, err := models.Notifications.Query(models.SelectWhere.Notifications.UserID.EQ(
			gofrsuuid.FromStringOrNil(factory.UUID(3)),
		)).Exists(ctx, bob.NewDB(c.DB))
		require.NoError(t, err)
		require.False(t, exists)
	})

	t.Run("ok_invalid_payload", func(t *testing.T) {
		t.Parallel()
		handler.HandlePayload("invalid_payload")
	})

	t.Cleanup(func() {
		if err := c.Terminate(ctx); err != nil {
			t.Fatal(fmt.Errorf("terminate container: %w", err))
		}
	})
}

func TestFollowedUser_HandlePayload(t *testing.T) {
	t.Parallel()

	controller := gomock.NewController(t)
	repoMock := repo.NewMockRepo(controller)
	handler := handlers.NewFollowedUser(zap.NewExample(), repoMock)

	t.Run("ok_user_followed", func(t *testing.T) {
		t.Parallel()
		payload := events.UserFollowed{
			FollowerID: "follower_id",
			FolloweeID: "followee_id",
			EventID:    "event_id",
		}

		repoMock.EXPECT().CreateNotification(gomock.Any(), repo.CreateNotificationParams{
			Type:   notification.TypeFollow,
			UserID: payload.FolloweeID,
			Payload: notification.Payload{
				ActorID: payload.FollowerID,
				EventID: payload.EventID,
			},
		})

		handler.HandlePayload(payload)
	})

	t.Run("ok_invalid_payload", func(t *testing.T) {
		t.Parallel()
		handler.HandlePayload("invalid_payload")
		repoMock.EXPECT().StoreTrace(gomock.Any(), gomock.Any()).Times(0)
	})

	t.Cleanup(func() {
		controller.Finish()
	})
}
