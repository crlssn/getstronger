package config

import (
	"errors"
	"fmt"
	"net/netip"
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	defaultSourceAttempts  = 120
	defaultAccountAttempts = 10
	defaultAccountWindow   = 15 * time.Minute
)

var errPositiveRateLimit = errors.New("attempts must be positive and windows at least one second")

// AuthRateLimit holds deployment-wide policy; every replica must use the same values.
type AuthRateLimit struct {
	SourceAttempts  int
	SourceWindow    time.Duration
	AccountAttempts int
	AccountWindow   time.Duration
	TrustedProxies  []netip.Prefix
}

// NewAuthRateLimit refuses invalid overrides instead of silently disabling protection.
func NewAuthRateLimit() (*AuthRateLimit, error) {
	c := &AuthRateLimit{SourceAttempts: defaultSourceAttempts, SourceWindow: time.Minute, AccountAttempts: defaultAccountAttempts, AccountWindow: defaultAccountWindow}
	for name, value := range map[string]*int{
		"AUTH_RATE_SOURCE_ATTEMPTS":  &c.SourceAttempts,
		"AUTH_RATE_ACCOUNT_ATTEMPTS": &c.AccountAttempts,
	} {
		if raw := os.Getenv(name); raw != "" {
			n, err := strconv.Atoi(raw)
			if err != nil {
				return nil, fmt.Errorf("parse %s: %w", name, err)
			}
			if n <= 0 {
				return nil, fmt.Errorf("%s: %w", name, errPositiveRateLimit)
			}
			*value = n
		}
	}
	for name, value := range map[string]*time.Duration{
		"AUTH_RATE_SOURCE_WINDOW":  &c.SourceWindow,
		"AUTH_RATE_ACCOUNT_WINDOW": &c.AccountWindow,
	} {
		if raw := os.Getenv(name); raw != "" {
			d, err := time.ParseDuration(raw)
			if err != nil {
				return nil, fmt.Errorf("parse %s: %w", name, err)
			}
			if d < time.Second {
				return nil, fmt.Errorf("%s: %w", name, errPositiveRateLimit)
			}
			*value = d
		}
	}
	proxies, err := authTrustedProxies(os.Getenv("AUTH_RATE_TRUSTED_PROXIES"))
	if err != nil {
		return nil, err
	}
	c.TrustedProxies = proxies
	return c, nil
}

func authTrustedProxies(raw string) ([]netip.Prefix, error) {
	if raw == "" {
		return nil, nil
	}
	var proxies []netip.Prefix
	for item := range strings.SplitSeq(raw, ",") {
		prefix, err := netip.ParsePrefix(strings.TrimSpace(item))
		if err != nil {
			return nil, fmt.Errorf("parse AUTH_RATE_TRUSTED_PROXIES: %w", err)
		}
		proxies = append(proxies, prefix)
	}
	return proxies, nil
}
