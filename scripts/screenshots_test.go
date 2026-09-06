package scripts_test

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// The set a comparison reads is 32 MB and six minutes old, and these two
// scripts are what decide which directory holds it and which directories are
// nobody's any more. The rule they share with web/tests/screenshots/ref.ts is
// written twice, so the cases below are the same cases as ref.spec.ts.

const stubGitRefs = `#!/bin/sh
case "$*" in
  *--show-toplevel*) echo "$GIT_ROOT" ;;
  *symbolic-ref*) echo "$GIT_BRANCH" ;;
  *for-each-ref*) printf '%s\n' $GIT_REFS ;;
  *--short*) echo "${GIT_SHA:-abc1234}" ;;
esac
`

func withStubbedGit(t *testing.T, cmd *exec.Cmd, env map[string]string) {
	t.Helper()

	dir := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(dir, "git"), []byte(stubGitRefs), 0o755))

	cmd.Env = append(os.Environ(), "PATH="+dir+string(os.PathListSeparator)+os.Getenv("PATH"))
	for name, value := range env {
		cmd.Env = append(cmd.Env, name+"="+value)
	}
}

func refDirectory(t *testing.T, ref string) string {
	t.Helper()

	script, err := filepath.Abs("screenshots_ref.sh")
	require.NoError(t, err)

	cmd := exec.CommandContext(t.Context(), "bash", "-c", `. "$1"; ref_directory "$2"`, "_", script, ref)
	withStubbedGit(t, cmd, nil)

	output, err := cmd.Output()
	require.NoError(t, err)

	return strings.TrimRight(string(output), "\n")
}

func TestScreenshotsRefDirectory(t *testing.T) {
	t.Parallel()

	tests := map[string]struct {
		ref  string
		want string
	}{
		"a branch": {ref: "main", want: "main"},
		"a slash a directory cannot carry": {
			ref:  "claude/github-issue-1377-80720e",
			want: "claude-github-issue-1377-80720e",
		},
		"the short SHA of a detached capture":     {ref: "4c4c604e", want: "4c4c604e"},
		"the dots a branch name may hold":         {ref: "release_1.2.x", want: "release_1.2.x"},
		"a run of folded characters":              {ref: "feature//spike", want: "feature-spike"},
		"a ref no directory could be named after": {ref: "..", want: "unnamed-ref"},
		"nothing at all":                          {ref: "", want: "unnamed-ref"},
	}

	for name, test := range tests {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			require.Equal(t, test.want, refDirectory(t, test.ref))
		})
	}
}

// A directory name is a single path segment, so no ref can send a publish or a
// prune outside the directory holding the sets.
func TestScreenshotsRefDirectoryStaysOneSegment(t *testing.T) {
	t.Parallel()

	for _, ref := range []string{"../../etc", "..", "a/../../b", "/"} {
		directory := refDirectory(t, ref)

		require.NotContains(t, directory, "/", ref)
		require.False(t, strings.HasPrefix(directory, "."), ref)
	}
}

func TestScreenshotsRefReadsTheBranchHeadIsOn(t *testing.T) {
	t.Parallel()

	script, err := filepath.Abs("screenshots_ref.sh")
	require.NoError(t, err)

	cmd := exec.CommandContext(t.Context(), "bash", script)
	withStubbedGit(t, cmd, map[string]string{"GIT_BRANCH": "claude/issue-1377"})

	output, err := cmd.Output()
	require.NoError(t, err)
	require.Equal(t, "claude-issue-1377\n", string(output))
}

// A detached HEAD is what a baseline captured on origin/main actually is, and
// it still has to be photographed somewhere.
func TestScreenshotsRefFallsBackToTheShortSHA(t *testing.T) {
	t.Parallel()

	script, err := filepath.Abs("screenshots_ref.sh")
	require.NoError(t, err)

	cmd := exec.CommandContext(t.Context(), "bash", script)
	withStubbedGit(t, cmd, map[string]string{"GIT_BRANCH": "", "GIT_SHA": "4c4c604e"})

	output, err := cmd.Output()
	require.NoError(t, err)
	require.Equal(t, "4c4c604e\n", string(output))
}

type pruneResult struct {
	stdout   string
	stderr   string
	exitCode int
}

func runScreenshotsPrune(t *testing.T, root string, args []string, env map[string]string) pruneResult {
	t.Helper()

	script, err := filepath.Abs("screenshots_prune.sh")
	require.NoError(t, err)

	cmd := exec.CommandContext(t.Context(), "bash", append([]string{script}, args...)...)
	withStubbedGit(t, cmd, env)
	cmd.Env = append(cmd.Env, "GIT_ROOT="+root)

	var stdout, stderr strings.Builder
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	exitCode := 0
	if err := cmd.Run(); err != nil {
		var exitErr *exec.ExitError
		require.ErrorAs(t, err, &exitErr)
		exitCode = exitErr.ExitCode()
	}

	return pruneResult{stdout: stdout.String(), stderr: stderr.String(), exitCode: exitCode}
}

