package trace

import (
	"net/http"
	"time"

	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/bus"
	"github.com/crlssn/getstronger/server/bus/events"
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
	log *zap.Logger
	bus *bus.Bus
}

func NewTracer(log *zap.Logger, bus *bus.Bus) *Tracer {
	return &Tracer{log, bus}
}

type Trace struct {
	start time.Time
	onEnd func(duration time.Duration, statusCode int)
}

func (m *Tracer) Trace(uri string) *Trace {
	return &Trace{
		start: time.Now().UTC(),
		onEnd: func(duration time.Duration, statusCode int) {
			m.log.Info("trace", zap.String("uri", uri), zap.Duration("duration", duration), zap.Int("status_code", statusCode))
			m.bus.Publish(&events.RequestTraced{
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
