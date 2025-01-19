package v1

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"go.uber.org/fx"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/cookies"
	"github.com/crlssn/getstronger/server/email"
	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/gen/proto/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/jwt"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/rpc"
	"github.com/crlssn/getstronger/server/xcontext"
)

var _ apiv1connect.AuthServiceHandler = (*authHandler)(nil)

type authHandler struct {
	jwt     *jwt.Manager
	repo    repo.Repo
	email   email.Email
	cookies *cookies.Cookies
}

type AuthHandlerParams struct {
	fx.In

	JWT     *jwt.Manager
	Repo    repo.Repo
	Email   email.Email
	Cookies *cookies.Cookies
}

func NewAuthHandler(p AuthHandlerParams) apiv1connect.AuthServiceHandler {
	return &authHandler{
		jwt:     p.JWT,
		repo:    p.Repo,
		email:   p.Email,
		cookies: p.Cookies,
	}
}

var errInvalidEmail = errors.New("invalid email")

func (h *authHandler) Signup(ctx context.Context, req *connect.Request[apiv1.SignupRequest]) (*connect.Response[apiv1.SignupResponse], error) {
	log := xcontext.MustExtractLogger(ctx)

	req.Msg.Email = strings.ReplaceAll(req.Msg.GetEmail(), " ", "")
	if !strings.Contains(req.Msg.GetEmail(), "@") {
		log.Warn("invalid email")
		return nil, connect.NewError(connect.CodeInvalidArgument, errInvalidEmail)
	}

	if req.Msg.GetPassword() != req.Msg.GetPasswordConfirmation() {
		log.Warn("passwords do not match")
		return nil, rpc.Error(connect.CodeInvalidArgument, apiv1.Error_ERROR_PASSWORDS_DO_NOT_MATCH)
	}

	if err := h.repo.NewTx(ctx, func(tx repo.Tx) error {
		auth, err := tx.CreateAuth(ctx, req.Msg.GetEmail(), req.Msg.GetPassword())
		if err != nil {
			if errors.Is(err, repo.ErrAuthEmailExists) {
				log.Warn("email exists")
				return nil
			}

			return fmt.Errorf("create auth: %w", err)
		}

		user, err := tx.CreateUser(ctx, repo.CreateUserParams{
			AuthID:    auth.ID,
			FirstName: req.Msg.GetFirstName(),
			LastName:  req.Msg.GetLastName(),
		})
		if err != nil {
			return fmt.Errorf("create user: %w", err)
		}

		if err = h.email.SendVerification(ctx, email.SendVerification{
			Name:    user.FirstName,
			ToEmail: auth.Email,
			Token:   auth.EmailToken,
		}); err != nil {
			return fmt.Errorf("send verification email: %w", err)
		}

		return nil
	}); err != nil {
		log.Error("signup failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("user signed up")
	return connect.NewResponse(&apiv1.SignupResponse{}), nil
}

var ErrInvalidCredentials = errors.New("invalid credentials")

func (h *authHandler) Login(ctx context.Context, req *connect.Request[apiv1.LoginRequest]) (*connect.Response[apiv1.LoginResponse], error) {
	log := xcontext.MustExtractLogger(ctx)

	if err := h.repo.CompareEmailAndPassword(ctx, req.Msg.GetEmail(), req.Msg.GetPassword()); err != nil {
		log.Error("credentials invalid", zap.Error(err))
		return nil, connect.NewError(connect.CodeInvalidArgument, ErrInvalidCredentials)
	}

	auth, err := h.repo.GetAuth(ctx,
		repo.GetAuthByEmail(req.Msg.GetEmail()),
		repo.GetAuthWithUser(),
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			log.Warn("auth not found", zap.Error(err))
			return nil, connect.NewError(connect.CodeFailedPrecondition, nil)
		}

		log.Error("fetch failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	if !auth.EmailVerified {
		log.Warn("email not verified")
		return nil, rpc.Error(connect.CodeFailedPrecondition, apiv1.Error_ERROR_EMAIL_NOT_VERIFIED)
	}

	accessToken, err := h.jwt.CreateToken(auth.R.User.ID, jwt.TokenTypeAccess)
	if err != nil {
		log.Error("token generation failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	refreshToken := auth.RefreshToken.String
	if !auth.RefreshToken.Valid {
		refreshToken, err = h.jwt.CreateToken(auth.R.User.ID, jwt.TokenTypeRefresh)
		if err != nil {
			log.Error("token generation failed", zap.Error(err))
			return nil, connect.NewError(connect.CodeInternal, nil)
		}

		if err = h.repo.UpdateAuth(ctx, auth.ID, repo.UpdateAuthRefreshToken(refreshToken)); err != nil {
			log.Error("refresh token update failed", zap.Error(err))
			return nil, connect.NewError(connect.CodeInternal, nil)
		}
	}

	res := connect.NewResponse(&apiv1.LoginResponse{AccessToken: accessToken})
	cookie := h.cookies.RefreshToken(refreshToken)
	res.Header().Set("Set-Cookie", cookie.String())

	log.Info("logged in")
	return res, nil
}

var (
	ErrInvalidRefreshToken  = errors.New("invalid refresh token")
	ErrRefreshTokenNotFound = errors.New("refresh token not found")
)

func (h *authHandler) RefreshToken(ctx context.Context, _ *connect.Request[apiv1.RefreshTokenRequest]) (*connect.Response[apiv1.RefreshTokenResponse], error) {
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
		return nil, connect.NewError(connect.CodeUnauthenticated, ErrRefreshTokenNotFound)
	}

	claims, err := h.jwt.ClaimsFromToken(refreshToken, jwt.TokenTypeRefresh)
	if err != nil {
		log.Error("token parsing failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInvalidArgument, ErrInvalidRefreshToken)
	}

	if err = h.jwt.ValidateClaims(claims); err != nil {
		log.Error("token validation failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInvalidArgument, ErrInvalidRefreshToken)
	}

	accessToken, err := h.jwt.CreateToken(claims.UserID, jwt.TokenTypeAccess)
	if err != nil {
		log.Error("token generation failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("token refreshed")
	return connect.NewResponse(&apiv1.RefreshTokenResponse{
		AccessToken: accessToken,
	}), nil
}

func (h *authHandler) Logout(ctx context.Context, _ *connect.Request[apiv1.LogoutRequest]) (*connect.Response[apiv1.LogoutResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	refreshToken, ok := xcontext.ExtractRefreshToken(ctx)
	if ok {
		auth, err := h.repo.GetAuth(ctx, repo.GetAuthByRefreshToken(refreshToken))
		if err != nil {
			log.Error("auth fetch failed", zap.Error(err))
			return nil, connect.NewError(connect.CodeFailedPrecondition, nil)
		}

		if err = h.repo.UpdateAuth(ctx, auth.ID, repo.UpdateAuthDeleteRefreshToken()); err != nil {
			log.Error("refresh token deletion failed", zap.Error(err))
			return nil, connect.NewError(connect.CodeInternal, nil)
		}
	}

	res := connect.NewResponse(&apiv1.LogoutResponse{})
	cookie := h.cookies.ExpiredRefreshToken()
	res.Header().Set("Set-Cookie", cookie.String())

	log.Info("logged out")
	return res, nil
}

func (h *authHandler) VerifyEmail(ctx context.Context, req *connect.Request[apiv1.VerifyEmailRequest]) (*connect.Response[apiv1.VerifyEmailResponse], error) {
	log := xcontext.MustExtractLogger(ctx)

	auth, err := h.repo.GetAuth(ctx, repo.GetAuthByEmailToken(req.Msg.GetToken()))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			log.Warn("auth not found")
			return nil, connect.NewError(connect.CodeFailedPrecondition, nil)
		}

		log.Error("auth fetch failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	if err = h.repo.UpdateAuth(ctx, auth.ID, repo.UpdateAuthEmailVerified()); err != nil {
		log.Error("email verification failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("email verified")
	return connect.NewResponse(&apiv1.VerifyEmailResponse{}), nil
}

func (h *authHandler) ResetPassword(ctx context.Context, req *connect.Request[apiv1.ResetPasswordRequest]) (*connect.Response[apiv1.ResetPasswordResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	auth, err := h.repo.GetAuth(ctx,
		repo.GetAuthByEmail(req.Msg.GetEmail()),
		repo.GetAuthWithUser(),
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			// Do not expose information about the email not existing.
			log.Warn("auth not found")
			return connect.NewResponse(&apiv1.ResetPasswordResponse{}), nil
		}

		log.Error("auth fetch failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	// TODO: Set expiration time for token.
	token := uuid.NewString()
	if err = h.repo.UpdateAuth(ctx, auth.ID, repo.UpdateAuthPasswordResetToken(token)); err != nil {
		log.Error("password reset token update failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	if err = h.email.SendPasswordReset(ctx, email.SendPasswordReset{
		Name:  auth.R.User.FirstName,
		Email: auth.Email,
		Token: token,
	}); err != nil {
		log.Error("password reset email failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("password reset email sent")
	return connect.NewResponse(&apiv1.ResetPasswordResponse{}), nil
}

func (h *authHandler) UpdatePassword(ctx context.Context, req *connect.Request[apiv1.UpdatePasswordRequest]) (*connect.Response[apiv1.UpdatePasswordResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	if req.Msg.GetPassword() != req.Msg.GetPasswordConfirmation() {
		log.Warn("passwords do not match")
		return nil, rpc.Error(connect.CodeInvalidArgument, apiv1.Error_ERROR_PASSWORDS_DO_NOT_MATCH)
	}

	auth, err := h.repo.GetAuth(ctx, repo.GetAuthByPasswordResetToken(req.Msg.GetToken()))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			log.Warn("auth not found")
			return nil, connect.NewError(connect.CodeFailedPrecondition, nil)
		}

		log.Error("auth fetch failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	if err = h.repo.UpdateAuth(ctx, auth.ID,
		repo.UpdateAuthPassword(req.Msg.GetPassword()),
		repo.UpdateAuthDeletePasswordResetToken(),
	); err != nil {
		log.Error("password update failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("password updated")
	return connect.NewResponse(&apiv1.UpdatePasswordResponse{}), nil
}
