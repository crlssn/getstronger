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

func NewAuth(log *zap.Logger, m *jwt.Issuer) connect.Interceptor {
	return &Auth{
		log: log,
		jwt: m,
	}
}

type Auth struct {
	log *zap.Logger
	jwt *jwt.Issuer
}

func (a *Auth) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(
		ctx context.Context,
		req connect.AnyRequest,
	) (connect.AnyResponse, error) {
		log := a.log.With(xzap.FieldRPC(req.Spec().Procedure))
		log.Info("Request received")
		ctx = xcontext.WithLogger(ctx, log)

		if !requiresAuth(log, req.Spec()) {
			log.Info("Request does not require authentication")
			return next(ctx, req)
		}

		claims, err := a.ClaimsFromHeader(req.Header())
		if err != nil {
			log.Warn("Request unauthenticated", zap.Error(err))
			return nil, connect.NewError(connect.CodeUnauthenticated, nil)
		}

		log = log.With(xzap.FieldUserID(claims.UserID))
		log.Info("Request authenticated")

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
		log.Info("Request received")
		ctx = xcontext.WithLogger(ctx, log)

		if !requiresAuth(log, conn.Spec()) {
			log.Info("Request does not require authentication")
			return next(ctx, conn)
		}

		claims, err := a.ClaimsFromHeader(conn.RequestHeader())
		if err != nil {
			log.Warn("Request unauthenticated", zap.Error(err))
			return connect.NewError(connect.CodeUnauthenticated, nil)
		}

		log = log.With(xzap.FieldUserID(claims.UserID))
		log.Info("Request authenticated")

		ctx = xcontext.WithLogger(ctx, log)
		ctx = xcontext.WithUserID(ctx, claims.UserID)
		return next(ctx, conn)
	}
}

// requiresAuth reports whether the schema of the procedure being served marks
// it as needing a token. Connect hands the interceptor the descriptor of the
// method it is about to call, so the answer comes from the same schema that
// generated the handler and cannot drift from what the mux serves. A procedure
// that arrives without a readable descriptor is treated as requiring a token:
// the interceptor must never serve a method whose rules it cannot read.
func requiresAuth(log *zap.Logger, spec connect.Spec) bool {
	method, ok := spec.Schema.(protoreflect.MethodDescriptor)
	if !ok {
		log.Warn("Request schema unreadable: requiring authentication")
		return true
	}

	options, ok := method.Options().(*descriptorpb.MethodOptions)
	if !ok {
		log.Warn("Request method options unreadable: requiring authentication")
		return true
	}

	auth, ok := proto.GetExtension(options, apiv1.E_Auth).(bool)
	if !ok {
		log.Warn("Request auth option unreadable: requiring authentication")
		return true
	}

	return auth
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

	if err = a.jwt.ValidateClaims(claims); err != nil {
		return nil, fmt.Errorf("validate claims: %w", err)
	}

	return claims, nil
}
