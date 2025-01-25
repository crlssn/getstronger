package stream

import (
	"context"
	"sync"
)

type Manager struct {
	connections sync.Map
}

func NewManager() *Manager {
	return &Manager{
		connections: sync.Map{},
	}
}

func (m *Manager) Add(userID string, cancelFunc context.CancelFunc) {
	m.connections.Store(userID, cancelFunc)
}

func (m *Manager) Remove(userID string) {
	m.connections.Delete(userID)
}

func (m *Manager) Cancel() {
	m.connections.Range(func(_, value interface{}) bool {
		cancelFunc, ok := value.(context.CancelFunc)
		if !ok {
			// Continue iteration.
			return true
		}
		cancelFunc()
		return true
	})
}
