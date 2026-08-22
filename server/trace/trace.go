package trace

import (
	"context"
	"net/http"
	"time"

	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/pubsub"
	"github.com/crlssn/getstronger/server/pubsub/events"
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
	log    *zap.Logger
	pubSub *pubsub.PubSub
}

func New(log *zap.Logger, ps *pubsub.PubSub) *Tracer {
	return &Tracer{log, ps}
}

type Trace struct {
	start time.Time
	onEnd func(duration time.Duration, statusCode int)
}

func (m *Tracer) Trace(ctx context.Context, uri string) *Trace {
	return &Trace{
		start: time.Now().UTC(),
		onEnd: func(duration time.Duration, statusCode int) {
			m.log.Info("Request traced", zap.String("uri", uri), zap.Duration("duration", duration), zap.Int("status_code", statusCode))
			m.pubSub.Publish(ctx, events.TopicRequestTraced, events.RequestTraced{
				Request:    uri,
				DurationMS: int(duration.Milliseconds()),
				StatusCode: statusCode,
			})
		},
	}
}

func (t *Trace) End(rw *ResponseWriter) {
	t.onEnd(time.Since(t.start), rw.statusCode)
}
