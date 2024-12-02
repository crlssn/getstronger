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

	"github.com/crlssn/getstronger/server/pkg/jwt"
	apiv1 "github.com/crlssn/getstronger/server/pkg/pb/api/v1"
	"github.com/crlssn/getstronger/server/pkg/xcontext"
	"github.com/crlssn/getstronger/server/pkg/xzap"
)

var _ connect.Interceptor = (*auth)(nil)

func newAuth(log *zap.Logger, m *jwt.Manager) connect.Interceptor {
	a := &auth{
		log:     log,
		jwt:     m,
		methods: make(map[string]bool),
	}
	a.initMethods()
	return a
}

type auth struct {
	log     *zap.Logger
	jwt     *jwt.Manager
	methods map[string]bool
}

func (a *auth) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
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

func (a *auth) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return func(
		ctx context.Context,
		spec connect.Spec,
	) connect.StreamingClientConn {
		return next(ctx, spec)
	}
}

func (a *auth) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
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

		claims, err := a.claimsFromHeader(conn.RequestHeader())
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

func (a *auth) initMethods() {
	fileDescriptors := []protoreflect.FileDescriptor{
		apiv1.File_api_v1_auth_proto,
		apiv1.File_api_v1_feed_proto,
		apiv1.File_api_v1_users_proto,
		apiv1.File_api_v1_exercise_proto,
		apiv1.File_api_v1_routines_proto,
		apiv1.File_api_v1_workouts_proto,
		apiv1.File_api_v1_notifications_proto,
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

//// Unary is the unary interceptor method for authentication.
//func (a *auth) Unary() connect.UnaryInterceptorFunc {
//	return func(next connect.UnaryFunc) connect.UnaryFunc {
//		return func(
//			ctx context.Context,
//			req connect.AnyRequest,
//		) (connect.AnyResponse, error) {
//			log := a.log.With(xzap.FieldRPC(req.Spec().Procedure))
//			log.Info("request received")
//			ctx = xcontext.WithLogger(ctx, log)
//
//			requiresAuth := a.methods[req.Spec().Procedure]
//			if !requiresAuth {
//				log.Info("request does not require authentication")
//				return next(ctx, req)
//			}
//
//			claims, err := a.claimsFromHeader(req.Header())
//			if err != nil {
//				log.Warn("request unauthenticated", zap.Error(err))
//				return nil, connect.NewError(connect.CodeUnauthenticated, nil)
//			}
//
//			log = log.With(xzap.FieldUserID(claims.UserID))
//			log.Info("request authenticated")
//
//			ctx = xcontext.WithLogger(ctx, log)
//			ctx = xcontext.WithUserID(ctx, claims.UserID)
//			return next(ctx, req)
//		}
//	}
//}

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

//func (a *auth) Stream() connect.StreamingHandlerFunc {
//	return func(ctx context.Context, next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
//		return func(ctx context.Context, conn connect.StreamingHandlerConn) error {
//			log := a.log.With(xzap.FieldRPC(conn.Spec().Procedure))
//			log.Info("stream request received")
//			ctx = xcontext.WithLogger(ctx, log)
//
//			requiresAuth := a.methods[conn.Spec().Procedure]
//			if !requiresAuth {
//				log.Info("stream does not require authentication")
//				return next(ctx, conn)
//			}
//
//			claims, err := a.claimsFromHeader(conn.RequestHeader())
//			if err != nil {
//				log.Warn("stream unauthenticated", zap.Error(err))
//				return connect.NewError(connect.CodeUnauthenticated, nil)
//			}
//
//			log = log.With(xzap.FieldUserID(claims.UserID))
//			log.Info("stream authenticated")
//
//			ctx = xcontext.WithLogger(ctx, log)
//			ctx = xcontext.WithUserID(ctx, claims.UserID)
//			return next(ctx, conn)
//		}
//	}
//}
