package scripts_test

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// The hook is a shell script, so it is exercised the way Claude Code runs it:
// with the tool payload on stdin and a stub `mise` on PATH that records the
// working directory and the formatter it was asked for.

const stubFormatterMise = `#!/bin/sh
echo "$PWD|$*" >> "$MISE_FORMAT_LOG"
if [ -n "$MISE_FORMAT_FAIL" ]; then
  echo "expected ';' but found '}'" >&2
  exit 1
fi
exit 0
`

type formatResult struct {
	calls    []string
	exitCode int
	output   string
}

// golangci-lint reads .golangci.yml from the working directory, so the hook
// runs it from the root with the file's relative path.
func TestHookFormatsGoFilesWithGolangciLintFromTheRoot(t *testing.T) {
	root := newTree(t, "server/rpc/handler.go")

	result := runFormatHook(t, root, payload("Edit", filepath.Join(root, "server/rpc/handler.go")))

	require.Equal(t, 0, result.exitCode, result.output)
	require.Equal(t, []string{
		root + "|exec -- golangci-lint fmt server/rpc/handler.go",
	}, result.calls)
}

func TestHookFormatsWebFilesWithPrettierFromTheWebDirectory(t *testing.T) {
	for _, file := range []string{
		"web/src/App.tsx",
		"web/src/main.ts",
		"web/src/styles/app.css",
		"web/package.json",
		"web/README.md",
	} {
		t.Run(file, func(t *testing.T) {
			root := newTree(t, file)

			result := runFormatHook(t, root, payload("Write", filepath.Join(root, file)))

			require.Equal(t, 0, result.exitCode, result.output)
			rel := strings.TrimPrefix(file, "web/")
			require.Equal(t, []string{
				filepath.Join(root, "web") + "|exec -- ./node_modules/.bin/prettier --write " + rel,
			}, result.calls)
		})
	}
}

// Only `web/` has a Prettier configuration, so the hook leaves the rest of the
// tree alone rather than reformatting it to Prettier's defaults.
func TestHookIgnoresFilesNoFormatterOwns(t *testing.T) {
	for _, file := range []string{
		"README.md",
		"mise.toml",
		".github/workflows/test.web.yml",
		"database/migrations/001_init.sql",
		"proto/api/v1/service.proto",
		"web/public/logo.svg",
		"server/testdata/fixture.txt",
	} {
		t.Run(file, func(t *testing.T) {
			root := newTree(t, file)

			result := runFormatHook(t, root, payload("Edit", filepath.Join(root, file)))

			require.Equal(t, 0, result.exitCode, result.output)
			require.Empty(t, result.calls)
		})
	}
}

func TestHookIgnoresFilesOutsideTheWorktree(t *testing.T) {
	root := newTree(t)
	outside := filepath.Join(t.TempDir(), "elsewhere.go")
	require.NoError(t, os.WriteFile(outside, nil, 0o644))

	result := runFormatHook(t, root, payload("Edit", outside))

	require.Equal(t, 0, result.exitCode, result.output)
	require.Empty(t, result.calls)
}

func TestHookIgnoresPayloadsItCannotAct(t *testing.T) {
	for name, body := range map[string]string{
		"no file path":  `{"tool_name":"Edit","tool_input":{}}`,
		"empty payload": `{}`,
		"not json":      `Bash(go test ./...)`,
	} {
		t.Run(name, func(t *testing.T) {
			root := newTree(t)

			result := runFormatHook(t, root, body)

			require.Equal(t, 0, result.exitCode, result.output)
			require.Empty(t, result.calls)
		})
	}
}

// A file the tool deleted, or wrote and then moved, is not an error worth
// interrupting Claude for.
func TestHookIgnoresMissingFiles(t *testing.T) {
	root := newTree(t)

	result := runFormatHook(t, root, payload("Edit", filepath.Join(root, "server/gone.go")))

	require.Equal(t, 0, result.exitCode, result.output)
	require.Empty(t, result.calls)
}

// Exit code 2 is what puts the formatter's complaint in front of Claude, so a
// file it just wrote and cannot parse gets fixed in the same turn.
func TestHookReportsFormatterFailuresToClaude(t *testing.T) {
	root := newTree(t, "server/rpc/handler.go")

	result := runFormatHook(t, root, payload("Edit", filepath.Join(root, "server/rpc/handler.go")), "MISE_FORMAT_FAIL=1")

	require.Equal(t, 2, result.exitCode, result.output)
	require.Contains(t, result.output, "server/rpc/handler.go")
	require.Contains(t, result.output, "expected ';' but found '}'")
}

func payload(tool, path string) string {
	return `{"tool_name":"` + tool + `","tool_input":{"file_path":"` + path + `"}}`
}

// newTree builds a throwaway worktree holding a copy of the hook and the given
// files, so a test never formats the real repository.
func newTree(t *testing.T, files ...string) string {
	t.Helper()

	root, err := filepath.EvalSymlinks(t.TempDir())
	require.NoError(t, err)
	require.NoError(t, os.MkdirAll(filepath.Join(root, "scripts"), 0o755))

	source, err := os.ReadFile("claude_format_hook.sh")
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(filepath.Join(root, "scripts/claude_format_hook.sh"), source, 0o755))

	for _, file := range files {
		path := filepath.Join(root, file)
		require.NoError(t, os.MkdirAll(filepath.Dir(path), 0o755))
		require.NoError(t, os.WriteFile(path, nil, 0o644))
	}

	return root
}

func runFormatHook(t *testing.T, root, stdin string, env ...string) formatResult {
	t.Helper()

	bin := t.TempDir()
	log := filepath.Join(bin, "formatters.log")
	require.NoError(t, os.WriteFile(filepath.Join(bin, "mise"), []byte(stubFormatterMise), 0o755))

	cmd := exec.CommandContext(t.Context(), filepath.Join(root, "scripts/claude_format_hook.sh"))
	cmd.Dir = root
	cmd.Stdin = strings.NewReader(stdin)
	cmd.Env = append(append(isolatedEnv(bin), "MISE_FORMAT_LOG="+log), env...)
	out, err := cmd.CombinedOutput()

	exitCode := 0
	var exit *exec.ExitError
	if err != nil {
		require.ErrorAs(t, err, &exit, string(out))
		exitCode = exit.ExitCode()
	}

	return formatResult{
		calls:    readLines(t, log),
		exitCode: exitCode,
		output:   string(out),
	}
}
