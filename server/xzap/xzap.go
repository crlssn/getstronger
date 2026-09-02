package xzap

import (
	"github.com/gofrs/uuid/v5"
	"go.uber.org/zap"
)

func FieldRPC(rpc string) zap.Field {
	return zap.String("rpc", rpc)
}

func FieldUserID(userID uuid.UUID) zap.Field {
	return zap.String("user_id", userID.String())
}

func FiledRoutineID(id uuid.UUID) zap.Field {
	return zap.String("routine_id", id.String())
}

func FieldExerciseID(exerciseID uuid.UUID) zap.Field {
	return zap.String("exercise_id", exerciseID.String())
}
