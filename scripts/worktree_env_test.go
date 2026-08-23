package scripts_test

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// worktree_env.sh is exercised the way a developer runs it: from a throwaway
// repository with real Git worktrees, and with stubbed 'nc' and 'docker' so a
// test can say what is listening and what containers exist without depending on
// the machine it runs on.

const (
	slotBase  = 20000
	slotWidth = 20
	slotCount = 99
)

// stubNC answers the port probe. NC_BUSY_PORTS lists the ports to report as
// listening; everything else is free.
const stubNC = `#!/bin/sh
port=$(eval echo \$$#)
for busy in ${NC_BUSY_PORTS:-}; do
  [ "$busy" = "$port" ] && exit 0
done
exit 1
`

// stubDocker prints DOCKER_PS for any 'ps' invocation and records removals, so
// a test can assert that nothing else was removed.
const stubDocker = `#!/bin/sh
case "$1" in
  ps) printf '%s' "${DOCKER_PS:-}" ;;
  rm) shift; echo "$*" >> "$DOCKER_RM_LOG" ;;
esac
exit 0
`

func TestMainCheckoutKeepsTheDefaultPorts(t *testing.T) {
	main := newCheckout(t)

	result := runEnv(t, main, nil)

	require.Equal(t, 0, result.exitCode, result.output)
	require.NoFileExists(t, filepath.Join(main, "mise.local.toml"))
	require.Contains(t, readFile(t, filepath.Join(main, ".claude/launch.json")), `"port": 5173`)
}

func TestWorktreeGetsItsOwnPortsAndContainers(t *testing.T) {
	main := newCheckout(t)
	tree := addWorktree(t, main, "feature-a")

	result := runEnv(t, tree, nil)

	require.Equal(t, 0, result.exitCode, result.output)
	slot := readSlot(t, tree)
	base := slotBase + slot*slotWidth
	local := readFile(t, filepath.Join(tree, "mise.local.toml"))
	require.Contains(t, local, fmt.Sprintf(`WEB_DEV_PORT = "%d"`, base+3))
	require.Contains(t, local, fmt.Sprintf(`DB_CONTAINER = "getstronger-feature-a-%d"`, slot))
	require.Contains(t, readFile(t, filepath.Join(tree, ".env")), fmt.Sprintf("DB_PORT=%d", base))
	require.Contains(t, readFile(t, filepath.Join(tree, "web/.env")), fmt.Sprintf("VITE_API_URL=http://localhost:%d", base+1))
	require.Contains(t, readFile(t, filepath.Join(tree, ".claude/launch.json")), fmt.Sprintf(`"port": %d`, base+3))
}

// The failure this issue is about: the first worktree's containers are stopped
// and its servers are not running, so nothing is listening on its ports.
func TestStoppedWorktreeKeepsItsSlot(t *testing.T) {
	main := newCheckout(t)
	first := addWorktree(t, main, "feature-a")
	second := addWorktree(t, main, "feature-b")

	require.Equal(t, 0, runEnv(t, first, nil).exitCode)
	result := runEnv(t, second, nil)

	require.Equal(t, 0, result.exitCode, result.output)
	require.Equal(t, 1, readSlot(t, first))
	require.Equal(t, 2, readSlot(t, second), "the recorded claim is honoured, not the idle ports")
}

func TestRecordedSlotIsKeptAcrossRuns(t *testing.T) {
	main := newCheckout(t)
	tree := addWorktree(t, main, "feature-a")

	require.Equal(t, 0, runEnv(t, tree, nil).exitCode)
	slot := readSlot(t, tree)
	require.Equal(t, 0, runEnv(t, tree, nil).exitCode)

	require.Equal(t, slot, readSlot(t, tree))
}

// A worktree whose recorded slot another worktree also holds is renumbered
// rather than left sharing a database.
func TestCollidingSlotIsRenumbered(t *testing.T) {
	main := newCheckout(t)
	first := addWorktree(t, main, "feature-a")
	second := addWorktree(t, main, "feature-b")
	writeSlot(t, first, 42)
	writeSlot(t, second, 42)

	result := runEnv(t, second, nil)

	require.Equal(t, 0, result.exitCode, result.output)
	require.NotEqual(t, 42, readSlot(t, second))
	require.Equal(t, 42, readSlot(t, first), "the other worktree keeps its slot")
	require.Contains(t, result.output, "Renumbering")
}

