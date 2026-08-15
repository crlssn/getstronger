package server

import (
	"net"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/config"
)

func TestHealth(t *testing.T) {
	t.Parallel()

	recorder := httptest.NewRecorder()
	request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/healthz", nil)
	NewMultiplexer(nil, nil, nil).ServeHTTP(recorder, request)

	assert.Equal(t, http.StatusNoContent, recorder.Code)
	assert.Equal(t, "no-store", recorder.Header().Get("Cache-Control"))
}

// Connect clients reach the server over cleartext HTTP/2 behind the proxy, so a
// server that only negotiates it over TLS would break every gRPC caller.
func TestServesUnencryptedHTTP2(t *testing.T) {
	t.Parallel()

	server := NewServer(Params{
		Log:    zap.NewNop(),
		Mux:    NewMultiplexer(nil, nil, nil),
		Config: &config.Config{},
		Stream: nil,
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
