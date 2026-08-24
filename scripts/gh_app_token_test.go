package scripts_test

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// The script's one interesting job is the JWT it signs, so the test runs the
// real script against a real key and inspects what it would have sent: curl is
// stubbed onto PATH, records its arguments, and replies with a canned body.
// Nothing here reaches GitHub.

const stubCurl = `#!/bin/sh
printf '%s\n' "$@" > "$CURL_LOG"
cat "$CURL_BODY"
exit "${CURL_EXIT:-0}"
`

const (
	testAppID          = "123456"
	testInstallationID = "7890"
)

// writeKey generates a signing key and leaves it where the script expects one,
// in the PKCS#1 PEM that GitHub hands out.
func writeKey(t *testing.T) (*rsa.PrivateKey, string) {
	t.Helper()

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)

	path := filepath.Join(t.TempDir(), "gh-app.pem")
	encoded := pem.EncodeToMemory(&pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(key),
	})
	require.NoError(t, os.WriteFile(path, encoded, 0o600))

	return key, path
}

type tokenResult struct {
	stdout   string
	stderr   string
	exitCode int
	curlArgs []string
}

// authorization returns the bearer JWT the script handed to curl.
func (r tokenResult) authorization(t *testing.T) string {
	t.Helper()

	const prefix = "Authorization: Bearer "
	for _, arg := range r.curlArgs {
		if after, ok := strings.CutPrefix(arg, prefix); ok {
			return after
		}
	}
	t.Fatalf("no bearer header in curl arguments: %v", r.curlArgs)

	return ""
}

func runTokenScript(t *testing.T, env map[string]string, responseBody string) tokenResult {
	t.Helper()

	dir := t.TempDir()

	stub := filepath.Join(dir, "curl")
	require.NoError(t, os.WriteFile(stub, []byte(stubCurl), 0o755))

	body := filepath.Join(dir, "body.json")
	require.NoError(t, os.WriteFile(body, []byte(responseBody), 0o600))

	curlLog := filepath.Join(dir, "curl.log")

	script, err := filepath.Abs("gh_app_token.sh")
	require.NoError(t, err)

	cmd := exec.CommandContext(t.Context(), "bash", script)

	// The ambient environment may already export GH_APP_*, which would hide a
	// case that is meant to run without it.
	for _, entry := range os.Environ() {
		name, _, _ := strings.Cut(entry, "=")
		switch name {
		case "GH_APP_ID", "GH_APP_INSTALLATION_ID", "GH_APP_PRIVATE_KEY", "PATH":
			continue
		}
		cmd.Env = append(cmd.Env, entry)
	}
	cmd.Env = append(
		cmd.Env,
		"PATH="+dir+string(os.PathListSeparator)+os.Getenv("PATH"),
		"CURL_LOG="+curlLog,
		"CURL_BODY="+body,
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

	var args []string
	if logged, err := os.ReadFile(curlLog); err == nil {
		args = strings.Split(strings.TrimRight(string(logged), "\n"), "\n")
	}

	return tokenResult{
		stdout:   stdout.String(),
		stderr:   stderr.String(),
		exitCode: exitCode,
		curlArgs: args,
	}
}

func configured(t *testing.T) (*rsa.PrivateKey, map[string]string) {
	t.Helper()

	key, path := writeKey(t)

	return key, map[string]string{
		"GH_APP_ID":              testAppID,
		"GH_APP_INSTALLATION_ID": testInstallationID,
		"GH_APP_PRIVATE_KEY":     path,
	}
}

func TestTokenScriptPrintsTheMintedToken(t *testing.T) {
	t.Parallel()

	_, env := configured(t)

	result := runTokenScript(t, env, `{"token":"ghs_example","expires_at":"2026-08-24T13:00:00Z"}`)

	require.Equal(t, 0, result.exitCode, result.stderr)
	require.Equal(t, "ghs_example", strings.TrimSpace(result.stdout))
	require.Contains(t, result.curlArgs,
		"https://api.github.com/app/installations/"+testInstallationID+"/access_tokens")
}

func TestTokenScriptSignsAJWTGitHubCanVerify(t *testing.T) {
	t.Parallel()

	key, env := configured(t)

	result := runTokenScript(t, env, `{"token":"ghs_example"}`)
	require.Equal(t, 0, result.exitCode, result.stderr)

	segments := strings.Split(result.authorization(t), ".")
	require.Len(t, segments, 3, "a JWT has three segments")

	for _, segment := range segments {
		require.NotContains(t, segment, "+", "base64url carries no '+'")
		require.NotContains(t, segment, "/", "base64url carries no '/'")
		require.NotContains(t, segment, "=", "base64url carries no padding")
	}

	var header struct {
		Alg string `json:"alg"`
		Typ string `json:"typ"`
	}
	decoded, err := base64.RawURLEncoding.DecodeString(segments[0])
	require.NoError(t, err)
	require.NoError(t, json.Unmarshal(decoded, &header))
	require.Equal(t, "RS256", header.Alg)
	require.Equal(t, "JWT", header.Typ)

	var claims struct {
		Iat int64  `json:"iat"`
		Exp int64  `json:"exp"`
		Iss string `json:"iss"`
	}
	decoded, err = base64.RawURLEncoding.DecodeString(segments[1])
	require.NoError(t, err)
	require.NoError(t, json.Unmarshal(decoded, &claims))
	require.Equal(t, testAppID, claims.Iss)

	// GitHub rejects a future-dated iat and any expiry beyond ten minutes.
	now := time.Now().Unix()
	require.Less(t, claims.Iat, now, "iat is backdated against clock skew")
	require.Greater(t, claims.Exp, now, "the JWT is still live")
	require.LessOrEqual(t, claims.Exp-claims.Iat, int64(600), "GitHub caps the lifetime at ten minutes")

	signature, err := base64.RawURLEncoding.DecodeString(segments[2])
	require.NoError(t, err)

	digest := sha256.Sum256([]byte(segments[0] + "." + segments[1]))
	require.NoError(t, rsa.VerifyPKCS1v15(&key.PublicKey, crypto.SHA256, digest[:], signature))
}

func TestTokenScriptRefusesIncompleteConfiguration(t *testing.T) {
	t.Parallel()

	tests := map[string]struct {
		mutate func(map[string]string)
		want   string
	}{
		"no app id": {
			mutate: func(env map[string]string) { delete(env, "GH_APP_ID") },
			want:   "GH_APP_ID is not set",
		},
		"no installation id": {
			mutate: func(env map[string]string) { delete(env, "GH_APP_INSTALLATION_ID") },
			want:   "GH_APP_INSTALLATION_ID is not set",
		},
		"no private key": {
			mutate: func(env map[string]string) { env["GH_APP_PRIVATE_KEY"] = "/nowhere/gh-app.pem" },
			want:   "cannot read the private key",
		},
	}

	for name, test := range tests {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			_, env := configured(t)
			test.mutate(env)

			result := runTokenScript(t, env, `{"token":"ghs_example"}`)

			require.NotEqual(t, 0, result.exitCode)
			require.Contains(t, result.stderr, test.want)
			require.Empty(t, result.stdout, "no token is printed")
			require.Empty(t, result.curlArgs, "GitHub is never called")
		})
	}
}

func TestTokenScriptReportsWhatGitHubSaid(t *testing.T) {
	t.Parallel()

	_, env := configured(t)

	result := runTokenScript(t, env, `{"message":"Bad credentials","status":"401"}`)

	require.NotEqual(t, 0, result.exitCode)
	require.Contains(t, result.stderr, "Bad credentials")
	require.Empty(t, result.stdout)
}
