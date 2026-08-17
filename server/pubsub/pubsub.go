package pubsub

import (
	"context"
	"encoding/json"
	"sync"

	"go.uber.org/fx"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/pubsub/handlers"
	"github.com/crlssn/getstronger/server/repo"
)

type PubSub struct {
	mu       sync.RWMutex
	log      *zap.Logger
	repo     repo.Repo
	handlers map[repo.EventTopic]handlers.Handler
}

type Params struct {
	fx.In

	Log  *zap.Logger
	Repo repo.Repo
}

func New(p Params) *PubSub {
	return &PubSub{
		log:      p.Log,
		repo:     p.Repo,
		handlers: make(map[repo.EventTopic]handlers.Handler),
	}
}

// Publish persists the event and dispatches it to the registered handler in
// process. Events are not routed through Postgres NOTIFY/LISTEN because the
// production database sits behind a connection pooler that does not guarantee
// notification delivery.
func (ps *PubSub) Publish(ctx context.Context, topic repo.EventTopic, payload any) {
	p, err := json.Marshal(payload)
	if err != nil {
		ps.log.Error("failed to marshal payload", zap.Error(err))
		return
	}

	if err = ps.repo.PublishEvent(ctx, topic, p); err != nil {
		ps.log.Error("failed to publish event", zap.Error(err))
		return
	}

	ps.mu.RLock()
	handler, ok := ps.handlers[topic]
	ps.mu.RUnlock()

	if !ok {
		ps.log.Error("handler not found", zap.String("topic", topic.String()))
		return
	}

	ps.log.Info("dispatching event", zap.String("topic", topic.String()))
	go handler.HandlePayload(string(p))
}

func (ps *PubSub) Register(handlers map[repo.EventTopic]handlers.Handler) {
	ps.mu.Lock()
	defer ps.mu.Unlock()

	for topic, handler := range handlers {
		ps.handlers[topic] = handler
		ps.log.Info("registered handler", zap.String("topic", topic.String()))
	}
}
