package main

import (
	"context"
	"log"
	"net/url"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/config"
	"github.com/crlssn/getstronger/server/objectstore"
	"github.com/crlssn/getstronger/server/testing/container"
	"github.com/crlssn/getstronger/server/testing/factory"
)

const recordedSession = `{"version":1,"points":[{"timestamp":1,"latitude":59.3,"longitude":18.0}]}`

// The command is run once, by hand, against the rows of a live database, so
// what it does there is what this test does here: move the documents off the
// rows and leave everything else alone.
func TestRunMovesRecordingsOffTheirRows(t *testing.T) {
	ctx := context.Background()
	c := container.NewContainer(ctx)
	t.Cleanup(func() {
		if err := c.Terminate(ctx); err != nil {
			log.Fatalf("clean container: %s", err)
		}
	})

	f := factory.NewFactory(c.DB)
	onRow := f.NewWorkout(factory.WorkoutRecordingJSON(recordedSession))
	alsoOnRow := f.NewWorkout(factory.WorkoutRecordingJSON(recordedSession))
	byHand := f.NewWorkout()

	root := useFilesystemStore(t)
	useDatabase(t, c.Connection)

	// One row per pass, so the loop that claims the next batch runs rather
	// than the whole table arriving in one.
	require.NoError(t, run([]string{"-batch", "1"}))

	for _, workout := range []struct{ id, want string }{
		{onRow.ID.String(), recordedSession},
		{alsoOnRow.ID.String(), recordedSession},
	} {
		body, err := os.ReadFile(filepath.Join(root, "recordings", workout.id+".json"))
		require.NoError(t, err)
		require.JSONEq(t, workout.want, string(body))
	}

	// A session logged by hand has no document, so the run wrote none for it.
	_, err := os.Stat(filepath.Join(root, "recordings", byHand.ID.String()+".json"))
	require.ErrorIs(t, err, os.ErrNotExist)

	// And a second run, over the default batch, has nothing left to claim.
	require.NoError(t, run(nil))
}

func TestRunReportsAnArgumentItCannotRead(t *testing.T) {
	useEmptyDirectory(t)

	require.ErrorContains(t, run([]string{"-batch", "all of them"}), "parse arguments")
}

func TestRunReportsAnUnreadableEnvFile(t *testing.T) {
	useEmptyDirectory(t)
	require.NoError(t, os.Mkdir(".env", 0o750))

	require.ErrorContains(t, run(nil), "load .env file")
}

func TestRunReportsAnUnusablePoolConfiguration(t *testing.T) {
	useEmptyDirectory(t)
	t.Setenv("DB_MAX_OPEN_CONNS", "as many as it takes")

	require.ErrorContains(t, run(nil), "resolve database pool configuration")
}

func TestRunReportsAnUnknownObjectStore(t *testing.T) {
	useEmptyDirectory(t)
	t.Setenv("OBJECT_STORE_PROVIDER", "nowhere")

	err := run(nil)
	require.ErrorIs(t, err, objectstore.ErrUnknownObjectStoreProvider)
	require.ErrorContains(t, err, "resolve object store")
}

// A database the command cannot reach stops the run rather than reporting a
// move it did not make.
func TestRunReportsAnUnreachableDatabase(t *testing.T) {
	useEmptyDirectory(t)
	useFilesystemStore(t)
	t.Setenv("DB_HOST", "127.0.0.1")
	// The discard port: nothing this repository runs listens on it.
	t.Setenv("DB_PORT", "9")
	t.Setenv("DB_NAME", "test-db")

	require.ErrorContains(t, run(nil), "move workout recordings")
}

// useEmptyDirectory runs the command somewhere with no .env of its own, so the
// environment the test sets is the whole of the configuration.
func useEmptyDirectory(t *testing.T) {
	t.Helper()

	t.Chdir(t.TempDir())
	t.Setenv("ENV", string(config.EnvironmentLocal))
}

// useFilesystemStore writes the documents to a directory of this test's own,
// and answers with it.
func useFilesystemStore(t *testing.T) string {
	t.Helper()

	root := t.TempDir()
	t.Setenv("OBJECT_STORE_PROVIDER", string(config.ObjectStoreProviderFilesystem))
	t.Setenv("OBJECT_STORE_PATH", root)

	return root
}

// useDatabase points the command at the container, the way a deployment points
// it at its own database.
func useDatabase(t *testing.T, connection string) {
	t.Helper()

	parsed, err := url.Parse(connection)
	require.NoError(t, err)

	password, _ := parsed.User.Password()
	t.Setenv("ENV", string(config.EnvironmentLocal))
	t.Setenv("DB_HOST", parsed.Hostname())
	t.Setenv("DB_PORT", parsed.Port())
	t.Setenv("DB_NAME", filepath.Base(parsed.Path))
	t.Setenv("DB_USER", parsed.User.Username())
	t.Setenv("DB_PASSWORD", password)
}
