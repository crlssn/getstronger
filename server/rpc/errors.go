package rpc

import (
	"connectrpc.com/connect"

	v1 "github.com/crlssn/getstronger/server/pkg/pb/api/v1"
)

func Error(code connect.Code, err v1.Error) *connect.Error {
	detail, detailErr := connect.NewErrorDetail(&v1.ErrorDetail{Error: err})
	if detailErr != nil {
		return connect.NewError(connect.CodeInternal, detailErr)
	}

	e := connect.NewError(code, nil)
	e.AddDetail(detail)

	return e
}
