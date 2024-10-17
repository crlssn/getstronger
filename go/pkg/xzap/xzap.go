package xzap

import "go.uber.org/zap"

func FieldRPC(rpc string) zap.Field {
	return zap.String("rpc", rpc)
}
