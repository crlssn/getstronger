package factory

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/volatiletech/null/v8"
	"github.com/volatiletech/sqlboiler/v4/boil"

	"github.com/crlssn/getstronger/server/gen/orm"
	"github.com/crlssn/getstronger/server/repo"
)

func (f *Factory) NewNotificationSlice(count int, opts ...NotificationOpt) orm.NotificationSlice {
	var slice orm.NotificationSlice
	for range count {
		slice = append(slice, f.NewNotification(opts...))
	}

	return slice
}

type NotificationOpt func(notification *orm.Notification)

func (f *Factory) NewNotification(opts ...NotificationOpt) *orm.Notification {
	m := &orm.Notification{
		ID:        "",
		UserID:    "",
		Type:      "",
		Payload:   nil,
		ReadAt:    null.Time{},
		CreatedAt: time.Time{},
	}

	for _, opt := range opts {
		opt(m)
	}

	if m.UserID == "" {
		m.UserID = f.NewUser().ID
	}

	if m.Type == "" {
		m.Type = orm.NotificationType(f.faker.RandomString([]string{
			orm.NotificationTypeFollow.String(),
			orm.NotificationTypeWorkoutComment.String(),
		}))
	}

	if m.Payload == nil {
		m.Payload = []byte("{}")
	}

	if err := m.Insert(context.Background(), f.db, boil.Infer()); err != nil {
		panic(fmt.Errorf("failed to insert notification: %w", err))
	}

	user, err := m.User().One(context.Background(), f.db)
	if err != nil {
		panic(fmt.Errorf("failed to retrieve user: %w", err))
	}

	if err = m.SetUser(context.Background(), f.db, false, user); err != nil {
		panic(fmt.Errorf("failed to set user: %w", err))
	}

	return m
}

func NotificationUserID(userID string) NotificationOpt {
	return func(notification *orm.Notification) {
		notification.UserID = userID
	}
}

func NotificationPayload(payload repo.NotificationPayload) NotificationOpt {
	return func(notification *orm.Notification) {
		p, err := json.Marshal(payload)
		if err != nil {
			panic(fmt.Errorf("failed to marshal payload: %w", err))
		}

		notification.Payload = p
	}
}

func NotificationType(t orm.NotificationType) NotificationOpt {
	return func(notification *orm.Notification) {
		notification.Type = t
	}
}

func NotificationRead() NotificationOpt {
	return func(notification *orm.Notification) {
		notification.ReadAt = null.TimeFrom(time.Now())
	}
}

func NotificationID(id string) NotificationOpt {
	return func(notification *orm.Notification) {
		notification.ID = id
	}
}

func NotificationCreatedAt(t time.Time) NotificationOpt {
	return func(notification *orm.Notification) {
		notification.CreatedAt = t
	}
}
