package handlers

import (
	"context"
	"encoding/json"
	"time"

	"github.com/gofrs/uuid/v5"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/pubsub/payloads"
	"github.com/crlssn/getstronger/server/repo"
)

const timeout = 5 * time.Second

//go:generate mockgen -package handlers -source=handlers.go -destination=handlers_mock.go Handler
type Handler interface {
	HandlePayload(payload string)
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

func (h *RequestTraced) HandlePayload(payload string) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	var p payloads.RequestTraced
	if err := json.Unmarshal([]byte(payload), &p); err != nil {
		h.log.Error("unmarshal payload", zap.Error(err))
		return
	}

	if err := h.repo.StoreTrace(ctx, repo.StoreTraceParams{
		Request:    p.Request,
		DurationMS: p.DurationMS,
		StatusCode: p.StatusCode,
	}); err != nil {
		h.log.Error("trace store failed", zap.Error(err))
	}
}

type WorkoutCommentPosted struct {
	log  *zap.Logger
	repo repo.Repo
}

func NewWorkoutCommentPosted(log *zap.Logger, repo repo.Repo) *WorkoutCommentPosted {
	return &WorkoutCommentPosted{log, repo}
}

func (w *WorkoutCommentPosted) HandlePayload(payload string) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	var p payloads.WorkoutCommentPosted
	if err := json.Unmarshal([]byte(payload), &p); err != nil {
		w.log.Error("unmarshal payload", zap.Error(err))
		return
	}
	if p.EventID == "" {
		w.log.Error("workout comment event is missing an ID")
		return
	}

	comment, err := w.repo.GetWorkoutComment(
		ctx,
		repo.GetWorkoutCommentWithID(p.CommentID),
	)
	if err != nil {
		w.log.Error("get workout comment", zap.Error(err))
		return
	}

	workout, err := w.repo.GetWorkout(
		ctx,
		repo.GetWorkoutWithID(comment.WorkoutID.String()),
		repo.GetWorkoutLoadComments(),
	)
	if err != nil {
		w.log.Error("get workout", zap.Error(err))
		return
	}

	mapUserIDs := make(map[uuid.UUID]struct{})
	if comment.UserID != workout.UserID {
		mapUserIDs[workout.UserID] = struct{}{}
	}
	for _, c := range workout.R.WorkoutComments {
		if comment.UserID == c.UserID {
			// Don't notify own comments.
			continue
		}
		mapUserIDs[c.UserID] = struct{}{}
	}

	for userID := range mapUserIDs {
		if err = w.repo.CreateNotification(ctx, repo.CreateNotificationParams{
			Type:   repo.NotificationTypeWorkoutComment,
			UserID: userID.String(),
			Payload: repo.NotificationPayload{
				ActorID:   comment.UserID.String(),
				EventID:   p.EventID,
				WorkoutID: comment.WorkoutID.String(),
			},
		}); err != nil {
			w.log.Error("create notification", zap.Error(err))
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

func (u *FollowedUser) HandlePayload(payload string) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	var p payloads.UserFollowed
	if err := json.Unmarshal([]byte(payload), &p); err != nil {
		u.log.Error("unmarshal payload", zap.Error(err))
		return
	}
	if p.EventID == "" {
		u.log.Error("followed user event is missing an ID")
		return
	}

	if err := u.repo.CreateNotification(ctx, repo.CreateNotificationParams{
		Type:   repo.NotificationTypeFollow,
		UserID: p.FolloweeID,
		Payload: repo.NotificationPayload{
			ActorID: p.FollowerID,
			EventID: p.EventID,
		},
	}); err != nil {
		u.log.Error("create notification", zap.Error(err))
	}
}
