package v1

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"go.uber.org/fx"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/account"
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
	repo    *repo.Repo
	email   email.Email
	cookies *cookies.Cookies
}

type AuthHandlerParams struct {
	fx.In

	JWT     *jwt.Manager
	Repo    *repo.Repo
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

func (h *authHandler) Signup(ctx context.Context, req *connect.Request[apiv1.SignupRequest]) (*connect.Response[apiv1.SignupResponse], error) {
	log := xcontext.MustExtractLogger(ctx)

	address, err := account.ParseEmailAddress(req.Msg.GetEmail())
	if err != nil {
		log.Warn("Invalid email")
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}
	req.Msg.Email = address

	if err = account.ConfirmPassword(req.Msg.GetPassword(), req.Msg.GetPasswordConfirmation()); err != nil {
		log.Warn("Passwords do not match")
		return nil, rpc.Error(connect.CodeInvalidArgument, apiv1.Error_ERROR_PASSWORDS_DO_NOT_MATCH)
	}

	if err = h.repo.NewTx(ctx, func(tx *repo.Repo) error {
		auth, err := tx.CreateAuth(ctx, req.Msg.GetEmail(), req.Msg.GetPassword())
		if err != nil {
			if errors.Is(err, account.ErrEmailAlreadyRegistered) {
				log.Warn("Email already registered")
				return nil
			}

			return fmt.Errorf("create auth: %w", err)
		}

		user, err := tx.CreateUser(ctx, repo.CreateUserParams{
			AuthID:   auth.ID.String(),
			Name:     strings.TrimSpace(req.Msg.GetName()),
			Username: req.Msg.GetUsername(),
		})
		if err != nil {
			return fmt.Errorf("create user: %w", err)
		}

		if err = h.email.SendVerification(ctx, email.SendVerification{
			Name:  user.Name,
			Email: auth.Email,
			Token: auth.EmailToken.String(),
		}); err != nil {
			return fmt.Errorf("send verification email: %w", err)
		}

		// Record the send so that it counts towards the resend rate limit.
		if err = tx.UpdateAuth(ctx, auth.ID.String(), repo.UpdateAuthEmailVerificationSentAt()); err != nil {
			return fmt.Errorf("update email verification sent at: %w", err)
		}

		return nil
	}); err != nil {
		if errors.Is(err, account.ErrUsernameTaken) {
			log.Warn("Username already taken")
			return nil, rpc.Error(connect.CodeAlreadyExists, apiv1.Error_ERROR_USERNAME_TAKEN)
		}

		log.Error("Sign up user", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("User signed up")
	return connect.NewResponse(&apiv1.SignupResponse{}), nil
}

var ErrInvalidCredentials = errors.New("invalid credentials")

func (h *authHandler) Login(ctx context.Context, req *connect.Request[apiv1.LoginRequest]) (*connect.Response[apiv1.LoginResponse], error) {
	log := xcontext.MustExtractLogger(ctx)

	if err := h.repo.CompareEmailAndPassword(ctx, req.Msg.GetEmail(), req.Msg.GetPassword()); err != nil {
		log.Error("Invalid credentials", zap.Error(err))
		return nil, connect.NewError(connect.CodeInvalidArgument, ErrInvalidCredentials)
	}

	auth, err := h.repo.GetAuth(
		ctx,
		repo.GetAuthByEmail(req.Msg.GetEmail()),
		repo.GetAuthWithUser(),
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			log.Warn("Auth not found", zap.Error(err))
			return nil, connect.NewError(connect.CodeFailedPrecondition, nil)
		}

		log.Error("Fetch auth for login", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	if !auth.EmailVerified {
		log.Warn("Email not verified")
		return nil, rpc.Error(connect.CodeFailedPrecondition, apiv1.Error_ERROR_EMAIL_NOT_VERIFIED)
	}

	accessToken, err := h.jwt.CreateToken(auth.R.User.ID.String(), jwt.TokenTypeAccess)
	if err != nil {
		log.Error("Generate access token for login", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	refreshToken := auth.RefreshToken.GetOrZero()
	if auth.RefreshToken.IsNull() {
		refreshToken, err = h.jwt.CreateToken(auth.R.User.ID.String(), jwt.TokenTypeRefresh)
		if err != nil {
			log.Error("Generate refresh token for login", zap.Error(err))
			return nil, connect.NewError(connect.CodeInternal, nil)
		}

		if err = h.repo.UpdateAuth(ctx, auth.ID.String(), repo.UpdateAuthRefreshToken(refreshToken)); err != nil {
			log.Error("Store refresh token for login", zap.Error(err))
			return nil, connect.NewError(connect.CodeInternal, nil)
		}
	}

	res := connect.NewResponse(&apiv1.LoginResponse{AccessToken: accessToken})
	cookie := h.cookies.RefreshToken(refreshToken)
	res.Header().Set("Set-Cookie", cookie.String())

	log.Info("Logged in")
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
		log.Warn("Refresh token not provided")
		return nil, connect.NewError(connect.CodeUnauthenticated, http.ErrNoCookie)
	}

	exists, err := h.repo.RefreshTokenExists(ctx, refreshToken)
	if err != nil {
		log.Error("Check refresh token exists", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}
	if !exists {
		log.Warn("Refresh token not found")
		return nil, connect.NewError(connect.CodeUnauthenticated, ErrRefreshTokenNotFound)
	}

	claims, err := h.jwt.ClaimsFromToken(refreshToken, jwt.TokenTypeRefresh)
	if err != nil {
		log.Error("Parse refresh token", zap.Error(err))
		return nil, connect.NewError(connect.CodeInvalidArgument, ErrInvalidRefreshToken)
	}

	if err = h.jwt.Validator.Validate(claims); err != nil {
		log.Error("Validate refresh token claims", zap.Error(err))
		return nil, connect.NewError(connect.CodeInvalidArgument, ErrInvalidRefreshToken)
	}

	accessToken, err := h.jwt.CreateToken(claims.UserID, jwt.TokenTypeAccess)
	if err != nil {
		log.Error("Generate access token from refresh token", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("Token refreshed")
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
			log.Error("Fetch auth for logout", zap.Error(err))
			return nil, connect.NewError(connect.CodeFailedPrecondition, nil)
		}

		if err = h.repo.UpdateAuth(ctx, auth.ID.String(), repo.UpdateAuthDeleteRefreshToken()); err != nil {
			log.Error("Delete refresh token for logout", zap.Error(err))
			return nil, connect.NewError(connect.CodeInternal, nil)
		}
	}

	res := connect.NewResponse(&apiv1.LogoutResponse{})
	cookie := h.cookies.ExpiredRefreshToken()
	res.Header().Set("Set-Cookie", cookie.String())

	log.Info("Logged out")
	return res, nil
}

func (h *authHandler) VerifyEmail(ctx context.Context, req *connect.Request[apiv1.VerifyEmailRequest]) (*connect.Response[apiv1.VerifyEmailResponse], error) {
	log := xcontext.MustExtractLogger(ctx)

	auth, err := h.repo.GetAuth(ctx, repo.GetAuthByEmailToken(req.Msg.GetToken()))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			log.Warn("Auth not found")
			return nil, connect.NewError(connect.CodeFailedPrecondition, nil)
		}

		log.Error("Fetch auth for email verification", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	if err = h.repo.UpdateAuth(ctx, auth.ID.String(), repo.UpdateAuthEmailVerified()); err != nil {
		log.Error("Mark email as verified", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("Email verified")
	return connect.NewResponse(&apiv1.VerifyEmailResponse{}), nil
}

func (h *authHandler) ResendVerificationEmail(ctx context.Context, req *connect.Request[apiv1.ResendVerificationEmailRequest]) (*connect.Response[apiv1.ResendVerificationEmailResponse], error) {
	log := xcontext.MustExtractLogger(ctx)

	// The same response is returned for every address so that the endpoint
	// never discloses whether an account exists or is already verified.
	res := connect.NewResponse(&apiv1.ResendVerificationEmailResponse{
		RetryAfterSeconds: int32(account.VerificationCooldown.Seconds()),
	})

	address := account.NormalizeEmailAddress(req.Msg.GetEmail())
	auth, err := h.repo.GetAuth(
		ctx,
		repo.GetAuthByEmail(address),
		repo.GetAuthWithUser(),
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			// Do not expose information about the email not existing.
			log.Warn("Auth not found")
			return res, nil
		}

		log.Error("Fetch auth for verification email resend", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	if auth.EmailVerified {
		// Do not expose information about the email already being verified.
		log.Warn("Email already verified")
		return res, nil
	}

	if !account.VerificationResendAllowed(auth.EmailVerificationSentAt.GetOrZero(), time.Now().UTC()) {
		// Do not expose information about the address being rate limited.
		log.Warn("Verification email rate limited")
		return res, nil
	}

	if err = h.email.SendVerification(ctx, email.SendVerification{
		Name:  auth.R.User.Name,
		Email: auth.Email,
		Token: auth.EmailToken.String(),
	}); err != nil {
		log.Error("Send verification email", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	if err = h.repo.UpdateAuth(ctx, auth.ID.String(), repo.UpdateAuthEmailVerificationSentAt()); err != nil {
		log.Error("Update verification email timestamp", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("Verification email resent")
	return res, nil
}

func (h *authHandler) ResetPassword(ctx context.Context, req *connect.Request[apiv1.ResetPasswordRequest]) (*connect.Response[apiv1.ResetPasswordResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	auth, err := h.repo.GetAuth(
		ctx,
		repo.GetAuthByEmail(req.Msg.GetEmail()),
		repo.GetAuthWithUser(),
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			// Do not expose information about the email not existing.
			log.Warn("Auth not found")
			return connect.NewResponse(&apiv1.ResetPasswordResponse{}), nil
		}

		log.Error("Fetch auth for password reset request", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	token := uuid.NewString()
	if err = h.repo.UpdateAuth(ctx, auth.ID.String(), repo.UpdateAuthPasswordResetToken(token)); err != nil {
		log.Error("Store password reset token", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	if err = h.email.SendPasswordReset(ctx, email.SendPasswordReset{
		Name:  auth.R.User.Name,
		Email: auth.Email,
		Token: token,
	}); err != nil {
		log.Error("Send password reset email", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("Password reset email sent")
	return connect.NewResponse(&apiv1.ResetPasswordResponse{}), nil
}

func (h *authHandler) UpdatePassword(ctx context.Context, req *connect.Request[apiv1.UpdatePasswordRequest]) (*connect.Response[apiv1.UpdatePasswordResponse], error) {
	log := xcontext.MustExtractLogger(ctx)
	if err := account.ConfirmPassword(req.Msg.GetPassword(), req.Msg.GetPasswordConfirmation()); err != nil {
		log.Warn("Passwords do not match")
		return nil, rpc.Error(connect.CodeInvalidArgument, apiv1.Error_ERROR_PASSWORDS_DO_NOT_MATCH)
	}

	auth, err := h.repo.GetAuth(ctx, repo.GetAuthByPasswordResetToken(req.Msg.GetToken()))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			log.Warn("Auth not found")
			return nil, connect.NewError(connect.CodeFailedPrecondition, nil)
		}

		log.Error("Fetch auth for password reset", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	if account.PasswordResetTokenExpired(auth.PasswordResetTokenValidUntil.GetOrZero(), time.Now().UTC()) {
		log.Warn("Password reset token expired")
		return nil, connect.NewError(connect.CodeFailedPrecondition, nil)
	}

	if err = h.repo.UpdateAuth(
		ctx, auth.ID.String(),
		repo.UpdateAuthPassword(req.Msg.GetPassword()),
		repo.UpdateAuthDeletePasswordResetToken(),
	); err != nil {
		log.Error("Update password", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	log.Info("Password updated")
	return connect.NewResponse(&apiv1.UpdatePasswordResponse{}), nil
}
