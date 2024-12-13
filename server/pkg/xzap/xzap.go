package xzap

import "go.uber.org/zap"

func FieldRPC(rpc string) zap.Field {
	return zap.String("rpc", rpc)
}

func FieldUserID(userID string) zap.Field {
	return zap.String("user_id", userID)
}

func FieldExerciseID(exerciseID string) zap.Field {
	return zap.String("exercise_id", exerciseID)
}
