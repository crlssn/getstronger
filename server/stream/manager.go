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

func (c *Manager) Add(userID string, cancelFunc context.CancelFunc) {
	c.connections.Store(userID, cancelFunc)
}

func (c *Manager) Remove(userID string) {
	c.connections.Delete(userID)
}

func (c *Manager) Cancel() {
	c.connections.Range(func(_, value interface{}) bool {
		cancelFunc, ok := value.(context.CancelFunc)
		if !ok {
			// Continue iteration.
			return true
		}
		cancelFunc()
		return true
	})
}
