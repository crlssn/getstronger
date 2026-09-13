// Package objectstore keeps documents that are written once and read back
// whole, away from the rows that name them. Nothing queries inside a document:
// what goes in comes back byte for byte or not at all.
package objectstore

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/crlssn/getstronger/server/config"
)

// ErrObjectNotFound is a key the store holds nothing under.
var ErrObjectNotFound = errors.New("object not found")

// ErrInvalidKey is a key outside the alphabet the store names documents in.
var ErrInvalidKey = errors.New("invalid object key")

// ErrUnknownObjectStoreProvider is a provider no implementation answers to.
var ErrUnknownObjectStoreProvider = errors.New("unknown object store provider")

// Store reads and writes whole documents by key.
type Store interface {
	Put(ctx context.Context, key string, body []byte) error
	Get(ctx context.Context, key string) ([]byte, error)
}

// New builds the store the environment names. A deployment must name one; an
// unset provider falls back to the filesystem only on a developer's own stack,
// where there is no bucket to reach.
func New(c *config.Config) (Store, error) {
	provider := c.ObjectStore.Provider
	if provider == "" && c.Environment.Local() {
		provider = config.ObjectStoreProviderFilesystem
	}

	switch provider {
	case config.ObjectStoreProviderFilesystem:
		return NewFilesystem(c)
	case config.ObjectStoreProviderS3:
		return NewS3(c)
	default:
		return nil, fmt.Errorf("%w: %q", ErrUnknownObjectStoreProvider, provider)
	}
}

// Keys are restricted to what is safe in both a URL path and a file path, so
// no implementation has to escape one and none can be talked into reading
// outside its bucket or its directory.
const keyAlphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_."

// ValidateKey holds a key to that alphabet: slash-separated segments, each of
// them non-empty and neither "." nor "..".
func ValidateKey(key string) error {
	if key == "" || strings.HasPrefix(key, "/") || strings.HasSuffix(key, "/") {
		return fmt.Errorf("%w: %q", ErrInvalidKey, key)
	}

	for segment := range strings.SplitSeq(key, "/") {
		if segment == "" || segment == "." || segment == ".." {
			return fmt.Errorf("%w: %q", ErrInvalidKey, key)
		}
		if strings.ContainsFunc(segment, func(r rune) bool {
			return !strings.ContainsRune(keyAlphabet, r)
		}) {
			return fmt.Errorf("%w: %q", ErrInvalidKey, key)
		}
	}

	return nil
}
