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

type event struct {
	topic   repo.EventTopic
	payload any
}

// PubSub routes persisted events to their handlers over an in-process channel.
// Postgres NOTIFY/LISTEN is deliberately not used as transport because the
// production database sits behind a connection pooler that does not guarantee
// notification delivery.
type PubSub struct {
	mu       sync.RWMutex
	wg       sync.WaitGroup
	log      *zap.Logger
	repo     repo.Repo
	events   chan event
	handlers map[repo.EventTopic]handlers.Handler
}

type Params struct {
	fx.In

	Log  *zap.Logger
	Repo repo.Repo
}

const bufferSize = 1024

func New(p Params) *PubSub {
	return &PubSub{
		log:      p.Log,
		repo:     p.Repo,
		events:   make(chan event, bufferSize),
		handlers: make(map[repo.EventTopic]handlers.Handler),
	}
}

func (ps *PubSub) Publish(ctx context.Context, topic repo.EventTopic, payload any) {
	p, err := json.Marshal(payload)
	if err != nil {
		ps.log.Error("Marshal event payload", zap.Error(err))
		return
	}

	if err = ps.repo.PublishEvent(ctx, topic, p); err != nil {
		ps.log.Error("Persist event", zap.Error(err))
		return
	}

	select {
	case ps.events <- event{topic: topic, payload: payload}:
	default:
		// Never block the request path; the event remains persisted in the
		// events table even when it cannot be dispatched.
		ps.log.Error("Event buffer full: dropping event", zap.String("topic", topic.String()))
	}
}

const workers = 10

func (ps *PubSub) Subscribe(handlers map[repo.EventTopic]handlers.Handler) {
	ps.mu.Lock()
	for topic, handler := range handlers {
		ps.handlers[topic] = handler
		ps.log.Info("Subscribed to topic", zap.String("topic", topic.String()))
	}
	ps.mu.Unlock()

	for range workers {
		ps.wg.Add(1)
		go ps.startWorker()
	}
}

func (ps *PubSub) startWorker() {
	defer ps.wg.Done()

	for event := range ps.events {
		log := ps.log.With(zap.String("topic", event.topic.String()))
		log.Info("Received event")

		ps.mu.RLock()
		handler, ok := ps.handlers[event.topic]
		ps.mu.RUnlock()

		if !ok {
			log.Error("No handler subscribed to topic")
			continue
		}

		handler.HandlePayload(event.payload)
	}
}

// Stop drains the event channel and waits for in-flight handlers to finish.
func (ps *PubSub) Stop() {
	close(ps.events)
	ps.wg.Wait()
}
