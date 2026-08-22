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
)

type RequestTraced struct {
	log  *zap.Logger
	repo repo.Repo
}

func NewRequestTraced(log *zap.Logger, repo repo.Repo) *RequestTraced {
	return &RequestTraced{log, repo}
}

func (h *RequestTraced) HandlePayload(payload any) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	p, ok := payload.(events.RequestTraced)
	if !ok {
		h.log.Error("Unexpected payload type for trace event", zap.Any("payload", payload))
		return
	}

	if err := h.repo.StoreTrace(ctx, repo.StoreTraceParams{
		Request:    p.Request,
		DurationMS: p.DurationMS,
		StatusCode: p.StatusCode,
	}); err != nil {
		h.log.Error("Store request trace", zap.Error(err))
	}
}

type WorkoutCommentPosted struct {
	log  *zap.Logger
	repo repo.Repo
}

func NewWorkoutCommentPosted(log *zap.Logger, repo repo.Repo) *WorkoutCommentPosted {
	return &WorkoutCommentPosted{log, repo}
}

func (w *WorkoutCommentPosted) HandlePayload(payload any) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	p, ok := payload.(events.WorkoutCommentPosted)
	if !ok {
		w.log.Error("Unexpected payload type for workout comment event", zap.Any("payload", payload))
		return
	}
	if p.EventID == "" {
		w.log.Error("Workout comment event is missing an ID")
		return
	}

	comment, err := w.repo.GetWorkoutComment(
		ctx,
		repo.GetWorkoutCommentWithID(p.CommentID),
	)
	if err != nil {
		w.log.Error("Get workout comment for notification", zap.Error(err))
		return
	}

	workout, err := w.repo.GetWorkout(
		ctx,
		repo.GetWorkoutWithID(comment.WorkoutID.String()),
		repo.GetWorkoutLoadComments(),
	)
	if err != nil {
		w.log.Error("Get workout for comment notification", zap.Error(err))
		return
	}

	for _, userID := range notification.CommentAudience(comment.UserID, workout.UserID, workout.R.WorkoutComments) {
		if err = w.repo.CreateNotification(ctx, repo.CreateNotificationParams{
			Type:   notification.TypeWorkoutComment,
			UserID: userID.String(),
			Payload: notification.Payload{
				ActorID:   comment.UserID.String(),
				EventID:   p.EventID,
				WorkoutID: comment.WorkoutID.String(),
			},
		}); err != nil {
			w.log.Error("Create workout comment notification", zap.Error(err))
		}
	}
}

type FollowedUser struct {
	log  *zap.Logger
	repo repo.Repo
}

func NewFollowedUser(log *zap.Logger, repo repo.Repo) *FollowedUser {
	return &FollowedUser{log, repo}
}

func (u *FollowedUser) HandlePayload(payload any) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	p, ok := payload.(events.UserFollowed)
	if !ok {
		u.log.Error("Unexpected payload type for followed user event", zap.Any("payload", payload))
		return
	}
	if p.EventID == "" {
		u.log.Error("Followed user event is missing an ID")
		return
	}

	if err := u.repo.CreateNotification(ctx, repo.CreateNotificationParams{
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
