package events

type Event interface {
	Data() any
	Type() string
}

var _ Event = (*EventRequestTraced)(nil)

type EventRequestTraced struct {
	Request    string
	DurationMS int
	StatusCode int
}

func (e *EventRequestTraced) Type() string {
	return "request:traced"
}

func (e *EventRequestTraced) Data() any {
	return e
}
