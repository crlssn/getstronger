package scripts_test

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// The hook is a shell script, so it is exercised the way Git runs it: from a
// throwaway repository, with the pushed refs on stdin and a stub `mise` on
// PATH that records the tasks it was asked for.

const zeroSHA = "0000000000000000000000000000000000000000"

const stubMise = `#!/bin/sh
shift
echo "$*" >> "$MISE_TASK_LOG"
echo "$GOFLAGS" >> "$MISE_TASK_LOG.goflags"
if [ "$*" = "$MISE_FAIL_TASK" ]; then exit 1; fi
if [ "$*" = "$MISE_DIRTY_TASK" ]; then echo reformatted > "$MISE_DIRTY_FILE"; fi
exit 0
`

type hookResult struct {
	tasks    []string
	goflags  []string
	exitCode int
	output   string
}

func TestHookRunsOnlyTheChangedAreasChecks(t *testing.T) {
	for name, tc := range map[string]struct {
		files []string
		tasks []string
	}{
		"web change": {
			files: []string{"web/src/main.ts"},
			tasks: []string{"format:web", "lint:web", "test:web"},
		},
		"backend change": {
			files: []string{"server/rpc/handler.go"},
			tasks: []string{"format:backend", "lint:backend", "test:backend"},
		},
		"migration change": {
			files: []string{"database/migrations/001_init.sql"},
			tasks: []string{"format:backend", "lint:backend", "test:backend"},
		},
		"script change": {
			files: []string{"scripts/worktree_env.sh"},
			tasks: []string{"format:backend", "lint:backend", "test:backend"},
		},
		"proto change": {
			files: []string{"proto/api/v1/service.proto"},
			tasks: []string{"lint:protos"},
		},
		"web and backend change": {
			files: []string{"web/src/main.ts", "server/rpc/handler.go"},
			tasks: []string{"format:web", "format:backend", "lint:web", "lint:backend", "test:web", "test:backend"},
		},
		"change outside the checked areas": {
			files: []string{"README.md"},
			tasks: nil,
		},
	} {
		t.Run(name, func(t *testing.T) {
			repo := newRepo(t)
			head := commit(t, repo, tc.files...)

			result := runHook(t, repo, pushLine(head, zeroSHA), nil)

			require.Equal(t, 0, result.exitCode, result.output)
			require.Equal(t, tc.tasks, result.tasks)
		})
	}
}

// A push's file list is not always small, and 'grep -qE' stops at the first
// match: a match near the top of a list too long to fit in a pipe leaves the
// writer with a broken pipe, which 'set -o pipefail' reads as "this area was not
// touched". The checks for it are then skipped on the way to a green push.
func TestHookChecksEveryAreaOfAPushTooLongForAPipe(t *testing.T) {
	repo := newRepo(t)
	files := make([]string, 0, 1001)
	files = append(files, "server/rpc/handler.go")
	for i := range 1000 {
		files = append(files, fmt.Sprintf("web/src/%s/component-%04d.ts", strings.Repeat("nested/", 10), i))
	}
	head := commit(t, repo, files...)

	result := runHook(t, repo, pushLine(head, zeroSHA), nil)

	require.Equal(t, 0, result.exitCode, result.output)
	require.Equal(t, []string{
		"format:web", "format:backend",
		"lint:web", "lint:backend",
		"test:web", "test:backend",
	}, result.tasks)
}

func TestHookComparesAgainstTheRemoteBranchWhenItExists(t *testing.T) {
	repo := newRepo(t)
	pushed := commit(t, repo, "web/src/main.ts")
	head := commit(t, repo, "server/rpc/handler.go")

	result := runHook(t, repo, pushLine(head, pushed), nil)

	require.Equal(t, 0, result.exitCode, result.output)
	require.Equal(t, []string{"format:backend", "lint:backend", "test:backend"}, result.tasks)
}

func TestHookChecksTheCheckedOutBranchWhenRunByHand(t *testing.T) {
	repo := newRepo(t)
	commit(t, repo, "web/src/main.ts")

	result := runHook(t, repo, "", nil)

	require.Equal(t, 0, result.exitCode, result.output)
	require.Equal(t, []string{"format:web", "lint:web", "test:web"}, result.tasks)
}

func TestHookSkipsDeletedBranches(t *testing.T) {
	repo := newRepo(t)
	commit(t, repo, "web/src/main.ts")

	result := runHook(t, repo, "(delete) "+zeroSHA+" refs/heads/feature "+zeroSHA+"\n", nil)

	require.Equal(t, 0, result.exitCode, result.output)
	require.Empty(t, result.tasks)
}

func TestHookAbortsWhenACheckFails(t *testing.T) {
	repo := newRepo(t)
	head := commit(t, repo, "web/src/main.ts")

	result := runHook(t, repo, pushLine(head, zeroSHA), []string{"MISE_FAIL_TASK=lint:web"})

	require.Equal(t, 1, result.exitCode, result.output)
	require.Equal(t, []string{"format:web", "lint:web"}, result.tasks)
	require.Contains(t, result.output, "mise run lint:web")
}

