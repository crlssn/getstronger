package server

import (
	"net/http"
	"net/http/httptest"
	"runtime/pprof"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"go.uber.org/zap/zaptest/observer"

	"github.com/crlssn/getstronger/server/config"
)

const testToken = "0123456789abcdef0123456789abcdef"

// An environment that configures no token — every one of them, until somebody
// deliberately sets one — must not serve the profiles at all. Absent is not the
// same as unauthorised: nothing on the wire may say the paths mean anything.
func TestProfilesAreUnmountedWithoutAToken(t *testing.T) {
	t.Parallel()

	mux := newProfilingMultiplexer(t, config.Pprof{})
	assert.Equal(t, http.StatusNotFound, profileStatus(t, mux, "/debug/pprof/", testToken))
}

// A token short enough to guess protects nothing, so it is treated as no token
// and the startup log says why rather than leaving an operator to wonder.
func TestProfilesAreUnmountedWithAGuessableToken(t *testing.T) {
	t.Parallel()

	core, logs := observer.New(zapcore.WarnLevel)
	mux := NewMultiplexer(MultiplexerParams{
		Log:    zap.New(core),
		Config: &config.Config{Pprof: config.Pprof{Token: "hunter2"}},
	})

	assert.Equal(t, http.StatusNotFound, profileStatus(t, mux, "/debug/pprof/", "hunter2"))
	require.Len(t, logs.All(), 1)
	assert.Equal(t, "Profiling token too short: serving no profiles", logs.All()[0].Message)
}

func TestProfilesRequireTheToken(t *testing.T) {
	t.Parallel()

	mux := newProfilingMultiplexer(t, config.Pprof{Token: testToken})

	tests := []struct {
		name          string
		authorization string
	}{
		{name: "no_authorization_header", authorization: ""},
		{name: "another_token", authorization: "Bearer " + strings.Repeat("z", len(testToken))},
		{name: "a_prefix_of_the_token", authorization: "Bearer " + testToken[:len(testToken)-1]},
		{name: "the_token_without_its_scheme", authorization: testToken},
		{name: "the_token_under_another_scheme", authorization: "Basic " + testToken},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			recorder := httptest.NewRecorder()
			request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/debug/pprof/", nil)
			if test.authorization != "" {
				request.Header.Set("Authorization", test.authorization)
			}
			mux.ServeHTTP(recorder, request)

			assert.Equal(t, http.StatusNotFound, recorder.Code)
		})
	}
}

func TestProfilesServeTheHolderOfTheToken(t *testing.T) {
	t.Parallel()

	mux := newProfilingMultiplexer(t, config.Pprof{Token: testToken})

	recorder := httptest.NewRecorder()
	request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/debug/pprof/", nil)
	request.Header.Set("Authorization", "Bearer "+testToken)
	mux.ServeHTTP(recorder, request)

	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), "goroutine")
	// A profile names the running process; no cache on the way out may keep it.
	assert.Equal(t, "no-store", recorder.Header().Get("Cache-Control"))
}

// The index serves every profile the runtime registers, which is how the
// goroutine leak profile — the production counterpart of the guard in
// server/testing/leak — is reachable without a line of code naming it. It is
// the reason these endpoints exist, so it is asserted rather than assumed.
func TestProfilesServeTheGoroutineLeakProfile(t *testing.T) {
	t.Parallel()

	require.NotNil(t, pprof.Lookup("goroutineleak"), "the toolchain no longer registers the goroutine leak profile")

	mux := newProfilingMultiplexer(t, config.Pprof{Token: testToken})
	assert.Equal(t, http.StatusOK, profileStatus(t, mux, "/debug/pprof/goroutineleak", testToken))
}

// Mounting the profiles says so once at startup: a server serving its own stack
// traces is worth seeing in the log of the environment that is doing it.
func TestProfilesAreAnnouncedWhenMounted(t *testing.T) {
	t.Parallel()

	core, logs := observer.New(zapcore.InfoLevel)
	NewMultiplexer(MultiplexerParams{
		Log:    zap.New(core),
		Config: &config.Config{Pprof: config.Pprof{Token: testToken}},
	})

	require.Len(t, logs.All(), 1)
	assert.Equal(t, "Profiling endpoints mounted", logs.All()[0].Message)
}

// Nothing is logged when no token is configured: the default is not news.
func TestProfilesAreSilentWhenUnconfigured(t *testing.T) {
	t.Parallel()

	core, logs := observer.New(zapcore.DebugLevel)
	NewMultiplexer(MultiplexerParams{Log: zap.New(core), Config: &config.Config{}})

	assert.Empty(t, logs.All())
}

func newProfilingMultiplexer(t *testing.T, cfg config.Pprof) *http.ServeMux {
	t.Helper()

	return NewMultiplexer(MultiplexerParams{
		Log:    zap.NewNop(),
		Config: &config.Config{Pprof: cfg},
	})
}

func profileStatus(t *testing.T, mux *http.ServeMux, path, token string) int {
	t.Helper()

	recorder := httptest.NewRecorder()
	request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, path, nil)
	request.Header.Set("Authorization", "Bearer "+token)
	mux.ServeHTTP(recorder, request)

	return recorder.Code
}
