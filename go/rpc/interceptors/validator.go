package interceptors

import (
	"context"
	"fmt"

	"connectrpc.com/connect"
	"github.com/bufbuild/protovalidate-go"
	"go.uber.org/zap"
	"google.golang.org/grpc"
	"google.golang.org/protobuf/proto"
)

func newValidator(log *zap.Logger, v *protovalidate.Validator) Interceptor {
	return &validator{
		log:       log,
		validator: v,
	}
}

type validator struct {
	log       *zap.Logger
	validator *protovalidate.Validator
}

func (v *validator) Unary() grpc.UnaryServerInterceptor {
	return func(
		ctx context.Context,
		req interface{},
		info *grpc.UnaryServerInfo,
		handler grpc.UnaryHandler,
	) (interface{}, error) {
		// Validate the incoming request.
		if err := v.validator.Validate(req.(proto.Message)); err != nil {
			v.log.Warn("invalid request", zap.Error(err))
			return nil, connect.NewError(connect.CodeInvalidArgument, err)
		}

		// Proceed to handler if validation passes.
		return handler(ctx, req)
	}
}

func (v *validator) Stream() grpc.StreamServerInterceptor {
	return func(
		srv interface{},
		ss grpc.ServerStream,
		info *grpc.StreamServerInfo,
		handler grpc.StreamHandler,
	) error {
		// Wrap the ServerStream with validationServerStream.
		vss := &validationServerStream{
			ServerStream: ss,
			validator:    v.validator,
			log:          v.log,
		}

		// Proceed with the handler.
		return handler(srv, vss)
	}
}

type validationServerStream struct {
	grpc.ServerStream
	validator *protovalidate.Validator
	log       *zap.Logger
}

func (vss *validationServerStream) RecvMsg(m interface{}) error {
	// Receive the message.
	err := vss.ServerStream.RecvMsg(m)
	if err != nil {
		return err // EOF or other errors.
	}

	// Assert that m is a proto.Message.
	msg, ok := m.(proto.Message)
	if !ok {
		vss.log.Warn("received message is not a proto.Message")
		return connect.NewError(connect.CodeInternal, fmt.Errorf("received message is not a proto.Message"))
	}

	// Validate the message.
	if err = vss.validator.Validate(msg); err != nil {
		vss.log.Warn("invalid stream request", zap.Error(err))
		return connect.NewError(connect.CodeInvalidArgument, err)
	}

	return nil // Validation passed.
}

// Ensure that validator implements Interceptor interface.
var _ Interceptor = (*validator)(nil)