// A container left behind by a removed worktree still holds the host port, so
// its slot is not free even though no worktree records it.
func TestOrphanedContainerKeepsItsSlot(t *testing.T) {
	main := newCheckout(t)
	tree := addWorktree(t, main, "feature-a")

	result := runEnv(t, tree, []string{
		"DOCKER_PS=getstronger-gone-7\t0.0.0.0:20140->5432/tcp, [::]:20140->5432/tcp\n",
	})

	require.Equal(t, 0, result.exitCode, result.output)
	require.NotEqual(t, 7, readSlot(t, tree))
}

// The port probe stays as a second check for anything the claims do not record.
func TestListeningPortStillBlocksASlot(t *testing.T) {
	main := newCheckout(t)
	tree := addWorktree(t, main, "feature-a")

	result := runEnv(t, tree, []string{"NC_BUSY_PORTS=20025"})

	require.Equal(t, 0, result.exitCode, result.output)
	require.NotEqual(t, 1, readSlot(t, tree))
}

// This worktree's own containers are its own claim, not somebody else's.
func TestOwnContainerDoesNotBlockTheRecordedSlot(t *testing.T) {
	main := newCheckout(t)
	tree := addWorktree(t, main, "feature-a")
	writeSlot(t, tree, 5)

	result := runEnv(t, tree, []string{
		"DOCKER_PS=getstronger-feature-a-5\t0.0.0.0:20100->5432/tcp\n",
	})

	require.Equal(t, 0, result.exitCode, result.output)
	require.Equal(t, 5, readSlot(t, tree))
}

// A worktree configured before the containers carried the slot, or renumbered
// since, has containers under a name nothing will look for again.
func TestItReportsContainersLeftByAnEarlierConfiguration(t *testing.T) {
	main := newCheckout(t)
	tree := addWorktree(t, main, "feature-a")

	result := runEnv(t, tree, []string{"DOCKER_PS=getstronger-feature-a\t0.0.0.0:20580->5432/tcp\n"})

	require.Equal(t, 0, result.exitCode, result.output)
	require.Contains(t, result.output, "docker rename")
	require.Contains(t, result.output, "getstronger-feature-a\n")
}

func TestItFailsRatherThanDoubleBookingWhenEverySlotIsClaimed(t *testing.T) {
	main := newCheckout(t)
	tree := addWorktree(t, main, "feature-a")
	for slot := 1; slot <= slotCount; slot++ {
		claim := filepath.Join(main, ".claude/worktrees", fmt.Sprintf("claimed-%d", slot))
		require.NoError(t, os.MkdirAll(claim, 0o755))
		writeSlot(t, claim, slot)
	}

	result := runEnv(t, tree, nil)

	require.Equal(t, 1, result.exitCode, result.output)
	require.Contains(t, result.output, "worktree:prune")
	require.NoFileExists(t, filepath.Join(tree, "mise.local.toml"))
}

func TestItNamesCoreBareWhenThereIsNoWorkingTree(t *testing.T) {
	dir := t.TempDir()

	result := runEnv(t, dir, nil)

	require.Equal(t, 1, result.exitCode, result.output)
	require.Contains(t, result.output, "core.bare")
}

// core.bare in the shared config takes out every worktree at once, so the main
// checkout's copy moves to where only the main checkout reads it.
func TestCoreBareMovesIntoTheMainCheckoutsWorktreeConfig(t *testing.T) {
	main := newCheckout(t)
	git(t, main, "config", "extensions.worktreeConfig", "true")

	result := runEnv(t, main, nil)

	require.Equal(t, 0, result.exitCode, result.output)
	shared := readFile(t, filepath.Join(main, ".git/config"))
	require.NotContains(t, shared, "bare = ")
	require.Contains(t, readFile(t, filepath.Join(main, ".git/config.worktree")), "bare = false")
}

