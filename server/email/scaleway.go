package email

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/crlssn/getstronger/server/config"
)

const (
	scalewayAPIURL        = "https://api.scaleway.com"
	timeout               = 5 * time.Second
	requiredConfigCount   = 3
	maxErrorResponseBytes = 8 << 10
)

var (
	errScalewayEmailConfig   = errors.New("configure Scaleway email")
	errScalewayEmailResponse = errors.New("send Scaleway email")
)

type scaleway struct {
	client      *http.Client
	endpoint    string
	projectID   string
	secretKey   string
	fromAddress string
	origin      string
}

var _ Email = (*scaleway)(nil)

type address struct {
	Email string `json:"email"`
	Name  string `json:"name,omitempty"`
}

type createEmailRequest struct {
	From      address   `json:"from"`
	To        []address `json:"to"`
	Subject   string    `json:"subject"`
	Text      string    `json:"text"`
	ProjectID string    `json:"project_id"` //nolint:tagliatelle // The Scaleway API uses snake_case.
}

func NewScaleway(c *config.Config) (Email, error) {
	return newScaleway(c, &http.Client{Timeout: timeout}, scalewayAPIURL)
}

func newScaleway(c *config.Config, client *http.Client, baseURL string) (Email, error) {
	missing := make([]string, 0, requiredConfigCount)
	if c.Email.ScalewayProjectID == "" {
		missing = append(missing, "SCW_PROJECT_ID")
	}
	if c.Email.ScalewaySecretKey == "" {
		missing = append(missing, "SCW_TEM_SECRET_KEY")
	}
	if len(c.Server.AllowedOrigins) == 0 || c.Server.AllowedOrigins[0] == "" {
		missing = append(missing, "CORS_ALLOWED_ORIGIN")
	}
	if len(missing) > 0 {
		return nil, fmt.Errorf("%w: missing %s", errScalewayEmailConfig, strings.Join(missing, ", "))
	}

	region := c.Email.ScalewayRegion
	if region == "" {
		region = "fr-par"
	}

	fromAddress := c.Email.FromAddress
	if fromAddress == "" {
		fromAddress = fromEmail
	}

	return &scaleway{
		client:      client,
		endpoint:    fmt.Sprintf("%s/transactional-email/v1alpha1/regions/%s/emails", strings.TrimRight(baseURL, "/"), region),
		projectID:   c.Email.ScalewayProjectID,
		secretKey:   c.Email.ScalewaySecretKey,
		fromAddress: fromAddress,
		origin:      c.Server.AllowedOrigins[0],
	}, nil
}

func (s *scaleway) SendVerification(ctx context.Context, req SendVerification) error {
	return s.send(ctx, req.Name, req.Email, subjectSendVerification, BodySendVerification(req.Name, s.origin, req.Token))
}

func (s *scaleway) SendPasswordReset(ctx context.Context, req SendPasswordReset) error {
	return s.send(ctx, req.Name, req.Email, subjectSendPasswordReset, BodySendPasswordReset(req.Name, s.origin, req.Token))
}

func (s *scaleway) send(ctx context.Context, recipientName, recipientEmail, subject, body string) error {
	payload, err := json.Marshal(createEmailRequest{
		From: address{
			Email: s.fromAddress,
			Name:  fromName,
		},
		To: []address{{
			Email: recipientEmail,
			Name:  recipientName,
		}},
		Subject:   subject,
		Text:      body,
		ProjectID: s.projectID,
	})
	if err != nil {
		return fmt.Errorf("marshal Scaleway email: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.endpoint, bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("create Scaleway email request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Auth-Token", s.secretKey)

	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("send Scaleway email: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		responseBody, readErr := io.ReadAll(io.LimitReader(resp.Body, maxErrorResponseBytes))
		if readErr != nil {
			return fmt.Errorf("%w: status %s: read response: %w", errScalewayEmailResponse, resp.Status, readErr)
		}
		return fmt.Errorf("%w: status %s: %s", errScalewayEmailResponse, resp.Status, strings.TrimSpace(string(responseBody)))
	}

	return nil
}
