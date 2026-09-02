package server

import (
	"crypto/subtle"
	"net/http"
	"net/http/pprof"

	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/config"
)

// registerProfiles mounts Go's runtime profiling endpoints on mux when, and
// only when, a token is configured to guard them.
//
// The deployed API is a Serverless Container: one internet-facing port, no
// shell, no second address to bind an admin listener to. So the profiles are
// off unless an operator turns them on, and the thing that turns them on is the
// credential itself — there is no flag to leave set without a secret behind it.
// The README says how to use them and what they cost to read.
//
// Importing net/http/pprof also registers these handlers on the standard
// library's DefaultServeMux, unguarded. Nothing here serves that mux.
func registerProfiles(mux *http.ServeMux, cfg config.Pprof, log *zap.Logger) {
	switch {
	case cfg.Token == "":
		return
	case !cfg.Enabled():
		log.Warn("Profiling token too short: serving no profiles",
			zap.Int("minimum_length", config.PprofTokenMinLength))
		return
	}

	// Index serves /debug/pprof/ and every profile the runtime has registered
	// under it by name, which is how the goroutineleak profile becomes reachable
	// here without a line naming it. The four handlers below are the ones Index
	// does not cover.
	profiles := http.NewServeMux()
	profiles.HandleFunc("/debug/pprof/", pprof.Index)
	profiles.HandleFunc("/debug/pprof/cmdline", pprof.Cmdline)
	profiles.HandleFunc("/debug/pprof/profile", pprof.Profile)
	profiles.HandleFunc("/debug/pprof/symbol", pprof.Symbol)
	profiles.HandleFunc("/debug/pprof/trace", pprof.Trace)

	mux.Handle("/debug/pprof/", tokenHolderOnly(cfg.Token, profiles))
	log.Info("Profiling endpoints mounted")
}

// tokenHolderOnly serves h to a request carrying the token as a bearer, and
// gives everything else the 404 an unmounted path would have given. A 401 would
// tell an unauthenticated caller that these paths mean something on this host,
// which is the one fact worth keeping from them; the profiles are for an
// operator who already knows the token, and nothing about them is discoverable.
func tokenHolderOnly(token string, h http.Handler) http.Handler {
	want := []byte("Bearer " + token)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if subtle.ConstantTimeCompare([]byte(r.Header.Get("Authorization")), want) != 1 {
			http.NotFound(w, r)
			return
		}

		// A profile names the running process and everything it is doing, so no
		// cache between here and the operator may keep a copy.
		w.Header().Set("Cache-Control", "no-store")
		h.ServeHTTP(w, r)
	})
}
