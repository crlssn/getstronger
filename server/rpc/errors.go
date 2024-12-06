package rpc

import (
	"connectrpc.com/connect"

	v1 "github.com/crlssn/getstronger/server/pkg/pb/api/v1"
)

func Error(code connect.Code, error v1.Error) error {
	detail, detailErr := connect.NewErrorDetail(&v1.ErrorDetail{Error: error})
	if detailErr != nil {
		return connect.NewError(connect.CodeInternal, detailErr)
	}

	err := connect.NewError(code, nil)
	err.AddDetail(detail)

	return err
}
