package scripts_test

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// The script publishes images to a world-readable bucket, so the test cares
// most about what it refuses: a path outside web/screenshots/, a missing
// bucket, and missing credentials all have to fail before a single object is
// uploaded. aws, gh and git are stubbed onto PATH, so nothing here reaches
// Scaleway or GitHub.

const stubAWS = `#!/bin/sh
printf '%s\n' "$@" >> "$AWS_LOG"
exit "${AWS_EXIT:-0}"
`

// Answers the two questions the script asks Git: where the checkout is, and
// which commit the images were taken at.
const stubGitRepository = `#!/bin/sh
case "$*" in
  *--show-toplevel*) echo "$GIT_ROOT" ;;
  *--short*) echo "${GIT_SHA:-abc1234}" ;;
esac
`

// 'gh pr view' returns the body the case set up; 'gh pr edit' records the body
// it was handed, which is what the append case reads back.
const stubGhPR = `#!/bin/sh
printf '%s\n' "$@" > "$GH_LOG"
case "$2" in
  view) printf '%s' "${GH_BODY:-}" ;;
  edit)
    for arg in "$@"; do
      if [ "$previous" = "--body-file" ]; then cat "$arg" > "$GH_BODY_FILE"; fi
      previous="$arg"
    done
    ;;
esac
`

type screenshotsResult struct {
	stdout   string
	stderr   string
	exitCode int
	awsArgs  []string
	awsRan   bool
	ghArgs   []string
	ghRan    bool
	newBody  string
}

// Lays out a checkout holding the given screenshots, each named relative to
// web/ — so 'screenshots/changes/…' is a highlighted difference and
// '.screenshots-baseline/…' the page as it was — and returns its root.
func screenshotsCheckout(t *testing.T, images ...string) string {
	t.Helper()

	// Resolved, because the script compares resolved paths and a temporary
	// directory on macOS is reached through a symlink.
	root, err := filepath.EvalSymlinks(t.TempDir())
	require.NoError(t, err)

	for _, image := range images {
		file := filepath.Join(root, "web", filepath.FromSlash(image))
		require.NoError(t, os.MkdirAll(filepath.Dir(file), 0o755))
		require.NoError(t, os.WriteFile(file, []byte("not really a png"), 0o600))
	}

	require.NoError(t, os.MkdirAll(filepath.Join(root, "web", "screenshots", "changes"), 0o755))

	return root
}

func runPRScreenshots(t *testing.T, root string, args []string, env map[string]string) screenshotsResult {
	t.Helper()

	dir := t.TempDir()

	require.NoError(t, os.WriteFile(filepath.Join(dir, "aws"), []byte(stubAWS), 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "gh"), []byte(stubGhPR), 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "git"), []byte(stubGitRepository), 0o755))

	awsLog := filepath.Join(dir, "aws.log")
	ghLog := filepath.Join(dir, "gh.log")
	bodyFile := filepath.Join(dir, "body.md")

	script, err := filepath.Abs("pr_screenshots.sh")
	require.NoError(t, err)

	cmd := exec.CommandContext(t.Context(), "bash", append([]string{script}, args...)...)

	// A developer machine exports Scaleway credentials and a bucket name into
	// every task, so a case meant to run without one would otherwise silently
	// pick the machine's value up.
	for _, entry := range os.Environ() {
		name, _, _ := strings.Cut(entry, "=")
		switch {
		case name == "PATH", name == "HOME":
			continue
		case strings.HasPrefix(name, "AWS_"), strings.HasPrefix(name, "SCW_"):
			continue
		}
		cmd.Env = append(cmd.Env, entry)
	}
	cmd.Env = append(
		cmd.Env,
		"PATH="+dir+string(os.PathListSeparator)+os.Getenv("PATH"),
		// A home with no ~/.aws in it, so only what a case sets counts as a
		// configured credential.
		"HOME="+dir,
		"AWS_LOG="+awsLog,
		"GH_LOG="+ghLog,
		"GH_BODY_FILE="+bodyFile,
		"GIT_ROOT="+root,
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

	logged := func(path string) ([]string, bool) {
		contents, err := os.ReadFile(path)
		if err != nil {
			return nil, false
		}

		return strings.Split(strings.TrimRight(string(contents), "\n"), "\n"), true
	}

	awsArgs, awsRan := logged(awsLog)
	ghArgs, ghRan := logged(ghLog)

	var newBody string
	if contents, err := os.ReadFile(bodyFile); err == nil {
		newBody = string(contents)
	}

	return screenshotsResult{
		stdout:   stdout.String(),
		stderr:   stderr.String(),
		exitCode: exitCode,
		awsArgs:  awsArgs,
		awsRan:   awsRan,
		ghArgs:   ghArgs,
		ghRan:    ghRan,
		newBody:  newBody,
	}
}

