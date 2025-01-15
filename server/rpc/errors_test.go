package rpc_test

import (
	"testing"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/require"

	v1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/rpc"
)

func TestError(t *testing.T) {
	t.Parallel()

	rpcError := rpc.Error(connect.CodeInvalidArgument, v1.Error_ERROR_EMAIL_NOT_VERIFIED)
	require.Error(t, rpcError)
	require.Equal(t, connect.CodeInvalidArgument, rpcError.Code())
	require.Len(t, rpcError.Details(), 1)

	value, err := rpcError.Details()[0].Value()
	require.NoError(t, err)

	detail, ok := value.(*v1.ErrorDetail)
	require.True(t, ok)
	require.Equal(t, v1.Error_ERROR_EMAIL_NOT_VERIFIED, detail.GetError())
}
