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

	"github.com/crlssn/getstronger/apps/backend/pkg/jwt"
	apiv2 "github.com/crlssn/getstronger/apps/backend/pkg/pb/api/v1"
)

type auth struct {
	log     *zap.Logger
	jwt     *jwt.Manager
	methods map[string]bool
}

func NewAuth(log *zap.Logger, m *jwt.Manager) Interceptor {
	a := &auth{
		log:     log,
		jwt:     m,
		methods: make(map[string]bool),
	}
	a.initMethods()
	return a
}

func (a *auth) initMethods() {
	fileDescriptors := []protoreflect.FileDescriptor{
		apiv2.File_api_v1_auth_proto,
		apiv2.File_api_v1_exercise_proto,
	}

	for _, fileDescriptor := range fileDescriptors {
		// Iterate over the services in the file descriptor.
		services := fileDescriptor.Services()
		for i := range services.Len() {
			service := services.Get(i)
			methods := service.Methods()
			for j := range methods.Len() {
				method := methods.Get(j)
				requiresAuth := false

				// Access the custom options.
				options, ok := method.Options().(*descriptorpb.MethodOptions)
				if !ok {
					panic("invalid method options")
				}
				if proto.HasExtension(options, apiv2.E_Auth) {
					if ext := proto.GetExtension(options, apiv2.E_Auth); ext != nil {
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

			claims, err := a.claimsFromHeader(req.Header())
			if err != nil {
				a.log.Warn("unauthenticated request", zap.Error(err))
				return nil, connect.NewError(connect.CodeUnauthenticated, nil)
			}

			return next(context.WithValue(ctx, jwt.ContextKeyUserID, claims.UserID), req)
		}
	}
	return interceptor
}

var (
	errMissingAuthorizationToken = errors.New("authorization token is missing")
	errInvalidAuthorizationToken = errors.New("invalid authorization header format")
)

func (a *auth) claimsFromHeader(header http.Header) (*jwt.Claims, error) {
	authHeader := header.Get("Authorization")
	if authHeader == "" {
		return nil, errMissingAuthorizationToken
	}

	const bearerPrefix = "Bearer "
	if !strings.HasPrefix(authHeader, bearerPrefix) {
		return nil, errInvalidAuthorizationToken
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