func count(args []string, want string) int {
	total := 0
	for _, arg := range args {
		if arg == want {
			total++
		}
	}

	return total
}

func credentials() map[string]string {
	return map[string]string{
		"AWS_ACCESS_KEY_ID":           "SCWTESTACCESSKEY",
		"AWS_SECRET_ACCESS_KEY":       "test-secret",
		"SCW_SCREENSHOTS_BUCKET_NAME": "getstronger-pull-requests",
		"SCW_REGION":                  "fr-par",
	}
}

// writeChangesIndex lays down the index 'screenshots:diff' leaves beside the
// difference images, naming every page it found had moved.
func writeChangesIndex(t *testing.T, root string, lines ...string) {
	t.Helper()

	path := filepath.Join(root, "web", "screenshots", "changes", "pages.tsv")
	require.NoError(t, os.WriteFile(path, []byte(strings.Join(lines, "\n")+"\n"), 0o600))
}

// The default run publishes what 'screenshots:diff' left behind: the page as it
// was, the page as it is, and the highlighted difference between them.
func TestPRScreenshotsUploadsTheChangedPages(t *testing.T) {
	t.Parallel()

	root := screenshotsCheckout(
		t,
		"screenshots/changes/active/home.png",
		"screenshots/active/home.png",
		".screenshots-baseline/active/home.png",
	)

	result := runPRScreenshots(t, root, []string{"1209"}, credentials())

	require.Equal(t, 0, result.exitCode, result.stderr)
	require.True(t, result.awsRan)
	require.Equal(t, 3, count(result.awsArgs, "sync"), "before, after and difference")
	require.Contains(t, result.awsArgs, filepath.Join(root, "web", "screenshots", "changes"))
	require.Contains(t, result.awsArgs, filepath.Join(root, "web", ".screenshots-baseline"))
	require.Contains(t, result.awsArgs, "s3://getstronger-pull-requests/pr/1209/abc1234/before")
	require.Contains(t, result.awsArgs, "s3://getstronger-pull-requests/pr/1209/abc1234/after")
	require.Contains(t, result.awsArgs, "s3://getstronger-pull-requests/pr/1209/abc1234/difference")
	require.Contains(t, result.awsArgs, "https://s3.fr-par.scw.cloud",
		"the endpoint is Scaleway's, so nothing is ever created in AWS")
	require.Contains(t, result.awsArgs, "public-read",
		"GitHub's image proxy fetches the images anonymously, so they must be readable")
	require.False(t, result.ghRan, "the body is only touched with --append")
}

// The markdown is the whole point: a block whose images GitHub can fetch, and
// which shows a redesign as the two states side by side.
func TestPRScreenshotsPrintsBeforeAndAfter(t *testing.T) {
	t.Parallel()

	root := screenshotsCheckout(
		t,
		"screenshots/changes/active/home.png",
		"screenshots/active/home.png",
		".screenshots-baseline/active/home.png",
	)

	result := runPRScreenshots(t, root, []string{"1209"}, credentials())

	require.Equal(t, 0, result.exitCode, result.stderr)
	require.Contains(t, result.stdout, "| Page | Before | After | Difference |")
	for _, state := range []string{"before", "after", "difference"} {
		require.Contains(t, result.stdout,
			"https://s3.fr-par.scw.cloud/getstronger-pull-requests/pr/1209/abc1234/"+state+"/active/home.png")
	}
	require.Contains(t, result.stdout, "active/home")
	require.Contains(t, result.stdout, "abc1234", "the block names the commit the images show")
}

// A difference with nothing to compare against says so, rather than the block
// linking an object that was never uploaded.
func TestPRScreenshotsMarksAPageWithNoBefore(t *testing.T) {
	t.Parallel()

	root := screenshotsCheckout(
		t,
		"screenshots/changes/active/plans.png",
		"screenshots/active/plans.png",
		".screenshots-baseline/active/home.png",
	)

	result := runPRScreenshots(t, root, []string{"1209"}, credentials())

	require.Equal(t, 0, result.exitCode, result.stderr)
	require.NotContains(t, result.stdout,
		"https://s3.fr-par.scw.cloud/getstronger-pull-requests/pr/1209/abc1234/before/active/plans.png")
	require.Contains(t, result.stdout, "not in the baseline")
	require.Contains(t, result.stdout,
		"https://s3.fr-par.scw.cloud/getstronger-pull-requests/pr/1209/abc1234/after/active/plans.png")
}

