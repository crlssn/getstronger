package interceptors

import (
	"context"
	"errors"

	"connectrpc.com/connect"
	"github.com/bufbuild/protovalidate-go"
	"go.uber.org/zap"
	"google.golang.org/protobuf/proto"
)

type validator struct {
	log       *zap.Logger
	validator *protovalidate.Validator
}

var _ Interceptor = (*validator)(nil)

func newValidator(log *zap.Logger, v *protovalidate.Validator) Interceptor {
	return &validator{
		log:       log,
		validator: v,
	}
}

var errRequestMessageNotProtoMessage = errors.New("request message is not a proto.Message")

func (v *validator) Unary() connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(
			ctx context.Context,
			req connect.AnyRequest,
		) (connect.AnyResponse, error) {
			msg, ok := req.Any().(proto.Message)
			if !ok {
				v.log.Warn("request message is not a proto.Message")
				return nil, connect.NewError(connect.CodeInvalidArgument, errRequestMessageNotProtoMessage)
			}

			if err := v.validator.Validate(msg); err != nil {
				v.log.Warn("invalid request", zap.Error(err))
				return nil, connect.NewError(connect.CodeInvalidArgument, err)
			}

			return next(ctx, req)
		}
	}
}