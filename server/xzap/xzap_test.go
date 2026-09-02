package xzap_test

import (
	"testing"

	"github.com/gofrs/uuid/v5"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap/zapcore"

	"github.com/crlssn/getstronger/server/xzap"
)

func TestFields(t *testing.T) {
	t.Parallel()

	id := uuid.Must(uuid.NewV4())

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
		String:    id.String(),
		Interface: nil,
	}, xzap.FieldUserID(id))

	require.Equal(t, zapcore.Field{
		Key:       "routine_id",
		Type:      zapcore.StringType,
		Integer:   0,
		String:    id.String(),
		Interface: nil,
	}, xzap.FiledRoutineID(id))

	require.Equal(t, zapcore.Field{
		Key:       "exercise_id",
		Type:      zapcore.StringType,
		Integer:   0,
		String:    id.String(),
		Interface: nil,
	}, xzap.FieldExerciseID(id))
}
