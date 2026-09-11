package scripts_test

import (
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// The hook is a shell script, so it is exercised the way Claude Code runs it:
// with the tool payload on stdin, a stub `mise` on PATH that resolves a pinned
// formatter to a path, and stub formatters that record where they ran.

// 'mise which' is the one mise call that answers without first installing
// every tool in mise.toml. It resolves what is in MISE_TOOLS and nothing else.
const stubResolverMise = `#!/bin/sh
[ "$1" = "which" ] || exit 1
case " ${MISE_UNRESOLVABLE:-} " in
*" $2 "*) exit 1 ;;
esac
[ -x "$MISE_TOOLS/$2" ] || exit 1
echo "$MISE_TOOLS/$2"
`

const stubFormatter = `#!/bin/sh
echo "$PWD|$(basename "$0") $*" >> "$MISE_FORMAT_LOG"
if [ -n "${MISE_FORMAT_FAIL:-}" ]; then
  echo "expected ';' but found '}'" >&2
  exit 1
fi
exit 0
`

// formatters is every binary the hook reaches for, stubbed in both the place
// mise resolves and the PATH the fallback reads.
func formatters() []string {
	return []string{"goimports", "gofumpt"}
}

type formatOptions struct {
	// unresolvable names formatters mise refuses to resolve, as the three
	// GitHub-released tools in mise.toml are from the cloud sandbox.
	unresolvable []string
	// missing names formatters that exist nowhere — not in mise, not on PATH.
	missing []string
	env     []string
}

type formatResult struct {
	calls    []string
	exitCode int
	output   string
}

func TestHookFormatsGoFilesWithGoimportsThenGofumpt(t *testing.T) {
	root := newTree(t, "server/rpc/handler.go")

	result := runFormatHook(t, root, payload("Edit", filepath.Join(root, "server/rpc/handler.go")), formatOptions{})

	require.Equal(t, 0, result.exitCode, result.output)
	require.Equal(t, []string{
		root + "|goimports -w " + filepath.Join(root, "server/rpc/handler.go"),
		root + "|gofumpt -w " + filepath.Join(root, "server/rpc/handler.go"),
	}, result.calls)
}

// mise installs every tool in mise.toml before it will run one, so a single
// unreachable tool takes the formatters down with it — which is the cloud
// sandbox's permanent state, where three of them cannot be fetched at all. The
// pinned binary is what the hook wants; a binary of the same name is better
// than refusing the edit.
func TestHookFallsBackToPathWhenMiseCannotResolveTheFormatter(t *testing.T) {
	root := newTree(t, "server/rpc/handler.go")

	result := runFormatHook(t, root, payload("Edit", filepath.Join(root, "server/rpc/handler.go")), formatOptions{
		unresolvable: formatters(),
	})

	require.Equal(t, 0, result.exitCode, result.output)
	require.Equal(t, []string{
		root + "|goimports -w " + filepath.Join(root, "server/rpc/handler.go"),
		root + "|gofumpt -w " + filepath.Join(root, "server/rpc/handler.go"),
	}, result.calls, "both still ran, from PATH")
}

// A formatter that cannot be found is not the edit's fault. Blocking on one is
// how every Go edit in the cloud sandbox came back as a failed tool call.
func TestHookDoesNotBlockAnEditWhenAFormatterIsMissingEverywhere(t *testing.T) {
	root := newTree(t, "server/rpc/handler.go")

	result := runFormatHook(t, root, payload("Edit", filepath.Join(root, "server/rpc/handler.go")), formatOptions{
		missing: []string{"gofumpt"},
	})

	require.Equal(t, 0, result.exitCode, result.output)
	require.Equal(t, []string{
		root + "|goimports -w " + filepath.Join(root, "server/rpc/handler.go"),
	}, result.calls, "the formatter that is here still runs")
	require.Contains(t, result.output, "gofumpt", "and the one that is not is named")
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

			result := runFormatHook(t, root, payload("Write", filepath.Join(root, file)), formatOptions{})

			require.Equal(t, 0, result.exitCode, result.output)
			rel := strings.TrimPrefix(file, "web/")
			require.Equal(t, []string{
				filepath.Join(root, "web") + "|prettier --write " + rel,
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

			result := runFormatHook(t, root, payload("Edit", filepath.Join(root, file)), formatOptions{})

			require.Equal(t, 0, result.exitCode, result.output)
			require.Empty(t, result.calls)
		})
	}
}

func TestHookIgnoresFilesOutsideTheWorktree(t *testing.T) {
	root := newTree(t)
	outside := filepath.Join(t.TempDir(), "elsewhere.go")
	require.NoError(t, os.WriteFile(outside, nil, 0o644))

	result := runFormatHook(t, root, payload("Edit", outside), formatOptions{})

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

			result := runFormatHook(t, root, body, formatOptions{})

			require.Equal(t, 0, result.exitCode, result.output)
			require.Empty(t, result.calls)
		})
	}
}

// A file the tool deleted, or wrote and then moved, is not an error worth
// interrupting Claude for.
func TestHookIgnoresMissingFiles(t *testing.T) {
	root := newTree(t)

	result := runFormatHook(t, root, payload("Edit", filepath.Join(root, "server/gone.go")), formatOptions{})

	require.Equal(t, 0, result.exitCode, result.output)
	require.Empty(t, result.calls)
}

// Exit code 2 is what puts the formatter's complaint in front of Claude, so a
// file it just wrote and cannot parse gets fixed in the same turn. This is the
// one verdict that still blocks an edit.
func TestHookReportsFormatterFailuresToClaude(t *testing.T) {
	root := newTree(t, "server/rpc/handler.go")

	result := runFormatHook(t, root, payload("Edit", filepath.Join(root, "server/rpc/handler.go")), formatOptions{
		env: []string{"MISE_FORMAT_FAIL=1"},
	})

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

	// Prettier is a local install rather than a mise tool, so it is stubbed
	// where the hook looks for it: web/'s own node_modules.
	prettier := filepath.Join(root, "web/node_modules/.bin/prettier")
	require.NoError(t, os.MkdirAll(filepath.Dir(prettier), 0o755))
	require.NoError(t, os.WriteFile(prettier, []byte(stubFormatter), 0o755))

	return root
}

func runFormatHook(t *testing.T, root, stdin string, opts formatOptions) formatResult {
	t.Helper()

	bin := t.TempDir()
	tools := t.TempDir()
	log := filepath.Join(bin, "formatters.log")
	require.NoError(t, os.WriteFile(filepath.Join(bin, "mise"), []byte(stubResolverMise), 0o755))

	for _, tool := range formatters() {
		if slices.Contains(opts.missing, tool) {
			continue
		}
		// The same stub in both places, so a test says which route ran it by
		// which one it left available rather than by the call it logged.
		require.NoError(t, os.WriteFile(filepath.Join(tools, tool), []byte(stubFormatter), 0o755))
		require.NoError(t, os.WriteFile(filepath.Join(bin, tool), []byte(stubFormatter), 0o755))
	}

	cmd := exec.CommandContext(t.Context(), filepath.Join(root, "scripts/claude_format_hook.sh"))
	cmd.Dir = root
	cmd.Stdin = strings.NewReader(stdin)
	cmd.Env = append(append(
		isolatedEnv(bin),
		"MISE_FORMAT_LOG="+log,
		"MISE_TOOLS="+tools,
		"MISE_UNRESOLVABLE="+strings.Join(opts.unresolvable, " "),
	), opts.env...)
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
