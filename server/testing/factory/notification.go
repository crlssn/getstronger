package factory

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/aarondl/opt/omit"
	"github.com/aarondl/opt/omitnull"
	"github.com/stephenafamo/bob"
	"github.com/stephenafamo/bob/dialect/psql/im"
	bobtypes "github.com/stephenafamo/bob/types"

	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/repo"
)

func (f *Factory) NewNotificationSlice(count int, opts ...NotificationOpt) models.NotificationSlice {
	slice := make(models.NotificationSlice, 0, count)
	for range count {
		slice = append(slice, f.NewNotification(opts...))
	}

	return slice
}

type NotificationOpt func(notification *models.NotificationSetter)

func (f *Factory) NewNotification(opts ...NotificationOpt) *models.Notification {
	m := &models.NotificationSetter{}

	for _, opt := range opts {
		opt(m)
	}

	if m.UserID.IsUnset() {
		m.UserID = omit.From(f.NewUser().ID)
	}

	if m.Type.IsUnset() {
		m.Type = omit.From(repo.NotificationType(f.Faker.RandomString([]string{
			repo.NotificationTypeFollow.String(),
			repo.NotificationTypeWorkoutComment.String(),
		})))
	}

	if m.Payload.IsUnset() {
		m.Payload = omit.From(bobtypes.NewJSON[json.RawMessage]([]byte("{}")))
	}

	ctx := context.Background()
	notification, err := models.Notifications.Insert(m,
		im.OnConflict(models.Notifications.Columns.ID.Name()).
			DoUpdate(im.SetExcluded(m.SetColumns()...)),
	).One(ctx, bob.NewDB(f.db))
	if err != nil {
		panic(fmt.Errorf("failed to insert notification: %w", err))
	}

	user, err := models.Users.Query(
		models.SelectWhere.Users.ID.EQ(notification.UserID),
	).One(ctx, bob.NewDB(f.db))
	if err != nil {
		panic(fmt.Errorf("failed to retrieve user: %w", err))
	}
	notification.R.User = user
	notification.R.Loaded.User = true

	return notification
}

func NotificationUserID(userID string) NotificationOpt {
	return func(notification *models.NotificationSetter) {
		notification.UserID = omit.From(userID)
	}
}

func NotificationPayload(payload repo.NotificationPayload) NotificationOpt {
	return func(notification *models.NotificationSetter) {
		p, err := json.Marshal(payload)
		if err != nil {
			panic(fmt.Errorf("failed to marshal payload: %w", err))
		}

		notification.Payload = omit.From(bobtypes.NewJSON[json.RawMessage](p))
	}
}

func NotificationType(t repo.NotificationType) NotificationOpt {
	return func(notification *models.NotificationSetter) {
		notification.Type = omit.From(t)
	}
}

func NotificationRead() NotificationOpt {
	return func(notification *models.NotificationSetter) {
		notification.ReadAt = omitnull.From(time.Now().UTC())
	}
}

func NotificationID(id string) NotificationOpt {
	return func(notification *models.NotificationSetter) {
		notification.ID = omit.From(id)
	}
}

func NotificationCreatedAt(t time.Time) NotificationOpt {
	return func(notification *models.NotificationSetter) {
		notification.CreatedAt = omit.From(t.UTC())
	}
}
