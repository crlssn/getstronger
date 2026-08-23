package scripts_test

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// The shim is the file Git actually runs, so it is exercised the way Git runs
// it: from the top of a working tree, with a stub scripts/pre_push_hook.sh
// that records its own path, its arguments, and its stdin. Recording the path
// is what tells a run of the worktree's script apart from a run of the main
// checkout's.

const stubHook = `#!/bin/sh
{ echo "$0"; echo "$*"; cat; } > "$HOOK_LOG"
`

type shimResult struct {
	ran      bool
	script   string
	args     string
	stdin    string
	exitCode int
	output   string
}

func TestShimRunsTheScriptFromTheRepository(t *testing.T) {
	repo := newRepo(t)
	writeHook(t, repo, 0o755)

	result := runShim(t, repo, "refs/heads/feature abc refs/heads/feature def\n", "origin", "git@example.test:repo.git")

	require.Equal(t, 0, result.exitCode, result.output)
	require.True(t, result.ran, result.output)
	require.Equal(t, hookPath(t, repo), result.script)
	require.Equal(t, "origin git@example.test:repo.git", result.args)
	require.Equal(t, "refs/heads/feature abc refs/heads/feature def\n", result.stdin)
}

// The hooks directory is shared with every linked worktree, so the one shim
// has to find the script belonging to the tree being pushed.
func TestShimRunsTheScriptFromTheWorktreeBeingPushed(t *testing.T) {
	repo := newRepo(t)
	writeHook(t, repo, 0o755)

	worktree := filepath.Join(t.TempDir(), "linked")
	git(t, repo, "worktree", "add", "-b", "feature", worktree)
	writeHook(t, worktree, 0o755)

	result := runShim(t, worktree, "")

	require.Equal(t, 0, result.exitCode, result.output)
	require.True(t, result.ran, result.output)
	require.Equal(t, hookPath(t, worktree), result.script)
}

func TestShimLetsThePushThroughWhenTheScriptCannotBeRun(t *testing.T) {
	// A zero mode stands for a checkout without the script at all.
	for name, mode := range map[string]os.FileMode{
		"script missing":        0,
		"script not executable": 0o644,
	} {
		t.Run(name, func(t *testing.T) {
			repo := newRepo(t)
			if mode != 0 {
				writeHook(t, repo, mode)
			}

			result := runShim(t, repo, "")

			require.Equal(t, 0, result.exitCode, result.output)
			require.False(t, result.ran, result.output)
			require.Contains(t, result.output, "Skipping")
		})
	}
}

func TestShimLetsThePushThroughOutsideARepository(t *testing.T) {
	result := runShim(t, t.TempDir(), "")

	require.Equal(t, 0, result.exitCode, result.output)
	require.False(t, result.ran, result.output)
	require.Contains(t, result.output, "Skipping")
}

func hookPath(t *testing.T, tree string) string {
	t.Helper()

	// Git resolves the working tree's path, and on macOS the temporary
	// directories these tests run in are reached through a symlink.
	resolved, err := filepath.EvalSymlinks(tree)
	require.NoError(t, err)

	return filepath.Join(resolved, "scripts", "pre_push_hook.sh")
}

func writeHook(t *testing.T, tree string, mode os.FileMode) {
	t.Helper()

	dir := filepath.Join(tree, "scripts")
	require.NoError(t, os.MkdirAll(dir, 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "pre_push_hook.sh"), []byte(stubHook), mode))
}

func runShim(t *testing.T, dir, stdin string, args ...string) shimResult {
	t.Helper()

	log := filepath.Join(t.TempDir(), "hook.log")

	shim, err := filepath.Abs("pre_push_shim.sh")
	require.NoError(t, err)

	cmd := exec.CommandContext(t.Context(), shim, args...)
	cmd.Dir = dir
	cmd.Stdin = strings.NewReader(stdin)
	cmd.Env = append(isolatedEnv(), "HOOK_LOG="+log)
	out, err := cmd.CombinedOutput()

	exitCode := 0
	var exit *exec.ExitError
	if err != nil {
		require.ErrorAs(t, err, &exit, string(out))
		exitCode = exit.ExitCode()
	}

	result := shimResult{exitCode: exitCode, output: string(out)}

	contents, err := os.ReadFile(log)
	if os.IsNotExist(err) {
		return result
	}
	require.NoError(t, err)

	recorded := strings.SplitN(string(contents), "\n", 3)
	require.Len(t, recorded, 3, string(contents))
	result.ran = true
	result.script = recorded[0]
	result.args = recorded[1]
	result.stdin = recorded[2]

	return result
}
