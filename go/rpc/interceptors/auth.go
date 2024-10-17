package interceptors

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"connectrpc.com/connect"
	"go.uber.org/zap"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/types/descriptorpb"

	"github.com/crlssn/getstronger/go/pkg/jwt"
	apiv1 "github.com/crlssn/getstronger/go/pkg/pb/api/v1"
)

type auth struct {
	log     *zap.Logger
	jwt     *jwt.Manager
	methods map[string]bool
}

func NewAuth(log *zap.Logger, jwt *jwt.Manager) Interceptor {
	a := &auth{
		log:     log,
		jwt:     jwt,
		methods: make(map[string]bool),
	}
	a.initMethods()
	return a
}

func (a *auth) initMethods() {
	fileDescriptors := []protoreflect.FileDescriptor{
		apiv1.File_api_v1_auth_proto,
	}

	for _, fileDescriptor := range fileDescriptors {
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
}

// Unary is the unary interceptor method for authentication.
func (a *auth) Unary() connect.UnaryInterceptorFunc {
	interceptor := func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(
			ctx context.Context,
			req connect.AnyRequest,
		) (connect.AnyResponse, error) {
			if err := a.authorize(req.Spec().Procedure, req.Header()); err != nil {
				a.log.Warn("unauthenticated request", zap.Error(err))
				return nil, connect.NewError(connect.CodeUnauthenticated, err)
			}
			return next(ctx, req)
		}
	}
	return interceptor
}

// authorize checks the authorization of the request.
func (a *auth) authorize(methodName string, header http.Header) error {
	requiresAuth := a.methods[methodName]
	if !requiresAuth {
		a.log.Info("method does not require authentication", zap.String("method", methodName))
		return nil
	}

	authHeader := header.Get("Authorization")
	if authHeader == "" {
		return errors.New("authorization token is missing")
	}

	const bearerPrefix = "Bearer "
	if !strings.HasPrefix(authHeader, bearerPrefix) {
		return errors.New("invalid authorization header format")
	}

	token := strings.TrimPrefix(authHeader, bearerPrefix)
	if err := a.jwt.ValidateAccessToken(token); err != nil {
		return errors.New("invalid authorization token")
	}

	return nil
}

var _ Interceptor = (*auth)(nil)
