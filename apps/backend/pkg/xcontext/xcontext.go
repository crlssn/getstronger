package xcontext

import (
	"context"

	"go.uber.org/zap"
)

type key struct{}

type (
	keyLogger       key
	keyUserID       key
	keyRefreshToken key
)

func WithLogger(ctx context.Context, logger *zap.Logger) context.Context {
	return context.WithValue(ctx, keyLogger{}, logger)
}

func ExtractLogger(ctx context.Context) *zap.Logger {
	// The logger is provided to all requests in the auth interceptor.
	return ctx.Value(keyLogger{}).(*zap.Logger)
}

func WithUserID(ctx context.Context, userID string) context.Context {
	return context.WithValue(ctx, keyUserID{}, userID)
}

func ExtractUserID(ctx context.Context) (string, bool) {
	userID, ok := ctx.Value(keyUserID{}).(string)
	return userID, ok
}

func WithRefreshToken(ctx context.Context, token string) context.Context {
	return context.WithValue(ctx, keyRefreshToken{}, token)
}

func ExtractRefreshToken(ctx context.Context) (string, bool) {
	token, ok := ctx.Value(keyRefreshToken{}).(string)
	return token, ok
}
