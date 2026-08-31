package username

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// TestRouteSegmentsCoverRouter fails when the web app routes a top-level path
// this package has not reserved. A new route whose segment anybody could
// register as a username would put a profile at a URL the router owns.
func TestRouteSegmentsCoverRouter(t *testing.T) {
	t.Parallel()

	// The route table is read from the backend's own tree, so the two cannot
	// drift apart unnoticed.
	routerPath := filepath.Join("..", "..", "web", "src", "router", "routes.ts")

	source, err := os.ReadFile(routerPath)
	require.NoError(t, err, "read the router table at %s", routerPath)

	segments := routeSegments()
	reservedSegments := make(map[string]struct{}, len(segments))
	for _, segment := range segments {
		reservedSegments[segment] = struct{}{}
	}

	matched := regexp.MustCompile(`\bpath:\s*'([^']*)'`).FindAllStringSubmatch(string(source), -1)
	require.NotEmpty(t, matched, "no routes parsed from %s", routerPath)

	var found int
	for _, match := range matched {
		segment, ok := topLevelSegment(match[1])
		if !ok {
			continue
		}

		found++
		require.Contains(t, reservedSegments, segment,
			"route '%s' is not reserved: add %q to routeSegments in username.go", match[1], segment)
	}

	require.NotZero(t, found, "no static top-level segments parsed from %s", routerPath)
}

// topLevelSegment reads the first segment off an absolute route path, and
// reports false for anything a username could never collide with: a relative
// child path, the catch-all, and the landing page.
func topLevelSegment(path string) (string, bool) {
	if !strings.HasPrefix(path, "/") {
		return "", false
	}

	segment, _, _ := strings.Cut(strings.TrimPrefix(path, "/"), "/")
	if segment == "" || strings.HasPrefix(segment, ":") {
		return "", false
	}

	return segment, true
}
