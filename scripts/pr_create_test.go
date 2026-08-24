package scripts_test

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// The script's job is to make it impossible to open a pull request under the
// wrong account, so the test cares less about the happy path than about what
// happens when the token cannot be minted: gh must never run. gh, curl and git
// are stubbed onto PATH, so nothing here reaches GitHub.

const stubGh = `#!/bin/sh
{ printf '%s\n' "$@"; printf 'GH_TOKEN=%s\n' "${GH_TOKEN:-}"; } > "$GH_LOG"
echo "https://github.com/crlssn/getstronger/pull/999"
`

// Stands in for the base branch lookup: GIT_EXIT makes the branch missing.
const stubGit = `#!/bin/sh
printf '%s\n' "$@" > "$GIT_LOG"
exit "${GIT_EXIT:-0}"
`

type prResult struct {
	stdout   string
	stderr   string
	exitCode int
	ghArgs   []string
	ghRan    bool
	gitArgs  []string
}

func runPRCreate(t *testing.T, args []string, env map[string]string) prResult {
	t.Helper()

	dir := t.TempDir()

	require.NoError(t, os.WriteFile(filepath.Join(dir, "gh"), []byte(stubGh), 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "curl"), []byte(stubCurl), 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "git"), []byte(stubGit), 0o755))

	responseBody := filepath.Join(dir, "body.json")
	require.NoError(t, os.WriteFile(responseBody, []byte(`{"token":"ghs_minted"}`), 0o600))

	ghLog := filepath.Join(dir, "gh.log")
	curlLog := filepath.Join(dir, "curl.log")
	gitLog := filepath.Join(dir, "git.log")

	script, err := filepath.Abs("pr_create.sh")
	require.NoError(t, err)

	cmd := exec.CommandContext(t.Context(), "bash", append([]string{script}, args...)...)

	// mise exports the real GH_APP_* into every task, so a case meant to run
	// without one would otherwise silently pick the machine's value up.
	for _, entry := range os.Environ() {
		name, _, _ := strings.Cut(entry, "=")
		switch name {
		case "GH_APP_ID", "GH_APP_INSTALLATION_ID", "GH_APP_PRIVATE_KEY", "GH_TOKEN", "PATH":
			continue
		}
		cmd.Env = append(cmd.Env, entry)
	}
	cmd.Env = append(
		cmd.Env,
		"PATH="+dir+string(os.PathListSeparator)+os.Getenv("PATH"),
		"GH_LOG="+ghLog,
		"CURL_LOG="+curlLog,
		"GIT_LOG="+gitLog,
		"CURL_BODY="+responseBody,
	)
	for name, value := range env {
		cmd.Env = append(cmd.Env, name+"="+value)
	}

	var stdout, stderr strings.Builder
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	exitCode := 0
	if err := cmd.Run(); err != nil {
		var exitErr *exec.ExitError
		require.ErrorAs(t, err, &exitErr)
		exitCode = exitErr.ExitCode()
	}

	var ghArgs []string
	logged, err := os.ReadFile(ghLog)
	ghRan := err == nil
	if ghRan {
		ghArgs = strings.Split(strings.TrimRight(string(logged), "\n"), "\n")
	}

	var gitArgs []string
	if logged, err := os.ReadFile(gitLog); err == nil {
		gitArgs = strings.Split(strings.TrimRight(string(logged), "\n"), "\n")
	}

	return prResult{
		stdout:   stdout.String(),
		stderr:   stderr.String(),
		exitCode: exitCode,
		ghArgs:   ghArgs,
		ghRan:    ghRan,
		gitArgs:  gitArgs,
	}
}

func bodyFile(t *testing.T) string {
	t.Helper()

	path := filepath.Join(t.TempDir(), "body.md")
	require.NoError(t, os.WriteFile(path, []byte("## Why\n\nBecause.\n"), 0o600))

	return path
}

