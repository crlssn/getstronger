package handlers

import (
	"context"

	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/training"
)

//go:generate mockgen -package handlers -source=ports.go -destination=ports_mock.go

// TraceStore keeps a record of a request that has been served.
type TraceStore interface {
	StoreTrace(ctx context.Context, p repo.StoreTraceParams) error
}

// NotificationStore tells an athlete about something that happened.
type NotificationStore interface {
	CreateNotification(ctx context.Context, p repo.CreateNotificationParams) error
}

// CommentThread reads back the comment an event refers to, together with the
// conversation it joined, so that the audience can be worked out.
type CommentThread interface {
	NotificationStore
	GetWorkoutComment(ctx context.Context, opts ...repo.GetWorkoutCommentOpt) (*training.WorkoutComment, error)
	GetWorkout(ctx context.Context, opts ...repo.GetWorkoutOpt) (*training.Workout, error)
}
