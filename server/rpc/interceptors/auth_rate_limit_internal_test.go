package interceptors

import (
	"net/http"
	"net/netip"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestAuthSourceAddress(t *testing.T) {
	t.Parallel()
	trusted := []netip.Prefix{netip.MustParsePrefix("10.0.0.0/24")}
	for _, tc := range []struct {
		name, peer string
		forwarded  []string
		want       string
	}{
		{"direct ignores spoof", "192.0.2.1:1234", []string{"198.51.100.9"}, "192.0.2.1"},
		{"trusted proxy", "10.0.0.1:443", []string{"192.0.2.1"}, "192.0.2.1"},
		{"spoofed prefix", "10.0.0.1:443", []string{"198.51.100.9, 192.0.2.1"}, "192.0.2.1"},
		{"multiple headers", "10.0.0.1:443", []string{"198.51.100.9", "192.0.2.1, 10.0.0.2"}, "192.0.2.1"},
		{"bad suffix", "10.0.0.1:443", []string{"192.0.2.1, bogus"}, "10.0.0.1"},
		{"no header", "10.0.0.1:443", nil, "10.0.0.1"},
		{"mapped IPv4", "[::ffff:192.0.2.1]:1234", nil, "192.0.2.1"},
		{"IPv6 subnet", "[2001:db8::1234]:1234", nil, "2001:db8::/64"},
		{"unknown peer", "not-an-IP", []string{"192.0.2.1"}, "unknown"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, tc.want, authSourceAddress(tc.peer, http.Header{"X-Forwarded-For": tc.forwarded}, trusted))
		})
	}
}
