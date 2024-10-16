package interceptors

import "google.golang.org/grpc"

type Interceptor interface {
	Unary() grpc.UnaryServerInterceptor
	Stream() grpc.StreamServerInterceptor
}
