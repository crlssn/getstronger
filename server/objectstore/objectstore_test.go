package objectstore_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/config"
	"github.com/crlssn/getstronger/server/objectstore"
)

func TestValidateKey(t *testing.T) {
	t.Parallel()

	for _, key := range []string{
		"recordings/0f7a.json",
		"a",
		"a/b/c-d_e.f",
	} {
		require.NoError(t, objectstore.ValidateKey(key), key)
	}

	for _, key := range []string{
		"",
		"/leading",
		"trailing/",
		"double//segment",
		"..",
		"recordings/../secrets",
		"recordings/./here",
		"with space",
		"with?query",
		"with#fragment",
		"with\\backslash",
		"héllo",
	} {
		require.ErrorIs(t, objectstore.ValidateKey(key), objectstore.ErrInvalidKey, key)
	}
}

func TestNewSelectsProvider(t *testing.T) {
	t.Parallel()

	local := &config.Config{Environment: config.EnvironmentLocal}
	local.ObjectStore.Path = t.TempDir()
	store, err := objectstore.New(local)
	require.NoError(t, err)
	require.NotNil(t, store)

	// A deployment names its provider: an unset one is not quietly a directory
	// on a container that is replaced on every deploy.
	_, err = objectstore.New(&config.Config{Environment: config.EnvironmentProduction})
	require.ErrorIs(t, err, objectstore.ErrUnknownObjectStoreProvider)

	deployed := &config.Config{Environment: config.EnvironmentProduction}
	deployed.ObjectStore.Provider = config.ObjectStoreProviderS3
	deployed.ObjectStore.Endpoint = "https://s3.fr-par.scw.cloud"
	deployed.ObjectStore.Bucket = "bucket"
	deployed.ObjectStore.AccessKey = "access"
	deployed.ObjectStore.SecretKey = "secret"
	store, err = objectstore.New(deployed)
	require.NoError(t, err)
	require.NotNil(t, store)

	unnamed := &config.Config{Environment: config.EnvironmentLocal}
	unnamed.ObjectStore.Provider = "nowhere"
	_, err = objectstore.New(unnamed)
	require.ErrorIs(t, err, objectstore.ErrUnknownObjectStoreProvider)
}

func TestFilesystemRoundTrip(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	root := t.TempDir()
	store := newFilesystem(t, root)

	const key = "recordings/one.json"
	require.NoError(t, store.Put(ctx, key, []byte(`{"version":1}`)))

	body, err := store.Get(ctx, key)
	require.NoError(t, err)
	require.JSONEq(t, `{"version":1}`, string(body))

	// The document is written whole under the key it was given, which is what
	// a backfill run twice and a save retried both depend on.
	require.NoError(t, store.Put(ctx, key, []byte(`{"version":1,"again":true}`)))
	body, err = store.Get(ctx, key)
	require.NoError(t, err)
	require.JSONEq(t, `{"version":1,"again":true}`, string(body))

	written, err := os.ReadFile(filepath.Join(root, "recordings", "one.json"))
	require.NoError(t, err)
	require.JSONEq(t, `{"version":1,"again":true}`, string(written))

	// Nothing half-written is left behind for a reader to trip over.
	entries, err := os.ReadDir(filepath.Join(root, "recordings"))
	require.NoError(t, err)
	require.Len(t, entries, 1)
}

func TestFilesystemMissingObject(t *testing.T) {
	t.Parallel()

	store := newFilesystem(t, t.TempDir())
	_, err := store.Get(context.Background(), "recordings/absent.json")
	require.ErrorIs(t, err, objectstore.ErrObjectNotFound)
}

func TestFilesystemRefusesKeyOutsideItsRoot(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	store := newFilesystem(t, t.TempDir())

	require.ErrorIs(t, store.Put(ctx, "../escaped.json", nil), objectstore.ErrInvalidKey)
	_, err := store.Get(ctx, "recordings/../../escaped.json")
	require.ErrorIs(t, err, objectstore.ErrInvalidKey)
}

func newFilesystem(t *testing.T, root string) objectstore.Store {
	t.Helper()

	c := &config.Config{Environment: config.EnvironmentLocal}
	c.ObjectStore.Path = root
	store, err := objectstore.NewFilesystem(c)
	require.NoError(t, err)

	return store
}
