package middlewares_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofrs/uuid/v5"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/config"
	"github.com/crlssn/getstronger/server/cookies"
	"github.com/crlssn/getstronger/server/pubsub"
	"github.com/crlssn/getstronger/server/pubsub/events"
	"github.com/crlssn/getstronger/server/rpc/middlewares"
	"github.com/crlssn/getstronger/server/trace"
	"github.com/crlssn/getstronger/server/xcontext"
)

const allowedOrigin = "https://app.getstronger.test"

// eventStore records what the tracer published instead of persisting it.
type eventStore struct {
	published []publishedEvent
}

type publishedEvent struct {
	topic   events.Topic
	payload []byte
}

func (s *eventStore) PublishEvent(_ context.Context, topic events.Topic, payload []byte) error {
	s.published = append(s.published, publishedEvent{topic: topic, payload: payload})
	return nil
}

func (s *eventStore) traced(t *testing.T) []events.RequestTraced {
	t.Helper()

	var traced []events.RequestTraced
	for _, published := range s.published {
		if published.topic != events.TopicRequestTraced {
			continue
		}

		var payload events.RequestTraced
		require.NoError(t, json.Unmarshal(published.payload, &payload))
		traced = append(traced, payload)
	}

	return traced
}

// register wraps h in the middleware stack the multiplexer gives every RPC
// handler, and hands back the store the tracer publishes to.
func register(h http.Handler) (http.Handler, *eventStore) {
	store := new(eventStore)
	log := zap.NewNop()

	tracer := trace.New(log, pubsub.New(pubsub.Params{Log: log, Store: store}))
	middleware := middlewares.New(&config.Config{
		Server: config.Server{AllowedOrigins: []string{allowedOrigin}},
	}, tracer)

	return middleware.Register(h), store
}

func newRequest(t *testing.T, method, target string) *http.Request {
	t.Helper()
	return httptest.NewRequestWithContext(t.Context(), method, target, nil)
}

// refreshToken is what the handler saw in its context, captured rather than
// asserted in place so the assertions stay outside the request goroutine.
type refreshToken struct {
	value  string
	found  bool
	served bool
}

func serveWithRefreshToken(t *testing.T, req *http.Request) *refreshToken {
	t.Helper()

	seen := new(refreshToken)
	handler, _ := register(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		seen.served = true
		seen.value, seen.found = xcontext.ExtractRefreshToken(r.Context())
	}))
	handler.ServeHTTP(httptest.NewRecorder(), req)

	return seen
}

func TestRefreshTokenCookie(t *testing.T) {
	t.Parallel()

	// The cookie is written by the cookies package and read back here, which is
	// the only production path carrying a refresh token into a handler.
	writer := cookies.New(&config.Config{Environment: config.EnvironmentLocal})

	t.Run("reaches the handler that will refresh the session", func(t *testing.T) {
		t.Parallel()

		token := uuid.Must(uuid.NewV4()).String()
		req := newRequest(t, http.MethodPost, "/api.v1.AuthService/RefreshToken")
		req.AddCookie(writer.RefreshToken(token))

		seen := serveWithRefreshToken(t, req)

		require.True(t, seen.found)
		require.Equal(t, token, seen.value)
	})

	t.Run("carries no token once the session is logged out", func(t *testing.T) {
		t.Parallel()

		req := newRequest(t, http.MethodPost, "/api.v1.AuthService/Logout")
		req.AddCookie(writer.ExpiredRefreshToken())

		seen := serveWithRefreshToken(t, req)

		require.True(t, seen.found)
		require.Empty(t, seen.value)
	})

	t.Run("is not read from another cookie", func(t *testing.T) {
		t.Parallel()

		req := newRequest(t, http.MethodPost, "/api.v1.AuthService/RefreshToken")
		req.AddCookie(&http.Cookie{Name: "accessToken", Value: uuid.Must(uuid.NewV4()).String()})

		seen := serveWithRefreshToken(t, req)

		require.False(t, seen.found)
	})

	t.Run("leaves a request without one alone", func(t *testing.T) {
		t.Parallel()

		seen := serveWithRefreshToken(t, newRequest(t, http.MethodPost, "/api.v1.AuthService/Login"))

		require.True(t, seen.served)
		require.False(t, seen.found)
	})
}

