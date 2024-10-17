package interceptors

import (
	"connectrpc.com/connect"
)

type Interceptor interface {
	Unary() connect.UnaryInterceptorFunc
}
