package email

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/synctest"

	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/config"
)

// An in-memory test server answers every request its own client makes, whatever
// address they carry, so this only has to look like Scaleway's API for the path
// and payload assertions below to mean something.
const testBaseURL = "https://api.scaleway.test"

func TestScalewaySendVerification(t *testing.T) {
	t.Parallel()

	var received createEmailRequest
	var authToken string
	var path string
	server := httptest.NewTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path = r.URL.Path
		authToken = r.Header.Get("X-Auth-Token")
		if err := json.NewDecoder(r.Body).Decode(&received); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))

	c := scalewayConfig()
	provider, err := newScaleway(c, server.Client(), testBaseURL)
	require.NoError(t, err)

	err = provider.SendVerification(context.Background(), SendVerification{
		Name:  "John Doe",
		Email: "john@example.com",
		Token: "token",
	})
	require.NoError(t, err)
	require.Equal(t, "/transactional-email/v1alpha1/regions/fr-par/emails", path)
	require.Equal(t, "secret-key", authToken)
	require.Equal(t, address{Email: "noreply@example.com", Name: fromName}, received.From)
	require.Equal(t, []address{{Email: "john@example.com", Name: "John Doe"}}, received.To)
	require.Equal(t, subjectSendVerification, received.Subject)
	require.Equal(t, BodySendVerification("John Doe", "https://example.com", "token"), received.Text)
	require.Equal(t, "project-id", received.ProjectID)
}

func TestScalewaySendError(t *testing.T) {
	t.Parallel()

	server := httptest.NewTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "denied", http.StatusForbidden)
	}))

	provider, err := newScaleway(scalewayConfig(), server.Client(), testBaseURL)
	require.NoError(t, err)

	err = provider.SendPasswordReset(context.Background(), SendPasswordReset{
		Name:  "John Doe",
		Email: "john@example.com",
		Token: "token",
	})
	require.EqualError(t, err, "send Scaleway email: status 403 Forbidden: denied")
}

func TestNewScalewayRequiresConfiguration(t *testing.T) {
	t.Parallel()

	_, err := NewScaleway(&config.Config{})
	require.EqualError(t, err, "configure Scaleway email: missing SCW_PROJECT_ID, SCW_TEM_SECRET_KEY, CORS_ALLOWED_ORIGIN")
}

func scalewayConfig() *config.Config {
	return &config.Config{
		Email: config.Email{
			FromAddress:       "noreply@example.com",
			ScalewayProjectID: "project-id",
			ScalewayRegion:    "fr-par",
			ScalewaySecretKey: "secret-key",
		},
		Server: config.Server{
			AllowedOrigins: []string{"https://example.com"},
		},
	}
}

func TestScalewaySendFailsWhenTheEndpointIsUnreachable(t *testing.T) {
	t.Parallel()

	// The one test here that needs a real socket. Closing an in-memory server
	// does not refuse the next connection the way a released port does; the
	// dial simply never completes.
	server := httptest.NewTestServer(t, http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	server.Start()

	client := server.Client()
	url := server.URL
	server.Close()

	provider, err := newScaleway(scalewayConfig(), client, url)
	require.NoError(t, err)

	err = provider.SendVerification(context.Background(), SendVerification{
		Name:  "John Doe",
		Email: "john@example.com",
		Token: "token",
	})
	require.ErrorContains(t, err, "send Scaleway email")
}

// A refusal whose body cannot be read still names the status: the caller has to
// be told the send failed even when the reason cannot be quoted back.
func TestScalewaySendReportsAnUnreadableErrorBody(t *testing.T) {
	t.Parallel()

	client := &http.Client{Transport: unreadableBodyTransport{}}
	provider, err := newScaleway(scalewayConfig(), client, "https://example.invalid")
	require.NoError(t, err)

	err = provider.SendVerification(context.Background(), SendVerification{
		Name:  "John Doe",
		Email: "john@example.com",
		Token: "token",
	})
	require.ErrorContains(t, err, "read response")
}

// An endpoint the request builder cannot parse fails before anything is sent.
func TestScalewaySendFailsOnAnUnbuildableRequest(t *testing.T) {
	t.Parallel()

	provider, err := newScaleway(scalewayConfig(), http.DefaultClient, "https://example.com/\x7f")
	require.NoError(t, err)

	err = provider.SendVerification(context.Background(), SendVerification{
		Name:  "John Doe",
		Email: "john@example.com",
		Token: "token",
	})
	require.ErrorContains(t, err, "create Scaleway email request")
}

type unreadableBodyTransport struct{}

func (unreadableBodyTransport) RoundTrip(*http.Request) (*http.Response, error) {
	return &http.Response{
		Status:     "403 Forbidden",
		StatusCode: http.StatusForbidden,
		Body:       io.NopCloser(errReader{}),
		Header:     make(http.Header),
	}, nil
}

var errUnreadableBody = errors.New("body unreadable")

type errReader struct{}

func (errReader) Read([]byte) (int, error) { return 0, errUnreadableBody }

// A hung endpoint must not hold a signup open, which is what the client's
// timeout is for. synctest runs the wait on a fake clock that only moves once
// every goroutine in the bubble is blocked, so the five seconds cost no wall
// clock and cannot flake on a loaded machine.
func TestScalewaySendGivesUpOnAHungEndpoint(t *testing.T) {
	t.Parallel()

	synctest.Test(t, func(t *testing.T) {
		// The handler answers only once the assertions are done. Blocking it is
		// what lets the fake clock reach the timeout; releasing it before the
		// bubble ends is what lets the server shut down.
		release := make(chan struct{})
		server := httptest.NewTestServer(t, http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
			<-release
		}))

		client := server.Client()
		client.Timeout = timeout

		provider, err := newScaleway(scalewayConfig(), client, testBaseURL)
		require.NoError(t, err)

		err = provider.SendVerification(t.Context(), SendVerification{
			Name:  "John Doe",
			Email: "john@example.com",
			Token: "token",
		})
		require.ErrorContains(t, err, "send Scaleway email")
		require.ErrorIs(t, err, context.DeadlineExceeded)

		close(release)
	})
}
