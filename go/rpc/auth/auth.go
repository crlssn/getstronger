package auth

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
	"github.com/crlssn/getstronger/go/pkg/repos"
	"github.com/crlssn/getstronger/go/pkg/xzap"
)

var _ apiv1connect.AuthServiceHandler = (*handler)(nil)

type handler struct {
	log  *zap.Logger
	repo *repos.Auth
	jwt  *jwt.Manager
}

func NewHandler(log *zap.Logger, repo *repos.Auth, jwt *jwt.Manager) apiv1connect.AuthServiceHandler {
	return &handler{log, repo, jwt}
}

func (h *handler) Signup(ctx context.Context, req *connect.Request[v1.SignupRequest]) (*connect.Response[v1.SignupResponse], error) {
	log := h.log.With(xzap.FieldRPC(apiv1connect.AuthServiceSignupProcedure))

	email := strings.ReplaceAll(req.Msg.Email, " ", "")
	if !strings.Contains(email, "@") {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("invalid email"))
	}

	if req.Msg.Password != req.Msg.PasswordConfirmation {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("passwords do not match"))
	}

	if err := h.repo.Insert(ctx, email, req.Msg.Password); err != nil {
		if errors.Is(err, repos.ErrAuthEmailExists) {
			log.Warn("email already exists")
			// Do not leak registered emails.
			return connect.NewResponse(&v1.SignupResponse{}), nil
		}

		log.Error("insert failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, errors.New(""))
	}

	// TODO: Send a confirmation email.

	log.Info("user signed up")
	return connect.NewResponse(&v1.SignupResponse{}), nil
}

func (h *handler) Login(ctx context.Context, req *connect.Request[v1.LoginRequest]) (*connect.Response[v1.LoginResponse], error) {
	log := h.log.With(xzap.FieldRPC(apiv1connect.AuthServiceLoginProcedure))

	if err := h.repo.CompareEmailAndPassword(ctx, req.Msg.Email, req.Msg.Password); err != nil {
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
		SameSite: http.SameSiteLaxMode, // TODO: Set to http.SameSiteStrictMode.
		Path:     "/api.v1.AuthService",
		MaxAge:   int(jwt.ExpiryTimeRefresh),
	}
	res.Header().Set("Set-Cookie", cookie.String())

	log.Info("logged in")
	return res, nil
}

func (h *handler) RefreshToken(ctx context.Context, _ *connect.Request[v1.RefreshTokenRequest]) (*connect.Response[v1.RefreshTokenResponse], error) {
	log := h.log.With(xzap.FieldRPC(apiv1connect.AuthServiceRefreshTokenProcedure))

	refreshToken, ok := ctx.Value(jwt.ContextKeyRefreshToken).(string)
	if !ok {
		log.Warn("refresh token not found")
		return nil, connect.NewError(connect.CodeUnauthenticated, http.ErrNoCookie)
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

func (h *handler) Logout(ctx context.Context, _ *connect.Request[v1.LogoutRequest]) (*connect.Response[v1.LogoutResponse], error) {
	log := h.log.With(xzap.FieldRPC(apiv1connect.AuthServiceLogoutProcedure))

	refreshToken, ok := ctx.Value(jwt.ContextKeyRefreshToken).(string)
	if !ok {
		log.Warn("refresh token not found")
		return nil, connect.NewError(connect.CodeUnauthenticated, http.ErrNoCookie)
	}

	if err := h.repo.DeleteRefreshToken(ctx, refreshToken); err != nil {
		log.Error("refresh token deletion failed", zap.Error(err))
		return nil, connect.NewError(connect.CodeInternal, errors.New(""))
	}

	res := connect.NewResponse(&v1.LogoutResponse{})
	cookie := &http.Cookie{
		Name:     "refreshToken",
		Value:    "",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode, // TODO: Set to http.SameSiteStrictMode.
		Path:     "/api.v1.AuthService",
		MaxAge:   -1,
	}
	res.Header().Set("Set-Cookie", cookie.String())

	log.Info("logged out")
	return res, nil
}
