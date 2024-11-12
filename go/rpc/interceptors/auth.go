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
		apiv1.File_api_v1_exercise_proto,
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
				if proto.HasExtension(options, apiv1.E_Auth) {
					if ext := proto.GetExtension(options, apiv1.E_Auth); ext != nil {
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
			requiresAuth := a.methods[req.Spec().Procedure]
			if !requiresAuth {
				a.log.Info("method does not require authentication", zap.String("method", req.Spec().Procedure))
				return next(ctx, req)
			}

			claims, err := a.authorize(req.Header())
			if err != nil {
				a.log.Warn("unauthenticated request", zap.Error(err))
				return nil, connect.NewError(connect.CodeUnauthenticated, nil)
			}

			return next(context.WithValue(ctx, jwt.ContextKeyUserID, claims.UserID), req)
		}
	}
	return interceptor
}

// authorize checks the authorization of the request.
func (a *auth) authorize(header http.Header) (*jwt.Claims, error) {
	authHeader := header.Get("Authorization")
	if authHeader == "" {
		return nil, errors.New("authorization token is missing")
	}

	const bearerPrefix = "Bearer "
	if !strings.HasPrefix(authHeader, bearerPrefix) {
		return nil, errors.New("invalid authorization header format")
	}

	token := strings.TrimPrefix(authHeader, bearerPrefix)
	claims, err := a.jwt.ClaimsFromToken(token, jwt.TokenTypeAccess)
	if err != nil {
		return nil, fmt.Errorf("claims from token: %w", err)
	}

	if err = a.jwt.ValidateClaims(claims); err != nil {
		return nil, fmt.Errorf("validate claims: %w", err)
	}

	return claims, nil
}

var _ Interceptor = (*auth)(nil)