func TestHookAbortsWhenFormattingChangesFiles(t *testing.T) {
	repo := newRepo(t)
	head := commit(t, repo, "web/src/main.ts")

	result := runHook(t, repo, pushLine(head, zeroSHA), []string{
		"MISE_DIRTY_TASK=format:web",
		"MISE_DIRTY_FILE=" + filepath.Join(repo, "web/src/main.ts"),
	})

	require.Equal(t, 1, result.exitCode, result.output)
	require.Equal(t, []string{"format:web"}, result.tasks)
	require.Contains(t, result.output, "Uncommitted changes")
}

func TestHookTestsTheCodeBeingPushedRatherThanACachedResult(t *testing.T) {
	repo := newRepo(t)
	head := commit(t, repo, "server/rpc/handler.go")

	result := runHook(t, repo, pushLine(head, zeroSHA), nil)

	require.Equal(t, 0, result.exitCode, result.output)
	require.Equal(t, []string{"-count=1", "-count=1", "-count=1"}, result.goflags)
}

func pushLine(local, remote string) string {
	return "refs/heads/feature " + local + " refs/heads/feature " + remote + "\n"
}

// newRepo returns a repository holding one commit, recorded as origin/main the
// way a clone would record it, so the hook has a base to compare against. The
// commit spans two of the checked areas, so a run that checks the whole tree
// instead of the diff shows up as tasks the change did not ask for.
func newRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()

	git(t, dir, "init", "-b", "main")
	git(t, dir, "config", "user.email", "hook@example.test")
	git(t, dir, "config", "user.name", "Hook Test")
	base := commit(t, dir, "docs/base.md", "server/base.go", "web/base.ts")
	git(t, dir, "update-ref", "refs/remotes/origin/main", base)

	return dir
}

// commit writes each file with unique contents and commits them, returning the
// new commit's SHA.
func commit(t *testing.T, dir string, files ...string) string {
	t.Helper()

	for _, file := range files {
		path := filepath.Join(dir, file)
		require.NoError(t, os.MkdirAll(filepath.Dir(path), 0o755))
		require.NoError(t, os.WriteFile(path, []byte(t.Name()+file), 0o644))
	}

	git(t, dir, "add", "-A")
	git(t, dir, "commit", "-m", "change "+strings.Join(files, " "))

	return strings.TrimSpace(git(t, dir, "rev-parse", "HEAD"))
}

func git(t *testing.T, dir string, args ...string) string {
	t.Helper()

	cmd := exec.CommandContext(t.Context(), "git", args...)
	cmd.Dir = dir
	cmd.Env = isolatedEnv()
	out, err := cmd.CombinedOutput()
	require.NoError(t, err, string(out))

	return string(out)
}

// isolatedEnv keeps every Git command here pointed at the throwaway repository.
// Git exports GIT_DIR to the hooks it runs, so a suite run from the pre-push
// hook itself inherits it, and a repository set up under it is not the one the
// commands operate on: they reconfigure and commit to the real repository
// instead. The config files are stubbed out for the same reason.
func isolatedEnv(pathDirs ...string) []string {
	path := os.Getenv("PATH")
	for _, dir := range pathDirs {
		path = dir + string(os.PathListSeparator) + path
	}

	return []string{
		"PATH=" + path,
		"GIT_CONFIG_GLOBAL=" + os.DevNull,
		"GIT_CONFIG_SYSTEM=" + os.DevNull,
	}
}

func runHook(t *testing.T, dir, stdin string, env []string) hookResult {
	t.Helper()

	bin := t.TempDir()
	log := filepath.Join(bin, "tasks.log")
	require.NoError(t, os.WriteFile(filepath.Join(bin, "mise"), []byte(stubMise), 0o755))

	script, err := filepath.Abs("pre_push_hook.sh")
	require.NoError(t, err)

	cmd := exec.CommandContext(t.Context(), script)
	cmd.Dir = dir
	cmd.Stdin = strings.NewReader(stdin)
	cmd.Env = append(append(isolatedEnv(bin), "MISE_TASK_LOG="+log), env...)
	cmd.Env = append(cmd.Env, "GOFLAGS=")
	out, err := cmd.CombinedOutput()

	exitCode := 0
	var exit *exec.ExitError
	if err != nil {
		require.ErrorAs(t, err, &exit, string(out))
		exitCode = exit.ExitCode()
	}

	return hookResult{
		tasks:    readLines(t, log),
		goflags:  readLines(t, log+".goflags"),
		exitCode: exitCode,
		output:   string(out),
	}
}

func readLines(t *testing.T, path string) []string {
	t.Helper()

	contents, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return nil
	}
	require.NoError(t, err)

	var lines []string
	for line := range strings.SplitSeq(strings.TrimSpace(string(contents)), "\n") {
		if line != "" {
			lines = append(lines, line)
		}
	}

	return lines
}
