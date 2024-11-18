package v1

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"

	"connectrpc.com/connect"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/apps/backend/pkg/jwt"
	v1 "github.com/crlssn/getstronger/apps/backend/pkg/pb/api/v1"
	"github.com/crlssn/getstronger/apps/backend/pkg/pb/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/apps/backend/pkg/repo"
	"github.com/crlssn/getstronger/apps/backend/pkg/xzap"
)

var _ apiv1connect.AuthServiceHandler = (*auth)(nil)

type auth struct {
	log  *zap.Logger
	repo *repo.Repo
	jwt  *jwt.Manager
}

func NewAuthHandler(log *zap.Logger, r *repo.Repo, m *jwt.Manager) apiv1connect.AuthServiceHandler {
	return &auth{log, r, m}
}

var (
	errInvalidEmail        = errors.New("invalid email")
	errPasswordsDoNotMatch = errors.New("passwords do not match")
)

func (h *auth) Signup(ctx context.Context, req *connect.Request[v1.SignupRequest]) (*connect.Response[v1.SignupResponse], error) {
	log := h.log.With(xzap.FieldRPC(apiv1connect.AuthServiceSignupProcedure))

	email := strings.ReplaceAll(req.Msg.GetEmail(), " ", "")
	if !strings.Contains(email, "@") {
		log.Warn("invalid email")
		return nil, connect.NewError(connect.CodeInvalidArgument, errInvalidEmail)
	}

	if req.Msg.GetPassword() != req.Msg.GetPasswordConfirmation() {
		log.Warn("passwords do not match")
		return nil, connect.NewError(connect.CodeInvalidArgument, errPasswordsDoNotMatch)
	}

	if err := h.repo.NewTx(ctx, func(r *repo.Repo) error {
		auth, err := r.CreateAuth(ctx, email, req.Msg.GetPassword())
		if err != nil {
			return fmt.Errorf("create auth: %w", err)
		}

		if err = r.CreateUser(ctx, repo.CreateUserParams{
			ID:        auth.ID,
			FirstName: req.Msg.GetFirstName(),
			LastName:  req.Msg.GetLastName(),
		}); err != nil {
			return fmt.Errorf("create user: %w", err)
		}

		return nil
	}); err != nil {
		log.Error("transaction failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	// TODO: Send a confirmation email.

	log.Info("user signed up")
	return connect.NewResponse(&v1.SignupResponse{}), nil
}

var errInvalidCredentials = errors.New("invalid credentials")

func (h *auth) Login(ctx context.Context, req *connect.Request[v1.LoginRequest]) (*connect.Response[v1.LoginResponse], error) {
	log := h.log.With(xzap.FieldRPC(apiv1connect.AuthServiceLoginProcedure))

	if err := h.repo.CompareEmailAndPassword(ctx, req.Msg.GetEmail(), req.Msg.GetPassword()); err != nil {
		log.Error("credentials invalid", zap.Error(err))
		return nil, connect.NewError(connect.CodeInvalidArgument, errInvalidCredentials)
	}

	auth, err := h.repo.FromEmail(ctx, req.Msg.GetEmail())
	if err != nil {
		log.Error("fetch failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	accessToken, err := h.jwt.CreateToken(auth.ID, jwt.TokenTypeAccess)
	if err != nil {
		log.Error("token generation failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	refreshToken, err := h.jwt.CreateToken(auth.ID, jwt.TokenTypeRefresh)
	if err != nil {
		log.Error("token generation failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	if err = h.repo.UpdateRefreshToken(ctx, auth.ID, refreshToken); err != nil {
		log.Error("refresh token upsert failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, nil)
	}

	res := connect.NewResponse(&v1.LoginResponse{
		AccessToken: accessToken,
	})

	cookie := &http.Cookie{
		Name:     "refreshToken",
		Value:    refreshToken,
		Path:     "/api.v1.AuthService",
		Domain:   os.Getenv("COOKIE_DOMAIN"),
		MaxAge:   int(jwt.ExpiryTimeRefresh),
		Secure:   true,
		HttpOnly: true,
		SameSite: http.SameSiteNoneMode,
	}
	res.Header().Set("Set-Cookie", cookie.String())

	log.Info("logged in", zap.String("refresh_token", refreshToken))
	return res, nil
}

var (
	errInvalidRefreshToken  = errors.New("invalid refresh token")
	errRefreshTokenNotFound = errors.New("refresh token not found")
)

func (h *auth) RefreshToken(ctx context.Context, _ *connect.Request[v1.RefreshTokenRequest]) (*connect.Response[v1.RefreshTokenResponse], error) {
	log := h.log.With(xzap.FieldRPC(apiv1connect.AuthServiceRefreshTokenProcedure))
	log.Info("request received")

	refreshToken, ok := ctx.Value(jwt.ContextKeyRefreshToken).(string)
	if !ok {
		log.Warn("refresh token not provided")
		return nil, connect.NewError(connect.CodeUnauthenticated, http.ErrNoCookie)
	}

	log.Info("refresh token provided", zap.String("refresh_token", refreshToken))

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

func (h *auth) Logout(ctx context.Context, _ *connect.Request[v1.LogoutRequest]) (*connect.Response[v1.LogoutResponse], error) {
	log := h.log.With(xzap.FieldRPC(apiv1connect.AuthServiceLogoutProcedure))

	refreshToken, ok := ctx.Value(jwt.ContextKeyRefreshToken).(string)
	if ok {
		if err := h.repo.DeleteRefreshToken(ctx, refreshToken); err != nil {
			log.Error("refresh token deletion failed", zap.Error(err))
			return nil, connect.NewError(connect.CodeInternal, nil)
		}
	}

	res := connect.NewResponse(&v1.LogoutResponse{})
	cookie := &http.Cookie{
		Name:     "refreshToken",
		Value:    "",
		Path:     "/api.v1.AuthService",
		Domain:   os.Getenv("COOKIE_DOMAIN"),
		MaxAge:   -1,
		Secure:   true,
		HttpOnly: true,
		SameSite: http.SameSiteNoneMode,
	}
	res.Header().Set("Set-Cookie", cookie.String())

	log.Info("logged out")
	return res, nil
}
