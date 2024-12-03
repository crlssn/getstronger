package stream

import (
	"context"
	"sync"
)

type Conn struct {
	active sync.Map
}

func New() *Conn {
	return &Conn{
		active: sync.Map{},
	}
}

func (c *Conn) Add(userID string, cancelFunc context.CancelFunc) {
	c.active.Store(userID, cancelFunc)
}

func (c *Conn) Remove(userID string) {
	c.active.Delete(userID)
}

func (c *Conn) Cancel() {
	c.active.Range(func(_, value interface{}) bool {
		cancelFunc, ok := value.(context.CancelFunc)
		if !ok {
			// Continue iteration.
			return true
		}
		cancelFunc()
		return true
	})
}
