package handlers

import (
	"context"
	"time"

	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/gen/orm"
	"github.com/crlssn/getstronger/server/pubsub/payloads"
	repo "github.com/crlssn/getstronger/server/repo"
)

const timeout = 5 * time.Second

type Handler interface {
	HandlePayload(payload any)
}

var (
	_ Handler = (*UserFollowed)(nil)
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

	switch t := payload.(type) {
	case *payloads.RequestTraced:
		if err := h.repo.StoreTrace(ctx, repo.StoreTraceParams{
			Request:    t.Request,
			DurationMS: t.DurationMS,
			StatusCode: t.StatusCode,
		}); err != nil {
			h.log.Error("trace store failed", zap.Error(err))
		}
	default:
		h.log.Error("unexpected event type", zap.Any("event", payload))
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

	switch t := payload.(type) {
	case *payloads.WorkoutCommentPosted:
		comment, err := w.repo.GetWorkoutComment(ctx,
			repo.GetWorkoutCommentWithID(t.CommentID),
		)
		if err != nil {
			w.log.Error("get workout comment", zap.Error(err))
			return
		}

		workout, err := w.repo.GetWorkout(ctx,
			repo.GetWorkoutWithID(comment.WorkoutID),
			repo.GetWorkoutWithComments(),
		)
		if err != nil {
			w.log.Error("get workout", zap.Error(err))
			return
		}

		mapUserIDs := make(map[string]struct{})
		for _, c := range workout.R.WorkoutComments {
			if comment.UserID == c.UserID {
				// Don't notify own comments.
				continue
			}
			mapUserIDs[c.UserID] = struct{}{}
		}

		for userID := range mapUserIDs {
			if err = w.repo.CreateNotification(ctx, repo.CreateNotificationParams{
				Type:   orm.NotificationTypeWorkoutComment,
				UserID: userID,
				Payload: repo.NotificationPayload{
					ActorID:   comment.UserID,
					WorkoutID: comment.WorkoutID,
				},
			}); err != nil {
				w.log.Error("create notification", zap.Error(err))
			}
		}
	default:
		w.log.Error("unexpected event type", zap.Any("event", payload))
	}
}

type UserFollowed struct {
	log  *zap.Logger
	repo repo.Repo
}

func NewUserFollowed(log *zap.Logger, repo repo.Repo) *UserFollowed {
	return &UserFollowed{log, repo}
}

func (u *UserFollowed) HandlePayload(payload any) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	switch t := payload.(type) {
	case *payloads.UserFollowed:
		if err := u.repo.CreateNotification(ctx, repo.CreateNotificationParams{
			Type:   orm.NotificationTypeFollow,
			UserID: t.FolloweeID,
			Payload: repo.NotificationPayload{
				ActorID: t.FollowerID,
			},
		}); err != nil {
			u.log.Error("create notification", zap.Error(err))
		}
	default:
		u.log.Error("unexpected event type", zap.Any("event", payload))
	}
}
