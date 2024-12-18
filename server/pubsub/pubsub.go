package pubsub

import (
	"fmt"
	"sync"

	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/pubsub/handlers"
)

type PubSub struct {
	mu       sync.RWMutex
	log      *zap.Logger
	channels map[string]chan any
	handlers map[string]handlers.Handler
}

func New(log *zap.Logger) *PubSub {
	return &PubSub{
		log:      log,
		channels: make(map[string]chan any),
		handlers: make(map[string]handlers.Handler),
	}
}

func (ps *PubSub) Publish(event string, payload any) {
	ps.mu.RLock()
	channel, found := ps.channels[event]
	ps.mu.RUnlock()

	if !found {
		ps.log.Error("channel not found", zap.String("event", event))
		return
	}

	channel <- payload
}

const (
	channelWorkers  = 5
	channelCapacity = 50
)

var errHandlerExists = fmt.Errorf("handler already exists")

func (ps *PubSub) Subscribe(event string, handler handlers.Handler) error {
	ps.mu.Lock()
	defer ps.mu.Unlock()

	if _, exists := ps.handlers[event]; exists {
		return fmt.Errorf("%w: %s", errHandlerExists, event)
	}
	ps.handlers[event] = handler

	if _, found := ps.channels[event]; !found {
		ps.channels[event] = make(chan any, channelCapacity)
		for range channelWorkers {
			go ps.startWorker(event)
		}
		ps.log.Info("subscribed to event", zap.String("event", event))
	}

	return nil
}

func (ps *PubSub) startWorker(event string) {
	for payload := range ps.channels[event] {
		ps.mu.RLock()
		handler := ps.handlers[event]
		ps.mu.RUnlock()

		go func(payload any) {
			defer func() {
				if r := recover(); r != nil {
					ps.log.Error("handler panicked", zap.Any("recover", r))
				}
			}()
			handler.HandlePayload(payload)
		}(payload)
	}
}

func (ps *PubSub) Stop() {
	ps.mu.Lock()
	defer ps.mu.Unlock()

	for _, channel := range ps.channels {
		close(channel)
	}
}