func TestWorktreePinsCoreBareForItself(t *testing.T) {
	main := newCheckout(t)
	git(t, main, "config", "extensions.worktreeConfig", "true")
	tree := addWorktree(t, main, "feature-a")

	require.Equal(t, 0, runEnv(t, tree, nil).exitCode)

	config := filepath.Join(main, ".git/worktrees/feature-a/config.worktree")
	require.Contains(t, readFile(t, config), "bare = false")
}

type scriptResult struct {
	exitCode int
	output   string
	removed  []string
}

// newCheckout returns a main checkout holding the files worktree_env.sh renders
// its output from, plus the worktrees directory Claude Code puts worktrees in.
func newCheckout(t *testing.T) string {
	t.Helper()

	dir, err := filepath.EvalSymlinks(t.TempDir())
	require.NoError(t, err)
	dir = filepath.Join(dir, "getstronger")
	require.NoError(t, os.MkdirAll(dir, 0o755))

	git(t, dir, "init", "-b", "main")
	git(t, dir, "config", "user.email", "worktree@example.test")
	git(t, dir, "config", "user.name", "Worktree Test")

	write(t, dir, ".env.example", "DB_PORT=5433\nSERVER_PORT=8080\nSSE_PORT=8081\nCORS_ALLOWED_ORIGIN=http://localhost:5173\nMAILHOG_SMTP_PORT=1025\n")
	write(t, dir, "web/.env.example", "VITE_API_URL=http://localhost:8080\n")
	write(t, dir, ".claude/launch.json.example", `{"configurations": [{"port": 5173}]}`+"\n")
	require.NoError(t, os.MkdirAll(filepath.Join(dir, ".claude/worktrees"), 0o755))

	git(t, dir, "add", "-A")
	git(t, dir, "commit", "-m", "initial")

	return dir
}

func addWorktree(t *testing.T, main, name string) string {
	t.Helper()

	path := filepath.Join(main, ".claude/worktrees", name)
	git(t, main, "worktree", "add", "-b", name, path)

	return path
}

func writeSlot(t *testing.T, dir string, slot int) {
	t.Helper()
	write(t, dir, "mise.local.toml", fmt.Sprintf("[env]\nWORKTREE_SLOT = \"%d\"\n", slot))
}

func readSlot(t *testing.T, dir string) int {
	t.Helper()

	for line := range strings.SplitSeq(readFile(t, filepath.Join(dir, "mise.local.toml")), "\n") {
		if strings.HasPrefix(line, "WORKTREE_SLOT =") {
			slot, err := strconv.Atoi(strings.Trim(strings.SplitN(line, "=", 2)[1], ` "`))
			require.NoError(t, err)

			return slot
		}
	}
	t.Fatalf("no WORKTREE_SLOT recorded in %s", dir)

	return 0
}

func write(t *testing.T, dir, name, contents string) {
	t.Helper()

	path := filepath.Join(dir, name)
	require.NoError(t, os.MkdirAll(filepath.Dir(path), 0o755))
	require.NoError(t, os.WriteFile(path, []byte(contents), 0o644))
}

func readFile(t *testing.T, path string) string {
	t.Helper()

	contents, err := os.ReadFile(path)
	require.NoError(t, err)

	return string(contents)
}

func runEnv(t *testing.T, dir string, env []string) scriptResult {
	t.Helper()

	return runScript(t, "worktree_env.sh", dir, env)
}

func runScript(t *testing.T, script, dir string, env []string) scriptResult {
	t.Helper()

	bin := t.TempDir()
	removed := filepath.Join(bin, "removed.log")
	require.NoError(t, os.WriteFile(filepath.Join(bin, "nc"), []byte(stubNC), 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(bin, "docker"), []byte(stubDocker), 0o755))

	path, err := filepath.Abs(script)
	require.NoError(t, err)

	cmd := exec.CommandContext(t.Context(), path)
	cmd.Dir = dir
	cmd.Env = append(isolatedEnv(bin), "DOCKER_RM_LOG="+removed)
	cmd.Env = append(cmd.Env, env...)
	out, err := cmd.CombinedOutput()

	exitCode := 0
	var exit *exec.ExitError
	if err != nil {
		require.ErrorAs(t, err, &exit, string(out))
		exitCode = exit.ExitCode()
	}

	return scriptResult{exitCode: exitCode, output: string(out), removed: readLines(t, removed)}
}

