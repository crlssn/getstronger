package v1

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"connectrpc.com/connect"
	"go.uber.org/fx"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/pkg/config"
	"github.com/crlssn/getstronger/server/pkg/cookies"
	"github.com/crlssn/getstronger/server/pkg/email"
	"github.com/crlssn/getstronger/server/pkg/jwt"
	v1 "github.com/crlssn/getstronger/server/pkg/pb/api/v1"
	"github.com/crlssn/getstronger/server/pkg/pb/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/pkg/repo"
	"github.com/crlssn/getstronger/server/pkg/xcontext"
	"github.com/crlssn/getstronger/server/rpc/apperrors"
)

var _ apiv1connect.AuthServiceHandler = (*authHandler)(nil)

type authHandler struct {
	jwt     *jwt.Manager
	repo    *repo.Repo
	email   *email.Email
	config  *config.Config
	cookies *cookies.Cookies
}

type AuthHandlerParams struct {
	fx.In

	JWT     *jwt.Manager
	Repo    *repo.Repo
	Email   *email.Email
	Config  *config.Config
	Cookies *cookies.Cookies
}

func NewAuthHandler(p AuthHandlerParams) apiv1connect.AuthServiceHandler {
	return &authHandler{
		jwt:     p.JWT,
		repo:    p.Repo,
		email:   p.Email,
		config:  p.Config,
		cookies: p.Cookies,
	}
}

var (
	errInvalidEmail        = errors.New("invalid email")
	errPasswordsDoNotMatch = errors.New("passwords do not match")
)

func (h *authHandler) Signup(ctx context.Context, req *connect.Request[v1.SignupRequest]) (*connect.Response[v1.SignupResponse], error) {
	log := xcontext.MustExtractLogger(ctx)

	emailAddress := strings.ReplaceAll(req.Msg.GetEmail(), " ", "")
	if !strings.Contains(emailAddress, "@") {
		log.Warn("invalid email")
		return nil, connect.NewError(connect.CodeInvalidArgument, errInvalidEmail)
	}

	if req.Msg.GetPassword() != req.Msg.GetPasswordConfirmation() {
		log.Warn("passwords do not match")
		return nil, connect.NewError(connect.CodeInvalidArgument, errPasswordsDoNotMatch)
	}

	if err := h.repo.NewTx(ctx, func(r *repo.Repo) error {
		auth, err := r.CreateAuth(ctx, emailAddress, req.Msg.GetPassword())
		if err != nil {
			return fmt.Errorf("create auth: %w", err)
		}

		user, err := r.CreateUser(ctx, repo.CreateUserParams{
			ID:        auth.ID,
			FirstName: req.Msg.GetFirstName(),
			LastName:  req.Msg.GetLastName(),
		})
		if err != nil {
			return fmt.Errorf("create user: %w", err)
		}

		if err = h.email.SendVerificationEmail(ctx, email.SendVerificationEmail{
			Name:  user.FirstName,
			Email: auth.Email,
			Token: auth.EmailToken,
		}); err != nil {
			return fmt.Errorf("send verification email: %w", err)
		}

		return nil
	}); err != nil {
		log.Error("signup failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("user signed up")
	return connect.NewResponse(&v1.SignupResponse{}), nil
}

var errInvalidCredentials = errors.New("invalid credentials")

func (h *authHandler) Login(ctx context.Context, req *connect.Request[v1.LoginRequest]) (*connect.Response[v1.LoginResponse], error) {
	log := xcontext.MustExtractLogger(ctx)

	if err := h.repo.CompareEmailAndPassword(ctx, req.Msg.GetEmail(), req.Msg.GetPassword()); err != nil {
		log.Error("credentials invalid", zap.Error(err))
		return nil, connect.NewError(connect.CodeInvalidArgument, errInvalidCredentials)
	}

	auth, err := h.repo.FromEmail(ctx, req.Msg.GetEmail())
	if err != nil {
		log.Error("fetch failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	if !auth.EmailVerified {
		log.Warn("email not verified")
		return nil, apperrors.ErrEmailNotVerified
	}

	accessToken, err := h.jwt.CreateToken(auth.ID, jwt.TokenTypeAccess)
	if err != nil {
		log.Error("token generation failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	refreshToken := auth.RefreshToken.String
	if !auth.RefreshToken.Valid {
		refreshToken, err = h.jwt.CreateToken(auth.ID, jwt.TokenTypeRefresh)
		if err != nil {
			log.Error("token generation failed", zap.Error(err))
			return nil, connect.NewError(connect.CodeInternal, nil)
		}

		if err = h.repo.UpdateRefreshToken(ctx, auth.ID, refreshToken); err != nil {
			log.Error("refresh token update failed", zap.Error(err))
			return nil, connect.NewError(connect.CodeInternal, nil)
		}
	}

	res := connect.NewResponse(&v1.LoginResponse{AccessToken: accessToken})
	cookie := h.cookies.RefreshToken(refreshToken)
	res.Header().Set("Set-Cookie", cookie.String())

	log.Info("logged in")
	return res, nil
}

var (
	errInvalidRefreshToken  = errors.New("invalid refresh token")
	errRefreshTokenNotFound = errors.New("refresh token not found")
)

func (h *authHandler) RefreshToken(ctx context.Context, _ *connect.Request[v1.RefreshTokenRequest]) (*connect.Response[v1.RefreshTokenResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	refreshToken, ok := xcontext.ExtractRefreshToken(ctx)
	if !ok {
		log.Warn("refresh token not provided")
		return nil, connect.NewError(connect.CodeUnauthenticated, http.ErrNoCookie)
	}

	exists, err := h.repo.RefreshTokenExists(ctx, refreshToken)
	if err != nil {
		log.Error("refresh token check failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}
	if !exists {
		log.Warn("refresh token not found")
		return nil, connect.NewError(connect.CodeUnauthenticated, errRefreshTokenNotFound)
	}

	claims, err := h.jwt.ClaimsFromToken(refreshToken, jwt.TokenTypeRefresh)
	if err != nil {
		log.Error("token parsing failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInvalidArgument, errInvalidRefreshToken)
	}

	if err = h.jwt.ValidateClaims(claims); err != nil {
		log.Error("token validation failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInvalidArgument, errInvalidRefreshToken)
	}

	accessToken, err := h.jwt.CreateToken(claims.UserID, jwt.TokenTypeAccess)
	if err != nil {
		log.Error("token generation failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("token refreshed")
	return connect.NewResponse(&v1.RefreshTokenResponse{
		AccessToken: accessToken,
	}), nil
}

func (h *authHandler) Logout(ctx context.Context, _ *connect.Request[v1.LogoutRequest]) (*connect.Response[v1.LogoutResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	refreshToken, ok := xcontext.ExtractRefreshToken(ctx)
	if ok {
		if err := h.repo.DeleteRefreshToken(ctx, refreshToken); err != nil {
			log.Error("refresh token deletion failed", zap.Error(err))
			return nil, connect.NewError(connect.CodeInternal, nil)
		}
	}

	res := connect.NewResponse(&v1.LogoutResponse{})
	cookie := h.cookies.ExpiredRefreshToken()
	res.Header().Set("Set-Cookie", cookie.String())

	log.Info("logged out")
	return res, nil
}
