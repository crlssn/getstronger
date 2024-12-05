package apperrors

import (
	"fmt"

	"connectrpc.com/connect"

	v1 "github.com/crlssn/getstronger/server/pkg/pb/api/v1"
)

var ErrEmailNotVerified *connect.Error

func init() { //nolint:gochecknoinits
	provideEmailNotVerified()
}

func provideEmailNotVerified() {
	detail, err := connect.NewErrorDetail(&v1.ErrorDetail{Error: v1.Error_ERROR_EMAIL_NOT_VERIFIED})
	if err != nil {
		panic(fmt.Errorf("failed to create error detail: %w", err))
	}

	ErrEmailNotVerified = connect.NewError(connect.CodeFailedPrecondition, nil)
	ErrEmailNotVerified.AddDetail(detail)
}
