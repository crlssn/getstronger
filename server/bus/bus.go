package bus

import (
	"sync"

	"go.uber.org/fx"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/bus/events"
	"github.com/crlssn/getstronger/server/bus/handlers"
)

const channelCapacity = 100

type Bus struct {
	fx.Hook

	mu          sync.RWMutex
	log         *zap.Logger
	channels    map[string]chan any
	subscribers map[string]handlers.Handler
}

func New(log *zap.Logger) *Bus {
	return &Bus{
		log:         log,
		channels:    make(map[string]chan any),
		subscribers: make(map[string]handlers.Handler),
	}
}

func (b *Bus) Publish(event events.Event) {
	b.mu.RLock()
	ch, found := b.channels[event.Type()]
	b.mu.RUnlock()

	if !found {
		b.log.Error("no subscribers found for event", zap.String("event", event.Type()))
		return
	}

	ch <- event.Data()
}

func (b *Bus) Subscribe(event events.Event, handler handlers.Handler) {
	b.mu.Lock()
	defer b.mu.Unlock()

	if _, found := b.channels[event.Type()]; !found {
		b.channels[event.Type()] = make(chan any, channelCapacity)
		b.log.Info("subscribed to event", zap.String("event", event.Type()))
		go b.startWorker(event)
	}

	b.subscribers[event.Type()] = handler
}

func (b *Bus) startWorker(event events.Event) {
	for data := range b.channels[event.Type()] {
		b.mu.RLock()
		h := b.subscribers[event.Type()]
		b.mu.RUnlock()

		go h.HandleEvent(data)
	}
}
