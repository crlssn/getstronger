package handlers

import (
	"context"
	"time"

	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/bus/payloads"
	"github.com/crlssn/getstronger/server/pkg/repo"
)

type Handler interface {
	HandlePayload(payload any)
}

var _ Handler = (*RequestTraced)(nil)

type RequestTraced struct {
	log  *zap.Logger
	repo *repo.Repo
}

func NewRequestTraced(log *zap.Logger, repo *repo.Repo) *RequestTraced {
	return &RequestTraced{log, repo}
}

const timeout = 5 * time.Second

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