// setsCheckout lays out one photographed set per named ref and returns the root.
func setsCheckout(t *testing.T, refs ...string) string {
	t.Helper()

	root, err := filepath.EvalSymlinks(t.TempDir())
	require.NoError(t, err)

	for _, ref := range refs {
		directory := filepath.Join(root, "web", "screenshots", ref, "active")
		require.NoError(t, os.MkdirAll(directory, 0o755))
		require.NoError(t, os.WriteFile(filepath.Join(directory, "home.png"), []byte(ref), 0o600))
	}

	return root
}

func exists(t *testing.T, parts ...string) bool {
	t.Helper()

	_, err := os.Stat(filepath.Join(parts...))

	return err == nil
}

func TestScreenshotsPruneListsSetsWhoseRefIsGone(t *testing.T) {
	t.Parallel()

	root := setsCheckout(t, "main", "merged-branch")
	env := map[string]string{"GIT_BRANCH": "main", "GIT_REFS": "main"}

	result := runScreenshotsPrune(t, root, nil, env)

	require.Equal(t, 0, result.exitCode, result.stderr)
	require.Contains(t, result.stdout, "merged-branch")
	require.NotContains(t, result.stdout, "\n  main ", "a ref that still exists is not stale")
	require.True(t, exists(t, root, "web", "screenshots", "merged-branch"),
		"listing removes nothing: a set is six minutes of photographing")
}

func TestScreenshotsPruneRemovesThemWithForce(t *testing.T) {
	t.Parallel()

	root := setsCheckout(t, "main", "merged-branch")
	env := map[string]string{"GIT_BRANCH": "main", "GIT_REFS": "main"}

	result := runScreenshotsPrune(t, root, []string{"--force"}, env)

	require.Equal(t, 0, result.exitCode, result.stderr)
	require.False(t, exists(t, root, "web", "screenshots", "merged-branch"))
	require.True(t, exists(t, root, "web", "screenshots", "main", "active", "home.png"),
		"the set a comparison reads its before column from survives")
}

// The set being photographed right now has no branch behind it on a detached
// HEAD, and pruning it out from under the run would be the very bug this keying
// was meant to fix.
func TestScreenshotsPruneKeepsTheSetForTheCurrentRef(t *testing.T) {
	t.Parallel()

	root := setsCheckout(t, "4c4c604e")
	env := map[string]string{"GIT_BRANCH": "", "GIT_SHA": "4c4c604e", "GIT_REFS": "main"}

	result := runScreenshotsPrune(t, root, []string{"--force"}, env)

	require.Equal(t, 0, result.exitCode, result.stderr)
	require.True(t, exists(t, root, "web", "screenshots", "4c4c604e"))
}

// A baseline is usually captured on origin/main, which is a remote-tracking ref
// rather than a local branch.
func TestScreenshotsPruneKeepsASetPhotographedOnARemoteRef(t *testing.T) {
	t.Parallel()

	root := setsCheckout(t, "origin-main")
	env := map[string]string{"GIT_BRANCH": "my-branch", "GIT_REFS": "main origin/main"}

	result := runScreenshotsPrune(t, root, []string{"--force"}, env)

	require.Equal(t, 0, result.exitCode, result.stderr)
	require.True(t, exists(t, root, "web", "screenshots", "origin-main"))
}

// The copy-aside the old layout kept is 32 MB no task will ever read again, and
// only the machine that ran the old tooling has one.
func TestScreenshotsPruneRemovesTheRetiredBaseline(t *testing.T) {
	t.Parallel()

	root := setsCheckout(t, "main")
	baseline := filepath.Join(root, "web", ".screenshots-baseline", "active")
	require.NoError(t, os.MkdirAll(baseline, 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(baseline, "home.png"), []byte("old"), 0o600))
	env := map[string]string{"GIT_BRANCH": "main", "GIT_REFS": "main"}

	listed := runScreenshotsPrune(t, root, nil, env)
	require.Equal(t, 0, listed.exitCode, listed.stderr)
	require.Contains(t, listed.stdout, ".screenshots-baseline")
	require.True(t, exists(t, root, "web", ".screenshots-baseline"), "listing removes nothing")

	removed := runScreenshotsPrune(t, root, []string{"--force"}, env)
	require.Equal(t, 0, removed.exitCode, removed.stderr)
	require.False(t, exists(t, root, "web", ".screenshots-baseline"))
	require.True(t, exists(t, root, "web", "screenshots", "main"))
}

func TestScreenshotsPruneSaysWhenThereIsNothingToDo(t *testing.T) {
	t.Parallel()

	root := setsCheckout(t, "main")
	env := map[string]string{"GIT_BRANCH": "main", "GIT_REFS": "main"}

	result := runScreenshotsPrune(t, root, nil, env)

	require.Equal(t, 0, result.exitCode, result.stderr)
	require.Contains(t, result.stdout, "No sets left behind")
}
