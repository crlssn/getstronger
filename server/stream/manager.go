package stream

import (
	"context"
	"sync"
)

type subscriber struct {
	cancel  context.CancelFunc
	updates chan struct{}
}

type Manager struct {
	mu          sync.RWMutex
	subscribers map[string]map[*subscriber]struct{}
}

func NewManager() *Manager {
	return &Manager{
		subscribers: make(map[string]map[*subscriber]struct{}),
	}
}

// Subscribe registers one client connection for a user. Updates are coalesced
// so notification writers never block on a slow or suspended client.
func (m *Manager) Subscribe(userID string, cancel context.CancelFunc) (<-chan struct{}, func()) {
	s := &subscriber{
		cancel:  cancel,
		updates: make(chan struct{}, 1),
	}

	m.mu.Lock()
	if m.subscribers[userID] == nil {
		m.subscribers[userID] = make(map[*subscriber]struct{})
	}
	m.subscribers[userID][s] = struct{}{}
	m.mu.Unlock()

	var once sync.Once
	unsubscribe := func() {
		once.Do(func() {
			m.mu.Lock()
			defer m.mu.Unlock()

			delete(m.subscribers[userID], s)
			if len(m.subscribers[userID]) == 0 {
				delete(m.subscribers, userID)
			}
		})
	}

	return s.updates, unsubscribe
}

// Notify wakes every active stream for a user. The stream is responsible for
// loading the latest unread count, so several rapid updates can be coalesced.
func (m *Manager) Notify(userID string) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for s := range m.subscribers[userID] {
		select {
		case s.updates <- struct{}{}:
		default:
		}
	}
}

func (m *Manager) Cancel() {
	m.mu.RLock()
	cancelFuncs := make([]context.CancelFunc, 0)
	for _, subscribers := range m.subscribers {
		for s := range subscribers {
			cancelFuncs = append(cancelFuncs, s.cancel)
		}
	}
	m.mu.RUnlock()

	for _, cancel := range cancelFuncs {
		cancel()
	}
}
