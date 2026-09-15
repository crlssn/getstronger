// Package objectstoretest is an object store for tests: documents in a map,
// which is what a bucket is once nothing has to survive the process. It fails
// on demand, so the paths that matter when a bucket is unreachable can be
// tested without one.
package objectstoretest

import (
	"context"
	"fmt"
	"maps"
	"slices"
	"sync"

	"github.com/crlssn/getstronger/server/objectstore"
)

type Memory struct {
	mu      sync.Mutex
	objects map[string][]byte

	// PutErr and GetErr are what the store answers instead of doing the work.
	PutErr error
	GetErr error
}

var _ objectstore.Store = (*Memory)(nil)

func NewMemory() *Memory {
	return &Memory{objects: make(map[string][]byte)}
}

func (m *Memory) Put(_ context.Context, key string, body []byte) error {
	if err := objectstore.ValidateKey(key); err != nil {
		return fmt.Errorf("put object: %w", err)
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	if m.PutErr != nil {
		return m.PutErr
	}

	m.objects[key] = body

	return nil
}

func (m *Memory) Get(_ context.Context, key string) ([]byte, error) {
	if err := objectstore.ValidateKey(key); err != nil {
		return nil, fmt.Errorf("get object: %w", err)
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	if m.GetErr != nil {
		return nil, m.GetErr
	}

	body, ok := m.objects[key]
	if !ok {
		return nil, fmt.Errorf("%w: %s", objectstore.ErrObjectNotFound, key)
	}

	return body, nil
}

// Keys is every key the store holds, which is how a test asks whether a save
// wrote one document or none.
func (m *Memory) Keys() []string {
	m.mu.Lock()
	defer m.mu.Unlock()

	return slices.Sorted(maps.Keys(m.objects))
}
