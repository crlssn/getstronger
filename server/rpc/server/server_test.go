package server

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/config"
)

func TestHealth(t *testing.T) {
	t.Parallel()

	recorder := httptest.NewRecorder()
	request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/healthz", nil)
	NewMultiplexer(MultiplexerParams{Log: zap.NewNop(), Config: &config.Config{}}).ServeHTTP(recorder, request)

	assert.Equal(t, http.StatusNoContent, recorder.Code)
	assert.Equal(t, "no-store", recorder.Header().Get("Cache-Control"))
}

// Connect clients reach the server over cleartext HTTP/2 behind the proxy, so a
// server that only negotiates it over TLS would break every gRPC caller.
func TestServesUnencryptedHTTP2(t *testing.T) {
	t.Parallel()

	server := NewServer(Params{
		Log:    zap.NewNop(),
		Mux:    NewMultiplexer(MultiplexerParams{Log: zap.NewNop(), Config: &config.Config{}}),
		Config: &config.Config{},
	}).server

	listener, err := new(net.ListenConfig).Listen(t.Context(), "tcp", "127.0.0.1:0")
	require.NoError(t, err)
	go func() { _ = server.Serve(listener) }()
	t.Cleanup(func() { _ = server.Close() })

	var protocols http.Protocols
	protocols.SetUnencryptedHTTP2(true)
	client := &http.Client{Transport: &http.Transport{Protocols: &protocols}}

	req, err := http.NewRequestWithContext(
		t.Context(), http.MethodGet, "http://"+listener.Addr().String()+"/healthz", nil,
	)
	require.NoError(t, err)

	res, err := client.Do(req)
	require.NoError(t, err)
	defer func() { _ = res.Body.Close() }()

	assert.Equal(t, 2, res.ProtoMajor)
	assert.Equal(t, http.StatusNoContent, res.StatusCode)
}

// The fx OnStart hook has to mean "accepting connections": the end-to-end suite
// calls the API on the line after app.Start, so a hook returning while the
// socket is still being bound refuses the first call it was meant to enable.
func TestListenAndServeAcceptsOnceStarted(t *testing.T) {
	t.Parallel()

	port := freePort(t)
	server := newTestServer(t, config.Server{Port: port})
	require.NoError(t, server.ListenAndServe(t.Context()))

	res, err := http.DefaultClient.Do(getRequest(t, "http://127.0.0.1:"+port+"/healthz"))
	require.NoError(t, err)
	defer func() { _ = res.Body.Close() }()

	assert.Equal(t, http.StatusNoContent, res.StatusCode)
}

// The same contract holds for the TLS path, which serves the deployed app.
func TestListenAndServeTLSAcceptsOnceStarted(t *testing.T) {
	t.Parallel()

	cfg, pool := selfSignedCertificate(t)
	cfg.Port = freePort(t)
	server := newTestServer(t, cfg)
	require.NoError(t, server.ListenAndServe(t.Context()))

	client := &http.Client{Transport: &http.Transport{TLSClientConfig: &tls.Config{
		RootCAs:    pool,
		MinVersion: tls.VersionTLS12,
	}}}

	res, err := client.Do(getRequest(t, "https://127.0.0.1:"+cfg.Port+"/healthz"))
	require.NoError(t, err)
	defer func() { _ = res.Body.Close() }()

	assert.Equal(t, http.StatusNoContent, res.StatusCode)
}

// Binding synchronously also gives a taken port back to whoever started the
// app, instead of killing the process from a goroutine nobody is listening to.
func TestListenAndServeReturnsBindError(t *testing.T) {
	t.Parallel()

	port := freePort(t)
	blocker, err := new(net.ListenConfig).Listen(t.Context(), "tcp", ":"+port)
	require.NoError(t, err)
	t.Cleanup(func() { _ = blocker.Close() })

	server := newTestServer(t, config.Server{Port: port})
	require.Error(t, server.ListenAndServe(t.Context()))
}

func newTestServer(t *testing.T, cfg config.Server) *Server {
	t.Helper()

	server := NewServer(Params{
		Log:    zap.NewNop(),
		Mux:    NewMultiplexer(MultiplexerParams{Log: zap.NewNop(), Config: &config.Config{}}),
		Config: &config.Config{Server: cfg},
	})
	t.Cleanup(func() { _ = server.server.Close() })

	return server
}

func getRequest(t *testing.T, url string) *http.Request {
	t.Helper()

	req, err := http.NewRequestWithContext(t.Context(), http.MethodGet, url, nil)
	require.NoError(t, err)

	return req
}

// freePort returns a port nothing is listening on, so a test can predict the
// address its server binds without racing the rest of the suite for a fixed one.
func freePort(t *testing.T) string {
	t.Helper()

	listener, err := new(net.ListenConfig).Listen(t.Context(), "tcp", "127.0.0.1:0")
	require.NoError(t, err)
	_, port, err := net.SplitHostPort(listener.Addr().String())
	require.NoError(t, err)
	require.NoError(t, listener.Close())

	return port
}

func selfSignedCertificate(t *testing.T) (config.Server, *x509.CertPool) {
	t.Helper()

	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)

	template := &x509.Certificate{
		SerialNumber:          big.NewInt(1),
		Subject:               pkix.Name{CommonName: "localhost"},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(time.Hour),
		KeyUsage:              x509.KeyUsageDigitalSignature | x509.KeyUsageCertSign,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		IPAddresses:           []net.IP{net.ParseIP("127.0.0.1")},
		IsCA:                  true,
		BasicConstraintsValid: true,
	}

	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	require.NoError(t, err)
	keyDER, err := x509.MarshalECPrivateKey(key)
	require.NoError(t, err)

	dir := t.TempDir()
	cfg := config.Server{
		CertPath: filepath.Join(dir, "cert.pem"),
		KeyPath:  filepath.Join(dir, "key.pem"),
	}
	require.NoError(t, os.WriteFile(cfg.CertPath, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}), 0o600))
	require.NoError(t, os.WriteFile(cfg.KeyPath, pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER}), 0o600))

	certificate, err := x509.ParseCertificate(der)
	require.NoError(t, err)
	pool := x509.NewCertPool()
	pool.AddCert(certificate)

	return cfg, pool
}
