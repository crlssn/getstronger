package factory_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
	"go.yaml.in/yaml/v3"

	"github.com/crlssn/getstronger/server/testing/factory"
)

// libraryEntry is the part of an exercises/*.yaml entry this test reads.
type libraryEntry struct {
	Names struct {
		En string `yaml:"en"`
	} `yaml:"names"`
}

// The seed is the app's first impression, so its personas train movements the
// library knows by the same name. Renaming one on either side without the other
// brings back the drift the library exists to remove: "RDL", "Romanian
// deadlift" and "romanian dl" as three exercises with three sets of records.
func TestSeedExercisesResolveToTheLibrary(t *testing.T) {
	t.Parallel()

	files, err := filepath.Glob(filepath.Join("..", "..", "..", "exercises", "*.yaml"))
	require.NoError(t, err)
	require.NotEmpty(t, files)

	names := make(map[string]struct{})
	for _, file := range files {
		contents, readErr := os.ReadFile(file)
		require.NoError(t, readErr)

		var entries []libraryEntry
		require.NoError(t, yaml.Unmarshal(contents, &entries), file)
		for _, entry := range entries {
			names[entry.Names.En] = struct{}{}
		}
	}

	for _, title := range factory.SeedExerciseTitles() {
		_, ok := names[title]
		require.True(t, ok, "seeded exercise %q is not an entry of exercises/", title)
	}
}
