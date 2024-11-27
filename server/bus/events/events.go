package events

type Event interface {
	Data() any
	Type() string
}

var _ Event = (*RequestTraced)(nil)

type RequestTraced struct {
	Request    string
	DurationMS int
	StatusCode int
}

func (e *RequestTraced) Type() string {
	return "request:traced"
}

func (e *RequestTraced) Data() any {
	return e
}
