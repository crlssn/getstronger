//nolint:contextcheck
package factory_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	gofrsuuid "github.com/gofrs/uuid/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/stephenafamo/bob"

	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/notification"
	"github.com/crlssn/getstronger/server/testing/container"
	"github.com/crlssn/getstronger/server/testing/factory"
)

func TestFactory_Notification(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	c := container.NewContainer(ctx)
	f := factory.NewFactory(c.DB)

	t.Run("Slice", func(t *testing.T) {
		t.Parallel()
		slice := f.NewNotificationSlice(3)
		require.Len(t, slice, 3)
	})

	t.Run("Default", func(t *testing.T) {
		t.Parallel()
		expected := f.NewNotification()
		created, err := models.FindNotification(ctx, bob.NewDB(c.DB), expected.ID)
		require.NoError(t, err)
		require.Equal(t, expected.ID, created.ID)
		require.Equal(t, expected.UserID, created.UserID)
		require.Equal(t, expected.Type, created.Type)
		require.Equal(t, expected.Payload, created.Payload)
		require.Equal(t, expected.ReadAt, created.ReadAt)
		require.Equal(t, expected.CreatedAt.Truncate(time.Millisecond), created.CreatedAt.Truncate(time.Millisecond))
	})

	t.Run("NotificationID", func(t *testing.T) {
		t.Parallel()
		id := uuid.NewString()
		expected := f.NewNotification(factory.NotificationID(id))
		created, err := models.FindNotification(ctx, bob.NewDB(c.DB), expected.ID)
		require.NoError(t, err)
		require.Equal(t, id, created.ID.String())
	})

	t.Run("NotificationUserID", func(t *testing.T) {
		t.Parallel()
		userID := f.NewUser().ID
		expected := f.NewNotification(factory.NotificationUserID(userID))
		created, err := models.FindNotification(ctx, bob.NewDB(c.DB), expected.ID)
		require.NoError(t, err)
		require.Equal(t, userID, created.UserID)
	})

	t.Run("NotificationType", func(t *testing.T) {
		t.Parallel()
		notificationType := notification.TypeFollow
		expected := f.NewNotification(factory.NotificationType(notificationType))
		created, err := models.FindNotification(ctx, bob.NewDB(c.DB), expected.ID)
		require.NoError(t, err)
		require.Equal(t, notificationType, created.Type)
	})

	t.Run("NotificationPayload", func(t *testing.T) {
		t.Parallel()
		payload := notification.Payload{
			ActorID:   gofrsuuid.Must(gofrsuuid.NewV4()),
			WorkoutID: gofrsuuid.Must(gofrsuuid.NewV4()),
		}
		expected := f.NewNotification(factory.NotificationPayload(payload))
		created, err := models.FindNotification(ctx, bob.NewDB(c.DB), expected.ID)
		require.NoError(t, err)
		var createdPayload notification.Payload
		require.NoError(t, json.Unmarshal(created.Payload.Val, &createdPayload))
		require.Equal(t, payload, createdPayload)
	})

	t.Run("NotificationRead", func(t *testing.T) {
		t.Parallel()
		expected := f.NewNotification(factory.NotificationRead())
		created, err := models.FindNotification(ctx, bob.NewDB(c.DB), expected.ID)
		require.NoError(t, err)
		require.False(t, created.ReadAt.IsNull())
		require.WithinDuration(t, time.Now().UTC(), created.ReadAt.GetOrZero().UTC(), time.Minute)
	})

	t.Run("NotificationCreatedAt", func(t *testing.T) {
		t.Parallel()
		createdAt := time.Now().Add(-24 * time.Hour).UTC()
		expected := f.NewNotification(factory.NotificationCreatedAt(createdAt))
		created, err := models.FindNotification(ctx, bob.NewDB(c.DB), expected.ID)
		require.NoError(t, err)
		require.WithinDuration(t, createdAt, created.CreatedAt, time.Second)
	})

	t.Cleanup(func() {
		require.NoError(t, c.Terminate(ctx))
	})
}
