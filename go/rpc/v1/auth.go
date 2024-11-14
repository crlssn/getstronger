package v1

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"connectrpc.com/connect"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/go/pkg/jwt"
	v1 "github.com/crlssn/getstronger/go/pkg/pb/api/v1"
	"github.com/crlssn/getstronger/go/pkg/pb/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/go/pkg/repo"
	"github.com/crlssn/getstronger/go/pkg/xzap"
)

var _ apiv1connect.AuthServiceHandler = (*auth)(nil)

type auth struct {
	log  *zap.Logger
	repo *repo.Repo
	jwt  *jwt.Manager
}

func NewAuthHandler(log *zap.Logger, repo *repo.Repo, jwt *jwt.Manager) apiv1connect.AuthServiceHandler {
	return &auth{log, repo, jwt}
}

func (h *auth) Signup(ctx context.Context, req *connect.Request[v1.SignupRequest]) (*connect.Response[v1.SignupResponse], error) {
	log := h.log.With(xzap.FieldRPC(apiv1connect.AuthServiceSignupProcedure))

	email := strings.ReplaceAll(req.Msg.Email, " ", "")
	if !strings.Contains(email, "@") {
		log.Warn("invalid email")
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("invalid email"))
	}

	if req.Msg.Password != req.Msg.PasswordConfirmation {
		log.Warn("passwords do not match")
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("passwords do not match"))
	}

	if err := h.repo.NewTx(ctx, func(r *repo.Repo) error {
		auth, err := r.CreateAuth(ctx, email, req.Msg.Password)
		if err != nil {
			log.Error("create auth", zap.Error(err))
			return connect.NewError(connect.CodeInternal, errors.New(""))
		}

		if err = r.CreateUser(ctx, repo.CreateUserParams{
			ID:        auth.ID,
			FirstName: req.Msg.FirstName,
			LastName:  req.Msg.LastName,
		}); err != nil {
			log.Error("create user", zap.Error(err))
			return connect.NewError(connect.CodeInternal, errors.New(""))
		}

		return nil
	}); err != nil {
		return nil, err
	}

	// TODO: Send a confirmation email.

	log.Info("user signed up")
	return connect.NewResponse(&v1.SignupResponse{}), nil
}

func (h *auth) Login(ctx context.Context, req *connect.Request[v1.LoginRequest]) (*connect.Response[v1.LoginResponse], error) {
	log := h.log.With(xzap.FieldRPC(apiv1connect.AuthServiceLoginProcedure))

	if err := h.repo.CompareEmailAndPassword(ctx, req.Msg.Email, req.Msg.Password); err != nil {
		log.Error("credentials invalid", zap.Error(err))
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("invalid credentials"))
	}

	auth, err := h.repo.FromEmail(ctx, req.Msg.Email)
	if err != nil {
		log.Error("fetch failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, errors.New(""))
	}

	accessToken, err := h.jwt.CreateToken(auth.ID, jwt.TokenTypeAccess)
	if err != nil {
		log.Error("token generation failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, errors.New(""))
	}

	refreshToken, err := h.jwt.CreateToken(auth.ID, jwt.TokenTypeRefresh)
	if err != nil {
		log.Error("token generation failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, errors.New(""))
	}

	if err = h.repo.UpdateRefreshToken(ctx, auth.ID, refreshToken); err != nil {
		log.Error("refresh token upsert failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, errors.New(""))
	}

	res := connect.NewResponse(&v1.LoginResponse{
		AccessToken: accessToken,
	})

	cookie := &http.Cookie{
		Name:     "refreshToken",
		Value:    refreshToken,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteNoneMode,
		Domain:   ".getstronger.pro",
		Path:     "/api.v1.AuthService",
		MaxAge:   int(jwt.ExpiryTimeRefresh),
	}
	res.Header().Set("Set-Cookie", cookie.String())

	log.Info("logged in")
	return res, nil
}

func (h *auth) RefreshToken(ctx context.Context, _ *connect.Request[v1.RefreshTokenRequest]) (*connect.Response[v1.RefreshTokenResponse], error) {
	log := h.log.With(xzap.FieldRPC(apiv1connect.AuthServiceRefreshTokenProcedure))

	refreshToken, ok := ctx.Value(jwt.ContextKeyRefreshToken).(string)
	if !ok {
		log.Warn("refresh token not provided")
		return nil, connect.NewError(connect.CodeUnauthenticated, http.ErrNoCookie)
	}

	exists, err := h.repo.RefreshTokenExists(ctx, refreshToken)
	if err != nil {
		log.Error("refresh token check failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, errors.New(""))
	}
	if !exists {
		log.Warn("refresh token not found")
		return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("refresh token not found"))
	}

	claims, err := h.jwt.ClaimsFromToken(refreshToken, jwt.TokenTypeRefresh)
	if err != nil {
		log.Error("token parsing failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("invalid refresh token"))
	}

	if err = h.jwt.ValidateClaims(claims); err != nil {
		log.Error("token validation failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("invalid refresh token"))
	}

	accessToken, err := h.jwt.CreateToken(claims.UserID, jwt.TokenTypeAccess)
	if err != nil {
		log.Error("token generation failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, errors.New(""))
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
			return nil, connect.NewError(connect.CodeInternal, errors.New(""))
		}
	}

	res := connect.NewResponse(&v1.LogoutResponse{})
	cookie := &http.Cookie{
		Name:     "refreshToken",
		Value:    "",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteNoneMode,
		Domain:   ".getstronger.pro",
		Path:     "/api.v1.AuthService",
		MaxAge:   -1,
	}
	res.Header().Set("Set-Cookie", cookie.String())

	log.Info("logged out")
	return res, nil
}