func TestCORS(t *testing.T) {
	t.Parallel()

	ok := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	t.Run("lets a configured origin send credentials", func(t *testing.T) {
		t.Parallel()

		handler, _ := register(ok)
		req := newRequest(t, http.MethodPost, "/api.v1.UserService/GetUser")
		req.Header.Set("Origin", allowedOrigin)

		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		require.Equal(t, allowedOrigin, rec.Header().Get("Access-Control-Allow-Origin"))
		require.Equal(t, "true", rec.Header().Get("Access-Control-Allow-Credentials"))
	})

	t.Run("withholds the credentialed response from an unknown origin", func(t *testing.T) {
		t.Parallel()

		handler, _ := register(ok)
		req := newRequest(t, http.MethodPost, "/api.v1.UserService/GetUser")
		req.Header.Set("Origin", "https://not-getstronger.test")

		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		require.Empty(t, rec.Header().Get("Access-Control-Allow-Origin"))
	})

	t.Run("exposes the headers a Connect error arrives in", func(t *testing.T) {
		t.Parallel()

		handler, _ := register(ok)
		req := newRequest(t, http.MethodPost, "/api.v1.UserService/GetUser")
		req.Header.Set("Origin", allowedOrigin)

		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		require.Contains(t, rec.Header().Get("Access-Control-Expose-Headers"), "Grpc-Status")
	})

	t.Run("answers the preflight an authenticated Connect call makes", func(t *testing.T) {
		t.Parallel()

		served := false
		handler, store := register(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
			served = true
		}))

		req := newRequest(t, http.MethodOptions, "/api.v1.UserService/GetUser")
		req.Header.Set("Origin", allowedOrigin)
		req.Header.Set("Access-Control-Request-Method", http.MethodPost)
		// What connect-web asks for once the auth interceptor has stamped a
		// token on the call. The Fetch standard has browsers send these
		// lowercased and sorted, and rs/cors rejects a list that is not.
		req.Header.Set("Access-Control-Request-Headers", "authorization,connect-protocol-version,content-type")

		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		require.Equal(t, allowedOrigin, rec.Header().Get("Access-Control-Allow-Origin"))
		require.Equal(t, "true", rec.Header().Get("Access-Control-Allow-Credentials"))
		require.Contains(t, rec.Header().Get("Access-Control-Allow-Methods"), http.MethodPost)

		// A preflight never reaches the handler, so it is not a request worth
		// tracing either.
		require.False(t, served)
		require.Empty(t, store.traced(t))
	})
}

func TestTrace(t *testing.T) {
	t.Parallel()

	t.Run("publishes the request and the status the handler sent", func(t *testing.T) {
		t.Parallel()

		handler, store := register(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusTeapot)
		}))
		handler.ServeHTTP(httptest.NewRecorder(), newRequest(t, http.MethodPost, "/api.v1.UserService/GetUser"))

		traced := store.traced(t)
		require.Len(t, traced, 1)
		require.Equal(t, "/api.v1.UserService/GetUser", traced[0].Request)
		require.Equal(t, http.StatusTeapot, traced[0].StatusCode)
		require.GreaterOrEqual(t, traced[0].DurationMS, 0)
	})

	t.Run("records 200 for a handler that only writes a body", func(t *testing.T) {
		t.Parallel()

		var writeErr error
		handler, store := register(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			_, writeErr = w.Write([]byte("body"))
		}))
		handler.ServeHTTP(httptest.NewRecorder(), newRequest(t, http.MethodPost, "/api.v1.UserService/GetUser"))

		require.NoError(t, writeErr)

		traced := store.traced(t)
		require.Len(t, traced, 1)
		require.Equal(t, http.StatusOK, traced[0].StatusCode)
	})
}
