package bus

import "github.com/davecgh/go-spew/spew"

type handler interface {
	handle(data any)
}

type handlerRequestTraced struct {
}

func newHandlerRequestTraced() *handlerRequestTraced {
	return &handlerRequestTraced{}
}

func (h *handlerRequestTraced) handle(data any) {
	spew.Dump(data)
}

var _ handler = (*handlerRequestTraced)(nil)
