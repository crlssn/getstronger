package bus

import (
	"sync"

	"go.uber.org/fx"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/bus/handlers"
)

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

func (b *Bus) Publish(event string, payload any) {
	b.mu.RLock()
	ch, found := b.channels[event]
	b.mu.RUnlock()

	if !found {
		b.log.Error("no subscribers found for event", zap.String("event", event))
		return
	}

	ch <- payload
}

const channelCapacity = 100

func (b *Bus) Subscribe(event string, handler handlers.Handler) {
	b.mu.Lock()
	defer b.mu.Unlock()

	if _, found := b.channels[event]; !found {
		b.channels[event] = make(chan any, channelCapacity)
		b.log.Info("subscribed to event", zap.String("event", event))
		go b.startWorker(event)
	}

	b.subscribers[event] = handler
}

func (b *Bus) startWorker(event string) {
	for data := range b.channels[event] {
		b.mu.RLock()
		h := b.subscribers[event]
		b.mu.RUnlock()

		go func(data any) {
			defer func() {
				if r := recover(); r != nil {
					b.log.Error("handler panicked", zap.Any("recover", r))
				}
			}()
			h.HandleEvent(data)
		}(data)
	}
}

func (b *Bus) Stop() {
	b.mu.Lock()
	defer b.mu.Unlock()

	for _, ch := range b.channels {
		close(ch)
	}
}
