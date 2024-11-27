package bus

import (
	"context"
	"sync"

	"go.uber.org/fx"
	"go.uber.org/zap"
)

type event string

const EventRequestTraced event = "request:traced"

type EventWorkoutCreatedData struct{}

type EventRequestTracedData struct {
	Request    string
	DurationMS int
	StatusCode int
}

type Bus struct {
	fx.Hook

	mapEventHandlers map[event]handler

	mu          sync.RWMutex
	log         *zap.Logger
	channels    map[event]chan any
	subscribers map[event]handler
}

func New(log *zap.Logger, mapEventHandlers map[event]handler) *Bus {
	return &Bus{
		mapEventHandlers: mapEventHandlers,

		log:         log,
		channels:    make(map[event]chan any),
		subscribers: make(map[event]handler),
	}
}

func (b *Bus) Publish(event event, data any) {
	b.mu.RLock()
	ch, found := b.channels[event]
	b.mu.RUnlock()

	if !found {
		// Add test for this and remove this check.
		b.log.Error("no subscribers found for event", zap.String("event", string(event)))
		return
	}

	ch <- data
}

const channelCapacity = 100

func (b *Bus) Subscribe(event event, handler handler) {
	b.mu.Lock()
	defer b.mu.Unlock()

	if _, found := b.channels[event]; !found {
		b.channels[event] = make(chan any, channelCapacity)
		b.log.Info("subscribed to event", zap.String("event", string(event)))
		go b.startWorker(event)
	}

	b.subscribers[event] = handler
}

func (b *Bus) startWorker(event event) {
	for data := range b.channels[event] {
		b.mu.RLock()
		h := b.subscribers[event]
		b.mu.RUnlock()

		go h.handle(data)
	}
}

func (b *Bus) Unsubscribe(event event) {
	b.mu.Lock()
	defer b.mu.Unlock()

	b.subscribers[event] = nil
	b.log.Info("unsubscribed from event", zap.String("event", string(event)))
}

func (b *Bus) OnStart(_ context.Context) error {
	for e, h := range b.mapEventHandlers {
		b.Subscribe(e, h)
	}

	return nil
}

func (b *Bus) OnStop(_ context.Context) error {
	for e := range b.mapEventHandlers {
		b.Unsubscribe(e)
	}

	return nil
}
