package xzap_test

import (
	"testing"

	"github.com/stretchr/testify/require"
	"go.uber.org/zap/zapcore"

	"github.com/crlssn/getstronger/server/xzap"
)

func TestFields(t *testing.T) {
	t.Parallel()

	require.Equal(t, zapcore.Field{
		Key:       "rpc",
		Type:      zapcore.StringType,
		Integer:   0,
		String:    "value",
		Interface: nil,
	}, xzap.FieldRPC("value"))

	require.Equal(t, zapcore.Field{
		Key:       "user_id",
		Type:      zapcore.StringType,
		Integer:   0,
		String:    "value",
		Interface: nil,
	}, xzap.FieldUserID("value"))

	require.Equal(t, zapcore.Field{
		Key:       "routine_id",
		Type:      zapcore.StringType,
		Integer:   0,
		String:    "value",
		Interface: nil,
	}, xzap.FiledRoutineID("value"))

	require.Equal(t, zapcore.Field{
		Key:       "exercise_id",
		Type:      zapcore.StringType,
		Integer:   0,
		String:    "value",
		Interface: nil,
	}, xzap.FieldExerciseID("value"))
}
