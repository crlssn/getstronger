package interceptors

import (
	"context"
	"errors"

	"connectrpc.com/connect"
	"github.com/bufbuild/protovalidate-go"
	"go.uber.org/zap"
	"google.golang.org/protobuf/proto"
)

var _ connect.Interceptor = (*validator)(nil)

func newValidator(log *zap.Logger, v *protovalidate.Validator) connect.Interceptor {
	return &validator{
		log:       log,
		validator: v,
	}
}

type validator struct {
	log       *zap.Logger
	validator *protovalidate.Validator
}

var errRequestMessageNotProtoMessage = errors.New("request message is not a proto.Message")

func (v *validator) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
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

func (v *validator) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return func(
		ctx context.Context,
		spec connect.Spec,
	) connect.StreamingClientConn {
		return next(ctx, spec)
	}
}

func (v *validator) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return func(
		ctx context.Context,
		conn connect.StreamingHandlerConn,
	) error {
		return next(ctx, conn)
	}
}
