package interceptors

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"strings"
	"time"

	"connectrpc.com/connect"
	"github.com/gofrs/uuid/v5"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/account"
	"github.com/crlssn/getstronger/server/config"
	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
)

type authAttempts interface {
	ConsumeAuthAttempt(ctx context.Context, key string, limit int, window time.Duration) (bool, error)
	PasswordResetAccount(ctx context.Context, token uuid.UUID) (uuid.UUID, error)
}

type authRateLimit struct {
	log    *zap.Logger
	store  authAttempts
	policy *config.AuthRateLimit
	key    []byte
}

func newAuthRateLimit(log *zap.Logger, store authAttempts, c *config.Config, policy *config.AuthRateLimit) connect.Interceptor {
	return &authRateLimit{log: log, store: store, policy: policy, key: []byte(c.JWT.AccessTokenKey)}
}

func (a *authRateLimit) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		if requiresAuth(a.log, req.Spec()) {
			return next(ctx, req)
		}
		if err := a.source(ctx, req.Peer().Addr, req.Header()); err != nil {
			return nil, err
		}
		subject, err := a.accountSubject(ctx, req.Any())
		if err != nil {
			return nil, a.storageError(err)
		}
		if subject != "" {
			if err := a.consume(ctx, subject, a.policy.AccountAttempts, a.policy.AccountWindow); err != nil {
				return nil, err
			}
		}
		return next(ctx, req)
	}
}

func (a *authRateLimit) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return next
}

func (a *authRateLimit) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return func(ctx context.Context, conn connect.StreamingHandlerConn) error {
		if !requiresAuth(a.log, conn.Spec()) {
			if err := a.source(ctx, conn.Peer().Addr, conn.RequestHeader()); err != nil {
				return err
			}
		}
		return next(ctx, conn)
	}
}

func (a *authRateLimit) source(ctx context.Context, peer string, header http.Header) error {
	return a.consume(ctx, "source:"+authSourceAddress(peer, header, a.policy.TrustedProxies), a.policy.SourceAttempts, a.policy.SourceWindow)
}

func (a *authRateLimit) accountSubject(ctx context.Context, message any) (string, error) {
	switch msg := message.(type) {
	case *apiv1.LoginRequest:
		return "login:" + account.NormalizeEmailAddress(msg.GetEmail()), nil
	case *apiv1.UpdatePasswordRequest:
		token, err := uuid.FromString(msg.GetToken())
		if err != nil {
			return "reset:invalid", nil //nolint:nilerr // Validation rejects it after the source reservation.
		}
		id, err := a.store.PasswordResetAccount(ctx, token)
		if errors.Is(err, sql.ErrNoRows) {
			return "reset-token:" + token.String(), nil
		}
		if err != nil {
			return "", fmt.Errorf("resolve password reset account: %w", err)
		}
		return "reset-account:" + id.String(), nil
	default:
		return "", nil
	}
}

func (a *authRateLimit) consume(ctx context.Context, subject string, attempts int, window time.Duration) error {
	// A domain-separated HMAC keeps low-entropy emails and IPs out of the table.
	mac := hmac.New(sha256.New, a.key)
	_, _ = mac.Write([]byte("auth-rate-limit:" + subject))
	allowed, err := a.store.ConsumeAuthAttempt(ctx, hex.EncodeToString(mac.Sum(nil)), attempts, window)
	if err != nil {
		return a.storageError(err)
	}
	if !allowed {
		return connect.NewError(connect.CodeResourceExhausted, errAuthRateLimited)
	}
	return nil
}

var errAuthRateLimited = errors.New("too many authentication attempts; try again later")

func (a *authRateLimit) storageError(err error) error {
	if errors.Is(err, context.Canceled) {
		return connect.NewError(connect.CodeCanceled, nil)
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return connect.NewError(connect.CodeDeadlineExceeded, nil)
	}
	a.log.Error("Reserve authentication attempt", zap.Error(err))
	return connect.NewError(connect.CodeUnavailable, nil)
}

const ipv6SourcePrefixBits = 64

// authSourceAddress walks from the socket toward the client, stopping at the
// first untrusted hop. Client-supplied prefixes can never override that hop.
func authSourceAddress(peer string, header http.Header, trusted []netip.Prefix) string {
	host, _, err := net.SplitHostPort(peer)
	if err != nil {
		host = peer
	}
	addr, err := netip.ParseAddr(host)
	if err != nil {
		return "unknown"
	}
	addr = addr.Unmap()
	chain := strings.Split(strings.Join(header.Values("X-Forwarded-For"), ","), ",")
	for n := len(chain) - 1; n >= 0 && trustedAddress(addr, trusted); n-- {
		forwarded, err := netip.ParseAddr(strings.TrimSpace(chain[n]))
		if err != nil {
			break
		}
		addr = forwarded.Unmap()
	}
	// Privacy addresses rotate inside an IPv6 subnet; one /64 shares a budget.
	if addr.Is6() {
		return netip.PrefixFrom(addr, ipv6SourcePrefixBits).Masked().String()
	}
	return addr.String()
}

func trustedAddress(addr netip.Addr, prefixes []netip.Prefix) bool {
	for _, prefix := range prefixes {
		if prefix.Contains(addr) {
			return true
		}
	}
	return false
}
