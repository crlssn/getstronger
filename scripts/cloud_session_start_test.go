package scripts_test

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// The hook runs on every session, cloud and local, so the tests drive it the
// way Claude Code does: with CLAUDE_PROJECT_DIR pointing at a checkout, and
// with stub 'docker' and 'service' binaries ahead of the real ones on PATH.
// CLAUDE_CODE_REMOTE_SESSION_ID is what tells the two kinds of session apart.

const stubCloudDocker = `#!/bin/sh
echo "docker $*" >> "$STUB_LOG"
if [ "$1" = "info" ]; then exit ${DOCKER_INFO_EXIT:-0}; fi
exit 0
`

const stubCloudService = `#!/bin/sh
echo "service $*" >> "$STUB_LOG"
exit ${SERVICE_EXIT:-0}
`

type sessionStartResult struct {
	calls    string
	exitCode int
	output   string
}

func TestSessionStartIgnoresALocalSession(t *testing.T) {
	root := newCheckout(t)

	result := runSessionStart(t, root, nil)

	require.Equal(t, 0, result.exitCode, result.output)
	require.Empty(t, result.calls, "a local session already has its own stack")
	require.NoFileExists(t, filepath.Join(root, ".env"))
}

func TestSessionStartStartsTheDockerDaemon(t *testing.T) {
	root := newCheckout(t)

	result := runSessionStart(t, root, []string{
		"CLAUDE_CODE_REMOTE_SESSION_ID=cse_test",
		"DOCKER_INFO_EXIT=1",
		"CLOUD_DOCKER_WAIT=1",
	})

	require.Equal(t, 0, result.exitCode, result.output)
	require.Contains(t, result.calls, "service docker start")
}

func TestSessionStartLeavesARunningDaemonAlone(t *testing.T) {
	root := newCheckout(t)

	result := runSessionStart(t, root, []string{"CLAUDE_CODE_REMOTE_SESSION_ID=cse_test"})

	require.Equal(t, 0, result.exitCode, result.output)
	require.Contains(t, result.calls, "docker info")
	require.NotContains(t, result.calls, "service docker start")
}

func TestSessionStartWritesTheEnvironmentFile(t *testing.T) {
	root := newCheckout(t)

	result := runSessionStart(t, root, []string{"CLAUDE_CODE_REMOTE_SESSION_ID=cse_test"})

	require.Equal(t, 0, result.exitCode, result.output)
	example, err := os.ReadFile(filepath.Join(root, ".env.example"))
	require.NoError(t, err)
	require.FileExists(t, filepath.Join(root, ".env"))
	contents, err := os.ReadFile(filepath.Join(root, ".env"))
	require.NoError(t, err)
	require.Equal(t, string(example), string(contents))
}

func TestSessionStartKeepsAnExistingEnvironmentFile(t *testing.T) {
	root := newCheckout(t)
	require.NoError(t, os.WriteFile(filepath.Join(root, ".env"), []byte("DB_NAME=mine\n"), 0o600))

	result := runSessionStart(t, root, []string{"CLAUDE_CODE_REMOTE_SESSION_ID=cse_test"})

	require.Equal(t, 0, result.exitCode, result.output)
	contents, err := os.ReadFile(filepath.Join(root, ".env"))
	require.NoError(t, err)
	require.Equal(t, "DB_NAME=mine\n", string(contents))
}

// A session that fails to start is worse than one without a database, so no
// step may fail the hook. The cloud image's setup script has the same rule.
func TestSessionStartSurvivesAnUnusableDocker(t *testing.T) {
	root := newCheckout(t)

	result := runSessionStart(t, root, []string{
		"CLAUDE_CODE_REMOTE_SESSION_ID=cse_test",
		"DOCKER_INFO_EXIT=1",
		"SERVICE_EXIT=1",
		"CLOUD_DOCKER_WAIT=1",
	})

	require.Equal(t, 0, result.exitCode, result.output)
	require.FileExists(t, filepath.Join(root, ".env"), "the rest of the hook still ran")
}

func runSessionStart(t *testing.T, root string, env []string) sessionStartResult {
	t.Helper()

	stubs := t.TempDir()
	log := filepath.Join(stubs, "calls.log")
	for name, body := range map[string]string{"docker": stubCloudDocker, "service": stubCloudService} {
		require.NoError(t, os.WriteFile(filepath.Join(stubs, name), []byte(body), 0o755))
	}

	script, err := filepath.Abs("cloud_session_start.sh")
	require.NoError(t, err)

	cmd := exec.CommandContext(t.Context(), script)
	cmd.Dir = root
	cmd.Env = append(isolatedEnv(stubs), "STUB_LOG="+log, "CLAUDE_PROJECT_DIR="+root)
	cmd.Env = append(cmd.Env, env...)
	out, err := cmd.CombinedOutput()

	exitCode := 0
	var exit *exec.ExitError
	if err != nil {
		require.ErrorAs(t, err, &exit, string(out))
		exitCode = exit.ExitCode()
	}

	calls, readErr := os.ReadFile(log)
	if readErr != nil {
		require.ErrorIs(t, readErr, os.ErrNotExist)
	}

	return sessionStartResult{
		calls:    strings.TrimSpace(string(calls)),
		exitCode: exitCode,
		output:   string(out),
	}
}
