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

type Tracer struct {
	log  *zap.Logger
	repo *repo.Repo
}

func NewTracer(log *zap.Logger, repo *repo.Repo) *Tracer {
	return &Tracer{log, repo}
}

type Trace struct {
	start time.Time
	onEnd func(duration time.Duration, statusCode int)
}

const timeout = 5 * time.Second

func (m *Tracer) Trace(uri string) *Trace {
	return &Trace{
		start: time.Now().UTC(),
		onEnd: func(duration time.Duration, statusCode int) {
			m.log.Info("trace", zap.String("uri", uri), zap.Duration("duration", duration), zap.Int("status_code", statusCode))
			go func() {
				ctx, cancel := context.WithTimeout(context.Background(), timeout)
				defer cancel()
				if err := m.repo.StoreTrace(ctx, repo.StoreTraceParams{
					Request:    uri,
					DurationMS: int(duration.Milliseconds()),
					StatusCode: statusCode,
				}); err != nil {
					m.log.Error("trace store failed", zap.Error(err))
				}
			}()
		},
	}
}

func (t *Trace) End(rw *ResponseWriter) {
	t.onEnd(time.Since(t.start), rw.statusCode)
}
