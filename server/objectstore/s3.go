package objectstore

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/crlssn/getstronger/server/config"
)

const (
	signingAlgorithm = "AWS4-HMAC-SHA256"
	signingService   = "s3"
	signingRequest   = "aws4_request"
	signedHeaders    = "host;x-amz-content-sha256;x-amz-date"

	amzDateFormat  = "20060102T150405Z"
	amzShortFormat = "20060102"

	// The region every Scaleway bucket this project uses lives in.
	defaultRegion = "fr-par"

	s3Timeout = 10 * time.Second
	// A document larger than this is not one this codebase wrote, so reading it
	// is a symptom rather than a request to allocate.
	maxObjectBytes = 8 << 20
	// Enough of a rejection to say which bucket refused and why.
	maxErrorBytes = 8 << 10
)

var (
	errS3Config   = errors.New("configure the object store")
	errS3Response = errors.New("object store request")
)

// s3 speaks the S3 REST API directly, signed with Signature Version 4. One
// bucket, two verbs and a hand-rolled signature are less to carry than a cloud
// SDK, and the signature is held to Amazon's own worked example in the tests.
type s3 struct {
	client    *http.Client
	endpoint  string
	region    string
	bucket    string
	accessKey string
	secretKey string
	now       func() time.Time
}

var _ Store = (*s3)(nil)

func NewS3(c *config.Config) (Store, error) {
	return newS3(c, &http.Client{Timeout: s3Timeout}, time.Now)
}

func newS3(c *config.Config, client *http.Client, now func() time.Time) (Store, error) {
	var missing []string
	for _, required := range []struct{ name, value string }{
		{"OBJECT_STORE_ENDPOINT", c.ObjectStore.Endpoint},
		{"OBJECT_STORE_BUCKET", c.ObjectStore.Bucket},
		{"OBJECT_STORE_ACCESS_KEY", c.ObjectStore.AccessKey},
		{"OBJECT_STORE_SECRET_KEY", c.ObjectStore.SecretKey},
	} {
		if required.value == "" {
			missing = append(missing, required.name)
		}
	}
	if len(missing) > 0 {
		return nil, fmt.Errorf("%w: missing %s", errS3Config, strings.Join(missing, ", "))
	}

	region := c.ObjectStore.Region
	if region == "" {
		region = defaultRegion
	}

	return &s3{
		client:    client,
		endpoint:  strings.TrimRight(c.ObjectStore.Endpoint, "/"),
		region:    region,
		bucket:    c.ObjectStore.Bucket,
		accessKey: c.ObjectStore.AccessKey,
		secretKey: c.ObjectStore.SecretKey,
		now:       now,
	}, nil
}

func (s *s3) Put(ctx context.Context, key string, body []byte) error {
	resp, err := s.send(ctx, http.MethodPut, key, body)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()

	if err = responseError(resp); err != nil {
		return fmt.Errorf("put object %s: %w", key, err)
	}

	return nil
}

func (s *s3) Get(ctx context.Context, key string) ([]byte, error) {
	resp, err := s.send(ctx, http.MethodGet, key, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("%w: %s", ErrObjectNotFound, key)
	}
	if err = responseError(resp); err != nil {
		return nil, fmt.Errorf("get object %s: %w", key, err)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxObjectBytes))
	if err != nil {
		return nil, fmt.Errorf("read object %s: %w", key, err)
	}

	return body, nil
}

// send builds the request, signs it, and hands back whatever the bucket
// answered. The canonical URI is the path the request is sent to, so what is
// signed and what is sent cannot drift apart.
func (s *s3) send(ctx context.Context, method, key string, body []byte) (*http.Response, error) {
	if err := ValidateKey(key); err != nil {
		return nil, err
	}

	canonicalURI := "/" + s.bucket + "/" + key
	req, err := http.NewRequestWithContext(ctx, method, s.endpoint+canonicalURI, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create object store request: %w", err)
	}
	req.ContentLength = int64(len(body))

	s.sign(req, method, canonicalURI, body)

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("send object store request: %w", err)
	}

	return resp, nil
}

// sign is Signature Version 4 over the three headers S3 needs and no query
// string: the payload is hashed rather than streamed, so every request carries
// its own content hash and nothing has to be re-read to sign it.
func (s *s3) sign(req *http.Request, method, canonicalURI string, body []byte) {
	now := s.now().UTC()
	amzDate := now.Format(amzDateFormat)
	dateStamp := now.Format(amzShortFormat)
	payloadHash := hashHex(body)

	req.Header.Set("X-Amz-Content-Sha256", payloadHash)
	req.Header.Set("X-Amz-Date", amzDate)

	canonicalRequest := strings.Join([]string{
		method,
		canonicalURI,
		"",
		fmt.Sprintf("host:%s\nx-amz-content-sha256:%s\nx-amz-date:%s\n", req.URL.Host, payloadHash, amzDate),
		signedHeaders,
		payloadHash,
	}, "\n")

	scope := strings.Join([]string{dateStamp, s.region, signingService, signingRequest}, "/")
	stringToSign := strings.Join([]string{
		signingAlgorithm,
		amzDate,
		scope,
		hashHex([]byte(canonicalRequest)),
	}, "\n")

	signature := hex.EncodeToString(sign(signingKey(s.secretKey, dateStamp, s.region), stringToSign))
	req.Header.Set("Authorization", fmt.Sprintf(
		"%s Credential=%s/%s, SignedHeaders=%s, Signature=%s",
		signingAlgorithm, s.accessKey, scope, signedHeaders, signature,
	))
}

// signingKey is the secret walked down to the one day, region and service it
// may sign for, which is what keeps a leaked signature from signing anything
// else.
func signingKey(secretKey, dateStamp, region string) []byte {
	key := sign([]byte("AWS4"+secretKey), dateStamp)
	key = sign(key, region)
	key = sign(key, signingService)

	return sign(key, signingRequest)
}

func sign(key []byte, value string) []byte {
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(value))

	return mac.Sum(nil)
}

func hashHex(body []byte) string {
	sum := sha256.Sum256(body)

	return hex.EncodeToString(sum[:])
}

// responseError carries the bucket's own rejection through, which is the only
// thing that says whether a 403 is the wrong key or the wrong bucket.
func responseError(resp *http.Response) error {
	if resp.StatusCode >= http.StatusOK && resp.StatusCode < http.StatusMultipleChoices {
		return nil
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxErrorBytes))
	if err != nil {
		return fmt.Errorf("%w: status %s: read response: %w", errS3Response, resp.Status, err)
	}

	return fmt.Errorf("%w: status %s: %s", errS3Response, resp.Status, strings.TrimSpace(string(body)))
}
