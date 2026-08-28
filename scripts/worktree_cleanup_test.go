package scripts_test

import (
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// worktree_clean.sh and worktree_sweep.sh are exercised against real Git
// worktrees and real processes: the listeners they kill are 'sleep' processes
// the test starts, and a stubbed 'lsof' is what says they hold the ports. Only
// the things a test cannot own — Docker and GitHub — are stubbed.

// stubLsof answers the probe of a single port from LSOF_<port>, a list of
// alternating pids and command names, and the listing of every listener from
// LSOF_ALL, which is already in lsof's field format.
const stubLsof = `#!/bin/sh
port=$(echo "$*" | sed -n 's/.*-iTCP:\([0-9]*\).*/\1/p')
if [ -z "$port" ]; then
  printf '%s' "${LSOF_ALL:-}"
  exit 0
fi
eval "spec=\${LSOF_$port:-}"
[ -n "$spec" ] || exit 1
set -- $spec
while [ $# -gt 0 ]; do
  printf 'p%s\nc%s\n' "$1" "$2"
  shift 2
done
`

// stubDockerStop answers 'ps' from DOCKER_PS, whose lines are a running
// container and the ports it publishes, and records what was stopped and
// removed so a test can assert that nothing else was touched. A 'ps' that does
// not ask for the ports gets the names alone, as Docker's own does.
const stubDockerStop = `#!/bin/sh
case "$1" in
  ps)
    case "$*" in
      *Ports*) printf '%s' "${DOCKER_PS:-}" ;;
      *) printf '%s' "${DOCKER_PS:-}" | cut -f1 ;;
    esac
    ;;
  stop) shift; echo "$*" >> "$DOCKER_STOP_LOG" ;;
  rm) shift; echo "$*" >> "$DOCKER_RM_LOG" ;;
esac
exit 0
`

// running renders the DOCKER_PS lines for a worktree's two containers.
func running(dir string, slot int) string {
	name := filepath.Base(dir) + "-" + strconv.Itoa(slot)
	port := slotBase + slot*slotWidth

	return "DOCKER_PS=" + strings.Join([]string{
		"getstronger-" + name + "\t0.0.0.0:" + strconv.Itoa(port) + "->5432/tcp",
		"getstronger-mailhog-" + name + "\t0.0.0.0:" + strconv.Itoa(port+7) + "->1025/tcp",
		"",
	}, "\n")
}

// stubGH answers 'gh pr view <branch> --json state' from the GH_STATES file,
// whose lines are a branch and its state. A branch that is not in it has no
// pull request, which is what gh itself reports with a non-zero exit.
const stubGH = `#!/bin/sh
for arg in "$@"; do
  case "$prev" in view) branch="$arg" ;; esac
  prev="$arg"
done
state=$(awk -v b="$branch" '$1 == b { print $2 }' "${GH_STATES:-/dev/null}")
[ -n "$state" ] || exit 1
echo "$state"
`

func TestCleanLeavesTheMainCheckoutAlone(t *testing.T) {
	main := newCheckout(t)

	result := runCleanup(t, "worktree_clean.sh", main, nil, nil)

	require.Equal(t, 0, result.exitCode, result.output)
	require.Empty(t, result.stopped)
}

func TestCleanStopsTheContainersAndKillsTheListeners(t *testing.T) {
	main := newCheckout(t)
	tree := addWorktree(t, main, "feature-a")
	configure(t, tree, 3)
	server := spawnSleeper(t)

	result := runCleanup(t, "worktree_clean.sh", tree, nil, []string{
		running(tree, 3),
		listener(3, 1, server.pid, "main"),
	})

	require.Equal(t, 0, result.exitCode, result.output)
	require.Equal(t, []string{"getstronger-feature-a-3 getstronger-mailhog-feature-a-3"}, result.stopped)
	require.Empty(t, result.removed, "a stopped container keeps its database")
	requireExited(t, server)
}

// Running it twice, or in a worktree whose stack was never started, has
// nothing to report: Docker stops a stopped container without complaint, and
// saying so reads as though something was still running.
func TestCleanSaysNothingAboutContainersAlreadyStopped(t *testing.T) {
	main := newCheckout(t)
	tree := addWorktree(t, main, "feature-a")
	configure(t, tree, 3)

	result := runCleanup(t, "worktree_clean.sh", tree, nil, nil)

	require.Equal(t, 0, result.exitCode, result.output)
	require.Empty(t, result.stopped)
	require.NotContains(t, result.output, "getstronger-feature-a-3")
}

// Docker publishes every container's ports itself, so its listener stands for
// the container. Killing it would take down every worktree's stack at once.
func TestCleanNeverKillsDocker(t *testing.T) {
	main := newCheckout(t)
	tree := addWorktree(t, main, "feature-a")
	configure(t, tree, 3)
	daemon := spawnSleeper(t)

	result := runCleanup(t, "worktree_clean.sh", tree, nil, []string{
		listener(3, 0, daemon.pid, "com.docker.backend"),
	})

	require.Equal(t, 0, result.exitCode, result.output)
	requireAlive(t, daemon)
}

func TestCleanDoesNothingWithoutAStackOfItsOwn(t *testing.T) {
	main := newCheckout(t)
	tree := addWorktree(t, main, "feature-a")

	result := runCleanup(t, "worktree_clean.sh", tree, nil, nil)

	require.Equal(t, 0, result.exitCode, result.output)
	require.Empty(t, result.stopped)
	require.Contains(t, result.output, "worktree:env")
}

// '/clear' ends a session and starts another in the same worktree. Stopping
// the stack there takes the database out from under the next prompt.
func TestCleanKeepsTheStackWhenTheSessionOnlyCleared(t *testing.T) {
	main := newCheckout(t)
	tree := addWorktree(t, main, "feature-a")
	configure(t, tree, 3)
	server := spawnSleeper(t)

	result := runCleanup(t, "worktree_clean.sh", tree, []string{"--session-end"}, []string{
		listener(3, 1, server.pid, "main"),
		`HOOK_PAYLOAD={"session_id":"abc","reason":"clear"}`,
	})

	require.Equal(t, 0, result.exitCode, result.output)
	require.Empty(t, result.stopped)
	requireAlive(t, server)
}

func TestCleanFreesTheStackWhenTheSessionEnded(t *testing.T) {
	main := newCheckout(t)
	tree := addWorktree(t, main, "feature-a")
	configure(t, tree, 3)
	server := spawnSleeper(t)

	result := runCleanup(t, "worktree_clean.sh", tree, []string{"--session-end"}, []string{
		running(tree, 3),
		listener(3, 1, server.pid, "main"),
		`HOOK_PAYLOAD={"session_id":"abc","reason":"prompt_input_exit"}`,
	})

	require.Equal(t, 0, result.exitCode, result.output)
	require.Equal(t, []string{"getstronger-feature-a-3 getstronger-mailhog-feature-a-3"}, result.stopped)
	requireExited(t, server)
}

func TestSweepFreesAWorktreeWhosePullRequestIsMerged(t *testing.T) {
	main := newCheckout(t)
	merged := addWorktree(t, main, "feature-a")
	configure(t, merged, 5)
	server := spawnSleeper(t)

	result := runCleanup(t, "worktree_sweep.sh", main, nil, []string{
		states(t, "feature-a MERGED"),
		running(merged, 5),
		listener(5, 1, server.pid, "main"),
	})

	require.Equal(t, 0, result.exitCode, result.output)
	require.Equal(t, []string{"getstronger-feature-a-5 getstronger-mailhog-feature-a-5"}, result.stopped)
	require.Empty(t, result.removed, "the worktree and its database stay")
	requireExited(t, server)
}

func TestSweepLeavesAWorktreeWhosePullRequestIsOpen(t *testing.T) {
	main := newCheckout(t)
	open := addWorktree(t, main, "feature-a")
	configure(t, open, 3)
	server := spawnSleeper(t)

	result := runCleanup(t, "worktree_sweep.sh", main, nil, []string{
		states(t, "feature-a OPEN"),
		listener(3, 1, server.pid, "main"),
	})

	require.Equal(t, 0, result.exitCode, result.output)
	require.Empty(t, result.stopped)
	requireAlive(t, server)
}

// The sweep runs at the start of a session, in the worktree that session is
// about to work in. A merged pull request is no reason to stop the stack the
// developer is looking at.
func TestSweepSkipsTheWorktreeItRunsIn(t *testing.T) {
	main := newCheckout(t)
	here := addWorktree(t, main, "feature-a")
	configure(t, here, 3)

	result := runCleanup(t, "worktree_sweep.sh", here, nil, []string{
		states(t, "feature-a MERGED"),
	})

	require.Equal(t, 0, result.exitCode, result.output)
	require.Empty(t, result.stopped)
}

func TestSweepStopsContainersWhoseWorktreeIsGone(t *testing.T) {
	main := newCheckout(t)
	server := spawnSleeper(t)

	result := runCleanup(t, "worktree_sweep.sh", main, nil, []string{
		"DOCKER_PS=getstronger-gone-7\t0.0.0.0:20140->5432/tcp\n",
		listener(7, 1, server.pid, "main"),
	})

	require.Equal(t, 0, result.exitCode, result.output)
	require.Equal(t, []string{"getstronger-gone-7"}, result.stopped)
	require.Empty(t, result.removed)
	require.Contains(t, result.output, "worktree:prune")
	requireExited(t, server)
}

// A worktree whose containers were pruned long ago can still have left a
// backend running, and nothing names the slot it holds any more.
func TestSweepStopsServersOfAWorktreeThatIsGone(t *testing.T) {
	main := newCheckout(t)
	here := addWorktree(t, main, "feature-a")
	configure(t, here, 3)
	stray := spawnSleeper(t)
	mine := spawnSleeper(t)

	result := runCleanup(t, "worktree_sweep.sh", here, nil, []string{
		allListeners(
			t,
			listening(stray.pid, "main", 7, 1),
			listening(mine.pid, "main", 3, 1),
		),
	})

	require.Equal(t, 0, result.exitCode, result.output)
	requireExited(t, stray)
	requireAlive(t, mine, "the slot belongs to a worktree that is still there")
}

// The slot block is this repository's, not the machine's. An editor or a
// database of the developer's own that happens to listen inside it is not a
// leftover of a worktree.
func TestSweepLeavesProcessesThatAreNotPartOfTheStack(t *testing.T) {
	main := newCheckout(t)
	theirs := spawnSleeper(t)

	result := runCleanup(t, "worktree_sweep.sh", main, nil, []string{
		allListeners(t, listening(theirs.pid, "Rider", 7, 1)),
	})

	require.Equal(t, 0, result.exitCode, result.output)
	requireAlive(t, theirs, "only the stack's own servers are swept")
}

func TestSweepKeepsTheMainCheckoutsOwnContainers(t *testing.T) {
	main := newCheckout(t)

	result := runCleanup(t, "worktree_sweep.sh", main, nil, []string{
		"DOCKER_PS=getstronger\t0.0.0.0:5433->5432/tcp\ngetstronger-mailhog\t0.0.0.0:1025->1025/tcp\n",
	})

	require.Equal(t, 0, result.exitCode, result.output)
	require.Empty(t, result.stopped)
}

// Without an answer from GitHub there is no telling a merged branch from an
// open one, and a sweep that guessed would stop a stack still in use. The
// containers of a worktree that is gone need no answer.
func TestSweepLeavesWorktreesWhenGitHubCannotAnswer(t *testing.T) {
	main := newCheckout(t)
	open := addWorktree(t, main, "feature-a")
	configure(t, open, 3)

	result := runCleanup(t, "worktree_sweep.sh", main, nil, []string{
		"GH_STATES=" + os.DevNull,
		"DOCKER_PS=getstronger-gone-7\t0.0.0.0:20140->5432/tcp\n",
	})

	require.Equal(t, 0, result.exitCode, result.output)
	require.Equal(t, []string{"getstronger-gone-7"}, result.stopped)
}

type cleanupResult struct {
	exitCode int
	output   string
	stopped  []string
	removed  []string
}

// configure writes the mise.local.toml 'mise run worktree:env' would write, so
// the cleanup scripts read a slot and container names the way they do in a
// worktree a developer has set up.
func configure(t *testing.T, dir string, slot int) {
	t.Helper()

	name := filepath.Base(dir)
	write(t, dir, "mise.local.toml", strings.Join([]string{
		"[env]",
		`WORKTREE_SLOT = "` + strconv.Itoa(slot) + `"`,
		`DB_CONTAINER = "getstronger-` + name + "-" + strconv.Itoa(slot) + `"`,
		`MAILHOG_CONTAINER = "getstronger-mailhog-` + name + "-" + strconv.Itoa(slot) + `"`,
		"",
	}, "\n"))
}

// listener tells the stubbed lsof that a process holds the given port of a
// slot's block.
func listener(slot, offset, pid int, command string) string {
	port := slotBase + slot*slotWidth + offset

	return "LSOF_" + strconv.Itoa(port) + "=" + strconv.Itoa(pid) + " " + command
}

// listening renders one lsof field record: a process, and the port of a slot's
// block that it holds.
func listening(pid int, command string, slot, offset int) string {
	port := slotBase + slot*slotWidth + offset

	return "p" + strconv.Itoa(pid) + "\nc" + command + "\nn*:" + strconv.Itoa(port)
}

func allListeners(t *testing.T, records ...string) string {
	t.Helper()

	return "LSOF_ALL=" + strings.Join(records, "\n") + "\n"
}

func states(t *testing.T, lines ...string) string {
	t.Helper()

	path := filepath.Join(t.TempDir(), "states")
	require.NoError(t, os.WriteFile(path, []byte(strings.Join(lines, "\n")+"\n"), 0o644))

	return "GH_STATES=" + path
}

type sleeper struct {
	pid  int
	done chan struct{}
}

// spawnSleeper starts a process the scripts are meant to kill. It is a real
// one: a stubbed 'kill' would prove only that the script called it.
func spawnSleeper(t *testing.T) *sleeper {
	t.Helper()

	cmd := exec.CommandContext(t.Context(), "sleep", "600")
	require.NoError(t, cmd.Start())

	done := make(chan struct{})
	go func() {
		_ = cmd.Wait()
		close(done)
	}()

	return &sleeper{pid: cmd.Process.Pid, done: done}
}

func requireExited(t *testing.T, s *sleeper) {
	t.Helper()

	select {
	case <-s.done:
	case <-time.After(10 * time.Second):
		t.Fatalf("process %d is still running", s.pid)
	}
}

func requireAlive(t *testing.T, s *sleeper, because ...string) {
	t.Helper()

	select {
	case <-s.done:
		t.Fatalf("process %d was killed: %s", s.pid, strings.Join(because, " "))
	case <-time.After(200 * time.Millisecond):
	}
}

func runCleanup(t *testing.T, script, dir string, args, env []string) cleanupResult {
	t.Helper()

	bin := t.TempDir()
	stopped := filepath.Join(bin, "stopped.log")
	removed := filepath.Join(bin, "removed.log")
	require.NoError(t, os.WriteFile(filepath.Join(bin, "lsof"), []byte(stubLsof), 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(bin, "docker"), []byte(stubDockerStop), 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(bin, "gh"), []byte(stubGH), 0o755))

	path, err := filepath.Abs(script)
	require.NoError(t, err)

	cmd := exec.CommandContext(t.Context(), path, args...)
	cmd.Dir = dir
	cmd.Env = append(isolatedEnv(bin), "DOCKER_STOP_LOG="+stopped, "DOCKER_RM_LOG="+removed)
	// The hook payload reaches a hook on stdin, so that is where a test that
	// sets HOOK_PAYLOAD puts it rather than in the environment.
	for _, entry := range env {
		if payload, found := strings.CutPrefix(entry, "HOOK_PAYLOAD="); found {
			cmd.Stdin = strings.NewReader(payload)

			continue
		}
		cmd.Env = append(cmd.Env, entry)
	}
	out, err := cmd.CombinedOutput()

	exitCode := 0
	var exit *exec.ExitError
	if err != nil {
		require.ErrorAs(t, err, &exit, string(out))
		exitCode = exit.ExitCode()
	}

	return cleanupResult{
		exitCode: exitCode,
		output:   string(out),
		stopped:  readLines(t, stopped),
		removed:  readLines(t, removed),
	}
}
