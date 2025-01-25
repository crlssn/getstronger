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

	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/jwt"
	"github.com/crlssn/getstronger/server/xcontext"
	"github.com/crlssn/getstronger/server/xzap"
)

var _ connect.Interceptor = (*Auth)(nil)

func NewAuth(log *zap.Logger, m *jwt.Manager) connect.Interceptor {
	a := &Auth{
		log:     log,
		jwt:     m,
		methods: make(map[string]bool),
	}
	a.initMethods()
	return a
}

type Auth struct {
	log     *zap.Logger
	jwt     *jwt.Manager
	methods map[string]bool
}

func (a *Auth) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
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

		claims, err := a.ClaimsFromHeader(req.Header())
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

func (a *Auth) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return func(
		ctx context.Context,
		spec connect.Spec,
	) connect.StreamingClientConn {
		return next(ctx, spec)
	}
}

func (a *Auth) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return func(
		ctx context.Context,
		conn connect.StreamingHandlerConn,
	) error {
		log := a.log.With(xzap.FieldRPC(conn.Spec().Procedure))
		log.Info("request received")
		ctx = xcontext.WithLogger(ctx, log)

		requiresAuth := a.methods[conn.Spec().Procedure]
		if !requiresAuth {
			log.Info("request does not require authentication")
			return next(ctx, conn)
		}

		claims, err := a.ClaimsFromHeader(conn.RequestHeader())
		if err != nil {
			log.Warn("request unauthenticated", zap.Error(err))
			return connect.NewError(connect.CodeUnauthenticated, nil)
		}

		log = log.With(xzap.FieldUserID(claims.UserID))
		log.Info("request authenticated")

		ctx = xcontext.WithLogger(ctx, log)
		ctx = xcontext.WithUserID(ctx, claims.UserID)
		return next(ctx, conn)
	}
}

func (a *Auth) initMethods() {
	fileDescriptors := []protoreflect.FileDescriptor{
		apiv1.File_api_v1_auth_service_proto,
		apiv1.File_api_v1_feed_service_proto,
		apiv1.File_api_v1_user_service_proto,
		apiv1.File_api_v1_routine_service_proto,
		apiv1.File_api_v1_workout_service_proto,
		apiv1.File_api_v1_exercise_service_proto,
		apiv1.File_api_v1_notification_service_proto,
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

var (
	ErrMissingAuthorizationToken = errors.New("authorization token is missing")
	ErrInvalidAuthorizationToken = errors.New("invalid authorization header format")
)

func (a *Auth) ClaimsFromHeader(header http.Header) (*jwt.Claims, error) {
	authHeader := header.Get("Authorization")
	if authHeader == "" {
		return nil, ErrMissingAuthorizationToken
	}

	const bearerPrefix = "Bearer "
	if !strings.HasPrefix(authHeader, bearerPrefix) {
		return nil, ErrInvalidAuthorizationToken
	}

	token := strings.TrimPrefix(authHeader, bearerPrefix)
	claims, err := a.jwt.ClaimsFromToken(token, jwt.TokenTypeAccess)
	if err != nil {
		return nil, fmt.Errorf("claims from token: %w", err)
	}

	if err = a.jwt.Validator.Validate(claims); err != nil {
		return nil, fmt.Errorf("validate claims: %w", err)
	}

	return claims, nil
}
