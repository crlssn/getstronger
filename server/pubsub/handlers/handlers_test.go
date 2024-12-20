package handlers_test

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/gen/orm"
	"github.com/crlssn/getstronger/server/pubsub/handlers"
	"github.com/crlssn/getstronger/server/pubsub/payloads"
	"github.com/crlssn/getstronger/server/repo"
	mock_repo "github.com/crlssn/getstronger/server/repo/mocks"
	"github.com/crlssn/getstronger/server/testing/container"
	"github.com/crlssn/getstronger/server/testing/factory"
)

func TestRequestTraced_HandlePayload(t *testing.T) {
	t.Parallel()
	controller := gomock.NewController(t)
	repoMock := mock_repo.NewMockRepo(controller)
	handler := handlers.NewRequestTraced(zap.NewExample(), repoMock)

	t.Run("ok_request_traced", func(t *testing.T) {
		t.Parallel()
		payload := payloads.RequestTraced{
			Request:    "GET /api/test",
			DurationMS: 200,
			StatusCode: 200,
		}

		repoMock.EXPECT().StoreTrace(gomock.Any(), repo.StoreTraceParams{
			Request:    payload.Request,
			DurationMS: payload.DurationMS,
			StatusCode: payload.StatusCode,
		})

		bytes, err := json.Marshal(payload)
		require.NoError(t, err)

		handler.HandlePayload(string(bytes))
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
		payload := payloads.WorkoutCommentPosted{
			CommentID: uuid.NewString(),
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

		bytes, err := json.Marshal(payload)
		require.NoError(t, err)

		handler.HandlePayload(string(bytes))

		count, err := orm.Notifications(orm.NotificationWhere.UserID.IN(
			[]string{factory.UUID(0), factory.UUID(1), factory.UUID(2)},
		)).Count(ctx, c.DB)
		require.NoError(t, err)
		require.Equal(t, 3, int(count))

		exists, err := orm.Notifications(orm.NotificationWhere.UserID.EQ(factory.UUID(3))).Exists(ctx, c.DB)
		require.NoError(t, err)
		require.False(t, exists)
	})

	t.Cleanup(func() {
		if err := c.Terminate(ctx); err != nil {
			t.Fatal(fmt.Errorf("failed to terminate container: %w", err))
		}
	})
}

func TestFollowedUser_HandlePayload(t *testing.T) {
	t.Parallel()

	controller := gomock.NewController(t)
	repoMock := mock_repo.NewMockRepo(controller)
	handler := handlers.NewFollowedUser(zap.NewExample(), repoMock)

	t.Run("ok_user_followed", func(t *testing.T) {
		payload := payloads.UserFollowed{
			FollowerID: "follower_id",
			FolloweeID: "followee_id",
		}

		repoMock.EXPECT().CreateNotification(gomock.Any(), repo.CreateNotificationParams{
			Type:   orm.NotificationTypeFollow,
			UserID: payload.FolloweeID,
			Payload: repo.NotificationPayload{
				ActorID: payload.FollowerID,
			},
		})

		bytes, err := json.Marshal(payload)
		require.NoError(t, err)

		handler.HandlePayload(string(bytes))
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