// The guard is what stands between an unconfigured worktree and the main
// checkout's containers: without mise.local.toml a worktree inherits the
// documented defaults, so 'mise run db:clean' deletes the main database.

func TestGuardAllowsTheMainCheckout(t *testing.T) {
	main := newCheckout(t)

	result := runScript(t, "worktree_guard.sh", main, nil)

	require.Equal(t, 0, result.exitCode, result.output)
}

func TestGuardAllowsAConfiguredWorktree(t *testing.T) {
	main := newCheckout(t)
	tree := addWorktree(t, main, "feature-a")
	require.Equal(t, 0, runEnv(t, tree, nil).exitCode)

	result := runScript(t, "worktree_guard.sh", tree, []string{
		"WORKTREE_SLOT=" + strconv.Itoa(readSlot(t, tree)),
		"DB_CONTAINER=getstronger-feature-a-1",
	})

	require.Equal(t, 0, result.exitCode, result.output)
}

func TestGuardRefusesAnUnconfiguredWorktree(t *testing.T) {
	main := newCheckout(t)
	tree := addWorktree(t, main, "feature-a")

	result := runScript(t, "worktree_guard.sh", tree, []string{"DB_CONTAINER=getstronger"})

	require.Equal(t, 1, result.exitCode, result.output)
	require.Contains(t, result.output, "mise run worktree:env")
}

// The slot alone is not enough: a stale mise.local.toml can name it while the
// container is still the shared default.
func TestGuardRefusesAWorktreeStillOnTheDefaultContainer(t *testing.T) {
	main := newCheckout(t)
	tree := addWorktree(t, main, "feature-a")

	result := runScript(t, "worktree_guard.sh", tree, []string{
		"WORKTREE_SLOT=4",
		"DB_CONTAINER=getstronger",
	})

	require.Equal(t, 1, result.exitCode, result.output)
	require.Contains(t, result.output, "mise run worktree:env")
}

func TestPruneListsOnlyContainersWhoseWorktreeIsGone(t *testing.T) {
	main := newCheckout(t)
	addWorktree(t, main, "feature-a")

	result := runScript(t, "worktree_prune.sh", main, []string{
		"DOCKER_PS=getstronger\ngetstronger-mailhog\ngetstronger-feature-a-1\ngetstronger-mailhog-feature-a-1\ngetstronger-gone-7\ngetstronger-mailhog-gone-7\n",
	})

	require.Equal(t, 0, result.exitCode, result.output)
	require.Contains(t, result.output, "getstronger-gone-7")
	require.Contains(t, result.output, "getstronger-mailhog-gone-7")
	require.NotContains(t, result.output, "getstronger-feature-a-1")
	require.Empty(t, result.removed, "listing removes nothing")
}

func TestPruneRemovesOnlyWithForce(t *testing.T) {
	main := newCheckout(t)
	addWorktree(t, main, "feature-a")

	result := runScript(t, "worktree_prune.sh", main, []string{
		"DOCKER_PS=getstronger\ngetstronger-mailhog\ngetstronger-feature-a-1\ngetstronger-gone-7\n",
		"usage_force=true",
	})

	require.Equal(t, 0, result.exitCode, result.output)
	require.Equal(t, []string{"-f getstronger-gone-7"}, result.removed)
}

// A worktree removed from Git but still on disk keeps its containers: the
// directory is what a developer comes back to.
func TestPruneKeepsContainersOfADirectoryStillOnDisk(t *testing.T) {
	main := newCheckout(t)
	require.NoError(t, os.MkdirAll(filepath.Join(main, ".claude/worktrees/left-behind"), 0o755))

	result := runScript(t, "worktree_prune.sh", main, []string{
		"DOCKER_PS=getstronger-left-behind-3\n",
		"usage_force=true",
	})

	require.Equal(t, 0, result.exitCode, result.output)
	require.Empty(t, result.removed)
}
