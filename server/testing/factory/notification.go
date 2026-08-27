package factory

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/aarondl/opt/omit"
	"github.com/aarondl/opt/omitnull"
	"github.com/stephenafamo/bob/dialect/psql/im"
	bobtypes "github.com/stephenafamo/bob/types"

	bobfactory "github.com/crlssn/getstronger/server/gen/factory"
	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/notification"
)

func (f *Factory) NewNotificationSlice(count int, opts ...NotificationOpt) models.NotificationSlice {
	slice := make(models.NotificationSlice, 0, count)
	for range count {
		slice = append(slice, f.NewNotification(opts...))
	}

	return slice
}

type NotificationOpt func(notification *models.NotificationSetter)

func (f *Factory) NewNotification(opts ...NotificationOpt) *models.Notification { //nolint:cyclop // Maps optional fixture fields to generated Bob mods.
	setter := &models.NotificationSetter{}
	for _, opt := range opts {
		opt(setter)
	}
	if setter.Type.IsUnset() {
		setter.Type = omit.From(notification.Type(f.Faker.RandomString([]string{
			notification.TypeFollow.String(),
			notification.TypeWorkoutComment.String(),
		})))
	}
	if setter.Payload.IsUnset() {
		setter.Payload = omit.From(bobtypes.NewJSON[json.RawMessage]([]byte("{}")))
	}

	ctx := context.Background()
	var user *models.User
	if userID, ok := setter.UserID.Get(); ok {
		user = f.mustUser(userID)
	} else {
		user = f.NewUser()
	}

	mods := []bobfactory.NotificationMod{bobfactory.NotificationMods.WithExistingUser(userWithoutRelationships(user))}
	if value, ok := setter.ID.Get(); ok {
		mods = append(mods, bobfactory.NotificationMods.ID(value))
	}
	if value, ok := setter.Type.Get(); ok {
		mods = append(mods, bobfactory.NotificationMods.Type(value))
	}
	if value, ok := setter.Payload.Get(); ok {
		mods = append(mods, bobfactory.NotificationMods.Payload(value))
	}
	if value, ok := setter.ReadAt.GetNull(); ok {
		mods = append(mods, bobfactory.NotificationMods.ReadAt(value))
	}
	if value, ok := setter.CreatedAt.Get(); ok {
		mods = append(mods, bobfactory.NotificationMods.CreatedAt(value))
	}

	template := f.generated.NewNotification(mods...)
	built := template.Build()
	setter = template.BuildSetter()
	setter.UserID = omit.From(built.UserID)
	notification, err := models.Notifications.Insert(
		setter,
		im.OnConflict(models.Notifications.Columns.ID.Name()).
			DoUpdate(im.SetExcluded(setter.SetColumns()...)),
	).One(ctx, f.exec)
	if err != nil {
		panic(fmt.Errorf("create notification with Bob factory: %w", err))
	}
	notification.R = built.R

	return notification
}

func NotificationUserID(userID any) NotificationOpt {
	return func(notification *models.NotificationSetter) {
		notification.UserID = omit.From(nativeUUID(userID))
	}
}

func NotificationPayload(payload notification.Payload) NotificationOpt {
	return func(notification *models.NotificationSetter) {
		value, err := json.Marshal(payload)
		if err != nil {
			panic(fmt.Errorf("marshal payload: %w", err))
		}

		notification.Payload = omit.From(bobtypes.NewJSON[json.RawMessage](value))
	}
}

func NotificationType(notificationType notification.Type) NotificationOpt {
	return func(notification *models.NotificationSetter) {
		notification.Type = omit.From(notificationType)
	}
}

func NotificationRead() NotificationOpt {
	return func(notification *models.NotificationSetter) {
		notification.ReadAt = omitnull.From(time.Now().UTC())
	}
}

func NotificationID(id any) NotificationOpt {
	return func(notification *models.NotificationSetter) {
		notification.ID = omit.From(nativeUUID(id))
	}
}

func NotificationCreatedAt(createdAt time.Time) NotificationOpt {
	return func(notification *models.NotificationSetter) {
		notification.CreatedAt = omit.From(createdAt.UTC())
	}
}