// 'screenshots:page' leaves differences with no baseline to compare them with,
// so the block falls back to the images it does have.
func TestPRScreenshotsPublishesWithoutABaseline(t *testing.T) {
	t.Parallel()

	root := screenshotsCheckout(t, "screenshots/changes/active/home.png")

	result := runPRScreenshots(t, root, []string{"1209"}, credentials())

	require.Equal(t, 0, result.exitCode, result.stderr)
	require.Equal(t, 1, count(result.awsArgs, "sync"))
	require.Contains(t, result.awsArgs, "s3://getstronger-pull-requests/pr/1209/abc1234")
	require.Contains(t, result.stdout, "| Page | Screenshot |")
	require.Contains(t, result.stdout,
		"https://s3.fr-par.scw.cloud/getstronger-pull-requests/pr/1209/abc1234/active/home.png")
}

// The page a change actually moved was the one missing from the report: it grew
// past one fold, so one image became two and neither side had a counterpart to
// difference against.
func TestPRScreenshotsPublishesAPageThatGainedAFold(t *testing.T) {
	t.Parallel()

	root := screenshotsCheckout(
		t,
		"screenshots/active/38-circuit-1.png",
		"screenshots/active/38-circuit-2.png",
		".screenshots-baseline/active/38-circuit.png",
	)
	writeChangesIndex(
		t, root,
		"added\tactive/38-circuit-1.png",
		"added\tactive/38-circuit-2.png",
		"removed\tactive/38-circuit.png",
	)

	result := runPRScreenshots(t, root, []string{"1209"}, credentials())

	const prefix = "https://s3.fr-par.scw.cloud/getstronger-pull-requests/pr/1209/abc1234/"
	require.Equal(t, 0, result.exitCode, result.stderr)
	require.Contains(t, result.stdout, prefix+"after/active/38-circuit-1.png")
	require.Contains(t, result.stdout, prefix+"after/active/38-circuit-2.png")
	require.Contains(t, result.stdout, prefix+"before/active/38-circuit.png")
	require.NotContains(t, result.stdout, prefix+"difference/",
		"there is no difference to draw, and a broken image is worse than a word")
	require.Contains(t, result.stdout, "nothing to compare")
}

// A page whose pixels moved still has its difference published, and the index
// is what says which pages the report is about.
func TestPRScreenshotsPublishesTheDifferenceTheIndexNames(t *testing.T) {
	t.Parallel()

	root := screenshotsCheckout(
		t,
		"screenshots/changes/active/home.png",
		"screenshots/active/home.png",
		".screenshots-baseline/active/home.png",
		"screenshots/active/plans.png",
	)
	writeChangesIndex(t, root, "changed\tactive/home.png")

	result := runPRScreenshots(t, root, []string{"1209"}, credentials())

	const prefix = "https://s3.fr-par.scw.cloud/getstronger-pull-requests/pr/1209/abc1234/"
	require.Equal(t, 0, result.exitCode, result.stderr)
	require.Contains(t, result.stdout, prefix+"difference/active/home.png")
	require.NotContains(t, result.stdout, "active/plans", "an unchanged page is not the report")
}

// An index naming nothing is a run that found nothing, not a report to publish.
func TestPRScreenshotsRefusesAnEmptyIndex(t *testing.T) {
	t.Parallel()

	root := screenshotsCheckout(t, ".screenshots-baseline/active/home.png")
	writeChangesIndex(t, root)

	result := runPRScreenshots(t, root, []string{"1209"}, credentials())

	require.NotEqual(t, 0, result.exitCode)
	require.Contains(t, result.stderr, "no images")
	require.False(t, result.awsRan, "nothing is uploaded")
}

func TestPRScreenshotsUploadsAnotherDirectoryUnderScreenshots(t *testing.T) {
	t.Parallel()

	root := screenshotsCheckout(t, "screenshots/active/home.png", ".screenshots-baseline/active/home.png")
	path := filepath.Join(root, "web", "screenshots", "active")

	result := runPRScreenshots(t, root, []string{"1209", "--path", path}, credentials())

	require.Equal(t, 0, result.exitCode, result.stderr)
	require.Equal(t, 1, count(result.awsArgs, "sync"), "a folder of the set is published as it is")
	require.Contains(t, result.awsArgs, path)
	require.Contains(t, result.stdout,
		"https://s3.fr-par.scw.cloud/getstronger-pull-requests/pr/1209/abc1234/home.png")
}

// The guard that keeps real data out of a public bucket.
func TestPRScreenshotsRefusesAPathOutsideScreenshots(t *testing.T) {
	t.Parallel()

	root := screenshotsCheckout(t, "screenshots/changes/active/home.png")
	outside := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(outside, "secret.png"), []byte("private"), 0o600))

	result := runPRScreenshots(t, root, []string{"1209", "--path", outside}, credentials())

	require.NotEqual(t, 0, result.exitCode)
	require.False(t, result.awsRan, "nothing is uploaded")
	require.Contains(t, result.stderr, "web/screenshots")
	require.Contains(t, result.stderr, outside)
}

