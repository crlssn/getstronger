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
	v1 "github.com/crlssn/getstronger/apps/backend/pkg/pb/api/v1"
	"github.com/crlssn/getstronger/apps/backend/pkg/xcontext"
	"github.com/crlssn/getstronger/apps/backend/pkg/xzap"
)

type auth struct {
	log     *zap.Logger
	jwt     *jwt.Manager
	methods map[string]bool
}

var _ Interceptor = (*auth)(nil)

func newAuth(log *zap.Logger, m *jwt.Manager) Interceptor {
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
		v1.File_api_v1_auth_proto,
		v1.File_api_v1_exercise_proto,
		v1.File_api_v1_routines_proto,
		v1.File_api_v1_workouts_proto,
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
				if proto.HasExtension(options, v1.E_Auth) {
					if ext := proto.GetExtension(options, v1.E_Auth); ext != nil {
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
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(
			ctx context.Context,
			req connect.AnyRequest,
		) (connect.AnyResponse, error) {
			log := a.log.With(xzap.FieldRPC(req.Spec().Procedure))
			log.Info("request received")
			ctx = xcontext.WithLogger(ctx, log)

			requiresAuth := a.methods[req.Spec().Procedure]
			if !requiresAuth {
				log.Info("request does not require authentication")
				return next(ctx, req)
			}

			claims, err := a.claimsFromHeader(req.Header())
			if err != nil {
				log.Warn("request unauthenticated", zap.Error(err))
				return nil, connect.NewError(connect.CodeUnauthenticated, nil)
			}

			log = log.With(xzap.FieldUserID(claims.UserID))
			log.Info("request authenticated")

			ctx = xcontext.WithLogger(ctx, log)
			ctx = xcontext.WithUserID(ctx, claims.UserID)
			return next(ctx, req)
		}
	}
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
