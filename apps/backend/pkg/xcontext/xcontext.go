package xcontext

import (
	"context"

	"go.uber.org/zap"
)

type key string

const (
	keyLogger       key = "xcontext.logger"
	keyUserID       key = "xcontext.user_id"
	keyRefreshToken key = "xcontext.refresh_token"
)

func WithLogger(ctx context.Context, logger *zap.Logger) context.Context {
	return context.WithValue(ctx, keyLogger, logger)
}

func ExtractLogger(ctx context.Context, fallback *zap.Logger) *zap.Logger {
	logger, ok := ctx.Value(keyLogger).(*zap.Logger)
	if !ok {
		return fallback
	}
	return logger
}

func WithUserID(ctx context.Context, userID string) context.Context {
	return context.WithValue(ctx, keyUserID, userID)
}

func ExtractUserID(ctx context.Context) (string, bool) {
	userID, ok := ctx.Value(keyUserID).(string)
	return userID, ok
}

func WithRefreshToken(ctx context.Context, token string) context.Context {
	return context.WithValue(ctx, keyRefreshToken, token)
}

func ExtractRefreshToken(ctx context.Context) (string, bool) {
	token, ok := ctx.Value(keyRefreshToken).(string)
	return token, ok
}
