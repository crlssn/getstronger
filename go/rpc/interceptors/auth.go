package interceptors

import (
	"context"
	apiv1 "github.com/crlssn/getstronger/go/pkg/pb/api/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	_ "google.golang.org/grpc/peer"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
	"log"
)

// AuthInterceptor is an interceptor for authenticating requests.
type AuthInterceptor struct {
	// You could add fields like an authentication service or a token validator here.
}

// NewAuthInterceptor returns a new AuthInterceptor
func NewAuthInterceptor() *AuthInterceptor {
	return &AuthInterceptor{}
}

// Unary is the unary interceptor method for authentication.
func (a *AuthInterceptor) Unary() grpc.UnaryServerInterceptor {
	return func(
		ctx context.Context,
		req interface{},
		info *grpc.UnaryServerInfo,
		handler grpc.UnaryHandler,
	) (interface{}, error) {
		err := a.authorize(ctx, info.FullMethod)
		if err != nil {
			return nil, err
		}
		return handler(ctx, req)
	}
}

// Stream is the stream interceptor method for authentication.
func (a *AuthInterceptor) Stream() grpc.StreamServerInterceptor {
	return func(
		srv interface{},
		ss grpc.ServerStream,
		info *grpc.StreamServerInfo,
		handler grpc.StreamHandler,
	) error {
		err := a.authorize(ss.Context(), info.FullMethod)
		if err != nil {
			return err
		}
		return handler(srv, ss)
	}
}

// authorize checks the authorization of the request.
func (a *AuthInterceptor) authorize(ctx context.Context, fullMethodName string) error {
	// Retrieve method descriptor
	_, methodDesc := getMethodDescriptor(fullMethodName)
	if methodDesc == nil {
		return status.Errorf(codes.Internal, "method descriptor not found")
	}

	// Check for the custom option
	opts := methodDesc.Options()
	if opts != nil {
		ext := proto.GetExtension(opts, apiv1.E_RequiresAuth).(bool)
		if ext {
			log.Printf("Authorization required for method: %s", fullMethodName)

			// Perform the actual authentication check
			md, ok := metadata.FromIncomingContext(ctx)
			if !ok {
				return status.Errorf(codes.Unauthenticated, "missing metadata")
			}

			if len(md["authorization"]) == 0 {
				return status.Errorf(codes.Unauthenticated, "missing authorization token")
			}

			token := md["authorization"][0]
			if !validateToken(token) {
				return status.Errorf(codes.Unauthenticated, "invalid token")
			}
		}
	}

	return nil
}

// validateToken is a dummy function that should contain your token validation logic.
func validateToken(token string) bool {
	// Implement your token validation logic here
	return token == "valid-token"
}

// getMethodDescriptor retrieves the service and method descriptors based on the full method name.
func getMethodDescriptor(fullMethodName string) (protoreflect.ServiceDescriptor, protoreflect.MethodDescriptor) {
	// Assume you have registered your service descriptor somewhere
	// Replace 'MyService_ServiceDesc' with your actual service descriptor.
	serviceDesc := apiv1.File_api_v1_auth_proto.Services()

	for i := 0; i < serviceDesc.NumMethods(); i++ {
		methodDesc := serviceDesc.Method(i)
		if fullMethodName == "/"+serviceDesc.FullName()+"/"+string(methodDesc.Name()) {
			return serviceDesc, methodDesc
		}
	}

	return nil, nil
}

func getServiceDescriptors() grpc.ServiceDesc {
	for _, asd := range apiv1.File_api_v1_auth_proto.Services() {
		asd.
	}

	return apiv1.File_api_v1_auth_proto.Services().ByName("AuthService")
}
