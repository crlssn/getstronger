package config

// DefaultLogsEndpoint is PostHog's EU ingestion endpoint for OTLP log records.
// The web app reaches PostHog through a first-party reverse proxy because ad
// blockers drop requests to posthog.com by name; a server has no blocker to
// dodge, so it posts straight there and saves the hop.
const DefaultLogsEndpoint = "https://eu.i.posthog.com/i/v1/logs"

// Logs says where the server's log records go besides stdout. The project token
// is both the switch and the credential: an environment that sets none exports
// nothing, which is every environment until somebody configures one.
type Logs struct {
	Token    string
	Endpoint string
}

// Enabled reports whether log records may be exported.
func (l Logs) Enabled() bool {
	return l.Token != ""
}

// URL is where records are posted, PostHog's EU region unless an environment
// names somewhere else — a local collector, or the US region.
func (l Logs) URL() string {
	if l.Endpoint == "" {
		return DefaultLogsEndpoint
	}

	return l.Endpoint
}
