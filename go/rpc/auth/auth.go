package auth

import (
	"connectrpc.com/connect"
	"context"
	"errors"
	"github.com/crlssn/getstronger/go/pkg/jwt"
	v1 "github.com/crlssn/getstronger/go/pkg/pb/api/v1"
	"github.com/crlssn/getstronger/go/pkg/pb/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/go/pkg/repos"
	"go.uber.org/zap"
	"strings"
)

var _ apiv1connect.AuthServiceHandler = (*handler)(nil)

type handler struct {
	log  *zap.Logger
	repo *repos.Auth
}

func NewHandler(log *zap.Logger, repo *repos.Auth) apiv1connect.AuthServiceHandler {
	return &handler{log, repo}
}

func (h *handler) Signup(ctx context.Context, req *connect.Request[v1.SignupRequest]) (*connect.Response[v1.SignupResponse], error) {
	email := strings.ReplaceAll(req.Msg.Email, " ", "")
	if !strings.Contains(email, "@") {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("invalid email"))
	}

	if err := h.repo.Insert(ctx, email, req.Msg.Password); err != nil {
		if errors.Is(err, repos.ErrAuthEmailExists) {
			h.log.Warn("email already exists")
			// Do not leak registered emails.
			return connect.NewResponse(&v1.SignupResponse{}), nil
		}

		h.log.Error("insert failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, errors.New(""))
	}

	h.log.Info("user signed up")
	return connect.NewResponse(&v1.SignupResponse{}), nil
}

func (h *handler) Login(ctx context.Context, req *connect.Request[v1.LoginRequest]) (*connect.Response[v1.LoginResponse], error) {
	if err := h.repo.CompareEmailAndPassword(ctx, req.Msg.Email, req.Msg.Password); err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("invalid credentials"))
	}

	auth, err := h.repo.FromEmail(ctx, req.Msg.Email)
	if err != nil {
		h.log.Error("fetch failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, errors.New(""))
	}

	tokens, err := jwt.GenerateTokens(auth.ID)
	if err != nil {
		h.log.Error("token generation failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, errors.New(""))
	}

	h.log.Info("logged in")
	return connect.NewResponse(&v1.LoginResponse{
		AccessToken:  tokens.Access,
		RefreshToken: tokens.Refresh,
	}), nil
}

func (h *handler) RefreshToken(ctx context.Context, req *connect.Request[v1.RefreshTokenRequest]) (*connect.Response[v1.RefreshTokenResponse], error) {
	claims, err := jwt.ValidateToken(req.Msg.RefreshToken)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("invalid refresh token"))
	}

	tokens, err := jwt.GenerateTokens(claims.UserID)
	if err != nil {
		h.log.Error("token generation failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, errors.New(""))
	}

	h.log.Info("token refreshed")
	return connect.NewResponse(&v1.RefreshTokenResponse{
		AccessToken: tokens.Access,
	}), nil
}