// A symlink is the way out of the guard that a prefix check on the given path
// alone would miss.
func TestPRScreenshotsRefusesASymlinkOutOfScreenshots(t *testing.T) {
	t.Parallel()

	root := screenshotsCheckout(t, "screenshots/changes/active/home.png")
	outside := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(outside, "secret.png"), []byte("private"), 0o600))

	link := filepath.Join(root, "web", "screenshots", "elsewhere")
	require.NoError(t, os.Symlink(outside, link))

	result := runPRScreenshots(t, root, []string{"1209", "--path", link}, credentials())

	require.NotEqual(t, 0, result.exitCode)
	require.False(t, result.awsRan, "nothing is uploaded")
	require.Contains(t, result.stderr, "web/screenshots")
}

func TestPRScreenshotsRefusesMissingInput(t *testing.T) {
	t.Parallel()

	tests := map[string]struct {
		args    []string
		env     map[string]string
		images  []string
		want    string
		without string
	}{
		"no number": {
			args:   []string{},
			images: []string{"screenshots/changes/active/home.png"},
			want:   "no pull request number given",
		},
		"number that is not a number": {
			args:   []string{"#1209"},
			images: []string{"screenshots/changes/active/home.png"},
			want:   "not a pull request number",
		},
		"no bucket": {
			args:    []string{"1209"},
			images:  []string{"screenshots/changes/active/home.png"},
			want:    "SCW_SCREENSHOTS_BUCKET_NAME",
			without: "SCW_SCREENSHOTS_BUCKET_NAME",
		},
		"no credentials": {
			args:    []string{"1209"},
			images:  []string{"screenshots/changes/active/home.png"},
			want:    "credentials",
			without: "AWS_ACCESS_KEY_ID",
		},
		"no images": {
			args:   []string{"1209"},
			images: []string{"screenshots/active/home.png"},
			want:   "no images",
		},
		"missing directory": {
			args:   []string{"1209", "--path", "web/screenshots/nowhere"},
			images: []string{"screenshots/changes/active/home.png"},
			want:   "no directory",
		},
		"path without a value": {
			args:   []string{"1209", "--path"},
			images: []string{"screenshots/changes/active/home.png"},
			want:   "no path given",
		},
		"unknown flag": {
			args:   []string{"1209", "--force"},
			images: []string{"screenshots/changes/active/home.png"},
			want:   "unknown argument",
		},
	}

	for name, test := range tests {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			env := credentials()
			delete(env, test.without)

			result := runPRScreenshots(t, screenshotsCheckout(t, test.images...), test.args, env)

			require.NotEqual(t, 0, result.exitCode)
			require.Contains(t, result.stderr, test.want)
			require.False(t, result.awsRan, "nothing is uploaded")
		})
	}
}

func TestPRScreenshotsReportsAFailedUpload(t *testing.T) {
	t.Parallel()

	root := screenshotsCheckout(t, "screenshots/changes/active/home.png")
	env := credentials()
	env["AWS_EXIT"] = "1"

	result := runPRScreenshots(t, root, []string{"1209"}, env)

	require.NotEqual(t, 0, result.exitCode)
	require.Contains(t, result.stderr, "upload")
	require.False(t, result.ghRan, "a body is never edited to point at objects that are not there")
}

func TestPRScreenshotsAppendsTheBlockToTheBody(t *testing.T) {
	t.Parallel()

	root := screenshotsCheckout(t, "screenshots/changes/active/home.png")
	env := credentials()
	env["GH_BODY"] = "## Why\n\nBecause.\n"

	result := runPRScreenshots(t, root, []string{"1209", "--append"}, env)

	require.Equal(t, 0, result.exitCode, result.stderr)
	require.True(t, result.ghRan)
	require.Contains(t, result.ghArgs, "1209")
	require.Contains(t, result.newBody, "## Why", "the body it had is kept")
	require.Contains(t, result.newBody,
		"https://s3.fr-par.scw.cloud/getstronger-pull-requests/pr/1209/abc1234/active/home.png")
}

// Re-photographing a change and publishing again is normal, so the second run
// replaces the block rather than leaving the reviewer two of them.
func TestPRScreenshotsReplacesAnEarlierBlock(t *testing.T) {
	t.Parallel()

	root := screenshotsCheckout(t, "screenshots/changes/active/home.png")
	env := credentials()
	env["GH_BODY"] = "## Why\n\nBecause.\n\n<!-- pr:screenshots -->\n\n## Screenshots\n\nolder-upload.png\n"

	result := runPRScreenshots(t, root, []string{"1209", "--append"}, env)

	require.Equal(t, 0, result.exitCode, result.stderr)
	require.Contains(t, result.newBody, "## Why")
	require.NotContains(t, result.newBody, "older-upload.png", "the earlier block is replaced")
	require.Equal(t, 1, strings.Count(result.newBody, "<!-- pr:screenshots -->"))
}
