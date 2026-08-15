package email

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/config"
)

func TestScalewaySendVerification(t *testing.T) {
	t.Parallel()

	var received createEmailRequest
	var authToken string
	var path string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path = r.URL.Path
		authToken = r.Header.Get("X-Auth-Token")
		if err := json.NewDecoder(r.Body).Decode(&received); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(server.Close)

	c := scalewayConfig()
	provider, err := newScaleway(c, server.Client(), server.URL)
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

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "denied", http.StatusForbidden)
	}))
	t.Cleanup(server.Close)

	provider, err := newScaleway(scalewayConfig(), server.Client(), server.URL)
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
