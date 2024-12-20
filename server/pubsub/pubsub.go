package pubsub

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"sync"

	"github.com/lib/pq"
	"go.uber.org/fx"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/gen/orm"
	"github.com/crlssn/getstronger/server/pubsub/handlers"
)

type PubSub struct {
	mu       sync.RWMutex
	db       *sql.DB
	log      *zap.Logger
	listener *pq.Listener
	handlers map[orm.EventTopic]handlers.Handler
}

type Params struct {
	fx.In

	DB       *sql.DB
	Log      *zap.Logger
	Listener *pq.Listener
}

func New(p Params) *PubSub {
	return &PubSub{
		db:       p.DB,
		log:      p.Log,
		listener: p.Listener,
		handlers: make(map[orm.EventTopic]handlers.Handler),
	}
}

func (ps *PubSub) Publish(topic orm.EventTopic, payload any) {
	p, err := json.Marshal(payload)
	if err != nil {
		ps.log.Error("failed to marshal payload", zap.Error(err))
		return
	}

	if _, err = ps.db.Exec("SELECT pg_notify($1, $2)", topic.String(), p); err != nil {
		ps.log.Error("failed to publish event", zap.Error(err))
		return
	}
}

const workersPerTopic = 5

func (ps *PubSub) Subscribe(handlers map[orm.EventTopic]handlers.Handler) error {
	var totalWorkers int
	for topic, handler := range handlers {
		totalWorkers += workersPerTopic
		ps.handlers[topic] = handler
		if err := ps.listener.Listen(topic.String()); err != nil {
			return fmt.Errorf("failed to listen to event: %w", err)
		}
		ps.log.Info("subscribed to topic", zap.String("topic", topic.String()))
	}

	for range totalWorkers {
		go ps.startWorker()
	}

	return nil
}

func (ps *PubSub) startWorker() {
	for event := range ps.listener.Notify {
		if event == nil {
			ps.log.Warn("listener disconnected")
			return
		}

		log := ps.log.With(zap.String("topic", event.Channel))
		log.Info("received event")

		ps.mu.RLock()
		handler, ok := ps.handlers[orm.EventTopic(event.Channel)]
		ps.mu.RUnlock()

		if !ok {
			log.Error("handler not found")
			continue
		}

		go handler.HandlePayload(event.Extra)
	}
}

func (ps *PubSub) Stop() error {
	if err := ps.listener.Close(); err != nil {
		return fmt.Errorf("failed to close listener: %w", err)
	}
	return nil
}
