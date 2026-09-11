package handlers

import (
	"context"
	"time"

	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/notification"
	"github.com/crlssn/getstronger/server/pubsub/events"
	"github.com/crlssn/getstronger/server/repo"
)

const timeout = 5 * time.Second

//go:generate mockgen -package handlers -source=handlers.go -destination=handlers_mock.go Handler
type Handler interface {
	HandlePayload(payload any)
}

var (
	_ Handler = (*FollowedUser)(nil)
	_ Handler = (*RequestTraced)(nil)
	_ Handler = (*WorkoutCommentPosted)(nil)
	_ Handler = (*WorkoutLiked)(nil)
)

type RequestTraced struct {
	log    *zap.Logger
	traces TraceStore
}

func NewRequestTraced(log *zap.Logger, traces TraceStore) *RequestTraced {
	return &RequestTraced{log, traces}
}

func (h *RequestTraced) HandlePayload(payload any) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	p, ok := payload.(events.RequestTraced)
	if !ok {
		h.log.Error("Unexpected payload type for trace event", zap.Any("payload", payload))
		return
	}

	if err := h.traces.StoreTrace(ctx, repo.StoreTraceParams{
		Request:    p.Request,
		DurationMS: p.DurationMS,
		StatusCode: p.StatusCode,
	}); err != nil {
		h.log.Error("Store request trace", zap.Error(err))
	}
}

type WorkoutCommentPosted struct {
	log      *zap.Logger
	comments CommentThread
}

func NewWorkoutCommentPosted(log *zap.Logger, comments CommentThread) *WorkoutCommentPosted {
	return &WorkoutCommentPosted{log, comments}
}

func (w *WorkoutCommentPosted) HandlePayload(payload any) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	p, ok := payload.(events.WorkoutCommentPosted)
	if !ok {
		w.log.Error("Unexpected payload type for workout comment event", zap.Any("payload", payload))
		return
	}
	if p.EventID.IsNil() {
		w.log.Error("Workout comment event is missing an ID")
		return
	}

	comment, err := w.comments.GetWorkoutComment(
		ctx,
		repo.GetWorkoutCommentWithID(p.CommentID),
	)
	if err != nil {
		w.log.Error("Get workout comment for notification", zap.Error(err))
		return
	}

	workout, err := w.comments.GetWorkout(
		ctx,
		repo.GetWorkoutWithID(comment.WorkoutID),
		repo.GetWorkoutLoadComments(),
	)
	if err != nil {
		w.log.Error("Get workout for comment notification", zap.Error(err))
		return
	}

	for _, userID := range notification.CommentAudience(comment.UserID, workout.UserID, workout.Comments) {
		if err = w.comments.CreateNotification(ctx, repo.CreateNotificationParams{
			Type:   notification.TypeWorkoutComment,
			UserID: userID,
			Payload: notification.Payload{
				ActorID:   comment.UserID,
				EventID:   p.EventID,
				WorkoutID: comment.WorkoutID,
			},
		}); err != nil {
			w.log.Error("Create workout comment notification", zap.Error(err))
		}
	}
}

type WorkoutLiked struct {
	log      *zap.Logger
	workouts LikedWorkout
}

func NewWorkoutLiked(log *zap.Logger, workouts LikedWorkout) *WorkoutLiked {
	return &WorkoutLiked{log, workouts}
}

func (w *WorkoutLiked) HandlePayload(payload any) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	p, ok := payload.(events.WorkoutLiked)
	if !ok {
		w.log.Error("Unexpected payload type for workout like event", zap.Any("payload", payload))
		return
	}
	if p.EventID.IsNil() {
		w.log.Error("Workout like event is missing an ID")
		return
	}

	workout, err := w.workouts.GetWorkout(ctx, repo.GetWorkoutWithID(p.WorkoutID))
	if err != nil {
		w.log.Error("Get workout for like notification", zap.Error(err))
		return
	}

	// Only the owner hears about a rep, and never about their own.
	if workout.UserID == p.ActorID {
		return
	}

	if err = w.workouts.CreateNotification(ctx, repo.CreateNotificationParams{
		Type:   notification.TypeWorkoutLike,
		UserID: workout.UserID,
		Payload: notification.Payload{
			ActorID:   p.ActorID,
			EventID:   p.EventID,
			WorkoutID: p.WorkoutID,
		},
	}); err != nil {
		w.log.Error("Create workout like notification", zap.Error(err))
	}
}

type FollowedUser struct {
	log           *zap.Logger
	notifications NotificationStore
}

func NewFollowedUser(log *zap.Logger, notifications NotificationStore) *FollowedUser {
	return &FollowedUser{log, notifications}
}

func (u *FollowedUser) HandlePayload(payload any) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	p, ok := payload.(events.UserFollowed)
	if !ok {
		u.log.Error("Unexpected payload type for followed user event", zap.Any("payload", payload))
		return
	}
	if p.EventID.IsNil() {
		u.log.Error("Followed user event is missing an ID")
		return
	}

	if err := u.notifications.CreateNotification(ctx, repo.CreateNotificationParams{
		Type:   notification.TypeFollow,
		UserID: p.FolloweeID,
		Payload: notification.Payload{
			ActorID: p.FollowerID,
			EventID: p.EventID,
		},
	}); err != nil {
		u.log.Error("Create follow notification", zap.Error(err))
	}
}
