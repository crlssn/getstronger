package pubsub

import (
	"fmt"
	"sync"

	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/pubsub/handlers"
)

type Bus struct {
	mu       sync.RWMutex
	log      *zap.Logger
	channels map[string]chan any
	handlers map[string]handlers.Handler
}

func New(log *zap.Logger) *Bus {
	return &Bus{
		log:      log,
		channels: make(map[string]chan any),
		handlers: make(map[string]handlers.Handler),
	}
}

func (b *Bus) Publish(event string, payload any) {
	b.mu.RLock()
	channel, found := b.channels[event]
	b.mu.RUnlock()

	if !found {
		b.log.Error("channel not found", zap.String("event", event))
		return
	}

	channel <- payload
}

const (
	channelWorkers  = 5
	channelCapacity = 50
)

var errHandlerExists = fmt.Errorf("handler already exists")

func (b *Bus) Subscribe(event string, handler handlers.Handler) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	if _, exists := b.handlers[event]; exists {
		return fmt.Errorf("%w: %s", errHandlerExists, event)
	}
	b.handlers[event] = handler

	if _, found := b.channels[event]; !found {
		b.channels[event] = make(chan any, channelCapacity)
		for range channelWorkers {
			go b.startWorker(event)
		}
		b.log.Info("subscribed to event", zap.String("event", event))
	}

	return nil
}

func (b *Bus) startWorker(event string) {
	for payload := range b.channels[event] {
		b.mu.RLock()
		handler := b.handlers[event]
		b.mu.RUnlock()

		go func(payload any) {
			defer func() {
				if r := recover(); r != nil {
					b.log.Error("handler panicked", zap.Any("recover", r))
				}
			}()
			handler.HandlePayload(payload)
		}(payload)
	}
}

func (b *Bus) Stop() {
	b.mu.Lock()
	defer b.mu.Unlock()

	for _, channel := range b.channels {
		close(channel)
	}
}
