package interceptors

import (
	"context"
	"fmt"

	"go.uber.org/zap"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	_ "google.golang.org/grpc/peer"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/descriptorpb"

	"github.com/crlssn/getstronger/go/pkg/jwt"
	apiv1 "github.com/crlssn/getstronger/go/pkg/pb/api/v1"
)

// AuthInterceptor is an interceptor for authenticating requests.
type auth struct {
	log     *zap.Logger
	jwt     *jwt.Manager
	methods map[string]bool
}

// NewAuthInterceptor returns a new AuthInterceptor
func NewAuthInterceptor(log *zap.Logger, jwt *jwt.Manager) Interceptor {
	a := &auth{log: log, jwt: jwt}
	a.init()
	return a
}

func (a *auth) init() {
	fileDescriptor := apiv1.File_api_v1_auth_proto

	// Iterate over the services in the file descriptor.
	services := fileDescriptor.Services()
	for i := 0; i < services.Len(); i++ {
		service := services.Get(i)
		methods := service.Methods()
		for j := 0; j < methods.Len(); j++ {
			method := methods.Get(j)
			requiresAuth := false

			// Access the custom options.
			options := method.Options().(*descriptorpb.MethodOptions)
			if proto.HasExtension(options, apiv1.E_RequiresAuth) {
				if ext := proto.GetExtension(options, apiv1.E_RequiresAuth); ext != nil {
					if v, ok := ext.(bool); ok {
						requiresAuth = v
					}
				}
			}

			// Build the full method name.
			fullMethodName := fmt.Sprintf("/%s/%s", service.FullName(), method.Name())
			a.methods[fullMethodName] = requiresAuth
		}
	}
}

// Unary is the unary interceptor method for authentication.
func (a *auth) Unary() grpc.UnaryServerInterceptor {
	return func(
		ctx context.Context,
		req interface{},
		info *grpc.UnaryServerInfo,
		handler grpc.UnaryHandler,
	) (interface{}, error) {
		if err := a.authorize(ctx, info.FullMethod); err != nil {
			return nil, err
		}

		return handler(ctx, req)
	}
}

// Stream is the stream interceptor method for authentication.
func (a *auth) Stream() grpc.StreamServerInterceptor {
	return func(
		srv interface{},
		ss grpc.ServerStream,
		info *grpc.StreamServerInfo,
		handler grpc.StreamHandler,
	) error {
		if err := a.authorize(ss.Context(), info.FullMethod); err != nil {
			return err
		}

		return handler(srv, ss)
	}
}

// authorize checks the authorization of the request.
func (a *auth) authorize(ctx context.Context, methodName string) error {
	requiresAuth := a.methods[methodName]
	if !requiresAuth {
		a.log.Info("method does not require authentication", zap.String("method", methodName))
		return nil
	}

	// Extract metadata from the incoming context.
	md, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		a.log.Warn("missing metadata")
		return status.Error(codes.Unauthenticated, "missing metadata")
	}

	// Extract the "authorization" header.
	authHeaders := md.Get("authorization")
	if len(authHeaders) == 0 {
		a.log.Warn("authorization token is missing")
		return status.Error(codes.Unauthenticated, "authorization token is missing")
	}

	// Validate the token.
	token := authHeaders[0]
	if err := a.jwt.ValidateAccessToken(token); err != nil {
		a.log.Warn("invalid authorization token", zap.Error(err))
		return status.Error(codes.Unauthenticated, "invalid authorization token")
	}

	return nil
}
