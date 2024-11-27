package xcontext

import (
	"context"
	"time"

	"go.uber.org/zap"
)

type key struct{}

type (
	keyLogger         key
	keyUserID         key
	keyRefreshToken   key
	keyTraceStartTime key
)

func WithLogger(ctx context.Context, logger *zap.Logger) context.Context {
	return context.WithValue(ctx, keyLogger{}, logger)
}

func MustExtractLogger(ctx context.Context) *zap.Logger {
	logger, ok := ctx.Value(keyLogger{}).(*zap.Logger)
	if !ok {
		// The logger is provided to all requests in the auth interceptor.
		panic("logger not found in context")
	}
	return logger
}

func WithUserID(ctx context.Context, userID string) context.Context {
	return context.WithValue(ctx, keyUserID{}, userID)
}

func ExtractUserID(ctx context.Context) (string, bool) {
	userID, ok := ctx.Value(keyUserID{}).(string)
	return userID, ok
}

func MustExtractUserID(ctx context.Context) string {
	userID, ok := ExtractUserID(ctx)
	if !ok {
		// The user ID is provided to all authenticated requests in the auth interceptor.
		panic("user ID not found in context")
	}
	return userID
}

func WithRefreshToken(ctx context.Context, token string) context.Context {
	return context.WithValue(ctx, keyRefreshToken{}, token)
}

func ExtractRefreshToken(ctx context.Context) (string, bool) {
	token, ok := ctx.Value(keyRefreshToken{}).(string)
	return token, ok
}

func WithTraceStartTime(ctx context.Context, startTime time.Time) context.Context {
	return context.WithValue(ctx, keyTraceStartTime{}, startTime)
}

func ExtractTraceStartTime(ctx context.Context) (time.Time, bool) {
	startTime, ok := ctx.Value(keyTraceStartTime{}).(time.Time)
	return startTime, ok
}
