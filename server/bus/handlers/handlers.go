package handlers

import (
	"context"
	"time"

	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/bus/events"
	"github.com/crlssn/getstronger/server/pkg/repo"
)

type Handler interface {
	HandleEvent(event any)
}

var _ Handler = (*HandlerRequestTraced)(nil)

type HandlerRequestTraced struct {
	log  *zap.Logger
	repo *repo.Repo
}

func NewHandlerRequestTraced(log *zap.Logger, repo *repo.Repo) *HandlerRequestTraced {
	return &HandlerRequestTraced{log, repo}
}

const timeout = 5 * time.Second

func (h *HandlerRequestTraced) HandleEvent(event any) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	switch t := event.(type) {
	case *events.EventRequestTraced:
		if err := h.repo.StoreTrace(ctx, repo.StoreTraceParams{
			Request:    t.Request,
			DurationMS: t.DurationMS,
			StatusCode: t.StatusCode,
		}); err != nil {
			h.log.Error("trace store failed", zap.Error(err))
		}
	default:
		h.log.Error("unexpected event type", zap.Any("event", event))
	}
}
