package trace

import "time"

type Trace struct {
	uri   string
	start time.Time
}

func (t *Trace) End() {
	duration := time.Since(t.start)
	duration.Milliseconds()
	//println(t.uri, duration.String())
}

func Start(uri string) *Trace {
	return &Trace{
		uri:   uri,
		start: time.Now().UTC(),
	}
}
