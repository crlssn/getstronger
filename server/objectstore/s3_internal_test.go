package objectstore

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/config"
)

// The signature this request must carry. It was computed from Amazon's own
// specification by a second implementation, itself held to the published
// "get-vanilla" vector of the aws-sig-v4-test-suite first, so a signature this
// code would not be accepted by a bucket fails here rather than in production.
const wantAuthorization = "AWS4-HMAC-SHA256 " +
	"Credential=AKIDEXAMPLE/20260914/fr-par/s3/aws4_request, " +
	"SignedHeaders=host;x-amz-content-sha256;x-amz-date, " +
	"Signature=eada88d07f4d3e2a17e49eb983363d894d6e86d46b5c0f859ebd56ca60df70d3"

const signedKey = "recordings/a0d1f0e2-1111-4222-8333-444455556666.json"

func TestS3Signature(t *testing.T) {
	t.Parallel()

	store := signingStore(t, "https://s3.fr-par.scw.cloud")
	req, err := http.NewRequestWithContext(
		context.Background(),
		http.MethodPut,
		"https://s3.fr-par.scw.cloud/getstronger.recordings/"+signedKey,
		nil,
	)
	require.NoError(t, err)

	store.sign(req, http.MethodPut, "/getstronger.recordings/"+signedKey, []byte(`{"version":1}`))

	require.Equal(t, wantAuthorization, req.Header.Get("Authorization"))
	require.Equal(t, "20260914T000000Z", req.Header.Get("X-Amz-Date"))
	require.Equal(
		t,
		"2430f1a2ad2982d0067885488a4c89e21ad1d7c83b115ba8f1b20acc88dfaea8",
		req.Header.Get("X-Amz-Content-Sha256"),
	)
}

func TestS3RoundTrip(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	objects := make(map[string][]byte)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Whatever the bucket does with the request, it reads it off the path
		// that was signed, so the test holds the request to the same one.
		assert.Equal(t, "/getstronger.recordings/"+signedKey, r.URL.Path)
		assert.NotEmpty(t, r.Header.Get("Authorization"))

		switch r.Method {
		case http.MethodPut:
			body, err := io.ReadAll(r.Body)
			assert.NoError(t, err)
			assert.Equal(t, hashHex(body), r.Header.Get("X-Amz-Content-Sha256"))
			objects[r.URL.Path] = body
			w.WriteHeader(http.StatusOK)
		case http.MethodGet:
			body, ok := objects[r.URL.Path]
			if !ok {
				w.WriteHeader(http.StatusNotFound)
				return
			}
			_, _ = w.Write(body)
		}
	}))
	t.Cleanup(server.Close)

	store := signingStore(t, server.URL)

	_, err := store.Get(ctx, signedKey)
	require.ErrorIs(t, err, ErrObjectNotFound)

	require.NoError(t, store.Put(ctx, signedKey, []byte(`{"version":1}`)))
	body, err := store.Get(ctx, signedKey)
	require.NoError(t, err)
	require.JSONEq(t, `{"version":1}`, string(body))
}

func TestS3CarriesTheBucketsRejection(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte("<Error><Code>AccessDenied</Code></Error>"))
	}))
	t.Cleanup(server.Close)

	store := signingStore(t, server.URL)

	err := store.Put(context.Background(), signedKey, []byte(`{"version":1}`))
	require.ErrorIs(t, err, errS3Response)
	require.Contains(t, err.Error(), "AccessDenied")

	_, err = store.Get(context.Background(), signedKey)
	require.ErrorIs(t, err, errS3Response)
}

func TestS3RefusesIncompleteConfiguration(t *testing.T) {
	t.Parallel()

	_, err := newS3(&config.Config{}, http.DefaultClient, time.Now)
	require.ErrorIs(t, err, errS3Config)
	require.Contains(t, err.Error(), "OBJECT_STORE_ENDPOINT")
	require.Contains(t, err.Error(), "OBJECT_STORE_SECRET_KEY")
}

func signingStore(t *testing.T, endpoint string) *s3 {
	t.Helper()

	c := &config.Config{}
	c.ObjectStore.Endpoint = endpoint
	c.ObjectStore.Region = "fr-par"
	c.ObjectStore.Bucket = "getstronger.recordings"
	c.ObjectStore.AccessKey = "AKIDEXAMPLE"
	c.ObjectStore.SecretKey = "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY"

	store, err := newS3(c, http.DefaultClient, func() time.Time {
		return time.Date(2026, time.September, 14, 0, 0, 0, 0, time.UTC)
	})
	require.NoError(t, err)

	return store.(*s3) //nolint:forcetypeassert // newS3 returns nothing else.
}

// A key outside the alphabet never reaches the bucket: the signature covers
// the path, so a key the store would not sign is one it does not send.
func TestS3RefusesAKeyItWouldNotSign(t *testing.T) {
	t.Parallel()

	store := signingStore(t, "https://s3.fr-par.scw.cloud")

	require.ErrorIs(t, store.Put(context.Background(), "../escaped.json", nil), ErrInvalidKey)
	_, err := store.Get(context.Background(), "recordings/../../escaped.json")
	require.ErrorIs(t, err, ErrInvalidKey)
}

func TestS3ReportsAnEndpointItCannotAddress(t *testing.T) {
	t.Parallel()

	store := signingStore(t, "://nowhere")

	err := store.Put(context.Background(), signedKey, []byte(`{"version":1}`))
	require.ErrorContains(t, err, "create object store request")
}

// A bucket that cannot be reached is a failed save rather than a session
// stored without its route.
func TestS3ReportsABucketItCannotReach(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.NotFoundHandler())
	endpoint := server.URL
	server.Close()

	store := signingStore(t, endpoint)

	err := store.Put(context.Background(), signedKey, []byte(`{"version":1}`))
	require.ErrorContains(t, err, "send object store request")

	_, err = store.Get(context.Background(), signedKey)
	require.ErrorContains(t, err, "send object store request")
}

// A reply that stops half way through is not a document, and not an empty one
// either.
func TestS3ReportsATruncatedReply(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// More body promised than sent, so the connection closes mid-read.
		w.Header().Set("Content-Length", "64")
		if r.Method == http.MethodPut {
			w.WriteHeader(http.StatusForbidden)
		}
		_, _ = w.Write([]byte("{"))
	}))
	t.Cleanup(server.Close)

	store := signingStore(t, server.URL)

	require.ErrorIs(t, store.Put(context.Background(), signedKey, []byte(`{"version":1}`)), errS3Response)

	_, err := store.Get(context.Background(), signedKey)
	require.ErrorContains(t, err, "read object "+signedKey)
}
