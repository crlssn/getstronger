package auth

import (
	"connectrpc.com/connect"
	"context"
	v1 "github.com/crlssn/getstronger/go/pkg/pb/api/v1"
	"github.com/crlssn/getstronger/go/pkg/pb/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/go/pkg/repositories"
	"github.com/friendsofgo/errors"
	"log"
)

var _ apiv1connect.AuthServiceHandler = (*handler)(nil)

type handler struct {
	repo *repositories.Auth
}

func NewHandler(repo *repositories.Auth) apiv1connect.AuthServiceHandler {
	return &handler{repo}
}

func (h *handler) Signup(ctx context.Context, req *connect.Request[v1.SignupRequest]) (*connect.Response[v1.SignupResponse], error) {
	if err := h.repo.Insert(ctx, req.Msg.Email, req.Msg.Password); err != nil {
		if errors.Is(err, repositories.ErrAuthEmailExists) {
			// Do not leak registered emails.
			return connect.NewResponse(&v1.SignupResponse{}), nil
		}

		return nil, connect.NewError(connect.CodeInternal, err)
	}

	email := req.Msg.GetEmail()
	password := req.Msg.GetPassword()
	log.Printf("got a request to create password %s and email %s", password, email)
	return connect.NewResponse(&v1.SignupResponse{}), nil
}
