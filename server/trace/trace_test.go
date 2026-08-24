package trace_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/trace"
)

func TestResponseWriterStatusCode(t *testing.T) {
	t.Parallel()

	t.Run("defaults to 200 when the body is written without WriteHeader", func(t *testing.T) {
		t.Parallel()

		rw := trace.NewResponseWriter(httptest.NewRecorder())
		if _, err := rw.Write([]byte("body")); err != nil {
			t.Fatalf("write body: %v", err)
		}

		require.Equal(t, http.StatusOK, rw.StatusCode())
	})

	t.Run("captures an explicit WriteHeader", func(t *testing.T) {
		t.Parallel()

		rec := httptest.NewRecorder()
		rw := trace.NewResponseWriter(rec)
		rw.WriteHeader(http.StatusNotFound)

		require.Equal(t, http.StatusNotFound, rw.StatusCode())
		require.Equal(t, http.StatusNotFound, rec.Code)
	})
}
