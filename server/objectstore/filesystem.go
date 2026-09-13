package objectstore

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"

	"github.com/crlssn/getstronger/server/config"
)

// Documents are the process's own: readable by nobody else on the host, since
// a recording is one athlete's session.
const (
	objectDirMode = 0o750
)

// filesystem keeps each document as a file under one directory. It is what a
// developer's own stack and the test suites run against, where there is no
// bucket and nothing should have to reach the network to save a workout.
type filesystem struct {
	root string
}

var _ Store = (*filesystem)(nil)

func NewFilesystem(c *config.Config) (Store, error) {
	root, err := filepath.Abs(c.ObjectStore.Root())
	if err != nil {
		return nil, fmt.Errorf("resolve object store path: %w", err)
	}

	if err = os.MkdirAll(root, objectDirMode); err != nil {
		return nil, fmt.Errorf("create object store path: %w", err)
	}

	return &filesystem{root: root}, nil
}

// Put writes the document beside its neighbours through a temporary file, so a
// reader never sees half of one and a rewrite either lands whole or not at all.
func (f *filesystem) Put(_ context.Context, key string, body []byte) error {
	path, err := f.path(key)
	if err != nil {
		return err
	}

	if err = os.MkdirAll(filepath.Dir(path), objectDirMode); err != nil {
		return fmt.Errorf("create object directory: %w", err)
	}

	temp, err := os.CreateTemp(filepath.Dir(path), ".tmp-*")
	if err != nil {
		return fmt.Errorf("create object temporary file: %w", err)
	}
	defer func() { _ = os.Remove(temp.Name()) }()

	if _, err = temp.Write(body); err != nil {
		_ = temp.Close()
		return fmt.Errorf("write object %s: %w", key, err)
	}
	if err = temp.Close(); err != nil {
		return fmt.Errorf("write object %s: %w", key, err)
	}
	if err = os.Rename(temp.Name(), path); err != nil {
		return fmt.Errorf("write object %s: %w", key, err)
	}

	return nil
}

func (f *filesystem) Get(_ context.Context, key string) ([]byte, error) {
	path, err := f.path(key)
	if err != nil {
		return nil, err
	}

	body, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, fmt.Errorf("%w: %s", ErrObjectNotFound, key)
	}
	if err != nil {
		return nil, fmt.Errorf("read object %s: %w", key, err)
	}

	return body, nil
}

func (f *filesystem) path(key string) (string, error) {
	if err := ValidateKey(key); err != nil {
		return "", err
	}

	return filepath.Join(f.root, filepath.FromSlash(key)), nil
}