func TestPRCreateOpensThePullRequestWithTheAppToken(t *testing.T) {
	t.Parallel()

	_, keyPath := writeKey(t)
	body := bodyFile(t)

	result := runPRCreate(t, []string{"fix: something", body}, map[string]string{
		"GH_APP_ID":              testAppID,
		"GH_APP_INSTALLATION_ID": testInstallationID,
		"GH_APP_PRIVATE_KEY":     keyPath,
	})

	require.Equal(t, 0, result.exitCode, result.stderr)
	require.True(t, result.ghRan)
	require.Contains(t, result.ghArgs, "pr")
	require.Contains(t, result.ghArgs, "create")
	require.Contains(t, result.ghArgs, "fix: something")
	require.Contains(t, result.ghArgs, body)
	require.Contains(t, result.ghArgs, "GH_TOKEN=ghs_minted",
		"gh runs as the app, not as whoever is logged in")
	require.NotContains(t, result.ghArgs, "--base",
		"without a base, gh targets the default branch itself")
}

// Stacking: the pull request has to target the branch below it, or a reviewer
// reads the whole stack's diff.
func TestPRCreateTargetsTheGivenBase(t *testing.T) {
	t.Parallel()

	_, keyPath := writeKey(t)
	body := bodyFile(t)

	result := runPRCreate(t, []string{"fix: something", body, "--base", "claude/below"}, map[string]string{
		"GH_APP_ID":              testAppID,
		"GH_APP_INSTALLATION_ID": testInstallationID,
		"GH_APP_PRIVATE_KEY":     keyPath,
	})

	require.Equal(t, 0, result.exitCode, result.stderr)
	require.True(t, result.ghRan)
	require.Contains(t, result.ghArgs, "--base")
	require.Contains(t, result.ghArgs, "claude/below")
	require.Contains(t, result.gitArgs, "claude/below", "the base is looked up on the remote")
}

func TestPRCreateRefusesABaseThatIsNotOnTheRemote(t *testing.T) {
	t.Parallel()

	_, keyPath := writeKey(t)

	result := runPRCreate(t, []string{"fix: something", bodyFile(t), "--base", "claude/never-pushed"}, map[string]string{
		"GH_APP_ID":              testAppID,
		"GH_APP_INSTALLATION_ID": testInstallationID,
		"GH_APP_PRIVATE_KEY":     keyPath,
		"GIT_EXIT":               "2",
	})

	require.NotEqual(t, 0, result.exitCode)
	require.False(t, result.ghRan, "GitHub is never called")
	require.Contains(t, result.stderr, "claude/never-pushed")
	require.Contains(t, result.stderr, "push it first")
}

// The regression this script exists for: an empty GH_TOKEN does not stop gh,
// it quietly falls back to the logged-in account.
func TestPRCreateNeverFallsBackToYourOwnAccount(t *testing.T) {
	t.Parallel()

	_, keyPath := writeKey(t)

	result := runPRCreate(t, []string{"fix: something", bodyFile(t)}, map[string]string{
		"GH_APP_INSTALLATION_ID": testInstallationID,
		"GH_APP_PRIVATE_KEY":     keyPath,
	})

	require.NotEqual(t, 0, result.exitCode)
	require.False(t, result.ghRan, "gh must not run without an app token")
	require.Contains(t, result.stderr, "would have been opened as you")
}

func TestPRCreateRefusesBadArguments(t *testing.T) {
	t.Parallel()

	_, keyPath := writeKey(t)
	env := map[string]string{
		"GH_APP_ID":              testAppID,
		"GH_APP_INSTALLATION_ID": testInstallationID,
		"GH_APP_PRIVATE_KEY":     keyPath,
	}

	tests := map[string]struct {
		args []string
		want string
	}{
		"no title":          {args: []string{"", bodyFile(t)}, want: "no title given"},
		"no body file":      {args: []string{"fix: something", ""}, want: "no body file given"},
		"missing body file": {args: []string{"fix: something", "/nowhere/body.md"}, want: "cannot read the body file"},
		"empty base":        {args: []string{"fix: something", bodyFile(t), "--base", ""}, want: "no base branch given"},
		"base without a value": {
			args: []string{"fix: something", bodyFile(t), "--base"},
			want: "no base branch given",
		},
		"unknown flag": {args: []string{"fix: something", bodyFile(t), "--draft"}, want: "unknown argument"},
		"title only":   {args: []string{"fix: something"}, want: "no body file given"},
	}

	for name, test := range tests {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			result := runPRCreate(t, test.args, env)

			require.NotEqual(t, 0, result.exitCode)
			require.Contains(t, result.stderr, test.want)
			require.False(t, result.ghRan, "GitHub is never called")
		})
	}
}
