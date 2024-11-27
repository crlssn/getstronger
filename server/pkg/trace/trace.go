package trace

import (
	"context"
	"net/http"
	"time"

	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/pkg/repo"
)

type ResponseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (rw *ResponseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

type Manager struct {
	log  *zap.Logger
	repo *repo.Repo
}

type Trace struct {
	log   *zap.Logger
	uri   string
	repo  *repo.Repo
	start time.Time
}

func NewManager(log *zap.Logger, repo *repo.Repo) *Manager {
	return &Manager{log, repo}
}

func (m *Manager) Trace(uri string) *Trace {
	return &Trace{
		log:   m.log,
		uri:   uri,
		repo:  m.repo,
		start: time.Now().UTC(),
	}
}

func (t *Trace) End(rw *ResponseWriter) {
	duration := time.Since(t.start)
	t.log.Info("trace", zap.String("uri", t.uri), zap.Duration("duration", duration), zap.Int("status_code", rw.statusCode))

	// TODO: Use event bus to store trace.
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := t.repo.CreateTrace(ctx, repo.CreateTraceParams{
			Request:    t.uri,
			DurationMS: int(duration.Milliseconds()),
			StatusCode: rw.statusCode,
		}); err != nil {
			t.log.Error("trace creation failed", zap.Error(err))
		}
	}()
}
