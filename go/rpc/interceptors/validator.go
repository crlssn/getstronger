package interceptors

import (
	"context"

	"connectrpc.com/connect"
	"github.com/bufbuild/protovalidate-go"
	"go.uber.org/zap"
	"google.golang.org/protobuf/proto"
)

type validator struct {
	log       *zap.Logger
	validator *protovalidate.Validator
}

func NewValidator(log *zap.Logger, v *protovalidate.Validator) Interceptor {
	return &validator{
		log:       log,
		validator: v,
	}
}

func (v *validator) Unary() connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(
			ctx context.Context,
			req connect.AnyRequest,
		) (connect.AnyResponse, error) {
			if err := v.validator.Validate(req.(proto.Message)); err != nil {
				v.log.Warn("invalid request", zap.Error(err))
				return nil, connect.NewError(connect.CodeInvalidArgument, err)
			}
			return next(ctx, req)
		}
	}
}

var _ Interceptor = (*validator)(nil)
