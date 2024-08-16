package auth

import (
	"connectrpc.com/connect"
	"context"
	v1 "github.com/crlssn/getstronger/go/pkg/pb/api/v1"
	"github.com/crlssn/getstronger/go/pkg/pb/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/go/pkg/repositories"
	"github.com/friendsofgo/errors"
	"log"
	"strings"
)

var _ apiv1connect.AuthServiceHandler = (*handler)(nil)

type handler struct {
	repo *repositories.Auth
}

func (h *handler) Login(ctx context.Context, req *connect.Request[v1.LoginRequest]) (*connect.Response[v1.LoginResponse], error) {
	//TODO implement me
	panic("implement me")
}

func NewHandler(repo *repositories.Auth) apiv1connect.AuthServiceHandler {
	return &handler{repo}
}

func (h *handler) Signup(ctx context.Context, req *connect.Request[v1.SignupRequest]) (*connect.Response[v1.SignupResponse], error) {
	email := strings.ReplaceAll(req.Msg.Email, " ", "")
	if !strings.Contains(email, "@") {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("invalid email"))
	}

	if err := h.repo.Insert(ctx, email, req.Msg.Password); err != nil {
		if errors.Is(err, repositories.ErrAuthEmailExists) {
			// Do not leak registered emails.
			return connect.NewResponse(&v1.SignupResponse{}), nil
		}

		return nil, connect.NewError(connect.CodeInternal, err)
	}

	log.Printf("got a request to create password %s and email %s", req.Msg.GetPassword(), email)
	return connect.NewResponse(&v1.SignupResponse{}), nil
}
